export interface RoutePoint { x: number; y: number }

function followEndpoint(points: RoutePoint[], endpoint: RoutePoint, target: boolean) {
  if (points.length < 2) return points
  const next = points.map(point => ({ ...point }))
  const anchorIndex = target ? next.length - 1 : 0
  const bendIndex = target ? next.length - 2 : 1
  const oldAnchor = next[anchorIndex]
  const oldBend = next[bendIndex]
  const dx = endpoint.x - oldAnchor.x
  const dy = endpoint.y - oldAnchor.y
  next[anchorIndex] = endpoint
  if (Math.abs(oldBend.x - oldAnchor.x) < 0.5) next[bendIndex] = { x: oldBend.x + dx, y: oldBend.y }
  else if (Math.abs(oldBend.y - oldAnchor.y) < 0.5) next[bendIndex] = { x: oldBend.x, y: oldBend.y + dy }
  else next[bendIndex] = { x: oldBend.x + dx, y: oldBend.y + dy }
  return next
}

/** Keep an absolute orthogonal route connected to Vue Flow's live handle positions. */
export function followRouteEndpoints(points: RoutePoint[], source: RoutePoint, target: RoutePoint): RoutePoint[] {
  if (points.length < 2) return [source, target]
  if (points.length === 2) {
    const originalSource = points[0]
    const originalTarget = points[1]
    const horizontal = Math.abs(originalTarget.x - originalSource.x) >= Math.abs(originalTarget.y - originalSource.y)
    const bend = horizontal ? { x: target.x, y: source.y } : { x: source.x, y: target.y }
    const atEndpoint = (point: RoutePoint) => point.x === source.x && point.y === source.y || point.x === target.x && point.y === target.y
    return atEndpoint(bend) ? [source, target] : [source, bend, target]
  }
  const sourceAdjusted = followEndpoint(points, source, false)
  return followEndpoint(sourceAdjusted, target, true)
}
