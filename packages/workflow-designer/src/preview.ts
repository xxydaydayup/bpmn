import { toCanvas, type DesignerEdge, type DesignerNode } from './adapter'
import { layoutWorkflow, WORKFLOW_NODE_HEIGHT, WORKFLOW_NODE_WIDTH } from './layout'
import { isWorkflowNodeType } from './nodes'
import type { WorkflowModel } from './types'

export type WorkflowPreviewNodeState = 'active' | 'completed' | 'canceled'
export interface WorkflowPreviewMetadata {
  name?: string
  key?: string
  version?: string | number
  processDefinitionId?: string
}
export interface WorkflowPreviewReady { nodeIds: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate only the structure needed to draw; preview never normalizes published IDs. */
export async function prepareWorkflowPreview(input: unknown): Promise<{ nodes: DesignerNode[]; edges: DesignerEdge[]; warnings: string[]; nodeIds: string[] }> {
  let value: unknown
  try { value = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input)) }
  catch { throw new Error('业务工作流模型不是有效的 JSON。') }
  if (!isRecord(value) || !Array.isArray(value.nodes)) throw new Error('业务工作流模型结构不支持：需要 nodes 节点列表。')
  if (value.nodes.length === 0) throw new Error('业务工作流模型没有可展示的节点。')

  const ids = new Set<string>()
  const unknownTypes = new Set<string>()
  const register = (id: unknown, label: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error(`${label}标识为空或格式不支持。`)
    if (ids.has(id)) throw new Error(`模型存在重复标识：${id}。`)
    ids.add(id)
  }
  const visit = (process: Record<string, unknown>) => {
    if (!Array.isArray(process.nodes) || (process.flows !== undefined && !Array.isArray(process.flows))) throw new Error('业务工作流模型结构不支持：nodes 和 flows 必须是列表。')
    const localIds = new Set<string>()
    const localTypes = new Map<string, string>()
    for (const node of process.nodes) {
      if (!isRecord(node)) throw new Error('模型包含无法识别的节点结构。')
      register(node.id, '节点')
      localIds.add(node.id as string)
      if (typeof node.type !== 'string' || !node.type.trim()) throw new Error(`节点 ${node.id} 缺少有效类型。`)
      localTypes.set(node.id as string, node.type)
      if (node.name !== undefined && typeof node.name !== 'string') throw new Error(`节点 ${node.id} 的名称格式不支持。`)
      if (!isWorkflowNodeType(node.type)) unknownTypes.add(node.type)
      if (node.type === 'subProcess' && node.process !== undefined) {
        if (!isRecord(node.process)) throw new Error(`子流程 ${node.id} 的结构不支持。`)
        visit(node.process)
      }
    }
    for (const flow of (process.flows ?? []) as unknown[]) {
      if (!isRecord(flow)) throw new Error('模型包含无法识别的顺序流结构。')
      if (flow.id !== undefined) register(flow.id, '顺序流')
      if (typeof flow.source !== 'string' || typeof flow.target !== 'string' || !localIds.has(flow.source) || !localIds.has(flow.target)) throw new Error('模型存在悬空顺序流，无法可靠展示。')
      if (localTypes.get(flow.source) === 'end' || localTypes.get(flow.target) === 'start') throw new Error('模型包含从结束节点出发或指向开始节点的顺序流，无法可靠展示。')
      if (flow.branch !== undefined && typeof flow.branch !== 'string') throw new Error('顺序流分支格式不支持。')
      if (flow.conditionExpression !== undefined && typeof flow.conditionExpression !== 'string') throw new Error('顺序流条件格式不支持。')
    }
  }
  visit(value)
  const originalNodes = value.nodes as Record<string, unknown>[]
  const hasPosition = (node: Record<string, unknown>) => typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y)
  const needsLayout = originalNodes.some(node => !hasPosition(node))
  const model = { ...value, nodes: originalNodes.map(node => ({ ...node, name: node.name ?? '', x: hasPosition(node) ? node.x : 0, y: hasPosition(node) ? node.y : 0 })), flows: value.flows ?? [] } as WorkflowModel
  const dimensions = new Map(model.nodes.map(node => [node.id, {
    width: typeof node.width === 'number' && Number.isFinite(node.width) && node.width > 0 ? node.width : WORKFLOW_NODE_WIDTH,
    height: typeof node.height === 'number' && Number.isFinite(node.height) && node.height > 0 ? node.height : WORKFLOW_NODE_HEIGHT,
  }]))
  let { nodes, edges } = toCanvas(model)
  edges = edges.map((edge, index) => {
    let id = model.flows[index]?.id ?? `__preview_flow_${index}`
    while (ids.has(id) && model.flows[index]?.id !== id) id += '_'
    ids.add(id)
    return { ...edge, id, selectable: false, updatable: false, focusable: false }
  })
  if (needsLayout) {
    const result = await layoutWorkflow(nodes, edges, dimensions)
    const fixed = nodes.filter((_, index) => hasPosition(originalNodes[index]!))
    if (fixed.length) {
      const left = Math.max(...fixed.map(node => node.position.x + dimensions.get(node.id)!.width)) + 80
      const top = Math.min(...fixed.map(node => node.position.y))
      const missing = result.nodes.filter((_, index) => !hasPosition(originalNodes[index]!))
      const minX = Math.min(...missing.map(node => node.position.x))
      const minY = Math.min(...missing.map(node => node.position.y))
      nodes = result.nodes.map((node, index) => hasPosition(originalNodes[index]!) ? nodes[index]! : { ...node, position: { x: node.position.x - minX + left, y: node.position.y - minY + top } })
    } else {
      nodes = result.nodes
      edges = result.edges
    }
  }
  nodes = nodes.map(node => ({ ...node, draggable: false, connectable: false, selectable: false, focusable: false, ...dimensions.get(node.id)! }))
  return { nodes, edges, nodeIds: nodes.map(node => node.id), warnings: [
    ...(needsLayout ? ['部分节点缺少布局坐标，当前使用临时布局，已发布模型保持原样。'] : []),
    ...(unknownTypes.size ? [`包含暂不支持的节点类型：${[...unknownTypes].join('、')}，仅展示名称、类型与连接。`] : []),
  ] }
}
