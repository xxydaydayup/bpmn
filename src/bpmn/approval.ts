import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export type ApprovalMode = 'single' | 'all' | 'any' | 'unconfigured'
export interface ApprovalSnapshot {
  mode: ApprovalMode
  sequential: boolean
  participants: string[]
  multiInstance: boolean
  readOnlyReason: string
  issues: Array<{ code: string; message: string; severity: 'error' | 'warning' }>
}

interface ModdleFactory { create(type: string, properties: Record<string, unknown>): ModdleElement }

/** Read-only snapshots; never expose moddle objects to Vue or the graph validator. */
export function readApproval(task: ModdleElement): ApprovalSnapshot {
  const loop = task.loopCharacteristics
  const configs = (task.extensionElements?.values ?? []).filter((item: ModdleElement) => item.$type === 'wf:Approval')
  const config = configs[0]
  const multiInstance = loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
  const snapshot: ApprovalSnapshot = {
    mode: config?.policy === 'all' || config?.policy === 'any' ? config.policy : loop || config ? 'unconfigured' : 'single',
    sequential: !!loop?.isSequential,
    participants: (config?.participants ?? []).map((item: ModdleElement) => String(item.userId ?? '')),
    multiInstance,
    readOnlyReason: '', issues: [],
  }
  const add = (code: string, message: string, severity: 'error' | 'warning' = 'error') => snapshot.issues.push({ code, message, severity })
  if (configs.length > 1 || (config && (config.version !== '1' || !['all', 'any'].includes(config.policy)))) {
    snapshot.readOnlyReason = '审批扩展重复、版本或策略无法识别，请在 XML 中检查后再配置'
    add('invalid-approval', snapshot.readOnlyReason)
  }
  if (config && (Object.keys(config.$attrs ?? {}).length
    || (config.participants ?? []).some((item: ModdleElement) => Object.keys(item.$attrs ?? {}).length))) {
    snapshot.readOnlyReason ||= '审批名单包含额外扩展属性，请使用 XML 编辑以保留这些配置'
    add('extended-approval', snapshot.readOnlyReason, 'warning')
  }
  // Preserve imported engine bindings, expressions and unknown loop semantics verbatim.
  const loopKeys = ['id', 'documentation', 'isSequential', 'loopCardinality']
  const foreignLoop = loop && (!multiInstance
    || Object.entries(loop).some(([key, value]) => value !== undefined && !key.startsWith('$') && !loopKeys.includes(key))
    || Object.keys(loop.$attrs ?? {}).length > 0
    || (loop.loopCardinality && (!/^\d+$/.test(loop.loopCardinality.body ?? '')
      || loop.loopCardinality.language || Object.keys(loop.loopCardinality.$attrs ?? {}).some(key => key !== 'xsi:type'))))
  if (foreignLoop) {
    snapshot.readOnlyReason ||= '已有循环包含集合绑定、完成条件或其他高级配置；本面板保留原文，请使用 XML 编辑'
    add('unsupported-loop', '已有多实例/循环配置超出固定名单范围，人员分配与循环执行语义未检查', 'warning')
  }
  if (config) {
    if (!multiInstance) add('approval-loop-conflict', '多人审批配置与画布的多实例标记不一致，请同步配置')
    if (task.get('wf:assignee')?.trim()) add('approval-assignee-conflict', '多人名单与单人办理人同时存在，请同步配置')
    if (!snapshot.participants.length || snapshot.participants.some(user => !user.trim())) add('empty-participants', '审批参与人名单不能为空，也不能包含空白项')
    const normalized = snapshot.participants.map(user => user.trim())
    if (new Set(normalized).size !== normalized.length) add('duplicate-participants', '审批参与人名单有重复用户')
    if (multiInstance && !foreignLoop && loop.loopCardinality?.body !== String(snapshot.participants.length)) {
      add('approval-count-conflict', '多实例数量与名单人数不一致，请同步配置')
    }
  } else if (multiInstance && !foreignLoop) {
    add('missing-approval', '多实例任务尚未配置会签/或签及参与人名单')
  }
  return snapshot
}

function copy(moddle: ModdleFactory, item: ModdleElement, properties: Record<string, unknown>) {
  return moddle.create(item.$type, {
    ...Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('$'))),
    ...(item.$attrs ?? {}), ...properties,
  })
}

/** One updateProperties patch gives mode/list/order changes one atomic undo step. */
export function approvalPatch(moddle: ModdleFactory, task: ModdleElement, field: string, value: string): Record<string, unknown> {
  const previous = readApproval(task)
  if (previous.readOnlyReason) throw new Error(previous.readOnlyReason)
  const mode = field === 'approvalMode' ? value : previous.mode
  if (!['single', 'all', 'any'].includes(mode)) throw new Error('请先选择单人、会签或或签')
  const others = (task.extensionElements?.values ?? []).filter((item: ModdleElement) => item.$type !== 'wf:Approval')
  const participants = field === 'participants'
    ? value.trim() ? value.split(/\r?\n|[,，]/).map(user => user.trim()) : []
    : previous.mode === 'single' || previous.mode === 'unconfigured'
      ? task.get('wf:assignee')?.trim() ? [task.get('wf:assignee').trim()] : previous.participants
      : previous.participants
  let loop: ModdleElement | undefined
  let config: ModdleElement | undefined
  if (mode !== 'single') {
    config = moddle.create('wf:Approval', { version: '1', policy: mode,
      participants: participants.map(userId => moddle.create('wf:Participant', { userId })),
    })
    for (const participant of config.participants) participant.$parent = config
    const loopProperties = {
      isSequential: field === 'approvalOrder' ? value === 'sequential' : previous.sequential,
      loopCardinality: task.loopCharacteristics?.loopCardinality
        ? copy(moddle, task.loopCharacteristics.loopCardinality, { body: String(participants.length) })
        : moddle.create('bpmn:FormalExpression', { body: String(participants.length) }),
    }
    loop = task.loopCharacteristics ? copy(moddle, task.loopCharacteristics, loopProperties)
      : moddle.create('bpmn:MultiInstanceLoopCharacteristics', loopProperties)
    loop.$parent = task
    loop.loopCardinality.$parent = loop
  }
  const values = config ? [...others, config] : others
  const extensionElements = task.extensionElements ? copy(moddle, task.extensionElements, { values })
    : values.length ? moddle.create('bpmn:ExtensionElements', { values }) : undefined
  if (extensionElements) extensionElements.$parent = task
  if (config) config.$parent = extensionElements
  return {
    loopCharacteristics: loop, extensionElements,
    'wf:assignee': mode === 'single'
      ? previous.mode === 'single' ? task.get('wf:assignee') : previous.participants.length === 1 ? previous.participants[0] : undefined
      : undefined,
  }
}
