import type { ElkEdgeSection, ElkNode } from 'elkjs'
import type { DesignerEdge, DesignerNode } from './adapter'

export const WORKFLOW_NODE_WIDTH = 190
export const WORKFLOW_NODE_HEIGHT = 68

const INITIAL_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '56',
  'elk.layered.spacing.nodeNodeBetweenLayers': '32',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.thoroughness': '5',
  'elk.edgeRouting': 'ORTHOGONAL',
}

/** Detect explicit reject links that point back to an earlier node in the main flow. */
export function isFeedbackRejectEdge(edge: DesignerEdge, edges: DesignerEdge[]) {
  if (edge.data?.branch !== 'reject') return false
  const outgoing = new Map<string, string[]>()
  for (const candidate of edges) {
    if (candidate.id === edge.id || candidate.data?.branch === 'reject') continue
    outgoing.set(candidate.source, [...(outgoing.get(candidate.source) ?? []), candidate.target])
  }
  const visited = new Set<string>()
  const pending = [edge.target]
  while (pending.length) {
    const current = pending.pop()!
    if (current === edge.source) return true
    if (visited.has(current)) continue
    visited.add(current)
    pending.push(...(outgoing.get(current) ?? []))
  }
  return false
}

/** Rebuild the right-side return path after a user moves nodes following a layout. */
export function refreshFeedbackRoutes(
  nodes: DesignerNode[],
  edges: DesignerEdge[],
  dimensions: ReadonlyMap<string, { width: number; height: number }> = new Map(),
) {
  const feedbackEdges = new Set(edges.filter(edge => isFeedbackRejectEdge(edge, edges)).map(edge => edge.id))
  if (!feedbackEdges.size) return edges

  const positions = new Map(nodes.map(node => [node.id, node.position]))
  const channelX = Math.max(...nodes.map(node => {
    const size = dimensions.get(node.id) ?? { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }
    return node.position.x + size.width
  })) + 24

  return edges.map(edge => {
    if (!feedbackEdges.has(edge.id)) return edge
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) return edge

    const sourceSize = dimensions.get(edge.source) ?? { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }
    const targetSize = dimensions.get(edge.target) ?? { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }
    const start = { x: source.x + sourceSize.width / 2, y: source.y + sourceSize.height }
    const end = { x: target.x + targetSize.width / 2, y: target.y }
    const sourceTurn = { x: start.x, y: start.y + 24 }
    const targetTurn = { x: end.x, y: end.y - 24 }
    return { ...edge, data: { ...edge.data, feedback: true, routePoints: [start, sourceTurn, { x: channelX, y: sourceTurn.y }, { x: channelX, y: targetTurn.y }, targetTurn, end] } }
  })
}

export async function layoutWorkflow(
  nodes: DesignerNode[],
  edges: DesignerEdge[],
  dimensions: ReadonlyMap<string, { width: number; height: number }> = new Map(),
) {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const elk = new ELK()
  const feedbackEdges = new Set(edges.filter(edge => isFeedbackRejectEdge(edge, edges)).map(edge => edge.id))
  const graph = await elk.layout<ElkNode & { edges?: { id: string; sources: string[]; targets: string[]; sections?: ElkEdgeSection[] }[] }>({
    id: 'workflow',
    layoutOptions: INITIAL_LAYOUT_OPTIONS,
    children: nodes.map(node => ({
      id: node.id,
      width: dimensions.get(node.id)?.width || WORKFLOW_NODE_WIDTH,
      height: dimensions.get(node.id)?.height || WORKFLOW_NODE_HEIGHT,
      ports: [
        { id: node.id + '-in', width: 1, height: 1, layoutOptions: { 'elk.port.side': 'NORTH' } },
        { id: node.id + '-out', width: 1, height: 1, layoutOptions: { 'elk.port.side': 'SOUTH' } },
      ],
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
    })),
    edges: edges.filter(edge => !feedbackEdges.has(edge.id)).map(edge => ({ id: edge.id, sources: [edge.source + '-out'], targets: [edge.target + '-in'] })),
  })
  const graphEdges = graph.edges ?? []
  const positions = new Map((graph.children ?? []).map(node => [node.id, { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) }]))
  return {
    nodes: nodes.map(node => ({ ...node, position: positions.get(node.id) ?? node.position })),
    edges: edges.map(edge => {
      if (feedbackEdges.has(edge.id)) {
        const source = positions.get(edge.source)
        const target = positions.get(edge.target)
        if (!source || !target) return { ...edge, data: { ...edge.data, routePoints: undefined, feedback: true } }
        const sourceSize = dimensions.get(edge.source) ?? { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }
        const targetSize = dimensions.get(edge.target) ?? { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }
        const start = { x: (source.x ?? 0) + sourceSize.width / 2, y: (source.y ?? 0) + sourceSize.height }
        const end = { x: (target.x ?? 0) + targetSize.width / 2, y: target.y ?? 0 }
        const sourceTurn = { x: start.x, y: start.y + 24 }
        const targetTurn = { x: end.x, y: end.y - 24 }
        const channelX = Math.max(...nodes.map(node => (positions.get(node.id)?.x ?? 0) + (dimensions.get(node.id)?.width || WORKFLOW_NODE_WIDTH))) + 12
        return { ...edge, data: { ...edge.data, feedback: true, routePoints: [start, sourceTurn, { x: channelX, y: sourceTurn.y }, { x: channelX, y: targetTurn.y }, targetTurn, end] } }
      }
      const elkEdge = graphEdges.find(item => item.id === edge.id)
      const section = elkEdge?.sections?.[0]
      const points = section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(point => ({ x: point.x, y: point.y })) : undefined
      return { ...edge, data: { ...(edge.data ?? { original: { source: edge.source, target: edge.target } }), ...(points?.length ? { routePoints: points } : {}) } }
    }),
  }
}
