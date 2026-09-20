import type { ContextPadEntries } from 'diagram-js/lib/features/context-pad/ContextPadProvider'
import type ElementFactory from 'bpmn-js/lib/features/modeling/ElementFactory'
import type { Element, Shape } from 'bpmn-js/lib/model/Types'
import { diagramIcons, type DiagramIconName } from './icons'
import type EventBus from 'diagram-js/lib/core/EventBus'

interface Injector { get<T>(name: string, strict?: boolean): T }
interface Create { start(event: Event, shape: Shape, hints?: { source: Element }): void }
interface AutoPlace { append(source: Element, shape: Shape): void }
interface ContextPad { registerProvider(priority: number, provider: BusinessContextPad): void }
interface Canvas { getContainer(): HTMLElement }

const entriesPresentation: Record<string, [DiagramIconName, string]> = {
  'append.append-task': ['user', '添加人工任务'],
  'append.service-task': ['service', '添加服务任务'],
  'append.end-event': ['end', '添加结束事件'],
  'append.gateway': ['branch', '添加条件分支'],
  'append.intermediate-event': ['start', '添加中间事件'],
  'append.text-annotation': ['info', '添加注释'],
  replace: ['replace', '替换节点类型'], connect: ['link', '连接节点'], delete: ['trash', '删除'],
}

export default class BusinessContextPad {
  static $inject = ['contextPad', 'elementFactory', 'create', 'injector', 'eventBus', 'canvas']
  private readonly autoPlace: AutoPlace | undefined
  constructor(contextPad: ContextPad, private readonly factory: ElementFactory, private readonly create: Create, injector: Injector, eventBus: EventBus, canvas: Canvas) {
    this.autoPlace = injector.get<AutoPlace | undefined>('autoPlace', false)
    contextPad.registerProvider(500, this)
    let pad: HTMLElement | undefined
    const container = canvas.getContainer()
    const position = () => {
      if (!pad?.isConnected) return
      const maxWidth = `${Math.max(0, container.clientWidth - 16)}px`
      if (pad.style.maxWidth !== maxWidth) pad.style.maxWidth = maxWidth
      const left = parseFloat(pad.style.left) || 0, top = parseFloat(pad.style.top) || 0
      const x = Math.max(8, Math.min(left - pad.offsetWidth - 12, container.clientWidth - pad.offsetWidth - 8))
      const y = Math.max(8, Math.min(top - pad.offsetHeight - 12, container.clientHeight - pad.offsetHeight - 8))
      const transform = `translate(${x - left}px, ${y - top}px)`
      if (pad.style.transform !== transform) pad.style.transform = transform
    }
    // Native positioning is scheduled asynchronously; clamp after its style writes.
    const observer = new MutationObserver(position)
    const resize = new ResizeObserver(position)
    resize.observe(container)
    eventBus.on('contextPad.open', (event: { current: { html: HTMLElement } }) => {
      observer.disconnect()
      pad = event.current.html
      observer.observe(pad, { attributes: true, attributeFilter: ['style'] })
      position()
    })
    eventBus.on('contextPad.close', () => { observer.disconnect(); pad = undefined })
    eventBus.on('diagram.destroy', () => { observer.disconnect(); resize.disconnect(); pad = undefined })
  }

  getContextPadEntries(element: Element) {
    return (entries: ContextPadEntries<Element>) => {
      if (entries['append.append-task']) {
        for (const [id, type, name] of [['append.append-task', 'bpmn:UserTask', '人工任务'], ['append.service-task', 'bpmn:ServiceTask', '服务任务']]) {
          const shape = () => { const next = this.factory.createShape({ type }); next.businessObject.name = name; return next }
          entries[id] = { group: 'model', action: {
            click: event => { const next = shape(); if (this.autoPlace) this.autoPlace.append(element, next); else this.create.start(event, next, { source: element }) },
            dragstart: event => this.create.start(event, shape(), { source: element }),
          } }
        }
      }
      return this.decorate(entries)
    }
  }

  getMultiElementContextPadEntries() { return (entries: ContextPadEntries<Element>) => this.decorate(entries) }

  private decorate(entries: ContextPadEntries<Element>) {
    for (const [id, entry] of Object.entries(entries)) {
      const [icon, title] = entriesPresentation[id] ?? ['settings', entry.title || '节点操作']
      const button = document.createElement('button')
      button.type = 'button'
      button.draggable = true
      button.className = 'entry designer-context-entry'
      button.setAttribute('aria-label', title)
      button.title = title
      button.innerHTML = diagramIcons[icon]
      entry.html = button.outerHTML
      entry.className = 'designer-context-entry'
      entry.title = title
    }
    return entries
  }
}
