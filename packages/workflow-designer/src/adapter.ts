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

export function toCanvas(model: WorkflowModel, editor: WorkflowEditorState = {}): { nodes: DesignerNode[]; edges: DesignerEdge[] } {
  const nodes = model.nodes.map(node => {
    const { id, type, name, x, y, ...rest } = node
    const supported = ['start', 'approval', 'countersign', 'service', 'condition', 'end'].includes(type)
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
  const names: Record<WorkflowNodeType, string> = { start: '开始', approval: '审批', countersign: '多人审批', service: '服务调用', condition: '条件分支', end: '结束' }
  // Match the React designer default while allowing the property editor to clear it for start-time selection.
  return { id, type, name: names[type], x, y, ...(type === 'countersign' ? { approveMode: 'ALL', sequential: false } : {}), ...defaults }
}
