import type { ElkNode, ElkPoint } from 'elkjs/lib/elk-api'

export interface Bounds { x: number; y: number; width: number; height: number }
export interface LayoutLabel { id: string; text: string; width: number; height: number }
export interface LayoutNode extends Bounds { id: string; type: string; label?: LayoutLabel }
export interface LayoutEdge { id: string; source: string; target: string; label?: LayoutLabel }
export interface LayoutSnapshot { id: string; nodes: LayoutNode[]; edges: LayoutEdge[]; unsupported: string[] }
export interface LayoutSettings { width: number; height: number; nodeGap: number; layerGap: number; edgeGap: number; padding: number }
export interface LayoutPlan { shapes: Array<Bounds & { id: string }>; connections: Array<{ id: string; waypoints: ElkPoint[] }> }
export interface ConnectionPoint extends ElkPoint { original?: ElkPoint }
export type ConnectionNode = Partial<Bounds> & { type?: string }
type ConnectionNodeLike = ConnectionNode | Record<string, unknown>
export const supportedLayoutTypes = new Set(['bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway'])
export const isCardType = (type: string) => type === 'bpmn:UserTask' || type === 'bpmn:ServiceTask'
/** Keep orthogonal card connections away from rounded corners. */
export const cardPortInset = 16

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Crop circular and diamond BPMN ports to their visible outlines. */
function dock(point: ElkPoint, adjacent: ElkPoint, node: LayoutNode): ElkPoint {
  const horizontal = Math.abs(point.y - adjacent.y) < .1
  if (isCardType(node.type)) return point

  const cx = node.x + node.width / 2, cy = node.y + node.height / 2
  const offset = Math.min(1, Math.abs(horizontal ? (point.y - cy) / (node.height / 2) : (point.x - cx) / (node.width / 2)))
  const factor = node.type.endsWith('Gateway') ? 1 - offset : Math.sqrt(1 - offset * offset)
  if (horizontal) return { x: finite(cx + (point.x < cx ? -1 : 1) * node.width / 2 * factor), y: point.y }
  return { x: point.x, y: finite(cy + (point.y < cy ? -1 : 1) * node.height / 2 * factor) }
}

function isHorizontal(a: ElkPoint, b: ElkPoint): boolean {
  return Math.abs(a.y - b.y) < .1
}

function cardDock(point: ElkPoint, adjacent: ElkPoint, node?: ConnectionNodeLike): ElkPoint | undefined {
  const candidate = node as { x?: number; y?: number; width?: number; height?: number; type?: string } | undefined
  if (!candidate?.type || !isCardType(candidate.type)
    || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)
    || !Number.isFinite(candidate.width) || !Number.isFinite(candidate.height)) return
  const { x, y, width, height } = candidate as { x: number; y: number; width: number; height: number; type: string }
  const horizontal = isHorizontal(point, adjacent)
  const insetX = Math.min(cardPortInset, width / 2)
  const insetY = Math.min(cardPortInset, height / 2)
  if (horizontal) {
    const portX = point.x <= x + width / 2 ? x : x + width
    return { x: portX, y: clamp(point.y, y + insetY, y + height - insetY) }
  }
  const portY = point.y <= y + height / 2 ? y : y + height
  return { x: clamp(point.x, x + insetX, x + width - insetX), y: portY }
}

function withDocking<T extends ConnectionPoint>(point: T, docked: ElkPoint): T {
  return { ...point, x: docked.x, y: docked.y } as T
}

type Axis = 'horizontal' | 'vertical'

function terminalAxis(point: ElkPoint, adjacent: ElkPoint): Axis | undefined {
  if (isHorizontal(point, adjacent)) return 'horizontal'
  if (Math.abs(point.x - adjacent.x) < .1) return 'vertical'
  return
}

function samePoint(a: ElkPoint, b: ElkPoint): boolean {
  return Math.abs(a.x - b.x) < .1 && Math.abs(a.y - b.y) < .1
}

function firstDistinctIndex(points: ElkPoint[]): number {
  let index = 0
  while (index + 1 < points.length && samePoint(points[index], points[index + 1])) index++
  return index
}

function lastDistinctIndex(points: ElkPoint[]): number {
  let index = points.length - 1
  while (index > 0 && samePoint(points[index], points[index - 1])) index--
  return index
}

function hasDiagonalSegment(points: ElkPoint[]): boolean {
  return points.some((point, index) => index > 0
    && !samePoint(point, points[index - 1])
    && !isHorizontal(point, points[index - 1])
    && Math.abs(point.x - points[index - 1].x) >= .1)
}

function repairOrthogonalBends<T extends ConnectionPoint>(points: T[], sourceSegment: number, targetSegment: number, sourceAxis?: Axis, targetAxis?: Axis): T[] {
  const result: T[] = [points[0]]
  for (let index = 1; index < points.length; index++) {
    const previous = result.at(-1)!
    const current = points[index]
    if (Math.abs(previous.x - current.x) >= .1 && Math.abs(previous.y - current.y) >= .1) {
      if (index <= sourceSegment && sourceAxis) {
        result.push(sourceAxis === 'horizontal' ? { x: current.x, y: previous.y } as T : { x: previous.x, y: current.y } as T)
      } else if (index >= targetSegment && targetAxis) {
        result.push(targetAxis === 'horizontal' ? { x: previous.x, y: current.y } as T : { x: current.x, y: previous.y } as T)
      } else {
        result.push({ x: previous.x, y: current.y } as T)
      }
    }
    result.push(current)
  }
  return result
}

function normalizeDirect<T extends ConnectionPoint>(source: T, target: T, sourceDock: ElkPoint | undefined, targetDock: ElkPoint | undefined, sourceAxis: Axis | undefined, targetAxis: Axis | undefined): T[] {
  const start = sourceDock ? withDocking(source, sourceDock) : source
  const end = targetDock ? withDocking(target, targetDock) : target
  if (!sourceDock && !targetDock) return [start, end]
  if (sourceAxis === 'horizontal' && targetAxis === 'horizontal') {
    if (Math.abs(start.y - end.y) < .1) return [start, end]
    const middleX = (start.x + end.x) / 2
    return [start, { x: middleX, y: start.y } as T, { x: middleX, y: end.y } as T, end]
  }
  if (sourceAxis === 'vertical' && targetAxis === 'vertical') {
    if (Math.abs(start.x - end.x) < .1) return [start, end]
    const middleY = (start.y + end.y) / 2
    return [start, { x: start.x, y: middleY } as T, { x: end.x, y: middleY } as T, end]
  }
  if (sourceAxis === 'horizontal' && targetAxis === 'vertical') return [start, { x: end.x, y: start.y } as T, end]
  if (sourceAxis === 'vertical' && targetAxis === 'horizontal') return [start, { x: start.x, y: end.y } as T, end]
  return [start, end]
}

/**
 * Move card endpoints away from rounded corners while retaining an orthogonal
 * first/last segment. Oblique manual connections are left untouched.
 */
export function normalizeCardConnections<T extends ConnectionPoint>(points: T[], source?: ConnectionNodeLike, target?: ConnectionNodeLike): T[] {
  if (points.length < 2) return points.map(point => ({ ...point }))
  const normalized = points.map(point => ({ ...point, ...(point.original ? { original: { ...point.original } } : {}) })) as T[]
  if (normalized.length > 2 && hasDiagonalSegment(normalized)) return normalized
  const sourceIndex = firstDistinctIndex(normalized)
  const targetIndex = lastDistinctIndex(normalized)
  const sourceAxis = sourceIndex + 1 < normalized.length ? terminalAxis(normalized[sourceIndex], normalized[sourceIndex + 1]) : undefined
  const targetAxis = targetIndex > 0 ? terminalAxis(normalized[targetIndex], normalized[targetIndex - 1]) : undefined
  const sourceDock = sourceAxis ? cardDock(normalized[0], normalized[sourceIndex + 1], source) : undefined
  const targetDock = targetAxis ? cardDock(normalized.at(-1)!, normalized[targetIndex - 1], target) : undefined
  const sourceChanged = !!sourceDock && (Math.abs(sourceDock.x - normalized[0].x) >= .1 || Math.abs(sourceDock.y - normalized[0].y) >= .1)
  const targetChanged = !!targetDock && (Math.abs(targetDock.x - normalized.at(-1)!.x) >= .1 || Math.abs(targetDock.y - normalized.at(-1)!.y) >= .1)

  if (normalized.length === 2) {
    return normalizeDirect(normalized[0], normalized[1], sourceDock, targetDock, sourceAxis, targetAxis)
  }

  if (!sourceChanged && !targetChanged) return normalized

  if (sourceChanged && sourceDock && sourceAxis) {
    normalized[0] = withDocking(normalized[0], sourceDock)
    for (let index = 1; index <= sourceIndex + 1; index++) {
      normalized[index] = sourceAxis === 'horizontal' ? { ...normalized[index], y: sourceDock.y } : { ...normalized[index], x: sourceDock.x }
    }
  }
  if (targetChanged && targetDock && targetAxis) {
    normalized[normalized.length - 1] = withDocking(normalized.at(-1)!, targetDock)
    for (let index = targetIndex - 1; index < normalized.length - 1; index++) {
      normalized[index] = targetAxis === 'horizontal' ? { ...normalized[index], y: targetDock.y } : { ...normalized[index], x: targetDock.x }
    }
  }
  return repairOrthogonalBends(normalized, sourceIndex + 1, targetIndex - 1, sourceAxis, targetAxis)
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
    let points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(point => ({ x: finite(point.x), y: finite(point.y) }))
    const sourceDock = dock(points[0], points[1], nodes.get(original.source)!)
    points[0] = sourceDock

    const targetIndex = points.length - 1
    const targetDock = dock(points[targetIndex], points[targetIndex - 1], nodes.get(original.target)!)
    points[targetIndex] = targetDock
    points = normalizeCardConnections(points, nodes.get(original.source), nodes.get(original.target))
    if (original.label) {
      const label = edge.labels?.find(item => item.id === original.label!.id)
      if (!label) throw new Error(`布局缺少标签 ${original.label.id}`)
      shapes.push({ id: original.label.id, x: finite(label.x), y: finite(label.y), width: finite(label.width), height: finite(label.height) })
    }
    return { id: edge.id, waypoints: points }
  })
  return { shapes, connections }
}
