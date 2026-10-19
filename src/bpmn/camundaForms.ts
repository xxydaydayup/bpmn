import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export interface CamundaFormValueSnapshot { index: number; id: string; name: string }
export interface CamundaFormConstraintSnapshot { index: number; name: string; config: string }
export interface CamundaFormPropertySnapshot { index: number; id: string; value: string }
export interface CamundaFormFieldSnapshot {
  index: number
  id: string
  label: string
  type: string
  defaultValue: string
  datePattern: string
  values: CamundaFormValueSnapshot[]
  constraints: CamundaFormConstraintSnapshot[]
  properties: CamundaFormPropertySnapshot[]
}
export interface CamundaFormSnapshot {
  formKey: string
  formRef: string
  formRefBinding: string
  formRefVersion: string
  businessKey: string
  fields: CamundaFormFieldSnapshot[]
  validation: string[]
}

type ModdleFactory = {
  create(type: string, properties?: Record<string, unknown>): ModdleElement
  createAny(name: string, nsUri: string, properties?: Record<string, unknown>): ModdleElement
}

function valuesOf(element: ModdleElement | undefined, property: string): ModdleElement[] {
  return (element?.[property] ?? []) as ModdleElement[]
}

function stringValue(element: ModdleElement, property: string): string {
  return String(element[property] ?? '')
}

export function readCamundaForm(element: ModdleElement): CamundaFormSnapshot {
  const formData = (element.extensionElements?.values ?? [])
    .find((item: ModdleElement) => item.$type === 'camunda:FormData') as ModdleElement | undefined
  const fields = valuesOf(formData, 'fields').map((field, index) => ({
    index,
    id: stringValue(field, 'id'),
    label: stringValue(field, 'label'),
    type: stringValue(field, 'type'),
    defaultValue: stringValue(field, 'defaultValue'),
    datePattern: stringValue(field, 'datePattern'),
    values: valuesOf(field, 'values').map((item, valueIndex) => ({
      index: valueIndex, id: stringValue(item, 'id'), name: stringValue(item, 'name'),
    })),
    constraints: valuesOf(field.validation, 'constraints').map((item, constraintIndex) => ({
      index: constraintIndex, name: stringValue(item, 'name'), config: stringValue(item, 'config'),
    })),
    properties: valuesOf(field.properties, 'values').map((item, propertyIndex) => ({
      index: propertyIndex, id: stringValue(item, 'id'), value: stringValue(item, 'value'),
    })),
  }))
  const ids = fields.map(field => field.id.trim()).filter(Boolean)
  const validation: string[] = []
  fields.forEach((field, index) => {
    if (!field.id.trim()) validation.push(`表单字段 ${index + 1} 缺少 ID`)
  })
  if (new Set(ids).size !== ids.length) validation.push('表单字段 ID 必须唯一')
  if ((element.get('camunda:formRefBinding') || element.get('camunda:formRefVersion')) && !element.get('camunda:formRef')) {
    validation.push('表单引用绑定和版本需要先配置表单引用')
  }
  fields.forEach((field, index) => {
    if (field.type === 'enum' && !field.values.length) validation.push(`枚举字段 ${index + 1} 至少需要一个选项`)
    const optionIds = field.values.map(option => option.id.trim()).filter(Boolean)
    if (field.type === 'enum' && new Set(optionIds).size !== optionIds.length) validation.push(`枚举字段 ${index + 1} 的选项 ID 必须唯一`)
  })
  return {
    formKey: String(element.get('camunda:formKey') ?? ''),
    formRef: String(element.get('camunda:formRef') ?? ''),
    formRefBinding: String(element.get('camunda:formRefBinding') ?? ''),
    formRefVersion: String(element.get('camunda:formRefVersion') ?? ''),
    businessKey: String(formData?.businessKey ?? ''),
    fields, validation,
  }
}

function cloneModdleNode(moddle: ModdleFactory, source: ModdleElement): ModdleElement {
  const descriptor = source.$descriptor as { properties?: Array<{ name: string; isReference?: boolean }>; isGeneric?: boolean; ns?: { uri?: string } }
  const referenceProperties = new Set((descriptor.properties ?? []).filter(property => property.isReference).map(property => property.name))
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('$') || value === undefined) continue
    if (referenceProperties.has(key)) { properties[key] = value; continue }
    if (Array.isArray(value)) {
      properties[key] = value.map(item => isModdleElement(item) ? cloneModdleNode(moddle, item) : item)
    } else if (isModdleElement(value)) {
      properties[key] = cloneModdleNode(moddle, value)
    } else properties[key] = value
  }
  const clone = descriptor.isGeneric && descriptor.ns?.uri
    ? moddle.createAny(source.$type, descriptor.ns.uri, properties)
    : moddle.create(source.$type, properties)
  Object.assign(clone.$attrs ?? (clone.$attrs = {}), source.$attrs ?? {})
  if (source.$children) {
    clone.$children = source.$children.map((child: ModdleElement) => cloneModdleNode(moddle, child))
    clone.$children.forEach((child: ModdleElement) => { child.$parent = clone })
  }
  for (const property of descriptor.properties ?? []) {
    const child = clone[property.name]
    if (Array.isArray(child)) child.forEach((item: ModdleElement) => { if (isModdleElement(item)) item.$parent = clone })
    else if (isModdleElement(child)) child.$parent = clone
  }
  return clone
}

function isModdleElement(value: unknown): value is ModdleElement {
  return !!value && typeof value === 'object' && typeof (value as ModdleElement).$type === 'string'
}

function copyExtensionElements(moddle: ModdleFactory, element: ModdleElement): ModdleElement {
  const previous = element.extensionElements as ModdleElement | undefined
  const extension = moddle.create('bpmn:ExtensionElements', { values: [...(previous?.values ?? [])] })
  extension.values.forEach((item: ModdleElement) => { item.$parent = extension })
  if (previous?.$attrs) Object.assign(extension.$attrs, previous.$attrs)
  if (previous?.$children) extension.$children = [...previous.$children]
  extension.$parent = element
  return extension
}

function editableFormData(moddle: ModdleFactory, element: ModdleElement): { extension: ModdleElement; formData: ModdleElement } {
  const extension = copyExtensionElements(moddle, element)
  const values = [...(extension.values ?? [])] as ModdleElement[]
  const index = values.findIndex(item => item.$type === 'camunda:FormData')
  const original = index >= 0 ? values[index]! : undefined
  const formData = original ? cloneModdleNode(moddle, original) : moddle.create('camunda:FormData', { fields: [] })
  formData.$parent = extension
  if (index >= 0) values[index] = formData
  else values.push(formData)
  extension.values = values
  return { extension, formData }
}

function setValue(target: ModdleElement, property: string, value: string) {
  target[property] = value.trim() ? value : undefined
}

function indexedAction(field: string): { action: string; index: number; subIndex: number; property: string } | undefined {
  const parts = field.split(':')
  const indexedMatch = parts[0]?.match(/^form(Field|Option|Constraint|Property)(Add|Remove|MoveUp|MoveDown|Set)$/)
  const simpleMatch = parts[0]?.match(/^formField(Add|Remove|MoveUp|MoveDown)$/)
  const match = indexedMatch ? [indexedMatch[0], indexedMatch[1], indexedMatch[2]] : simpleMatch ? [simpleMatch[0], 'Field', simpleMatch[1]] : undefined
  if (!match) return undefined
  const isField = match[1] === 'Field'
  return {
    action: `form${match[1]}${match[2]}`,
    index: Number(parts[1] ?? -1),
    subIndex: isField ? -1 : Number(parts[2] ?? -1),
    property: parts[isField ? 2 : 3] ?? '',
  }
}

export function camundaFormPatch(
  moddle: ModdleFactory,
  element: ModdleElement,
  field: string,
  value: string,
): Record<string, unknown> {
  if (field === 'formKey') {
    return { 'camunda:formKey': value.trim() || undefined, 'camunda:formRef': undefined, 'camunda:formRefBinding': undefined, 'camunda:formRefVersion': undefined }
  }
  if (field === 'formRef') {
    return { 'camunda:formKey': undefined, 'camunda:formRef': value.trim() || undefined, ...(!value.trim() ? { 'camunda:formRefBinding': undefined, 'camunda:formRefVersion': undefined } : {}) }
  }
  if (field === 'formRefBinding' || field === 'formRefVersion') {
    return { [`camunda:${field}`]: value.trim() || undefined }
  }
  const action = indexedAction(field)
  if (!action && field !== 'formBusinessKey') throw new Error(`不支持的表单属性：${field}`)
  const { extension, formData } = editableFormData(moddle, element)
  if (field === 'formBusinessKey') setValue(formData, 'businessKey', value)
  else {
    const fields = [...valuesOf(formData, 'fields')]
    if (action!.action === 'formFieldAdd') {
      const created = moddle.create('camunda:FormField', { type: 'string', values: [] })
      created.$parent = formData
      fields.push(created)
      formData.fields = fields
    } else if (action!.action === 'formFieldRemove' || action!.action === 'formFieldMoveUp' || action!.action === 'formFieldMoveDown') {
      const from = action!.index
      if (from < 0 || from >= fields.length) return {}
      if (action!.action === 'formFieldRemove') fields.splice(from, 1)
      else {
        const to = from + (action!.action === 'formFieldMoveUp' ? -1 : 1)
        if (to < 0 || to >= fields.length) return {}
        ;[fields[from], fields[to]] = [fields[to]!, fields[from]!]
      }
    } else {
      const fieldNode = fields[action!.index]
      if (!fieldNode) return {}
      const fieldValues = [...valuesOf(fieldNode, 'values')]
      const validations = fieldNode.validation as ModdleElement | undefined
      const constraints = [...valuesOf(validations, 'constraints')]
      const propertiesNode = fieldNode.properties as ModdleElement | undefined
      const formProperties = [...valuesOf(propertiesNode, 'values')]
      if (action!.action === 'formFieldSet') {
        const propertyMap: Record<string, string> = { id: 'id', label: 'label', type: 'type', default: 'defaultValue', datePattern: 'datePattern' }
        const property = propertyMap[action!.property]
        if (!property) throw new Error(`不支持的表单字段属性：${action!.property}`)
        setValue(fieldNode, property, value)
      } else if (action!.action === 'formOptionAdd') {
        const option = moddle.create('camunda:Value', {})
        option.$parent = fieldNode
        fieldNode.values = [...fieldValues, option]
      } else if (action!.action === 'formOptionRemove' || action!.action === 'formOptionMoveUp' || action!.action === 'formOptionMoveDown') {
        const from = action!.subIndex
        if (from < 0 || from >= fieldValues.length) return {}
        if (action!.action === 'formOptionRemove') fieldNode.values = fieldValues.filter((_, index) => index !== from)
        else {
          const to = from + (action!.action === 'formOptionMoveUp' ? -1 : 1)
          if (to < 0 || to >= fieldValues.length) return {}
          ;[fieldValues[from], fieldValues[to]] = [fieldValues[to]!, fieldValues[from]!]
          fieldNode.values = fieldValues
        }
      } else if (action!.action === 'formOptionSet') {
        const option = fieldValues[action!.subIndex]
        const property = action!.property === 'id' || action!.property === 'name' ? action!.property : ''
        if (!option || !property) return {}
        setValue(option, property, value)
      } else if (action!.action === 'formConstraintAdd') {
        const constraint = moddle.create('camunda:Constraint', {})
        constraint.$parent = validations ?? undefined
        const nextValidation = validations ?? moddle.create('camunda:Validation', {})
        nextValidation.$parent = fieldNode
        nextValidation.constraints = [...constraints, constraint]
        fieldNode.validation = nextValidation
      } else if (action!.action === 'formConstraintRemove') {
        if (!validations || action!.subIndex < 0 || action!.subIndex >= constraints.length) return {}
        validations.constraints = constraints.filter((_, index) => index !== action!.subIndex)
      } else if (action!.action === 'formConstraintSet') {
        const constraint = constraints[action!.subIndex]
        if (!constraint || !['name', 'config'].includes(action!.property)) return {}
        setValue(constraint, action!.property, value)
      } else if (action!.action === 'formPropertyAdd') {
        const item = moddle.create('camunda:Property', {})
        const nextProperties = propertiesNode ?? moddle.create('camunda:Properties', {})
        nextProperties.$parent = fieldNode
        item.$parent = nextProperties
        nextProperties.values = [...formProperties, item]
        fieldNode.properties = nextProperties
      } else if (action!.action === 'formPropertyRemove') {
        if (!propertiesNode || action!.subIndex < 0 || action!.subIndex >= formProperties.length) return {}
        propertiesNode.values = formProperties.filter((_, index) => index !== action!.subIndex)
      } else if (action!.action === 'formPropertySet') {
        const item = formProperties[action!.subIndex]
        const property = action!.property === 'id' || action!.property === 'value' ? action!.property : ''
        if (!item || !property) return {}
        setValue(item, property, value)
      } else throw new Error(`不支持的表单编辑操作：${action!.action}`)
      fields[action!.index] = fieldNode
      formData.fields = fields
    }
  }
  return { extensionElements: extension }
}
