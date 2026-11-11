import type { WorkflowDesignDocument, WorkflowEditorState, WorkflowInput, WorkflowModel, WorkflowValidationIssue } from './types'
import { getWorkflowNodeDefinition, isWorkflowNodeType } from './nodes'
export { WORKFLOW_NODE_TYPES } from './nodes'

const MODEL_KEYS = new Set(['processId', 'processName', 'nodes', 'flows', 'width', 'height', 'bizFormKey'])
const EMBEDDED_PROCESS_KEYS = new Set(['processId', 'processName', 'nodes', 'flows'])
const NODE_KEYS = new Set(['id', 'type', 'name', 'x', 'y', 'width', 'height', 'bizType', 'form', 'messageName', 'timerType', 'timerValue', 'sequential', 'reminder', 'serviceName', 'serviceUrl', 'countersign', 'approveMode', 'passRate', 'process', 'subProcessKey', 'subProcessName', 'statusVariable', 'allowTransfer', 'allowAddSigner', 'bizFormKey', 'assignee'])
const FLOW_KEYS = new Set(['id', 'source', 'target', 'branch', 'conditionExpression'])
const MODEL_DEPTH_LIMIT = 100

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
  return typeof candidate.processId === 'string'
    && (candidate.processName === undefined || typeof candidate.processName === 'string')
    && Array.isArray(candidate.nodes)
    && (candidate.flows === undefined || Array.isArray(candidate.flows))
}

function normalizeWorkflowModel(value: Record<string, unknown>): WorkflowModel {
  const processId = String(value.processId ?? '')
  const nodes = Array.isArray(value.nodes) ? value.nodes.map((item, index) => {
    const node = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
    return {
      ...node,
      id: String(node.id ?? ''),
      type: String(node.type ?? ''),
      name: String(node.name ?? ''),
      x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 300,
      y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 80 + index * 120,
    }
  }) as WorkflowModel['nodes'] : []
  return { ...value, processId, processName: String(value.processName ?? processId), nodes, flows: Array.isArray(value.flows) ? value.flows as WorkflowModel['flows'] : [] } as WorkflowModel
}

function isEnvelope(value: Record<string, unknown>) {
  return value.format === 'workflow-designer' && 'version' in value && 'model' in value
}

export function createDesignDocument(model: WorkflowModel, editor: WorkflowEditorState = {}): WorkflowDesignDocument {
  return { format: 'workflow-designer', version: 1, model, editor }
}


function findUnknownPaths(model: WorkflowModel, path = 'model', depth = 0, embedded = false): string[] {
  const result: string[] = []
  const allowedModelKeys = embedded ? EMBEDDED_PROCESS_KEYS : MODEL_KEYS
  for (const key of Object.keys(model)) if (!allowedModelKeys.has(key)) result.push(`${path}.${key}`)
  if (depth > MODEL_DEPTH_LIMIT) { result.push(`${path}.nodes (子流程嵌套超过安全检查上限)`); return result }
  model.nodes.forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`
    for (const key of Object.keys(node)) if (!NODE_KEYS.has(key)) result.push(`${nodePath}.${key}`)
    if (!isWorkflowNodeType(node.type)) result.push(`${nodePath}.type:${node.type}`)
    if (node.reminder && Object.keys(node.reminder).some(key => !['duration', 'action', 'target', 'terminate', 'name'].includes(key))) {
      for (const key of Object.keys(node.reminder)) if (!['duration', 'action', 'target', 'terminate', 'name'].includes(key)) result.push(`${nodePath}.reminder.${key}`)
    }
    if (node.type === 'subProcess' && node.process && Array.isArray(node.process.nodes)) {
      const process = { ...node.process, flows: Array.isArray(node.process.flows) ? node.process.flows : [] } as WorkflowModel
      result.push(...findUnknownPaths(process, `${nodePath}.process`, depth + 1, true))
    }
  })
  model.flows.forEach((flow, index) => {
    const flowPath = `${path}.flows[${index}]`
    for (const key of Object.keys(flow)) if (!FLOW_KEYS.has(key)) result.push(`${flowPath}.${key}`)
  })
  return result
}

export function parseWorkflowInput(input: WorkflowInput): ParsedWorkflowInput {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  if (isEnvelope(value)) {
    const rawModel = value.model
    const validModel = isWorkflowModel(rawModel)
    const model = validModel ? normalizeWorkflowModel(rawModel as Record<string, unknown>) : { processId: '', processName: '', nodes: [], flows: [] } as WorkflowModel
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
    const model = normalizeWorkflowModel(value)
    const editor: WorkflowEditorState = {}
    return { document: createDesignDocument(model, editor), model, editor, readonly: false, unsupportedEnvelope: false, unknownPaths: findUnknownPaths(model), original: value }
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
    if (!isWorkflowNodeType(node.type)) issues.push({ code: 'unknown-node', message: `暂不支持“${node.type}”节点，保留原始数据但不能编译。`, nodeId: node.id })
    else issues.push(...(getWorkflowNodeDefinition(node.type)?.checkValid?.(node) ?? []))
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
