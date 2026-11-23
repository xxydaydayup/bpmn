import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import ReadOnlyProcessDiagram from '@/components/camunda/ReadOnlyProcessDiagram.vue'

const viewer = vi.hoisted(() => {
  let width = 0
  return {
    canvas: { resized: vi.fn(() => { width = 800 }), zoom: vi.fn(() => { if (!width) throw new TypeError('SVGMatrix scale is non-finite') }), addMarker: vi.fn(), removeMarker: vi.fn() },
    registry: { get: vi.fn() },
  }
})
vi.mock('bpmn-js/lib/NavigatedViewer', () => ({ default: class {
  clear() {}
  async importXML() { return { warnings: [] } }
  get(name: string) { return name === 'canvas' ? viewer.canvas : viewer.registry }
  destroy() {}
} }))

it('invalidates a zero-width cached canvas before fitting after its container becomes visible', async () => {
  let width = 0
  let frame: FrameRequestCallback | undefined
  const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const wrapper = mount(ReadOnlyProcessDiagram, { props: { xml: '<definitions />' } })
  try {
    await flushPromises()
    expect(frame).toBeTypeOf('function')
    width = 800
    expect(() => frame!(0)).not.toThrow()
    expect(viewer.canvas.zoom).toHaveBeenCalledWith('fit-viewport')
    expect(wrapper.text()).not.toContain('non-finite')
  } finally { wrapper.unmount(); widthSpy.mockRestore(); heightSpy.mockRestore(); vi.unstubAllGlobals() }
})
