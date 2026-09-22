import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export type ServiceImplementation = 'none' | 'external' | 'class' | 'delegateExpression' | 'expression'

export interface ServiceTaskSnapshot {
  implementation: ServiceImplementation
  topic: string
  className: string
  delegateExpression: string
  expression: string
  resultVariable: string
  readOnlyReason: string
}

export function readServiceTask(task: ModdleElement): ServiceTaskSnapshot {
  const type = String(task.get('camunda:type') ?? '')
  const className = String(task.get('camunda:class') ?? '')
  const delegateExpression = String(task.get('camunda:delegateExpression') ?? '')
  const expression = String(task.get('camunda:expression') ?? '')
  const configured = [type === 'external', !!className, !!delegateExpression, !!expression].filter(Boolean).length
  const implementation: ServiceImplementation = type === 'external' ? 'external'
    : className ? 'class' : delegateExpression ? 'delegateExpression' : expression ? 'expression' : 'none'
  return {
    implementation,
    topic: String(task.get('camunda:topic') ?? ''),
    className,
    delegateExpression,
    expression,
    resultVariable: String(task.get('camunda:resultVariable') ?? ''),
    readOnlyReason: configured > 1 ? '服务任务包含互斥的多种执行方式，请在 XML 中确认后再修改'
      : type && type !== 'external' || (!type && String(task.get('camunda:topic') ?? ''))
        ? '服务任务包含当前面板不支持的 Camunda type/topic 组合；请使用 XML 编辑以保留语义' : '',
  }
}

export function serviceTaskPatch(
  task: ModdleElement,
  field: string,
  value: string,
): Record<string, unknown> {
  const previous = readServiceTask(task)
  if (previous.readOnlyReason) throw new Error(previous.readOnlyReason)
  const implementation = field === 'serviceImplementation' ? value as ServiceImplementation : previous.implementation
  if (!['none', 'external', 'class', 'delegateExpression', 'expression'].includes(implementation)) {
    throw new Error('请选择有效的 Camunda 服务任务执行方式')
  }
  const patch: Record<string, unknown> = {
    'camunda:type': implementation === 'external' ? 'external' : undefined,
    'camunda:topic': implementation === 'external'
      ? field === 'serviceTopic' ? value.trim() || undefined : previous.topic || undefined
      : undefined,
    'camunda:class': implementation === 'class'
      ? field === 'serviceClass' ? value.trim() || undefined : previous.className || undefined
      : undefined,
    'camunda:delegateExpression': implementation === 'delegateExpression'
      ? field === 'serviceDelegateExpression' ? value.trim() || undefined : previous.delegateExpression || undefined
      : undefined,
    'camunda:expression': implementation === 'expression'
      ? field === 'serviceExpression' ? value.trim() || undefined : previous.expression || undefined
      : undefined,
    'camunda:resultVariable': implementation === 'expression'
      ? field === 'serviceResultVariable' ? value.trim() || undefined : previous.resultVariable || undefined
      : undefined,
  }
  if (implementation === 'none') return patch
  return patch
}
