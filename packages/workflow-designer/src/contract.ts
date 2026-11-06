import type { WorkflowDesignDocument, WorkflowEditorState, WorkflowInput, WorkflowModel, WorkflowValidationIssue } from './types'

export const WORKFLOW_NODE_TYPES = ['start', 'approval', 'countersign', 'service', 'receive', 'timer', 'condition', 'end'] as const
const MODEL_KEYS = new Set(['processId', 'processName', 'nodes', 'flows'])
const NODE_KEYS = new Set(['id', 'type', 'name', 'x', 'y', 'form', 'messageName', 'timerType', 'timerValue', 'sequential', 'reminder', 'serviceName', 'serviceUrl', 'countersign', 'approveMode', 'passRate'])
const FLOW_KEYS = new Set(['source', 'target', 'branch', 'conditionExpression'])

export interface ParsedWorkflowInput {
  document: WorkflowDesignDocument | Record<string, unknown>
  model: WorkflowModel
  editor: WorkflowEditorState
  readonly: boolean
  unsupportedEnvelope: boolean
  unknownPaths: string[]
  original?: Record<string, unknown>
}

export function isWorkflowModel(value: unknown): value is WorkflowModel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.processId === 'string' && typeof candidate.processName === 'string' && Array.isArray(candidate.nodes) && Array.isArray(candidate.flows)
}

function isEnvelope(value: Record<string, unknown>) {
  return value.format === 'workflow-designer' && 'version' in value && 'model' in value
}

export function createDesignDocument(model: WorkflowModel, editor: WorkflowEditorState = {}): WorkflowDesignDocument {
  return { format: 'workflow-designer', version: 1, model, editor }
}

function findUnknownPaths(model: WorkflowModel) {
  const result: string[] = []
  for (const key of Object.keys(model)) if (!MODEL_KEYS.has(key)) result.push(`model.${key}`)
  model.nodes.forEach((node, index) => {
    for (const key of Object.keys(node)) if (!NODE_KEYS.has(key)) result.push(`model.nodes[${index}].${key}`)
    if (!WORKFLOW_NODE_TYPES.includes(node.type as (typeof WORKFLOW_NODE_TYPES)[number])) result.push(`model.nodes[${index}].type:${node.type}`)
    if (node.reminder && Object.keys(node.reminder).some(key => !['duration', 'action', 'target', 'name'].includes(key))) result.push(`model.nodes[${index}].reminder`)
  })
  model.flows.forEach((flow, index) => {
    for (const key of Object.keys(flow)) if (!FLOW_KEYS.has(key)) result.push(`model.flows[${index}].${key}`)
    if (flow.branch !== undefined && flow.branch !== 'pass' && flow.branch !== 'reject') result.push(`model.flows[${index}].branch`)
  })
  return result
}

export function parseWorkflowInput(input: WorkflowInput): ParsedWorkflowInput {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  if (isEnvelope(value)) {
    const rawModel = value.model
    const validModel = isWorkflowModel(rawModel)
    const model = validModel ? rawModel : { processId: '', processName: '', nodes: [], flows: [] } as WorkflowModel
    const future = value.version !== 1
    const preserveEnvelope = future || !validModel
    return {
      document: value,
      model,
      editor: (value.editor && typeof value.editor === 'object' ? value.editor : {}) as WorkflowEditorState,
      readonly: preserveEnvelope,
      unsupportedEnvelope: preserveEnvelope,
      unknownPaths: validModel ? findUnknownPaths(model) : ['model 格式无效'],
      original: value,
    }
  }
  if (isWorkflowModel(value)) {
    const editor: WorkflowEditorState = {}
    return { document: createDesignDocument(value, editor), model: value, editor, readonly: false, unsupportedEnvelope: false, unknownPaths: findUnknownPaths(value), original: value }
  }
  const empty = { processId: '', processName: '', nodes: [], flows: [] } as WorkflowModel
  return { document: value, model: empty, editor: {}, readonly: true, unsupportedEnvelope: true, unknownPaths: ['无法识别设计稿格式'], original: value }
}

export function workflowIssues(model: WorkflowModel, extra: WorkflowValidationIssue[] = []): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [...extra]
  const ids = new Set<string>()
  const byId = new Map(model.nodes.map(node => [node.id, node]))
  if (!model.processName.trim()) issues.push({ code: 'process-name', message: '请填写流程名称。' })
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(model.processId)) issues.push({ code: 'process-id', message: '流程标识必须以英文字母开头，只能包含英文字母、数字、下划线和连字符。' })
  if (model.nodes.filter(node => node.type === 'start').length !== 1) issues.push({ code: 'start-count', message: '流程需要且只能有一个开始节点。' })
  if (model.nodes.filter(node => node.type === 'end').length !== 1) issues.push({ code: 'end-count', message: '流程需要且只能有一个结束节点。' })
  for (const node of model.nodes) {
    if (!node.id.trim() || ids.has(node.id)) issues.push({ code: 'node-id', message: `节点标识为空或重复：${node.id}`, nodeId: node.id })
    ids.add(node.id)
    if (!node.name.trim()) issues.push({ code: 'node-name', message: '请填写节点名称。', nodeId: node.id })
    if (!WORKFLOW_NODE_TYPES.includes(node.type as (typeof WORKFLOW_NODE_TYPES)[number])) issues.push({ code: 'unknown-node', message: `暂不支持“${node.type}”节点，保留原始数据但不能编译。`, nodeId: node.id })
  }
  const ordinary = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const pairs = new Set<string>()
  for (const [index, flow] of model.flows.entries()) {
    const edgeId = `flow-${index}`
    const source = byId.get(flow.source)
    const target = byId.get(flow.target)
    if (!source || !target) { issues.push({ code: 'flow-reference', message: '连线引用了不存在的节点。', edgeId }); continue }
    if (flow.source === flow.target) issues.push({ code: 'self-link', message: '节点不能连接到自身。', edgeId })
    const pair = `${flow.source}→${flow.target}`
    if (pairs.has(pair)) issues.push({ code: 'duplicate-flow', message: '同一对节点之间存在重复连线。', edgeId })
    pairs.add(pair)
    if (source.type === 'end') issues.push({ code: 'end-outgoing', message: '结束节点不能有后续步骤。', edgeId })
    if (target.type === 'start') issues.push({ code: 'start-incoming', message: '开始节点不能有上游步骤。', edgeId })
    outgoing.set(flow.source, [...(outgoing.get(flow.source) ?? []), flow.target])
    if (flow.branch !== 'reject') ordinary.set(flow.source, [...(ordinary.get(flow.source) ?? []), flow.target])
  }
  for (const node of model.nodes) {
    if (node.type !== 'end' && !outgoing.has(node.id)) issues.push({ code: 'no-outgoing', message: `“${node.name || node.id}”没有后续步骤。`, nodeId: node.id })
    if (node.type !== 'start' && !model.flows.some(flow => flow.target === node.id)) issues.push({ code: 'no-incoming', message: `“${node.name || node.id}”没有上游步骤。`, nodeId: node.id })
    if (node.type === 'service' && node.serviceUrl?.trim()) {
      try { const url = new URL(node.serviceUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('scheme') }
      catch { issues.push({ code: 'service-url', message: '服务地址必须是有效的 HTTP 或 HTTPS URL。', nodeId: node.id }) }
    }
    if (node.type === 'receive' && node.messageName !== undefined && typeof node.messageName !== 'string') {
      issues.push({ code: 'message-name-type', message: '消息名必须是文本。', nodeId: node.id })
    }
    if (node.type === 'timer') {
      if (node.timerType !== undefined && !['duration', 'date', 'cycle'].includes(String(node.timerType))) {
        issues.push({ code: 'timer-type', message: '等待条件仅支持时长、指定时刻或周期。', nodeId: node.id })
      }
      if (node.timerValue !== undefined && typeof node.timerValue !== 'string') {
        issues.push({ code: 'timer-value-type', message: '定时时间必须是文本。', nodeId: node.id })
      }
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>()
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const target of ordinary.get(id) ?? []) if (hasCycle(target)) return true
    visiting.delete(id); visited.add(id); return false
  }
  if (model.nodes.some(node => hasCycle(node.id))) issues.push({ code: 'cycle', message: '普通流转路径不能形成循环；驳回回流请标记为 reject 分支。' })
  return issues
}
