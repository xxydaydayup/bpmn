import type { ElkNode, ElkPoint } from 'elkjs/lib/elk-api'

export interface Bounds { x: number; y: number; width: number; height: number }
export interface LayoutLabel { id: string; text: string; width: number; height: number }
export interface LayoutNode extends Bounds { id: string; type: string; label?: LayoutLabel }
export interface LayoutEdge { id: string; source: string; target: string; label?: LayoutLabel }
export interface LayoutSnapshot { id: string; nodes: LayoutNode[]; edges: LayoutEdge[]; unsupported: string[] }
export interface LayoutSettings { width: number; height: number; nodeGap: number; layerGap: number; edgeGap: number; padding: number }
export interface LayoutPlan { shapes: Array<Bounds & { id: string }>; connections: Array<{ id: string; waypoints: ElkPoint[] }> }
export const supportedLayoutTypes = new Set(['bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway'])
export const isCardType = (type: string) => type === 'bpmn:UserTask' || type === 'bpmn:ServiceTask'

export function assessLayout(snapshot: LayoutSnapshot, settings: Pick<LayoutSettings, 'width' | 'height'>) {
  if (snapshot.unsupported.length) return { supported: false, needsResize: false, reason: `保留原布局：${snapshot.unsupported.join('、')}暂不支持自动整理。` }
  if (!snapshot.nodes.length) return { supported: false, needsResize: false, reason: '画布没有可整理的节点。' }
  const ids = new Set(snapshot.nodes.map(node => node.id))
  if (snapshot.nodes.some(node => !supportedLayoutTypes.has(node.type)) || snapshot.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) {
    return { supported: false, needsResize: false, reason: '保留原布局：存在尚未支持的节点或跨范围连线。' }
  }
  return { supported: true, needsResize: snapshot.nodes.some(node => isCardType(node.type) && (node.width < settings.width || node.height < settings.height)), reason: '' }
}

export function createLayoutGraph(snapshot: LayoutSnapshot, settings: LayoutSettings): ElkNode {
  const capability = assessLayout(snapshot, settings)
  if (!capability.supported) throw new Error(capability.reason)
  return {
    id: snapshot.id,
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(settings.nodeGap),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(settings.layerGap),
      'elk.spacing.edgeNode': String(settings.edgeGap),
      'elk.spacing.edgeEdge': String(settings.edgeGap),
      'elk.padding': `[top=${settings.padding},left=${settings.padding},bottom=${settings.padding},right=${settings.padding}]`,
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.randomSeed': '1',
    },
    children: snapshot.nodes.map(node => ({
      id: node.id,
      width: isCardType(node.type) ? settings.width : node.width,
      height: isCardType(node.type) ? settings.height : node.height,
      layoutOptions: node.type === 'bpmn:StartEvent' ? { 'elk.layered.layering.layerConstraint': 'FIRST' }
        : node.type === 'bpmn:EndEvent' ? { 'elk.layered.layering.layerConstraint': 'LAST' } : undefined,
      labels: node.label ? [{ ...node.label, layoutOptions: { 'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER' } }] : [],
    })),
    edges: snapshot.edges.map(edge => ({
      id: edge.id, sources: [edge.source], targets: [edge.target],
      labels: edge.label ? [{ ...edge.label, layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' } }] : [],
    })),
  }
}

function finite(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error('布局返回了无效坐标，已保留原图')
  return Math.round(value * 100) / 100
}

/** Crop rectangular ELK ports to circular/diamond BPMN outlines along the routed segment. */
function dock(point: ElkPoint, adjacent: ElkPoint, node: LayoutNode): ElkPoint {
  if (isCardType(node.type)) return point
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2
  const horizontal = Math.abs(point.y - adjacent.y) < .1
  const offset = Math.min(1, Math.abs(horizontal ? (point.y - cy) / (node.height / 2) : (point.x - cx) / (node.width / 2)))
  const factor = node.type.endsWith('Gateway') ? 1 - offset : Math.sqrt(1 - offset * offset)
  if (horizontal) return { x: finite(cx + (point.x < cx ? -1 : 1) * node.width / 2 * factor), y: point.y }
  return { x: point.x, y: finite(cy + (point.y < cy ? -1 : 1) * node.height / 2 * factor) }
}

export function readLayoutPlan(result: ElkNode, snapshot: LayoutSnapshot): LayoutPlan {
  const shapes: LayoutPlan['shapes'] = []
  const nodes = new Map<string, LayoutNode>()
  for (const original of snapshot.nodes) {
    const node = result.children?.find(item => item.id === original.id)
    if (!node) throw new Error(`布局缺少节点 ${original.id}`)
    const bounds = { id: node.id, x: finite(node.x), y: finite(node.y), width: finite(node.width), height: finite(node.height) }
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('布局返回了无效尺寸')
    shapes.push(bounds)
    nodes.set(node.id, { ...original, ...bounds })
    if (original.label) {
      const label = node.labels?.find(item => item.id === original.label!.id)
      if (!label) throw new Error(`布局缺少标签 ${original.label.id}`)
      shapes.push({ id: original.label.id, x: bounds.x + finite(label.x), y: bounds.y + finite(label.y), width: finite(label.width), height: finite(label.height) })
    }
  }
  const connections = snapshot.edges.map(original => {
    const edge = result.edges?.find(item => item.id === original.id)
    if (edge?.sections?.length !== 1) throw new Error(`连线 ${original.id} 的路由不完整`)
    const section = edge.sections[0]
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(point => ({ x: finite(point.x), y: finite(point.y) }))
    points[0] = dock(points[0], points[1], nodes.get(original.source)!)
    points[points.length - 1] = dock(points.at(-1)!, points.at(-2)!, nodes.get(original.target)!)
    if (original.label) {
      const label = edge.labels?.find(item => item.id === original.label!.id)
      if (!label) throw new Error(`布局缺少标签 ${original.label.id}`)
      shapes.push({ id: original.label.id, x: finite(label.x), y: finite(label.y), width: finite(label.width), height: finite(label.height) })
    }
    return { id: edge.id, waypoints: points }
  })
  return { shapes, connections }
}
