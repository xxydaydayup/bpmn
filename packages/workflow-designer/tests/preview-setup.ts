import { beforeAll } from 'vitest'

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = '.vue-flow__pane { z-index: 1; }'
  document.head.appendChild(style)
  class PreviewResizeObserver {
    private active = true
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { queueMicrotask(() => { if (this.active) this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver) }) }
    unobserve() {}
    disconnect() { this.active = false }
  }
  globalThis.ResizeObserver = PreviewResizeObserver as unknown as typeof ResizeObserver
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get() { return this.classList.contains('vue-flow__handle') ? 8 : this.classList.contains('vue-flow__node') ? 190 : 800 } },
    offsetHeight: { configurable: true, get() { return this.classList.contains('vue-flow__handle') ? 8 : this.classList.contains('vue-flow__node') ? 68 : 500 } },
  })
  HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight, toJSON() {} } }
  class PreviewMatrix { m22 = 1; a = 1; b = 0; c = 0; d = 1; e = 0; f = 0 }
  globalThis.DOMMatrixReadOnly = PreviewMatrix as unknown as typeof DOMMatrixReadOnly
  globalThis.DOMMatrix = PreviewMatrix as unknown as typeof DOMMatrix
  Object.defineProperty(SVGElement.prototype, 'getBBox', { configurable: true, value: () => ({ x: 0, y: 0, width: 40, height: 16 }) })
})
