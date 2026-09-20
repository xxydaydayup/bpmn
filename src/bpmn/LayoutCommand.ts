import type { Element, ModdleElement, Shape, Connection } from 'bpmn-js/lib/model/Types'
import type { LayoutPlan, Bounds } from './layout'

interface Registry { get(id: string): Element | undefined }
interface Moddle { create(type: string, attrs: Record<string, unknown>): ModdleElement }
interface ShapeChange { element: Shape; target: ModdleElement; previousLabel?: ModdleElement; before: Bounds; after: Bounds; previousBounds: ModdleElement; newBounds: ModdleElement }
interface EdgeChange { element: Connection; before: Connection['waypoints']; after: Connection['waypoints']; previousDI: ModdleElement[]; newDI: ModdleElement[] }
interface LayoutContext { plan: LayoutPlan; shapes?: ShapeChange[]; edges?: EdgeChange[] }

/** One command owns the entire geometry transaction. No business objects are reserialized. */
export default class LayoutCommand {
  static $inject = ['elementRegistry', 'moddle']
  constructor(private readonly registry: Registry, private readonly moddle: Moddle) {}

  execute(context: LayoutContext): Element[] {
    if (!context.shapes || !context.edges) {
      // Resolve and validate every target before changing even the first shape.
      const shapes = context.plan.shapes.map(({ id, ...after }) => {
        const element = this.registry.get(id) as Shape | undefined
        if (!element?.di || element.waypoints) throw new Error(`节点 ${id} 已变化，请重新整理`)
        const { x, y, width, height } = element
        // diagram-js labels share their owner's DI. Their bounds live under di.label.
        const target = element.labelTarget ? element.di.label ?? this.moddle.create('bpmndi:BPMNLabel', {}) : element.di
        const newBounds = target.bounds ?? this.moddle.create('dc:Bounds', {})
        if (!target.bounds) newBounds.$parent = target
        return { element, target, previousLabel: element.di.label, before: { x, y, width, height }, after, previousBounds: target.bounds, newBounds }
      })
      const edges = context.plan.connections.map(({ id, waypoints }) => {
        const element = this.registry.get(id) as Connection | undefined
        if (!element?.di || !element.waypoints) throw new Error(`连线 ${id} 已变化，请重新整理`)
        return { element, before: element.waypoints, after: waypoints.map(point => ({ ...point })), previousDI: element.di.waypoint, newDI: waypoints.map(point => this.moddle.create('dc:Point', { ...point })) }
      })
      context.shapes = shapes
      context.edges = edges
    }
    try { return this.apply(context, true) } catch (error) { this.apply(context, false); throw error }
  }

  revert(context: LayoutContext) { return this.apply(context, false) }

  private apply(context: LayoutContext, forward: boolean): Element[] {
    for (const change of context.shapes!) {
      const value = forward ? change.after : change.before
      Object.assign(change.element, value)
      if (change.element.labelTarget) change.element.di.label = forward ? change.target : change.previousLabel
      change.target.bounds = forward ? change.newBounds : change.previousBounds
      if (change.target.bounds) Object.assign(change.target.bounds, value)
    }
    for (const change of context.edges!) {
      change.element.waypoints = forward ? change.after : change.before
      change.element.di.waypoint = forward ? change.newDI : change.previousDI
    }
    return [...context.shapes!.map(change => change.element), ...context.edges!.map(change => change.element)]
  }
}
