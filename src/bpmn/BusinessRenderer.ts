import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer'
import type EventBus from 'diagram-js/lib/core/EventBus'
import type BpmnRenderer from 'bpmn-js/lib/draw/BpmnRenderer'
import { getFillColor, getStrokeColor, getLabelColor } from 'bpmn-js/lib/draw/BpmnRenderUtil'
import type { Element, Shape } from 'bpmn-js/lib/model/Types'
import { diagramIcons } from './icons'
import { diagramTheme as theme } from './theme'

const ns = 'http://www.w3.org/2000/svg'
const cards = new Set(['bpmn:UserTask', 'bpmn:ServiceTask'])
const styledShapes = new Set([...cards, 'bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway'])

function append<K extends keyof SVGElementTagNameMap>(parent: SVGElement, tag: K, attrs: Record<string, string | number>, text?: string) {
  const element = document.createElementNS(ns, tag)
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)))
  if (text !== undefined) element.textContent = text
  parent.appendChild(element)
  return element
}

function appendEventGlyph(parent: SVGElement, element: Shape, name: 'start' | 'end', color: string) {
  const glyph = new DOMParser().parseFromString(diagramIcons[name], 'image/svg+xml').documentElement
  // Match the 14px / 10px glyphs inside the library's 28px event symbols.
  const size = Math.min(element.width, element.height) / 28 * (name === 'start' ? 14 : 10)
  Object.entries({
    x: (element.width - size) / 2,
    y: (element.height - size) / 2,
    width: size,
    height: size,
    color,
    'stroke-width': 1.65,
    'pointer-events': 'none',
  }).forEach(([key, value]) => glyph.setAttribute(key, String(value)))
  glyph.classList.add('business-event-glyph')
  parent.appendChild(document.importNode(glyph, true))
}

export default class BusinessRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'bpmnRenderer']
  private measure = document.createElement('canvas').getContext('2d')

  constructor(eventBus: EventBus, private readonly bpmnRenderer: BpmnRenderer) { super(eventBus, 1500) }

  canRender(element: Element) { return styledShapes.has(element.type) && !element.labelTarget }

  drawShape(parent: SVGElement, element: Shape): SVGElement {
    if (!cards.has(element.type) || element.width < 84 || element.height < 72) {
      const shape = this.bpmnRenderer.drawShape(parent, element)
      const event = element.type.endsWith('Event')
      const parallel = element.type === 'bpmn:ParallelGateway'
      const fill = event ? (element.type === 'bpmn:StartEvent' ? theme.colors.humanSoft : theme.renderer.defaultFillColor) : parallel ? theme.colors.parallelSoft : theme.colors.branchSoft
      const stroke = event ? (element.type === 'bpmn:StartEvent' ? theme.colors.human : theme.colors.end) : parallel ? theme.colors.parallel : theme.colors.branch
      if (!cards.has(element.type)) {
        shape.style.fill = getFillColor(element, fill)
        const strokeColor = getStrokeColor(element, stroke)
        shape.style.stroke = strokeColor
        // Keep native markers for typed events (timer, signal, terminate, etc.).
        if (event && !element.businessObject.eventDefinitions?.length) {
          const start = element.type === 'bpmn:StartEvent'
          shape.style.stroke = getStrokeColor(element, theme.colors.eventBorder)
          shape.style.strokeWidth = String(Math.min(element.width, element.height) / 28 * (start ? 1 : 2))
          shape.style.fillOpacity = '1'
          appendEventGlyph(parent, element, start ? 'start' : 'end', getStrokeColor(element, start ? theme.colors.human : theme.colors.endIcon))
        }
      }
      return shape
    }

    // The generic task renderer retains standard loop/multi-instance/compensation markers.
    const outline = this.bpmnRenderer.handlers['bpmn:Task'](parent, element)
    parent.querySelectorAll('text').forEach(text => text.remove())
    outline.setAttribute('rx', String(theme.card.radius))
    outline.setAttribute('ry', String(theme.card.radius))
    outline.style.fill = getFillColor(element, theme.renderer.defaultFillColor)
    outline.style.fillOpacity = '1'
    outline.style.stroke = getStrokeColor(element, theme.card.stroke)
    outline.style.strokeWidth = String(theme.card.strokeWidth)
    outline.classList.add('business-card-outline')

    const compact = element.width < theme.card.width || element.height < theme.card.height
    const service = element.type === 'bpmn:ServiceTask'
    const color = service ? theme.colors.service : theme.colors.human
    const soft = service ? theme.colors.serviceSoft : theme.colors.humanSoft
    const box = compact ? 23 : theme.card.iconBox
    const x = compact ? 10 : theme.card.padding
    const y = compact ? 8 : (element.height - box) / 2 - 2
    append(parent, 'rect', { x, y, width: box, height: box, rx: compact ? 5 : 8, fill: soft, 'pointer-events': 'none' })
    const glyph = new DOMParser().parseFromString(diagramIcons[service ? 'service' : 'user'], 'image/svg+xml').documentElement
    const iconSize = compact ? 16 : theme.card.iconSize
    Object.entries({ x: x + (box - iconSize) / 2, y: y + (box - iconSize) / 2, width: iconSize, height: iconSize, color, 'stroke-width': 1.7, 'pointer-events': 'none' }).forEach(([key, value]) => glyph.setAttribute(key, String(value)))
    parent.appendChild(document.importNode(glyph, true))

    const textX = compact ? 10 : x + box + theme.card.textGap
    const available = Math.max(20, element.width - textX - theme.card.padding)
    const fontSize = compact ? 12 : theme.typography.fontSize
    if (this.measure) this.measure.font = `600 ${fontSize}px ${theme.typography.fontFamily}`
    const lines: string[] = ['']
    const characters = [...(element.businessObject.name || '未命名任务')]
    const width = (value: string) => this.measure?.measureText(value).width ?? value.length * fontSize
    for (const character of characters) {
      const index = lines.length - 1
      if (width(lines[index] + character) > available && lines[index]) lines.push(character)
      else lines[index] += character
    }
    const maxLines = compact ? 1 : 2
    if (lines.length > maxLines) {
      let last = lines[maxLines - 1]
      while (last && width(last + '…') > available) last = [...last].slice(0, -1).join('')
      lines[maxLines - 1] = last + '…'
    }
    const visible = lines.slice(0, maxLines)
    const textY = compact ? 46 : element.height / 2 - (visible.length === 2 ? 13 : 5)
    const labelColor = getLabelColor(element, theme.renderer.defaultLabelColor, theme.renderer.defaultStrokeColor)
    const text = append(parent, 'text', { class: 'business-card-name', 'font-family': theme.typography.fontFamily, 'font-size': fontSize, 'font-weight': 600, fill: labelColor, 'pointer-events': 'none' })
    visible.forEach((line, index) => append(text, 'tspan', { x: textX, y: textY + index * (compact ? 15 : theme.card.lineHeight) }, line))
    append(parent, 'text', { x: compact ? 40 : textX, y: compact ? 24 : textY + visible.length * theme.card.lineHeight + 1, 'font-family': theme.typography.fontFamily, 'font-size': compact ? 10 : theme.card.typeSize, fill: getLabelColor(element, theme.colors.secondary, theme.renderer.defaultStrokeColor), 'pointer-events': 'none' }, service ? '服务任务' : '人工任务')
    append(parent, 'title', {}, element.businessObject.name || '未命名任务')
    return outline
  }

  getShapePath(shape: Shape): string {
    if (!cards.has(shape.type) || shape.width < 84 || shape.height < 72) return this.bpmnRenderer.getShapePath(shape)
    const { x, y, width: w, height: h } = shape, r = theme.card.radius
    return `M${x+r},${y}h${w-2*r}a${r},${r} 0 0 1 ${r},${r}v${h-2*r}a${r},${r} 0 0 1 ${-r},${r}h${2*r-w}a${r},${r} 0 0 1 ${-r},${-r}v${2*r-h}a${r},${r} 0 0 1 ${r},${-r}z`
  }
}
