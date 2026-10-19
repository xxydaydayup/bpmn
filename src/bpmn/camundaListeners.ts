import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export type CamundaListenerKind = 'execution' | 'task'
export type CamundaListenerImplementation = 'expression' | 'class' | 'delegateExpression' | 'script'
export type CamundaListenerFieldType = 'string' | 'expression'

export interface CamundaListenerFieldSnapshot {
  index: number
  name: string
  type: CamundaListenerFieldType
  value: string
}

export interface CamundaListenerSnapshot {
  kind: CamundaListenerKind
  index: number
  event: string
  implementation: CamundaListenerImplementation
  expression: string
  className: string
  delegateExpression: string
  scriptFormat: string
  scriptResource: string
  scriptBody: string
  fields: CamundaListenerFieldSnapshot[]
}

export function readCamundaListeners(element: ModdleElement, kind: CamundaListenerKind): CamundaListenerSnapshot[] {
  const type = kind === 'execution' ? 'camunda:ExecutionListener' : 'camunda:TaskListener'
  const extensions = (element.extensionElements?.values ?? []) as ModdleElement[]
  return extensions
    .filter(extension => extension.$type === type)
    .map((listener, index) => readListener(listener, kind, index))
}

export function createCamundaListener(moddle: { create(type: string, properties?: Record<string, unknown>): ModdleElement }, kind: CamundaListenerKind) {
  return moddle.create(kind === 'execution' ? 'camunda:ExecutionListener' : 'camunda:TaskListener', {
    event: '',
    fields: [],
  })
}

export function createListenerField(
  moddle: { create(type: string, properties?: Record<string, unknown>): ModdleElement },
  field: Pick<CamundaListenerFieldSnapshot, 'name' | 'type' | 'value'>,
): ModdleElement {
  return moddle.create('camunda:Field', {
    name: field.name,
    ...(field.type === 'expression'
      ? { expression: field.value }
      : { string: field.value }),
  })
}

export function listenerFieldPatch(
  field: ModdleElement,
  patch: Pick<CamundaListenerFieldSnapshot, 'name' | 'type' | 'value'>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(field.$attrs ?? {}),
    name: patch.name,
    expression: undefined,
    string: undefined,
    stringValue: undefined,
  }
  if (patch.type === 'expression') {
    next.expression = patch.value
    delete next.string
    delete next.stringValue
  } else {
    next.string = patch.value
    delete next.expression
    delete next.stringValue
  }
  return next
}

export function listenerImplementationPatch(
  listener: ModdleElement,
  implementation: CamundaListenerImplementation,
  create: (type: string) => ModdleElement,
): Record<string, unknown> {
  return {
    expression: implementation === 'expression' ? listener.expression : undefined,
    class: implementation === 'class' ? listener.class : undefined,
    delegateExpression: implementation === 'delegateExpression' ? listener.delegateExpression : undefined,
    script: implementation === 'script' ? listener.script ?? create('camunda:Script') : undefined,
  }
}

export function validateCamundaListener(snapshot: CamundaListenerSnapshot): string[] {
  const errors: string[] = []
  if (!snapshot.event.trim()) errors.push('监听器事件不能为空')
  else if (!(snapshot.kind === 'execution' ? ['start', 'end', 'take'] : ['create', 'assignment', 'complete', 'delete', 'timeout', 'update']).includes(snapshot.event)) {
    errors.push('监听器事件不属于 Camunda 支持的事件类型')
  }
  if (snapshot.implementation === 'expression' && !snapshot.expression.trim()) errors.push('Expression 执行方式需要填写表达式')
  if (snapshot.implementation === 'class' && !snapshot.className.trim()) errors.push('Java class 执行方式需要填写类名')
  if (snapshot.implementation === 'delegateExpression' && !snapshot.delegateExpression.trim()) errors.push('Delegate expression 执行方式需要填写表达式')
  if (snapshot.implementation === 'script') {
    if (!snapshot.scriptFormat.trim()) errors.push('Script 执行方式需要填写脚本格式')
    if (!snapshot.scriptResource.trim() && !snapshot.scriptBody.trim()) errors.push('Script 执行方式需要填写脚本资源或脚本正文')
  }
  snapshot.fields.forEach((field, index) => {
    if (!field.name.trim()) errors.push(`Field ${index + 1} 缺少名称`)
  })
  return errors
}

function readListener(listener: ModdleElement, kind: CamundaListenerKind, index: number): CamundaListenerSnapshot {
  const script = listener.script as ModdleElement | undefined
  const implementation: CamundaListenerImplementation = script ? 'script'
    : listener.expression ? 'expression'
      : listener.delegateExpression ? 'delegateExpression'
        : listener.class ? 'class'
          : 'expression'
  const fields = (listener.fields ?? []) as ModdleElement[]
  return {
    kind,
    index,
    event: listener.event ?? '',
    implementation,
    expression: listener.expression ?? '',
    className: listener.class ?? '',
    delegateExpression: listener.delegateExpression ?? '',
    scriptFormat: script?.scriptFormat ?? '',
    scriptResource: script?.resource ?? '',
    scriptBody: script?.value ?? '',
    fields: fields.map((field, fieldIndex) => ({
      index: fieldIndex,
      name: field.name ?? '',
      type: field.expression ? 'expression' : 'string',
      value: field.expression ?? field.string ?? field.stringValue ?? '',
    })),
  }
}
