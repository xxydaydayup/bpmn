import { MarkerType, type Edge, type Node } from '@vue-flow/core'
import type { WorkflowEditorState, WorkflowFlowRecord, WorkflowModel, WorkflowNodeRecord, WorkflowNodeType } from './types'
import { getWorkflowNodeDefinition, isWorkflowNodeType } from './nodes'

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

export { createWorkflowNodeId, cloneWorkflowModelWithFreshNodeIds, normalizeLegacyUuidNodeIds } from './definition-ids'

export function toCanvas(model: WorkflowModel, editor: WorkflowEditorState = {}): { nodes: DesignerNode[]; edges: DesignerEdge[] } {
  const nodes = model.nodes.map(node => {
    const { id, type, name, x, y, ...rest } = node
    const supported = isWorkflowNodeType(type)
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
      ...(edge.data?.original?.id ? { id: edge.data.original.id } : {}),
      source: edge.source, target: edge.target,
      ...(edge.data?.branch !== undefined ? { branch: edge.data.branch as WorkflowFlowRecord['branch'] } : {}),
      ...(edge.data?.conditionExpression !== undefined ? { conditionExpression: edge.data.conditionExpression } : {}),
    })),
  }
}

export function createNodeRecord(type: WorkflowNodeType, id: string, x: number, y: number, defaults: Partial<WorkflowNodeRecord> = {}): WorkflowNodeRecord {
  const definition = getWorkflowNodeDefinition(type)
  const safeDefaults = Object.fromEntries(Object.entries(defaults).filter(([key]) => !['id', 'type', 'x', 'y'].includes(key))) as Partial<WorkflowNodeRecord>
  return { id, type, name: definition?.defaultValue?.name ?? definition?.title ?? type, x, y, ...definition?.defaultValue, ...safeDefaults }
}
