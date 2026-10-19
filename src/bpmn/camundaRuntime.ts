import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export interface RuntimeAttributesSnapshot {
  asyncBefore: boolean
  asyncAfter: boolean
  exclusive: boolean
  jobPriority: string
  failedJobRetryTimeCycle: string
}

export interface UserTaskRuntimeSnapshot {
  owner: string
  candidateUsers: string
  candidateGroups: string
  dueDate: string
  followUpDate: string
  priority: string
  description: string
}

export function readRuntimeAttributes(element: ModdleElement): RuntimeAttributesSnapshot {
  const retry = (element.extensionElements?.values ?? []).find((item: ModdleElement) => item.$type === 'camunda:FailedJobRetryTimeCycle') as ModdleElement | undefined
  return {
    asyncBefore: !!element.get('camunda:asyncBefore'),
    asyncAfter: !!element.get('camunda:asyncAfter'),
    exclusive: element.get('camunda:exclusive') !== false && element.get('camunda:exclusive') !== 'false',
    jobPriority: String(element.get('camunda:jobPriority') ?? ''),
    failedJobRetryTimeCycle: String(retry?.body ?? ''),
  }
}

export function runtimeAttributePatch(field: string, value: string): Record<string, unknown> {
  if (field === 'asyncBefore' || field === 'asyncAfter') return { [`camunda:${field}`]: value === 'true' }
  if (field === 'exclusive') return { 'camunda:exclusive': value === 'true' }
  if (field === 'jobPriority') return { 'camunda:jobPriority': value.trim() || undefined }
  throw new Error('不支持的 Camunda 运行属性')
}

export function retryCyclePatch(
  moddle: { create(type: string, properties: Record<string, unknown>): ModdleElement },
  element: ModdleElement,
  value: string,
): Record<string, unknown> {
  const extensions = element.extensionElements as ModdleElement | undefined
  const values = (extensions?.values ?? []) as ModdleElement[]
  const retry = values.find(item => item.$type === 'camunda:FailedJobRetryTimeCycle')
  if (!value.trim()) {
    if (!retry || !extensions) return {}
    const nextValues = values.filter(item => item !== retry)
    const hasUnknownChildren = !!extensions.$children?.length
    const hasUnknownAttributes = Object.keys(extensions.$attrs ?? {}).length > 0
    if (!nextValues.length && !hasUnknownChildren && !hasUnknownAttributes) return { extensionElements: undefined }
    const nextExtensions = moddle.create('bpmn:ExtensionElements', { values: nextValues })
    Object.assign(nextExtensions.$attrs, extensions.$attrs ?? {})
    nextExtensions.$children = [...(extensions.$children ?? [])]
    nextExtensions.$parent = element
    nextValues.forEach(item => { item.$parent = nextExtensions })
    nextExtensions.$children.forEach((child: ModdleElement) => { child.$parent = nextExtensions })
    return { extensionElements: nextExtensions }
  }
  const nextRetry = moddle.create('camunda:FailedJobRetryTimeCycle', { ...(retry?.$attrs ?? {}), body: value })
  if (retry?.$attrs) Object.assign(nextRetry.$attrs, retry.$attrs)
  const nextValues = retry ? values.map(item => item === retry ? nextRetry : item) : [...values, nextRetry]
  const nextExtensions = moddle.create('bpmn:ExtensionElements', { values: nextValues })
  Object.assign(nextExtensions.$attrs, extensions?.$attrs ?? {})
  nextExtensions.$children = [...(extensions?.$children ?? [])]
  nextExtensions.$parent = element
  nextValues.forEach(item => { item.$parent = nextExtensions })
  nextExtensions.$children.forEach((child: ModdleElement) => { child.$parent = nextExtensions })
  return { extensionElements: nextExtensions }
}

export function multiInstanceRetryCyclePatch(
  moddle: { create(type: string, properties: Record<string, unknown>): ModdleElement },
  activity: ModdleElement,
  value: string,
): Record<string, unknown> {
  const loop = activity.loopCharacteristics as ModdleElement | undefined
  if (loop?.$type !== 'bpmn:MultiInstanceLoopCharacteristics') return {}
  const patch = retryCyclePatch(moddle, loop, value)
  if (!('extensionElements' in patch)) return {}
  const properties: Record<string, unknown> = {}
  const descriptor = loop.$descriptor as { properties?: Array<{ name: string }> }
  for (const property of descriptor.properties ?? []) {
    const item = loop[property.name]
    if (item !== undefined) properties[property.name] = item
  }
  Object.assign(properties, loop.$attrs ?? {}, patch)
  const nextLoop = moddle.create('bpmn:MultiInstanceLoopCharacteristics', properties)
  Object.assign(nextLoop.$attrs, loop.$attrs ?? {})
  nextLoop.$children = [...(loop.$children ?? [])]
  nextLoop.$children.forEach((child: ModdleElement) => { child.$parent = nextLoop })
  nextLoop.$parent = activity
  for (const property of ['loopCardinality', 'completionCondition', 'inputDataItem', 'outputDataItem', 'extensionElements']) {
    const child = nextLoop[property] as ModdleElement | undefined
    if (child) child.$parent = nextLoop
  }
  if (nextLoop.extensionElements) {
    for (const child of (nextLoop.extensionElements.values ?? []) as ModdleElement[]) child.$parent = nextLoop.extensionElements
  }
  return { loopCharacteristics: nextLoop }
}

export function readUserTaskRuntime(task: ModdleElement): UserTaskRuntimeSnapshot {
  return {
    owner: String(task.get('camunda:owner') ?? ''),
    candidateUsers: String(task.get('camunda:candidateUsers') ?? ''),
    candidateGroups: String(task.get('camunda:candidateGroups') ?? ''),
    dueDate: String(task.get('camunda:dueDate') ?? ''),
    followUpDate: String(task.get('camunda:followUpDate') ?? ''),
    priority: String(task.get('camunda:priority') ?? ''),
    description: String(task.get('documentation') ?? ''),
  }
}

export function userTaskRuntimePatch(field: string, value: string): Record<string, unknown> {
  const map: Record<string, string> = {
    taskOwner: 'camunda:owner', taskDueDate: 'camunda:dueDate', taskFollowUpDate: 'camunda:followUpDate',
    taskPriority: 'camunda:priority', taskDescription: 'documentation',
    taskCandidateUsers: 'camunda:candidateUsers', taskCandidateGroups: 'camunda:candidateGroups',
  }
  const property = map[field]
  if (!property) throw new Error('不支持的 Camunda 人工任务属性')
  return { [property]: value.trim() || undefined }
}
