import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import WorkflowPreview from '../src/WorkflowPreview.vue'
import { prepareWorkflowPreview } from '../src/preview'
import './preview-setup'

const model = {
  processId: 'published', processName: '发布快照',
  nodes: [
    { id: 'start', type: 'start', name: '发起', x: 10, y: 20 },
    { id: 'review', type: 'approval', name: '财务审批', x: 10, y: 160 },
    { id: 'end', type: 'end', name: '结束', x: 10, y: 300 },
  ],
  flows: [{ id: 'f1', source: 'start', target: 'review' }, { id: 'f2', source: 'review', target: 'end' }],
}
const mounted: ReturnType<typeof mount>[] = []
function preview(props: Record<string, unknown>) {
  const wrapper = mount(WorkflowPreview, { props: props as { model: unknown }, attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => { for (const wrapper of mounted.splice(0)) wrapper.unmount() })

describe('WorkflowPreview public read-only behavior with real Vue Flow', () => {
  it('renders nodes, real paths, version metadata and textual activity markers without editing controls', async () => {
    const input = JSON.parse(JSON.stringify(model))
    const wrapper = preview({ model: input, metadata: { name: '财务流程', key: 'finance', version: 2, processDefinitionId: 'finance:2:old' }, nodeStates: { review: 'active', derived_timer: 'active' } })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(wrapper.findAll('.wfd-preview-node')).toHaveLength(3)
    expect(wrapper.findAll('.vue-flow__edge-path')).toHaveLength(2)
    expect(wrapper.text()).toContain('finance:2:old')
    expect(wrapper.text()).toContain('财务审批')
    expect(wrapper.get('[data-node-id="review"]').attributes('data-state')).toBe('active')
    expect(wrapper.get('[data-node-id="review"]').text()).toContain('当前活动')
    expect(wrapper.text()).toContain('derived_timer')
    expect(wrapper.findAll('button').map(button => button.attributes('aria-label') ?? button.text())).toEqual(['缩小流程图', '放大流程图', '适应画布'])
    expect(wrapper.find('.vue-flow__node.draggable').exists()).toBe(false)
    expect(wrapper.emitted('update:model')).toBeUndefined()
    expect(input).toEqual(model)
  })

  it('clears stale nodes and errors when a changed target cannot be drawn, then recovers', async () => {
    const wrapper = preview({ model })
    await flushPromises()
    expect(wrapper.findAll('.wfd-preview-node')).toHaveLength(3)
    await wrapper.setProps({ model: { ...model, flows: [{ source: 'start', target: 'missing' }] } })
    await flushPromises()
    expect(wrapper.findAll('.wfd-preview-node')).toHaveLength(0)
    expect(wrapper.get('[role="alert"]').text()).toContain('悬空顺序流')
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toContain('悬空顺序流')
    await wrapper.setProps({ model: JSON.stringify(model), nodeStates: { review: 'completed' } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('[data-node-id="review"]').text()).toContain('已完成')
    expect(wrapper.text()).not.toContain('当前活动')
  })

  it('zooms and fits the real viewport through the public viewing controls', async () => {
    const wrapper = preview({ model })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 40))
    const transform = () => wrapper.get('.vue-flow__transformationpane').attributes('style')
    const initial = transform()
    await wrapper.get('button[aria-label="放大流程图"]').trigger('click')
    await flushPromises()
    expect(transform()).not.toBe(initial)
    await wrapper.get('button[aria-label="缩小流程图"]').trigger('click')
    await flushPromises()
    expect(transform()).toBe(initial)
    await wrapper.get('button[aria-label="放大流程图"]').trigger('click')
    await wrapper.findAll('button')[2]!.trigger('click')
    await flushPromises()
    expect(transform()).toBe(initial)
  })

  it('keeps unknown node names, original types and their real connections visible', async () => {
    const wrapper = preview({ model: { ...model, nodes: model.nodes.map(node => node.id === 'review' ? { ...node, type: 'futureApproval', name: '新版节点', secretFutureField: 'PRIVATE_VALUE' } : node) } })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(wrapper.get('[data-node-id="review"]').text()).toContain('futureApproval')
    expect(wrapper.get('[data-node-id="review"]').text()).toContain('新版节点')
    expect(wrapper.findAll('.vue-flow__edge-path')).toHaveLength(2)
    expect(wrapper.text()).toContain('暂不支持的节点类型')
    expect(wrapper.text()).not.toContain('PRIVATE_VALUE')
  })

  it('creates temporary layout without mutating frozen input and preserves supplied coordinates', async () => {
    const input = { ...model, nodes: [Object.freeze({ ...model.nodes[0]!, width: 320, height: 100 }), Object.freeze({ id: 'review', type: 'approval', name: '财务审批' }), Object.freeze(model.nodes[2]!)], flows: model.flows }
    Object.freeze(input.nodes)
    Object.freeze(input)
    const before = JSON.stringify(input)
    const prepared = await prepareWorkflowPreview(input)
    expect(prepared.nodes[0]?.position).toEqual({ x: 10, y: 20 })
    expect(prepared.nodes[0]?.width).toBe(320)
    expect(prepared.nodes[0]?.height).toBe(100)
    expect(prepared.nodes[2]?.position).toEqual({ x: 10, y: 300 })
    expect(Number.isFinite(prepared.nodes[1]?.position.x)).toBe(true)
    expect(prepared.nodes[1]?.position.x).toBeGreaterThan(200)
    expect(JSON.stringify(input)).toBe(before)
    expect(prepared.warnings.join()).toContain('临时布局')
  })

  it('shows a subprocess as a sized outer node and leaves internal activity IDs unmatched', async () => {
    const wrapper = preview({ model: { nodes: [{ id: 'sub', type: 'subProcess', name: '合同审核', width: 290, height: 96, x: 0, y: 0, process: { nodes: [{ id: 'inner', type: 'approval', name: '内部审批' }] } }] }, nodeStates: { sub: 'completed', inner: 'active' } })
    await flushPromises()
    expect(wrapper.findAll('.wfd-preview-node')).toHaveLength(1)
    expect(wrapper.get('[data-node-id="sub"] .wfd-node').attributes('style')).toContain('width: 290px')
    expect(wrapper.get('[data-node-id="sub"] .wfd-node').attributes('style')).toContain('height: 96px')
    expect(wrapper.get('[data-node-id="sub"]').text()).toContain('1 个步骤')
    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.text()).toContain('inner')
    expect(wrapper.text()).not.toContain('内部审批')
    expect(wrapper.get('[data-node-id="sub"]').text()).not.toContain('当前活动')
    expect(wrapper.emitted('ready')).toEqual([[{ nodeIds: ['sub'] }]])
  })

  it('discards a late temporary layout after the host switches the selected snapshot', async () => {
    const stale = { processId: 'stale', nodes: [{ id: 'stale', type: 'approval', name: '上一个模板' }] }
    const wrapper = preview({ model: stale })
    await wrapper.setProps({ model })
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(wrapper.text()).toContain('财务审批')
    expect(wrapper.text()).not.toContain('上一个模板')
    expect(wrapper.emitted('ready')?.at(-1)).toEqual([{ nodeIds: ['start', 'review', 'end'] }])
  })

  it.each([
    { nodes: [{ id: '', type: 'start' }] },
    { nodes: [{ id: 'same', type: 'start' }, { id: 'same', type: 'end' }] },
    { nodes: [{ id: 'one', type: 'start' }], flows: [{ id: 'one', source: 'one', target: 'one' }] },
    { nodes: [{ id: 'one', type: 'start' }, { id: 'two', type: 'end' }], flows: [{ source: 'two', target: 'one' }] },
    { format: 'workflow-designer', version: 2, model },
    { nodes: [{ id: 'one', type: 'subProcess', process: { nodes: [{ id: 'one', type: 'start' }] } }] },
  ])('reports unreliable structures without rendering a misleading graph: %j', async input => {
    const wrapper = preview({ model: input })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('.vue-flow').exists()).toBe(false)
  })
})
