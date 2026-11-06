import { MarkerType, type Edge, type Node } from '@vue-flow/core'
import type { WorkflowEditorState, WorkflowFlowRecord, WorkflowModel, WorkflowNodeRecord, WorkflowNodeType } from './types'

export interface DesignerNodeData {
  kind: string
  name: string
  original: WorkflowNodeRecord
  custom: Record<string, unknown>
}
export interface DesignerEdgeData {
  branch?: string
  conditionExpression?: string
  original: WorkflowFlowRecord
}
export type DesignerNode = Node<DesignerNodeData, any, 'workflowNode'> & { data: DesignerNodeData }
export type DesignerEdge = Edge<DesignerEdgeData, any, 'workflowRoute'> & { data: DesignerEdgeData }

function createUuidV4() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (!cryptoApi?.getRandomValues) throw new Error('当前浏览器不支持安全随机数，无法生成节点标识。')

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createWorkflowNodeId(type: string, existingIds: Iterable<string> = []) {
  const prefix = /^[A-Za-z_][A-Za-z0-9_]*$/.test(type) ? type : 'node'
  const existing = new Set(existingIds)
  let id = ''
  do { id = `${prefix}_${createUuidV4().replaceAll('-', '')}` } while (existing.has(id))
  return id
}

export function remapWorkflowNodeIds(model: WorkflowModel, createId: (node: WorkflowNodeRecord, existingIds: Iterable<string>) => string): WorkflowModel {
  const usedIds = new Set<string>()
  const idMap = new Map<string, string>()
  const nodes = model.nodes.map(node => {
    const id = createId(node, usedIds)
    usedIds.add(id)
    idMap.set(node.id, id)
    return { ...node, id }
  }).map(node => {
    const reminder = node.reminder
    return reminder && typeof reminder === 'object' && typeof reminder.target === 'string'
      ? { ...node, reminder: { ...reminder, target: idMap.get(reminder.target) ?? reminder.target } }
      : node
  })
  return {
    ...model,
    nodes,
    flows: model.flows.map(flow => ({
      ...flow,
      source: idMap.get(flow.source) ?? flow.source,
      target: idMap.get(flow.target) ?? flow.target,
    })),
  }
}

export function cloneWorkflowModelWithFreshNodeIds(model: WorkflowModel): WorkflowModel {
  return remapWorkflowNodeIds(model, (node, existingIds) => createWorkflowNodeId(node.type, existingIds))
}

export function normalizeLegacyUuidNodeIds(model: WorkflowModel): WorkflowModel {
  const originalIds = model.nodes.map(node => node.id)
  return remapWorkflowNodeIds(model, (node, existingIds) => {
    const prefix = `${node.type}_`
    const suffix = node.id.startsWith(prefix) ? node.id.slice(prefix.length) : ''
    if (!/^([0-9a-f]{8})-([0-9a-f]{4})-4([0-9a-f]{3})-([89ab][0-9a-f]{3})-([0-9a-f]{12})$/i.test(suffix)) return node.id

    const compactId = `${prefix}${suffix.replaceAll('-', '')}`
    const unavailableIds = new Set([...originalIds.filter(id => id !== node.id), ...existingIds])
    if (!unavailableIds.has(compactId)) return compactId
    return createWorkflowNodeId(node.type, unavailableIds)
  })
}

export function toCanvas(model: WorkflowModel, editor: WorkflowEditorState = {}): { nodes: DesignerNode[]; edges: DesignerEdge[] } {
  const nodes = model.nodes.map(node => {
    const { id, type, name, x, y, ...rest } = node
    const supported = ['start', 'approval', 'countersign', 'service', 'receive', 'timer', 'condition', 'end'].includes(type)
    return { id, type: 'workflowNode', position: { x, y }, data: { kind: type, name, original: node, custom: rest }, draggable: supported, connectable: supported } as DesignerNode
  })
  const edges = model.flows.map((flow, index) => {
    const id = `flow-${index}`
    const data: DesignerEdgeData & { routePoints?: { x: number; y: number }[] } = { branch: flow.branch, conditionExpression: flow.conditionExpression, original: flow, ...(editor.routes?.[id] ? { routePoints: editor.routes[id] } : {}) }
    return {
      id, source: flow.source, target: flow.target, type: 'workflowRoute', markerEnd: MarkerType.ArrowClosed,
      label: flow.branch === 'pass' ? '通过' : flow.branch === 'reject' ? '驳回' : undefined,
      data,
      class: flow.branch ? `wfd-edge-${flow.branch}` : undefined,
    } as DesignerEdge
  })
  return { nodes, edges }
}

export function fromCanvas(nodes: DesignerNode[], edges: DesignerEdge[], model: WorkflowModel): WorkflowModel {
  const previous = new Map(model.nodes.map(node => [node.id, node]))
  return {
    ...model,
    nodes: nodes.map(node => {
      const data = node.data!
      const original = data.original ?? previous.get(node.id)!
      const next: WorkflowNodeRecord = { ...original, id: node.id, type: data.kind, name: data.name, x: Math.round(node.position.x), y: Math.round(node.position.y) }
      if (data.custom) Object.assign(next, data.custom)
      return next
    }),
    flows: edges.map(edge => ({
      ...(edge.data?.original ?? { source: edge.source, target: edge.target }),
      source: edge.source, target: edge.target,
      ...(edge.data?.branch ? { branch: edge.data.branch as WorkflowFlowRecord['branch'] } : { branch: undefined }),
      ...(edge.data?.conditionExpression !== undefined ? { conditionExpression: edge.data.conditionExpression } : {}),
    })).map(flow => {
      const next = { ...flow }
      if (!next.branch) delete next.branch
      if (!next.conditionExpression) delete next.conditionExpression
      return next
    }),
  }
}

export function createNodeRecord(type: WorkflowNodeType, id: string, x: number, y: number, defaults: Partial<WorkflowNodeRecord> = {}): WorkflowNodeRecord {
  const names: Record<WorkflowNodeType, string> = { start: '开始', approval: '审批', countersign: '多人审批', service: '服务调用', receive: '消息等待', timer: '定时等待', condition: '条件分支', end: '结束' }
  const safeDefaults = Object.fromEntries(Object.entries(defaults).filter(([key]) => !['id', 'type', 'x', 'y'].includes(key))) as Partial<WorkflowNodeRecord>
  // Match the React designer default while allowing the property editor to clear it for start-time selection.
  return { id, type, name: names[type], x, y, ...(type === 'countersign' ? { approveMode: 'ALL', sequential: false } : {}), ...(type === 'timer' ? { timerType: 'duration', timerValue: 'PT30M' } : {}), ...safeDefaults }
}
