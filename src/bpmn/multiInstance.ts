import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export type MultiInstanceMode = 'collection' | 'cardinality'

export interface MultiInstanceSnapshot {
  enabled: boolean
  mode: MultiInstanceMode
  sequential: boolean
  collection: string
  elementVariable: string
  cardinality: string
  completionCondition: string
  readOnlyReason: string
}

interface ModdleFactory {
  create(type: string, properties: Record<string, unknown>): ModdleElement
}

export function readMultiInstance(activity: ModdleElement): MultiInstanceSnapshot {
  const loop = activity.loopCharacteristics
  const enabled = loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
  const collection = enabled ? String(loop.get('camunda:collection') ?? '') : ''
  const cardinality = enabled ? String(loop.loopCardinality?.body ?? '') : ''
  let readOnlyReason = ''
  if (loop && !enabled) readOnlyReason = '现有循环类型不是 Camunda 多实例；本面板不会覆盖该配置'
  else if (enabled && collection.trim() && cardinality.trim() && !loop.completionCondition && !loop.inputDataItem && !loop.outputDataItem) {
    readOnlyReason = '集合绑定和循环次数同时存在；请在 XML 中确认引擎执行语义'
  }
  return {
    enabled: !!enabled,
    mode: collection.trim() || !loop?.loopCardinality ? 'collection' : 'cardinality',
    sequential: !!loop?.isSequential,
    collection,
    elementVariable: enabled ? String(loop.get('camunda:elementVariable') ?? '') : '',
    cardinality,
    completionCondition: enabled ? String(loop.completionCondition?.body ?? '') : '',
    readOnlyReason,
  }
}

function copiedProperties(loop: ModdleElement): Record<string, unknown> {
  return Object.fromEntries(Object.entries(loop).filter(([key, value]) => !key.startsWith('$') && value !== undefined))
}

export function multiInstancePatch(
  moddle: ModdleFactory,
  activity: ModdleElement,
  field: string,
  value: string,
): Record<string, unknown> {
  const previous = readMultiInstance(activity)
  if (previous.readOnlyReason) throw new Error(previous.readOnlyReason)
  if (field === 'multiInstanceEnabled' && value !== 'true') {
    if (activity.loopCharacteristics?.inputDataItem || activity.loopCharacteristics?.outputDataItem) {
      throw new Error('多实例包含输入/输出数据项；请使用 XML 编辑确认后再移除多实例')
    }
    return { loopCharacteristics: undefined }
  }

  const existing = activity.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
    ? activity.loopCharacteristics : undefined
  const mode = field === 'multiInstanceMode' ? value as MultiInstanceMode
    : field === 'multiInstanceEnabled' && value === 'true' ? 'collection' : previous.mode
  if (mode !== 'collection' && mode !== 'cardinality') throw new Error('多实例来源必须是集合或循环次数')

  const properties = existing ? copiedProperties(existing) : {}
  if (existing?.$attrs) Object.assign(properties, existing.$attrs)
  if (existing) {
    const descriptor = existing.$descriptor as { properties?: Array<{ name: string }> }
    for (const property of descriptor.properties ?? []) {
      if (existing[property.name] === undefined) delete properties[property.name]
    }
    for (const [key, attribute] of Object.entries(existing.$attrs ?? {})) {
      if ((attribute as string | undefined)?.startsWith('bpmn:')) delete properties[key]
    }
  }
  const sequential = field === 'multiInstanceOrder' ? value === 'sequential' : previous.sequential
  properties.isSequential = sequential

  if (mode === 'collection') {
    delete properties.loopCardinality
    properties.collection = field === 'multiInstanceCollection' ? value.trim() || undefined : previous.collection || undefined
    properties.elementVariable = field === 'multiInstanceElementVariable' ? value.trim() || undefined : previous.elementVariable || undefined
  } else {
    delete properties.collection
    delete properties.elementVariable
    const body = field === 'multiInstanceCardinality' ? value.trim() : previous.cardinality
    properties.loopCardinality = moddle.create('bpmn:FormalExpression', {
      ...(existing?.loopCardinality ? Object.fromEntries(Object.entries(existing.loopCardinality).filter(([key, item]) => !key.startsWith('$') && item !== undefined)) : {}),
      ...(existing?.loopCardinality?.$attrs ?? {}),
      body: body ?? '',
    })
  }

  if (field === 'multiInstanceCompletionCondition') {
    const body = value.trim()
    if (body) {
      const previousCondition = existing?.completionCondition
      properties.completionCondition = moddle.create('bpmn:FormalExpression', {
        ...(previousCondition ? copiedProperties(previousCondition) : {}),
        ...(previousCondition?.$attrs ?? {}),
        body: value,
      })
    } else {
      properties.completionCondition = undefined
    }
  }

  const loop = moddle.create('bpmn:MultiInstanceLoopCharacteristics', properties)
  if (existing?.$children) {
    loop.$children = [...existing.$children]
    loop.$children.forEach((child: ModdleElement) => { child.$parent = loop })
  }
  if (existing?.$attrs) {
    for (const [key, item] of Object.entries(existing.$attrs)) {
      if (!(item as string | undefined)?.startsWith('bpmn:')) loop.$attrs[key] = item
    }
  }
  if (existing?.$attrs) Object.assign(loop.$attrs, existing.$attrs)
  loop.$parent = activity
  if (loop.loopCardinality) loop.loopCardinality.$parent = loop
  if (loop.completionCondition) loop.completionCondition.$parent = loop
  if (loop.inputDataItem) loop.inputDataItem.$parent = loop
  if (loop.outputDataItem) loop.outputDataItem.$parent = loop
  return { loopCharacteristics: loop }
}
