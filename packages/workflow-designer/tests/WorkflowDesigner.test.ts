import { mount } from '@vue/test-utils'
import { defineComponent, markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import WorkflowDesigner from '../src/WorkflowDesigner.vue'
import WorkflowEdge from '../src/edges/WorkflowEdge.vue'
import WorkflowNode from '../src/nodes/WorkflowNode.vue'
import { followRouteEndpoints } from '../src/edges/route'
import { cloneWorkflowModelWithFreshNodeIds, createWorkflowNodeId, normalizeLegacyUuidNodeIds, toCanvas } from '../src/adapter'
import { layoutWorkflow } from '../src/layout'
import { workflowTemplates } from '../src/templates'
import fixture from '../src/fixtures/project-approval.json'
import type { WorkflowModel } from '../src/types'
import { toWorkflowCompilerJson } from '../src/compiler-model'

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    VueFlow: defineComponent({
      name: 'VueFlowTestHost',
      props: { nodes: { type: Array, default: () => [] }, edges: { type: Array, default: () => [] }, fitViewOnInit: { type: Boolean, default: false } },
      emits: ['init', 'nodes-initialized', 'node-click', 'edge-click', 'connect', 'edge-update', 'move-end', 'node-drag-start', 'node-drag', 'node-drag-stop'],
      setup(props, { emit }) {
        return () => h('div', { class: 'wfd-flow-mock' }, [
          ...(props.nodes as Array<{ id: string; data: { name: string } }>).map(node => h('button', { class: 'vue-flow__node', type: 'button', onClick: () => emit('node-click', { node }) }, node.data.name)),
          ...(props.edges as Array<{ id: string; source: string; target: string }>).map(edge => h('button', { class: 'vue-flow__edge', type: 'button', onClick: () => emit('edge-click', { edge }) }, edge.source + ' → ' + edge.target)),
        ])
      },
    }),
    useVueFlow: () => ({
      fitView: vi.fn().mockResolvedValue(true), zoomIn: vi.fn(), zoomOut: vi.fn(), setViewport: vi.fn().mockResolvedValue(true),
      screenToFlowCoordinate: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      getNodes: { value: [] as unknown[] },
    }),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    Handle: defineComponent({ name: 'HandleStub', template: '<span />' }),
    BaseEdge: defineComponent({ name: 'BaseEdgeStub', props: { id: String, path: String }, template: '<path :id="id" :d="path" />' }),
    EdgeLabelRenderer: defineComponent({ name: 'EdgeLabelStub', template: '<span><slot /></span>' }),
    getSmoothStepPath: () => ['M 0 0 L 10 10', 5, 5, 0, 0],
  }
})

const validModel = fixture as WorkflowModel
const parallelModel: WorkflowModel = {
  processId: 'parallel_approval', processName: '并行审批',
  nodes: [
    { id: 'start', type: 'start', name: '开始', x: 280, y: 20 },
    { id: 'apply', type: 'approval', name: '提交申请', x: 280, y: 130 },
    { id: 'split', type: 'parallel', name: '并行分流', x: 280, y: 240 },
    { id: 'finance', type: 'approval', name: '财务审批', x: 120, y: 350 },
    { id: 'legal', type: 'approval', name: '法务审批', x: 440, y: 350 },
    { id: 'join', type: 'parallel', name: '并行汇合', x: 280, y: 460 },
    { id: 'archive', type: 'approval', name: '归档', x: 280, y: 570 },
    { id: 'end', type: 'end', name: '结束', x: 280, y: 680 },
  ],
  flows: [
    { source: 'start', target: 'apply' }, { source: 'apply', target: 'split' },
    { source: 'split', target: 'finance' }, { source: 'split', target: 'legal' },
    { source: 'finance', target: 'join' }, { source: 'legal', target: 'join' },
    { source: 'join', target: 'archive' }, { source: 'archive', target: 'end' },
  ],
}

describe('public WorkflowDesigner behavior', () => {
  it('keeps conditions and history when reconnecting a real edge update and blocks readonly or duplicate updates', async () => {
    const input = structuredClone(parallelModel)
    input.flows[1]!.conditionExpression = 'amount > 1'
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    await flow.vm.$emit('edge-update', { edge: { id: 'flow-1' }, connection: { source: 'split', target: 'archive' } })
    expect(exported().flows[1]).toMatchObject({ source: 'split', target: 'archive', conditionExpression: 'amount > 1' })
    await flow.vm.$emit('edge-update', { edge: { id: 'flow-1' }, connection: { source: 'split', target: 'finance' } })
    expect(exported().flows[1]!.target).toBe('archive')
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(exported().flows[1]).toEqual(input.flows[1])
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    await wrapper.setProps({ readonly: true })
    await flow.vm.$emit('edge-update', { edge: { id: 'flow-1' }, connection: { source: 'apply', target: 'join' } })
    expect(exported().flows[1]!.source).toBe('split')
    wrapper.unmount()
  })

  it('saves a parallel fragment without start/end, reopens it and compiles a recursive independent snapshot', async () => {
    const fragment = structuredClone(parallelModel)
    fragment.nodes = fragment.nodes.filter(node => !['start', 'end'].includes(node.type))
    fragment.flows = fragment.flows.filter(edge => edge.source !== 'start' && edge.target !== 'end')
    const wrapper = mount(WorkflowDesigner, { props: { mode: 'subprocess-fragment', modelValue: fragment } })
    const api = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; validate: () => unknown[] }
    expect(api.validate()).toEqual([])
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    const name = wrapper.get('.wfd-inspector input')
    await name.setValue('片段并行分流'); await name.trigger('change')
    const saved = JSON.parse(JSON.stringify(api.exportDesign()))
    const copy = mount(WorkflowDesigner, { props: { mode: 'subprocess-fragment', modelValue: saved } })
    expect((copy.vm as unknown as { validate: () => unknown[] }).validate()).toEqual([])
    const source = { key: 'parallel-fragment', name: '并行片段', displayJson: { nodes: saved.model.nodes, flows: saved.model.flows } }
    const input = structuredClone(parallelModel)
    input.nodes[1] = { ...input.nodes[1]!, type: 'subProcess', process: { nodes: [{ id: 'inner', name: '递归容器', type: 'subProcess', x: 100, y: 100, process: source.displayJson }], flows: [] } }
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const host = mount(WorkflowDesigner, { props: { modelValue: input, compile } })
    await (host.vm as unknown as { compile: () => Promise<unknown> }).compile()
    expect(compile).toHaveBeenCalledOnce()
    expect(toWorkflowCompilerJson(compile.mock.calls[0]![0])).toMatchObject({ nodes: expect.arrayContaining([expect.objectContaining({ type: 'subProcess', process: { nodes: expect.arrayContaining([expect.objectContaining({ process: { nodes: expect.arrayContaining([expect.objectContaining({ type: 'parallel' })]), flows: source.displayJson.flows } })]), flows: [] } })]) })
    wrapper.unmount(); copy.unmount(); host.unmount()
  })

  it.each([{ branch: 'pass' }, { branch: 'reject' }, { branch: 'default' }, { branch: 'other' }, { conditionExpression: 'amount > 1' }, { branch: '', conditionExpression: '' }, { branch: 'pass', conditionExpression: 'amount > 1' }])('preserves and explicitly repairs illegal parallel conditions %j in one history step', async conditions => {
    const input = structuredClone(parallelModel)
    Object.assign(input.flows[2]!, conditions)
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const deploy = vi.fn()
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input, compile, deploy } })
    const api = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; compile: () => Promise<unknown> }
    expect(api.exportDesign().model.flows[2]).toMatchObject(conditions)
    await api.compile(); expect(compile).not.toHaveBeenCalled()
    expect(wrapper.findAll('button').find(button => button.text() === '发布任务模板')!.attributes('disabled')).toBeDefined()
    await wrapper.findAll('.vue-flow__edge')[2]!.trigger('click')
    const clear = () => wrapper.findAll('button').find(button => button.text() === '清除并行出线条件')!
    await wrapper.setProps({ readonly: true })
    expect(clear().attributes('disabled')).toBeDefined()
    await wrapper.setProps({ readonly: false })
    await clear().trigger('click')
    expect(api.exportDesign().model.flows[2]).toEqual({ source: 'split', target: 'finance' })
    await api.compile(); expect(compile).toHaveBeenCalledOnce()
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(api.exportDesign().model.flows[2]).toMatchObject(conditions)
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    expect(api.exportDesign().model.flows[2]).toEqual({ source: 'split', target: 'finance' })
    wrapper.unmount()
  })

  it('preserves reconnected conditions and enforces the same endpoint rules including self-edge exclusion', async () => {
    const input = structuredClone(parallelModel)
    input.flows[1]!.conditionExpression = 'amount > 1'
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input, extensions: { canConnect: () => true } } })
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    await wrapper.findAll('.vue-flow__edge')[1]!.trigger('click')
    const fields = () => wrapper.findAll('.wfd-inspector select')
    await fields()[2]!.setValue('archive')
    expect(exported().flows[1]).toMatchObject({ source: 'apply', target: 'archive' })
    await fields()[1]!.setValue('split')
    expect(exported().flows[1]).toMatchObject({ source: 'split', target: 'archive', conditionExpression: 'amount > 1' })
    await wrapper.findAll('button.wfd-issue').find(button => button.text().includes('并行网关出边'))!.trigger('click')
    expect(wrapper.text()).toContain('清除并行出线条件')
    await fields()[2]!.setValue('finance')
    expect(exported().flows[1]!.target).toBe('archive')
    await fields()[2]!.setValue('split')
    expect(exported().flows[1]!.target).toBe('archive')
    await fields()[1]!.setValue('end')
    expect(exported().flows[1]!.source).toBe('split')
    expect(exported().flows[1]!.conditionExpression).toBe('amount > 1')
    wrapper.unmount()
  })

  it('locates a condition error on the current edge after another flow is deleted', async () => {
    const input = structuredClone(parallelModel)
    input.flows[3]!.conditionExpression = 'amount > 1'
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input } })
    await wrapper.findAll('.vue-flow__edge')[2]!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await wrapper.findAll('button.wfd-issue').find(button => button.text().includes('并行网关出边'))!.trigger('click')
    expect(wrapper.text()).toContain('清除并行出线条件')
    expect(wrapper.get('.wfd-inspector textarea').element.value).toBe('amount > 1')
    wrapper.unmount()
  })

  it('retains unknown edge data when clearing parallel conditions', async () => {
    const input = structuredClone(parallelModel)
    Object.assign(input.flows[2]!, { branch: 'other', future: { keep: true } })
    const compile = vi.fn()
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input, compile } })
    await wrapper.findAll('.vue-flow__edge')[2]!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '清除并行出线条件')!.trigger('click')
    const api = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; compile: () => Promise<unknown> }
    expect(api.exportDesign().model.flows[2]).toEqual({ source: 'split', target: 'finance', future: { keep: true } })
    await api.compile(); expect(compile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('applies the parallel template through public history, export, compile and explicit publish', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' }), deploy = vi.fn()
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile, deploy } })
    await wrapper.findAll('button').find(button => button.text() === '流程模板')!.trigger('click')
    await wrapper.get('input[value="parallel-approval"]').setValue()
    await wrapper.findAll('button').find(button => button.text() === '使用模板')!.trigger('click')
    const api = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; compile: () => Promise<unknown> }
    const model = api.exportDesign().model
    expect(model.nodes.filter(node => node.type === 'parallel')).toHaveLength(2)
    expect(model.nodes.every(node => /^[A-Za-z]+_[0-9a-f]{32}$/.test(node.id))).toBe(true)
    expect(model.flows.every(edge => model.nodes.some(node => node.id === edge.source) && model.nodes.some(node => node.id === edge.target))).toBe(true)
    await api.compile(); expect(compile).toHaveBeenCalledWith(model)
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(api.exportDesign().model).toEqual(validModel)
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    expect(api.exportDesign().model).toEqual(model)
    wrapper.unmount()
  })

  it('edits a parallel split, connects both branches, round-trips history and submits the public callbacks', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const deploy = vi.fn().mockResolvedValue({ version: 1 })
    const input = { ...parallelModel, flows: parallelModel.flows.filter(flow => flow.source !== 'split') }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input, compile, deploy } })
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign()
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flow.vm.$emit('connect', { source: 'split', target: 'finance' })
    await flow.vm.$emit('connect', { source: 'split', target: 'legal' })
    expect(exported().model.flows.filter(edge => edge.source === 'split')).toEqual([
      { source: 'split', target: 'finance' }, { source: 'split', target: 'legal' },
    ])
    expect(wrapper.get('.wfd-inspector select').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.wfd-inspector textarea').attributes('disabled')).toBeDefined()
    await wrapper.findAll('.vue-flow__node')[2]!.trigger('click')
    expect(wrapper.text()).toContain('同时激活全部出线')
    const name = wrapper.get('.wfd-inspector input')
    await name.setValue('部门并行办理'); await name.trigger('change')
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(exported().model.nodes[2]!.name).toBe('并行分流')
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    expect(exported().model.nodes[2]!.name).toBe('部门并行办理')
    const copy = mount(WorkflowDesigner, { props: { modelValue: JSON.parse(JSON.stringify(exported())), compile, deploy } })
    await (copy.vm as unknown as { compile: () => Promise<unknown> }).compile()
    expect(compile).toHaveBeenCalledWith(exported().model)
    await copy.findAll('button').find(button => button.text() === '发布任务模板')!.trigger('click')
    expect(deploy).not.toHaveBeenCalled()
    await copy.findAll('button').find(button => button.text() === '确认发布')!.trigger('click')
    expect(deploy).toHaveBeenCalledWith(exported().model)
    copy.unmount(); wrapper.unmount()
  })

  it('creates a draggable parallel with host defaults and respects read-only mode', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: parallelModel, extensions: { nodeTypes: ['parallel'], nodeDefaults: { parallel: { name: '部门汇合', bizJson: '并行数据' } } } } })
    expect(wrapper.findAll('.wfd-library-item')).toHaveLength(1)
    const transfer = { getData: () => 'parallel' }
    await wrapper.get('main[aria-label="流程画布"]').trigger('drop', { dataTransfer: transfer, clientX: 200, clientY: 250 })
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign()
    expect(exported().model.nodes.at(-1)).toMatchObject({ type: 'parallel', name: '部门汇合', bizJson: '并行数据', x: 200, y: 250 })
    expect(toCanvas(exported().model).nodes.at(-1)).toMatchObject({ draggable: true, connectable: true })
    await wrapper.setProps({ readonly: true })
    expect(wrapper.get('.wfd-library-item').attributes('disabled')).toBeDefined()
    const before = exported()
    await wrapper.get('main[aria-label="流程画布"]').trigger('drop', { dataTransfer: transfer })
    expect(exported()).toEqual(before)
    wrapper.unmount()
  })

  it('binds a published fixed form version and preserves it through history and import without changing form', async () => {
    const model = { ...validModel, nodes: validModel.nodes.map(node => node.id === 'apply' ? { ...node, form: 'legacy-form' } : node) }
    const businessForms = { list: vi.fn().mockResolvedValue([{ key: 'leave', name: '请假单', version: 3, status: 'PUBLISHED' }]), get: vi.fn().mockResolvedValue({ key: 'leave', name: '请假单', version: 3, status: 'PUBLISHED' }) }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: model, extensions: { businessForms } } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.business-form-editor select option[value="form:leave@3"]').exists()).toBe(true))
    await wrapper.get('.business-form-editor select').setValue('form:leave@3')
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign()
    expect(exported().model.nodes.find(node => node.id === 'apply')).toMatchObject({ bizFormKey: 'form:leave@3', form: 'legacy-form' })
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(exported().model.nodes.find(node => node.id === 'apply')?.bizFormKey).toBeUndefined()
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    const copy = mount(WorkflowDesigner, { props: { modelValue: JSON.parse(JSON.stringify(exported())) } })
    expect((copy.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')).toMatchObject({ bizFormKey: 'form:leave@3', form: 'legacy-form' })
    copy.unmount(); wrapper.unmount()
  })

  it('shows and creates all built-in nodes using registered defaults', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const titles = wrapper.findAll('.wfd-library-item strong').map(item => item.text())
    expect(titles).toHaveLength(10)
    expect(titles.every((title, index) => title.includes([
      '开始', '审批', '多人审批', '服务调用', '消息等待', '定时等待', '条件分支', '并行网关', '嵌入式子流程', '结束',
    ][index]!))).toBe(true)
    expect(wrapper.findAll('.wfd-library-group h3').map(item => item.text())).toEqual(['人工与服务', '流程事件', '流程控制'])
    expect(wrapper.findAll('.wfd-library-icon svg')).toHaveLength(10)
    const expected = [
      ['start', '开始'], ['approval', '审批'], ['countersign', '多人审批'], ['service', '服务调用'],
      ['receive', '消息等待'], ['timer', '定时等待'], ['condition', '条件分支'], ['parallel', '并行网关'], ['subProcess', '嵌入式子流程'], ['end', '结束'],
    ] as const

    for (const [type, title] of expected) {
      const button = wrapper.findAll('.wfd-library-item').find(item => item.text().includes(title))
      expect(button, `${title} should be in the node library`).toBeDefined()
      await button!.trigger('click')
      expect(wrapper.find('input[placeholder="可选，供宿主业务系统识别"]').exists()).toBe(true)
      const data = wrapper.get('.wfd-inspector textarea[rows="4"]')
      expect(data.element.closest('label')?.textContent).toContain('业务数据（bizJson）')
      await data.setValue('节点业务数据：' + type)
      expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.at(-1)?.bizJson).toBe('节点业务数据：' + type)
    }

    const nodes = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes
    for (const [type, name] of expected) expect(nodes.find(node => node.type === type && node.name === name)).toBeDefined()
    expect(nodes.find(node => node.type === 'countersign' && node.name === '多人审批')).toMatchObject({ approveMode: 'ALL', sequential: false })
    expect(nodes.find(node => node.type === 'timer' && node.name === '定时等待')).toMatchObject({ timerType: 'duration', timerValue: 'PT30M' })
  })

  it('keeps existing nodes while filtering the palette and merges host defaults over registered defaults', async () => {
    const wrapper = mount(WorkflowDesigner, { props: {
      modelValue: validModel,
      extensions: { nodeTypes: ['timer'], nodeDefaults: { timer: { timerType: 'cycle', timerValue: 'R2/PT1H' } } },
    } })
    expect(wrapper.findAll('.wfd-library-item')).toHaveLength(1)
    expect(wrapper.findAll('.wfd-library-item')[0]!.text()).toContain('定时等待')
    expect(wrapper.findAll('.vue-flow__node').some(node => node.text().includes('立项审批单'))).toBe(true)

    await wrapper.find('.wfd-library-item').trigger('click')
    const added = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.at(-1)
    expect(added).toMatchObject({ type: 'timer', name: '定时等待', timerType: 'cycle', timerValue: 'R2/PT1H' })
  })

  it('loads a selected fragment as an independent snapshot, preserves it through history and passes it to compile', async () => {
    const fragment = {
      key: 'fragment-budget', name: '预算审批', description: '预算路径',
      displayJson: {
        processId: 'budget-fragment', processName: '预算审批',
        nodes: [
          { id: 'inner', type: 'approval', name: '部门审批', x: 10, y: 20, reminder: { action: 'return', target: 'inner2' } },
          { id: 'inner2', type: 'approval', name: '负责人审批', x: 10, y: 140 },
        ],
        flows: [{ id: 'flow-inner', source: 'inner', target: 'inner2' }],
        width: 600, height: 420,
      },
    }
    const subprocessFragments = { list: vi.fn().mockResolvedValue([fragment]), get: vi.fn().mockResolvedValue(fragment) }
    const model = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, type: 'subProcess', name: '预算审批' } : node),
      flows: validModel.flows.map(flow => flow.source === 'gwMinister' ? { ...flow, conditionExpression: flow.branch === 'reject' ? '${false}' : '${true}' } : flow),
    } as WorkflowModel
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: model, compile, extensions: { subprocessFragments } } })
    await wrapper.findAll('.vue-flow__node')[model.nodes.findIndex(node => node.id === 'minister')]!.trigger('click')
    await vi.waitFor(() => expect(subprocessFragments.list).toHaveBeenCalled())
    const selector = wrapper.get('.wfd-subprocess-select-field select')
    await selector.setValue('fragment-budget')

    await vi.waitFor(() => expect(subprocessFragments.get).toHaveBeenCalledWith('fragment-budget'))
    const getNode = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'minister')!
    await vi.waitFor(() => expect(getNode().subProcessKey).toBe('fragment-budget'))
    expect(getNode().process).toEqual({ processId: 'budget-fragment', processName: '预算审批', nodes: fragment.displayJson.nodes, flows: fragment.displayJson.flows })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(getNode().process).toBeUndefined()
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(getNode().process).toEqual({ processId: 'budget-fragment', processName: '预算审批', nodes: fragment.displayJson.nodes, flows: fragment.displayJson.flows })
    await (wrapper.vm as unknown as { compile: () => Promise<unknown> }).compile()
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    expect((compile.mock.calls[0]![0] as WorkflowModel).nodes.find(node => node.id === 'minister')?.process).toEqual({ processId: 'budget-fragment', processName: '预算审批', nodes: fragment.displayJson.nodes, flows: fragment.displayJson.flows })
  })

  it('edits and exports fragment business data, reuses its snapshot and refreshes only explicitly', async () => {
    const bizJson = ['  内部中文 "review" <&>', 'review_bizJson: 保留  '].join(String.fromCharCode(10))
    const fragmentEditor = mount(WorkflowDesigner, { props: { mode: 'subprocess-fragment', modelValue: {
      processId: 'fragment', processName: '审批片段', nodes: [{ id: 'review', type: 'approval', name: '内部审批', x: 10, y: 20 }], flows: [],
    } } })
    const fragmentVm = fragmentEditor.vm as unknown as { exportDesign: () => { model: WorkflowModel } }
    await fragmentEditor.find('.vue-flow__node').trigger('click')
    expect(fragmentEditor.find('input[placeholder="可选，供宿主业务系统识别"]').exists()).toBe(false)
    await fragmentEditor.get('textarea[rows="4"]').setValue(bizJson)
    await fragmentEditor.get('textarea[rows="4"]').trigger('focus')
    await fragmentEditor.get('textarea[rows="4"]').setValue('')
    expect(fragmentVm.exportDesign().model.nodes[0]).not.toHaveProperty('bizJson')
    await fragmentEditor.get('button[aria-label="撤销"]').trigger('click')
    expect(fragmentVm.exportDesign().model.nodes[0]?.bizJson).toBe(bizJson)
    await fragmentEditor.get('button[aria-label="重做"]').trigger('click')
    expect(fragmentVm.exportDesign().model.nodes[0]).not.toHaveProperty('bizJson')
    await fragmentEditor.get('button[aria-label="撤销"]').trigger('click')
    const fragment = { key: 'business-fragment', name: '审批片段', displayJson: fragmentVm.exportDesign().model }
    await fragmentEditor.setProps({ readonly: true })
    await fragmentEditor.find('.vue-flow__node').trigger('click')
    expect((fragmentEditor.get('textarea[rows="4"]').element as HTMLTextAreaElement).disabled).toBe(true)
    expect((fragmentEditor.get('textarea[rows="4"]').element as HTMLTextAreaElement).value).toBe(bizJson)
    const subprocessFragments = { list: vi.fn().mockResolvedValue([fragment]), get: vi.fn().mockImplementation(async () => fragment) }
    const model = {
      processId: 'main', processName: '主流程', nodes: [
        { id: 'start', type: 'start', name: '开始', x: 10, y: 10 },
        { id: 'container', type: 'subProcess', name: '容器', bizJson: '容器默认值', x: 10, y: 120 },
        { id: 'end', type: 'end', name: '结束', x: 10, y: 240 },
      ], flows: [{ source: 'start', target: 'container' }, { source: 'container', target: 'end' }],
    } as WorkflowModel
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: model, compile, extensions: { subprocessFragments } } })
    const vm = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; compile: () => Promise<unknown> }
    const container = () => vm.exportDesign().model.nodes[1]!
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.wfd-subprocess-select-field option[value="business-fragment"]').exists()).toBe(true))
    await wrapper.get('.wfd-subprocess-select-field select').setValue('business-fragment')
    await vi.waitFor(() => expect(container().process?.nodes[0]?.bizJson).toBe(bizJson))
    expect(container().bizJson).toBe('容器默认值')
    fragment.displayJson.nodes[0]!.bizJson = '片段库新版'
    expect(container().process?.nodes[0]?.bizJson).toBe(bizJson)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const refresh = wrapper.findAll('button').find(button => button.text() === '刷新快照')!
    await refresh.trigger('click')
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    expect(container().process?.nodes[0]?.bizJson).toBe(bizJson)
    confirm.mockReturnValue(true)
    await refresh.trigger('click')
    await vi.waitFor(() => expect(container().process?.nodes[0]?.bizJson).toBe('片段库新版'))
    expect(container().bizJson).toBe('容器默认值')
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(container().process?.nodes[0]?.bizJson).toBe(bizJson)
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    const restored = mount(WorkflowDesigner, { props: { modelValue: JSON.parse(JSON.stringify(vm.exportDesign())), compile } })
    await (restored.vm as unknown as { compile: () => Promise<unknown> }).compile()
    expect(compile.mock.calls[0]![0].nodes[1]).toMatchObject({ bizJson: '容器默认值', process: { nodes: [expect.objectContaining({ id: 'review', bizJson: '片段库新版' })] } })
    expect(toWorkflowCompilerJson(compile.mock.calls[0]![0]).nodes[1]).not.toHaveProperty('subProcessKey')
    confirm.mockRestore(); restored.unmount(); wrapper.unmount(); fragmentEditor.unmount()
  })

  it('loads a nested subprocess fragment without leaking source metadata into its compiler process', async () => {
    const nested = {
      processId: 'outer-fragment', processName: '外层', width: 800, height: 480,
      nodes: [{ id: 'inner-sub', type: 'subProcess', name: '内层', subProcessKey: 'nested-key', subProcessName: '内层来源', process: { processId: 'inner-fragment', nodes: [{ id: 'approval-1', type: 'approval', name: '审批', x: 10, y: 20 }], flows: [] } }],
      flows: [],
    }
    const subprocessFragments = { list: vi.fn().mockResolvedValue([{ key: 'outer-key', name: '外层', displayJson: nested }]), get: vi.fn().mockResolvedValue({ key: 'outer-key', name: '外层', displayJson: nested }) }
    const model = { ...validModel, nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, type: 'subProcess', name: '外层' } : node) } as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: model, extensions: { subprocessFragments } } })
    await wrapper.findAll('.vue-flow__node')[model.nodes.findIndex(node => node.id === 'minister')]!.trigger('click')
    await vi.waitFor(() => expect(subprocessFragments.list).toHaveBeenCalled())
    await wrapper.get('.wfd-subprocess-select-field select').setValue('outer-key')

    const embedded = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'minister')!
    await vi.waitFor(() => expect(embedded().subProcessKey).toBe('outer-key'))
    expect(embedded().process).toEqual({ processId: 'outer-fragment', processName: '外层', nodes: nested.nodes, flows: [] })
  })

  it('appends host validation while preserving built-in validation and custom inspector overrides', async () => {
    const CustomInspector = defineComponent({
      props: { model: { type: Object, required: true }, update: { type: Function, required: true } },
      template: '<button type="button" class="custom-inspector" @click="update(\'name\', \'host edited\')">Host inspector</button>',
    })
    const wrapper = mount(WorkflowDesigner, { props: {
      modelValue: validModel,
      extensions: {
        nodePropertyEditors: { approval: markRaw(CustomInspector) },
        validate: () => [{ code: 'host-rule', message: '宿主校验问题' }],
      },
    } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    await wrapper.find('.custom-inspector').trigger('click')
    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.nodes.find(node => node.id === 'apply')?.name).toBe('host edited')
    expect(wrapper.text()).toContain('宿主校验问题')
    expect(wrapper.find('.wfd-inspector input[placeholder="例如：project-form"]').exists()).toBe(false)
    expect(wrapper.find('.wfd-inspector input[placeholder="可选，供宿主业务系统识别"]').exists()).toBe(false)
    expect(wrapper.find('.wfd-inspector textarea[rows="4"]').exists()).toBe(false)
  })

  it('disables bizType editing when the workflow designer is read-only', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, readonly: true } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    expect((wrapper.get('input[placeholder="可选，供宿主业务系统识别"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.get('.wfd-inspector textarea[rows="4"]').element as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('preserves opaque bizJson through edits, node switches, history, design import, model binding and compilation', async () => {
    const bizJson = "  中文 \"review\" <tag>&\nreview_bizJson: 非 JSON  "
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    const exported = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign()
    expect(exported().model.nodes.every(node => !Object.hasOwn(node, 'bizJson'))).toBe(true)
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    const data = wrapper.get('.wfd-inspector textarea[rows="4"]')
    await data.trigger('focus')
    await data.setValue(bizJson)
    expect(exported().model.nodes[1]?.bizJson).toBe(bizJson)
    const writeback = wrapper.emitted('update:modelValue')!.at(-1)![0]
    expect(writeback).toMatchObject({ model: { nodes: expect.arrayContaining([expect.objectContaining({ id: 'apply', bizJson })]) } })
    await wrapper.setProps({ modelValue: writeback as never })
    await wrapper.get('.wfd-inspector input:not([disabled])').setValue('改名后仍保留数据')
    await wrapper.findAll('.vue-flow__node')[2]!.trigger('click')
    expect((wrapper.get('.wfd-inspector textarea[rows="4"]').element as HTMLTextAreaElement).value).toBe('')
    await wrapper.get('.wfd-inspector textarea[rows="4"]').setValue('另一个节点')
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    expect((wrapper.get('.wfd-inspector textarea[rows="4"]').element as HTMLTextAreaElement).value).toBe(bizJson)
    await wrapper.get('.wfd-inspector textarea[rows="4"]').trigger('focus')
    await wrapper.get('.wfd-inspector textarea[rows="4"]').setValue('')
    expect(exported().model.nodes[1]).not.toHaveProperty('bizJson')
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    expect(exported().model.nodes[1]?.bizJson).toBe(bizJson)
    await wrapper.get('button[aria-label="重做"]').trigger('click')
    expect(exported().model.nodes[1]).not.toHaveProperty('bizJson')
    await wrapper.get('button[aria-label="撤销"]').trigger('click')
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flow.vm.$emit('node-drag-start')
    await flow.vm.$emit('node-drag-stop')
    expect(exported().model.nodes[1]?.bizJson).toBe(bizJson)
    const restored = mount(WorkflowDesigner, { props: { modelValue: JSON.parse(JSON.stringify(exported())), compile } })
    await (restored.vm as unknown as { compile: () => Promise<unknown> }).compile()
    expect(compile.mock.calls[0]![0].nodes[1]).toMatchObject({ name: '改名后仍保留数据', bizJson })
    expect(compile.mock.calls[0]![0].nodes[2].bizJson).toBe('另一个节点')
    restored.unmount(); wrapper.unmount()
  })

  it.each([{}, [], null, 42, false])('retains imported invalid bizJson %j and blocks the public compile operation', async bizJson => {
    const compile = vi.fn()
    const input = { ...validModel, nodes: validModel.nodes.map(node => node.id === 'apply' ? { ...node, bizJson } : node) } as unknown as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: input, compile } })
    const vm = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; validate: () => { code: string; path: string }[]; compile: () => Promise<unknown> }
    expect(vm.exportDesign().model.nodes[1]?.bizJson).toEqual(bizJson)
    expect(vm.validate()).toContainEqual(expect.objectContaining({ code: 'field-type', path: '/nodes/1/bizJson' }))
    await vm.compile()
    expect(compile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps mandatory connection restrictions when the host permits a connection', async () => {
    const canConnect = vi.fn(() => true)
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, extensions: { canConnect } } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flow.vm.$emit('connect', { source: 'end', target: 'apply' })
    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(canConnect).not.toHaveBeenCalled()
    expect(exported.flows).toEqual(validModel.flows)
  })

  it('rejects connections forbidden by node definitions and keeps condition checks contextual', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const before = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.flows.length

    await flow.vm.$emit('connect', { source: 'end', target: 'start' })
    await flow.vm.$emit('connect', { source: 'minister', target: 'start' })
    await flow.vm.$emit('connect', { source: 'gwMinister', target: 'gwManagers' })
    await flow.vm.$emit('connect', { source: 'start', target: 'end' })
    const after = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.flows
    expect(after).toHaveLength(before + 1)
    expect(after.at(-1)).toMatchObject({ source: 'start', target: 'end' })
  })

  it('shows node-level validation messages against their node in the public inspector', async () => {
    const invalid = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'gwMinister'
        ? { ...node, type: 'timer', timerType: 'duration', timerValue: 'tomorrow' }
        : node),
    } as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: invalid } })
    expect(wrapper.text()).toContain('定时时长必须使用 ISO-8601 格式')
    await wrapper.findAll('.vue-flow__node').find(node => node.text().includes('部长审批结果'))!.trigger('click')
    expect(wrapper.text()).toContain('定时时长必须使用 ISO-8601 格式')
  })

  it('creates node ids that can be used as Camunda EL variable names', () => {
    const id = createWorkflowNodeId('approval')
    const assigneeExpression = `\${${id}_assignee}`
    expect(id).toMatch(/^approval_[0-9a-f]{32}$/)
    expect(assigneeExpression).toMatch(/^\$\{[A-Za-z_$][A-Za-z0-9_$]*\}$/)
  })

  it('shows message wait semantics and edits the optional message name', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const eventGroup = wrapper.findAll('.wfd-library-group').find(group => group.text().includes('流程事件'))!
    await eventGroup.findAll('button').find(button => button.text().includes('消息等待'))!.trigger('click')
    const addedId = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.at(-1)!.id
    expect(addedId).toMatch(/^receive_[0-9a-f]{32}$/)
    const input = wrapper.get('input[placeholder="留空时使用节点标识"]')
    expect(wrapper.text()).toContain('消息名')
    expect(wrapper.text()).toContain('不产生人工待办')
    await input.setValue('invoice.ready')
    await input.trigger('change')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.at(-1))
      .toMatchObject({ type: 'receive', messageName: 'invoice.ready' })
  })

  it('adds a timer event with a valid default and changes the timer condition with its value', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const eventGroup = wrapper.findAll('.wfd-library-group').find(group => group.text().includes('流程事件'))!
    await eventGroup.findAll('button').find(button => button.text().includes('定时等待'))!.trigger('click')
    const vm = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }
    expect(vm.exportDesign().model.nodes.at(-1)).toMatchObject({ type: 'timer', timerType: 'duration', timerValue: 'PT30M', id: expect.stringMatching(/^timer_[0-9a-f]{32}$/) })
    const node = vm.exportDesign().model.nodes.at(-1)!
    expect((wrapper.get('input[placeholder*="PT30M"]').element as HTMLInputElement).value).toBe('PT30M')
    await wrapper.get('select[aria-label="等待条件"]').setValue('date')
    await wrapper.vm.$nextTick()
    expect(vm.exportDesign().model.nodes.find(item => item.id === node.id)).toMatchObject({ timerType: 'date', timerValue: '2026-12-31T23:59:59' })
  })

  it('publishes, undoes, redoes, and compiles a timer property edit', async () => {
    const timerModel = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'gwManagers'
        ? { ...node, type: 'timer', timerType: 'duration', timerValue: 'PT1M' }
        : node),
      flows: validModel.flows.map(flow => flow.source === 'gwManagers' ? { ...flow, conditionExpression: flow.branch === 'reject' ? '${false}' : '${true}' } : flow),
    } as WorkflowModel
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: timerModel, compile } })
    const timerIndex = timerModel.nodes.findIndex(node => node.id === 'gwManagers')
    await wrapper.findAll('.vue-flow__node')[timerIndex]!.trigger('click')
    await wrapper.get('select[aria-label="等待条件"]').setValue('date')

    const getTimer = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } })
      .exportDesign().model.nodes.find(node => node.id === 'gwManagers')
    expect(getTimer()).toMatchObject({ timerType: 'date', timerValue: '2026-12-31T23:59:59' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      model: { nodes: expect.arrayContaining([expect.objectContaining({ id: 'gwManagers', timerType: 'date', timerValue: '2026-12-31T23:59:59' })]) },
    })

    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(getTimer()).toMatchObject({ timerType: 'duration', timerValue: 'PT1M' })
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(getTimer()).toMatchObject({ timerType: 'date', timerValue: '2026-12-31T23:59:59' })
    await (wrapper.vm as unknown as { compile: () => Promise<unknown> }).compile()
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    expect((compile.mock.calls[0]![0] as WorkflowModel).nodes.find(node => node.id === 'gwManagers'))
      .toMatchObject({ timerType: 'date', timerValue: '2026-12-31T23:59:59' })
  })

  it('applies the JSON template from the picker and fits its top-to-bottom graph', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('button').find(button => button.text() === '流程模板')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '使用模板')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as unknown as { model: WorkflowModel }).model.processId).toBe('serial-approval')
    const model = (wrapper.vm as unknown as { model: WorkflowModel }).model
    expect(model.nodes.every(node => /^\w+_[0-9a-f]{32}$/.test(node.id))).toBe(true)
    const nodeIds = new Set(model.nodes.map(node => node.id))
    expect(model.flows.every(flow => nodeIds.has(flow.source) && nodeIds.has(flow.target))).toBe(true)
    expect(wrapper.find('[role=dialog][aria-labelledby=wfd-template-title]').exists()).toBe(false)
  })

  it('remaps node ids in template copies, including flows and node-to-node reminder targets', () => {
    const source: WorkflowModel = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, reminder: { action: 'return', target: 'apply' } } : node),
    }
    const copy = cloneWorkflowModelWithFreshNodeIds(source)
    const copiedApplyId = copy.nodes.find(node => node.name === '立项审批单')!.id
    const copiedMinister = copy.nodes.find(node => node.name === '部长审批')!
    expect(copy.nodes.every((node, index) => node.id !== source.nodes[index]?.id)).toBe(true)
    expect(copiedMinister.reminder?.target).toBe(copiedApplyId)
    expect(copy.flows.every(flow => copy.nodes.some(node => node.id === flow.source) && copy.nodes.some(node => node.id === flow.target))).toBe(true)
  })

  it('normalizes persisted UUID ids without breaking flows or reminder targets', () => {
    const oldId = 'approval_937c1a82-933b-42b4-92a7-ed676c3de0fc'
    const source: WorkflowModel = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, id: oldId, reminder: { action: 'return', target: 'apply' } } : node),
      flows: validModel.flows.map(flow => ({ ...flow, source: flow.source === 'minister' ? oldId : flow.source, target: flow.target === 'minister' ? oldId : flow.target })),
    }
    const normalized = normalizeLegacyUuidNodeIds(source)
    const newId = 'approval_937c1a82933b42b492a7ed676c3de0fc'
    expect(normalized.nodes.some(node => node.id === oldId)).toBe(false)
    expect(normalized.nodes.find(node => node.name === '部长审批')).toMatchObject({ id: newId, reminder: { target: 'apply' } })
    expect(normalized.flows.some(flow => flow.source === oldId || flow.target === oldId)).toBe(false)
    expect(normalized.flows.some(flow => flow.source === newId || flow.target === newId)).toBe(true)
  })

  it('normalizes persisted UUID ids when loading a model into the designer', () => {
    const oldId = 'approval_937c1a82-933b-42b4-92a7-ed676c3de0fc'
    const source: WorkflowModel = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, id: oldId } : node),
      flows: validModel.flows.map(flow => ({ ...flow, source: flow.source === 'minister' ? oldId : flow.source, target: flow.target === 'minister' ? oldId : flow.target })),
    }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: source, compile: vi.fn() } })
    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.nodes.some(node => node.id === oldId)).toBe(false)
    expect(exported.nodes.some(node => node.id === 'approval_937c1a82933b42b492a7ed676c3de0fc')).toBe(true)
    expect(exported.flows.every(flow => exported.nodes.some(node => node.id === flow.source) && exported.nodes.some(node => node.id === flow.target))).toBe(true)
  })

  it('renders labels on two-point ELK routes using Vue Flow live path coordinates', async () => {
    const wrapper = mount(WorkflowEdge, { props: {
      id: 'flow-1', source: 'start', target: 'approval', type: 'workflowRoute',
      sourceNode: {} as never, targetNode: {} as never,
      sourceX: 40, sourceY: 60, targetX: 40, targetY: 140,
      sourcePosition: 'bottom', targetPosition: 'top', markerStart: '', markerEnd: '', events: {},
      data: { branch: 'pass', original: { source: 'start', target: 'approval' }, routePoints: [{ x: 40, y: 60 }, { x: 40, y: 140 }] },
    } as never })
    expect(wrapper.text()).toContain('通过')
    expect(wrapper.find('path').attributes('d')).toBe('M 40 60 L 40 140')
    expect(wrapper.find('.wfd-edge-label').attributes('style')).toContain('translate(40px,60px)')
    await wrapper.setProps({ sourceX: 65, sourceY: 85, targetX: 75, targetY: 160 })
    expect(wrapper.find('path').attributes('d')).toBe('M 65 85 L 65 160 L 75 160')
    expect(wrapper.find('.wfd-edge-label').attributes('style')).toContain('translate(65px,160px)')
  })

  it('lays out the imported approval fixture with ELK without throwing', async () => {
    const canvas = toCanvas(validModel)
    const result = await layoutWorkflow(canvas.nodes, canvas.edges)
    expect(result.nodes).toHaveLength(validModel.nodes.length)
    expect(result.edges).toHaveLength(validModel.flows.length)
    expect(result.nodes.find(node => node.id === 'end')!.position.y).toBeGreaterThan(result.nodes.find(node => node.id === 'start')!.position.y)
  })

  it('edits through the public inspector, publishes the complete envelope and supports undo/redo', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const field = wrapper.find('.wfd-inspector input:not([disabled])')
    await field.setValue('已更新的申请')
    await field.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ format: 'workflow-designer', model: { nodes: expect.arrayContaining([expect.objectContaining({ name: '已更新的申请' })]) } })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ model: { nodes: expect.arrayContaining([expect.objectContaining({ name: '立项审批单' })]) } })
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ model: { nodes: expect.arrayContaining([expect.objectContaining({ name: '已更新的申请' })]) } })
  })

  it('keeps the latest viewport and host display data when undoing', async () => {
    const route = [{ x: 275, y: 213 }, { x: 275, y: 237 }, { x: 435, y: 237 }, { x: 435, y: 285 }]
    const document = {
      format: 'workflow-designer', version: 1, model: { ...validModel, modelExtension: { future: true } }, hostEnvelopeExtension: { keep: true },
      editor: { viewport: { x: 4, y: 8, zoom: 1 }, theme: { accent: '#123456' }, extensions: { hostOverlay: 'keep' }, hostPanel: { collapsed: true }, routes: { 'flow-1': route } },
    }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: document } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const name = wrapper.find('.wfd-inspector input:not([disabled])')
    await name.setValue('临时名称')
    await name.trigger('change')
    await wrapper.findComponent({ name: 'VueFlowTestHost' }).vm.$emit('move-end', { flowTransform: { x: 42, y: -18, zoom: 1.4 } })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    const restored = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { model: WorkflowModel; editor: Record<string, any>; hostEnvelopeExtension: unknown }
    expect(restored.model.nodes.find(node => node.id === 'apply')?.name).toBe('立项审批单')
    expect(restored.model.modelExtension).toEqual({ future: true })
    expect(restored.editor).toMatchObject({ viewport: { x: 42, y: -18, zoom: 1.4 }, theme: { accent: '#123456' }, extensions: { hostOverlay: 'keep' }, hostPanel: { collapsed: true }, routes: { 'flow-1': route } })
    expect(restored.hostEnvelopeExtension).toEqual({ keep: true })
  })

  it('does not create history for viewport changes and truncates redo after a new edit', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findComponent({ name: 'VueFlowTestHost' }).vm.$emit('move-end', { flowTransform: { x: 30, y: 12, zoom: 1.2 } })
    const hostWriteback = wrapper.emitted('update:modelValue')?.at(-1)?.[0]
    await wrapper.setProps({ modelValue: hostWriteback as never })
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const field = wrapper.find('.wfd-inspector input:not([disabled])')
    await field.setValue('第一次编辑')
    await field.trigger('change')
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const nextField = wrapper.find('.wfd-inspector input:not([disabled])')
    await nextField.setValue('新分支')
    await nextField.trigger('change')
    expect((wrapper.find('button[aria-label="重做"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not reset history when the host writes back several emitted editor states', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flow.vm.$emit('move-end', { flowTransform: { x: 12, y: 8, zoom: 1.1 } })
    await flow.vm.$emit('move-end', { flowTransform: { x: 24, y: 16, zoom: 1.2 } })
    const writes = wrapper.emitted('update:modelValue')!
    await wrapper.setProps({ modelValue: writes[0]![0] as never })
    await wrapper.setProps({ modelValue: writes[1]![0] as never })
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const name = wrapper.find('.wfd-inspector input:not([disabled])')
    await name.setValue('连续回写后继续编辑')
    await name.trigger('change')
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')?.name).toBe('立项审批单')
  })

  it('compiles only the restored WorkflowModel after undo', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const name = wrapper.find('.wfd-inspector input:not([disabled])')
    await name.setValue('待撤销名称')
    await name.trigger('change')
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '生成 BPMN XML')!.trigger('click')
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    expect(compile).toHaveBeenCalledWith(validModel)
  })

  it('edits bizType as shared node metadata and passes it to the compile callback', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')

    const bizType = wrapper.get('input[placeholder="可选，供宿主业务系统识别"]')
    await bizType.setValue('  procurement.request  ')
    await bizType.trigger('change')

    const vm = wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel }; compile: () => Promise<unknown> }
    const exported = vm.exportDesign().model
    expect(exported.nodes.find(node => node.id === 'apply')?.bizType).toBe('  procurement.request  ')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      model: { nodes: expect.arrayContaining([expect.objectContaining({ id: 'apply', bizType: '  procurement.request  ' })]) },
    })
    await vm.compile()
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    expect(compile).toHaveBeenCalledWith(exported)
    expect(wrapper.text()).not.toContain('包含未识别数据，编译已禁用')
  })

  it('removes an empty bizType and preserves undo and redo behavior', async () => {
    const modelWithBizType = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'apply' ? { ...node, bizType: 'purchase' } : node),
    } as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: modelWithBizType } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    const bizType = wrapper.get('input[placeholder="可选，供宿主业务系统识别"]')
    await bizType.setValue('')
    await bizType.trigger('change')

    const getBizType = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')?.bizType
    expect(getBizType()).toBeUndefined()
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(getBizType()).toBe('purchase')
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(getBizType()).toBeUndefined()
  })

  it('does not create an undo step for an invalid JSON import', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('button').find(button => button.text() === '导入 / 转换 JSON')!.trigger('click')
    await wrapper.find('textarea[aria-label="业务 JSON"]').setValue('{ invalid')
    await wrapper.findAll('button').find(button => button.text() === '导入到画布')!.trigger('click')
    expect(wrapper.find('[role="alert"]').text()).toContain('无法解析')
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('resets history when the host replaces the workflow model', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const name = wrapper.find('.wfd-inspector input:not([disabled])')
    await name.setValue('本地编辑')
    await name.trigger('change')
    const replacement = { ...validModel, processId: 'host-replacement', processName: '宿主载入的新流程' }
    await wrapper.setProps({ modelValue: replacement })
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const replacementName = wrapper.find('.wfd-inspector input:not([disabled])')
    await replacementName.setValue('新流程编辑')
    await replacementName.trigger('change')
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model).toMatchObject({ processId: 'host-replacement', processName: '宿主载入的新流程' })
  })

  it('records node and flow structure edits as undoable operations', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flowHost = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flowHost.vm.$emit('connect', { source: 'start', target: 'end' })
    let model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.flows).toHaveLength(validModel.flows.length + 1)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.flows).toHaveLength(validModel.flows.length)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.flows.at(-1)).toMatchObject({ source: 'start', target: 'end' })

    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.nodes.some(node => node.id === 'apply')).toBe(false)
    expect(model.flows.some(item => item.source === 'apply' || item.target === 'apply')).toBe(false)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.nodes.find(node => node.id === 'apply')).toMatchObject(validModel.nodes.find(node => node.id === 'apply')!)
    expect(model.flows.filter(item => item.source === 'apply' || item.target === 'apply')).toHaveLength(4)
  })

  it('undoes and redoes adding a node as one graph edit', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const before = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.length
    await wrapper.findAll('.wfd-library-item').find(item => item.text().includes('定时等待'))!.trigger('click')
    let model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.nodes).toHaveLength(before + 1)
    expect(model.nodes.at(-1)).toMatchObject({ type: 'timer', timerType: 'duration', timerValue: 'PT30M' })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.nodes).toHaveLength(before)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(model.nodes).toHaveLength(before + 1)
  })

  it('undoes deletion of a single sequential flow', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flowIndex = 0
    await wrapper.findAll('.vue-flow__edge')[flowIndex]!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.flows).toHaveLength(validModel.flows.length - 1)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.flows[flowIndex]).toEqual(validModel.flows[flowIndex])
  })

  it('undoes a valid JSON import as a single graph edit', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const imported = { ...validModel, processId: 'imported-flow', processName: '导入流程', importerData: { retain: true } }
    await wrapper.findAll('button').find(button => button.text() === '导入 / 转换 JSON')!.trigger('click')
    await wrapper.find('textarea[aria-label="业务 JSON"]').setValue(JSON.stringify(imported))
    await wrapper.findAll('button').find(button => button.text() === '导入到画布')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model).toMatchObject({ processId: 'imported-flow', importerData: { retain: true } })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.processId).toBe(validModel.processId)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.processId).toBe('imported-flow')
  })

  it('imports a full design envelope as one graph edit and keeps its editor data', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const imported = {
      format: 'workflow-designer', version: 1,
      model: { ...validModel, processId: 'full-envelope-import', processName: '完整设计稿导入', envelopeData: 'business' },
      editor: { viewport: { x: 16, y: 24, zoom: 1.3 }, theme: { accent: '#654321' }, hostPanel: { visible: false }, routes: { 'flow-2': [{ x: 1, y: 2 }, { x: 3, y: 4 }] } },
      hostEnvelopeExtension: { imported: true },
    }
    await wrapper.findAll('button').find(button => button.text() === '导入 / 转换 JSON')!.trigger('click')
    await wrapper.find('textarea[aria-label="业务 JSON"]').setValue(JSON.stringify(imported))
    await wrapper.findAll('button').find(button => button.text() === '导入到画布')!.trigger('click')
    await wrapper.vm.$nextTick()
    let exported = (wrapper.vm as unknown as { exportDesign: () => Record<string, any> }).exportDesign()
    expect(exported).toMatchObject({ hostEnvelopeExtension: { imported: true }, editor: { theme: { accent: '#654321' }, hostPanel: { visible: false } }, model: { processId: 'full-envelope-import', envelopeData: 'business' } })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => Record<string, any> }).exportDesign()
    expect(exported.model.processId).toBe(validModel.processId)
    expect(exported.hostEnvelopeExtension).toEqual({ imported: true })
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => Record<string, any> }).exportDesign()
    expect(exported.model.processId).toBe('full-envelope-import')
    expect(exported).toMatchObject({ hostEnvelopeExtension: { imported: true }, editor: { viewport: { x: 16, y: 24, zoom: 1.3 }, theme: { accent: '#654321' }, hostPanel: { visible: false } } })
  })

  it('undoes and redoes workflow templates as one edit', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('button').find(button => button.text() === '流程模板')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '使用模板')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.processId).toBe('serial-approval')
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.processId).toBe(validModel.processId)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.processId).toBe('serial-approval')
  })

  it('records flow endpoint, branch, and condition edits with their flow data', async () => {
    const model = { ...validModel, flows: validModel.flows.map((flow, index) => index === 0 ? { ...flow, conditionExpression: 'amount > 0' } : flow) }
    const route = [{ x: 20, y: 30 }, { x: 20, y: 80 }]
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: { format: 'workflow-designer', version: 1, model, editor: { routes: { 'flow-0': route } } } } })
    await wrapper.findAll('.vue-flow__edge')[0].trigger('click')
    await wrapper.find('.wfd-inspector select').setValue('pass')
    await wrapper.findAll('.wfd-inspector select')[2].setValue('minister')
    await wrapper.find('.wfd-inspector textarea').setValue('amount > 100')
    await wrapper.find('.wfd-inspector textarea').trigger('change')
    let exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ source: 'start', target: 'minister', branch: 'pass', conditionExpression: 'amount > 100' })
    expect((wrapper.vm as unknown as { exportDesign: () => { editor: { routes?: Record<string, unknown> } } }).exportDesign().editor.routes?.['flow-0']).toBeUndefined()
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ source: 'start', target: 'minister', branch: 'pass', conditionExpression: 'amount > 0' })
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ source: 'start', target: 'apply', branch: 'pass', conditionExpression: 'amount > 0' })
    expect((wrapper.vm as unknown as { exportDesign: () => { editor: { routes?: Record<string, unknown> } } }).exportDesign().editor.routes?.['flow-0']).toEqual(route)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ source: 'start', target: 'apply', conditionExpression: 'amount > 0' })
    expect(exported.flows[0]).not.toHaveProperty('branch')
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ branch: 'pass', conditionExpression: 'amount > 0' })
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0].target).toBe('minister')
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.flows[0]).toMatchObject({ branch: 'pass', conditionExpression: 'amount > 100' })
  })

  it('commits a text field as one undoable edit instead of recording each keystroke', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const field = wrapper.find('.wfd-inspector input:not([disabled])')
    await field.setValue('新的审批名称')
    await field.trigger('change')

    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ model: { nodes: expect.arrayContaining([expect.objectContaining({ name: '立项审批单' })]) } })

    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ model: { nodes: expect.arrayContaining([expect.objectContaining({ name: '新的审批名称' })]) } })
  })

  it('leaves Ctrl+Z inside text inputs to the browser instead of undoing the workflow', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')
    const field = wrapper.find('.wfd-inspector input:not([disabled])')
    await field.setValue('新的审批名称')
    await field.trigger('change')
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    field.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.find('button[aria-label="重做"]').element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.find('button[aria-label="重做"]').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect((wrapper.find('button[aria-label="重做"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('sends only a valid WorkflowModel v1 to the host compile callback and shows its result', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    const button = wrapper.findAll('button').find(item => item.text() === '生成 BPMN XML')!
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    await button.trigger('click')
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(1))
    expect(compile).toHaveBeenCalledWith(validModel)
    expect(wrapper.emitted('compile-success')).toHaveLength(1)
    expect(wrapper.text()).toContain('编译完成')
  })

  it('does not rewrite routed edges or publish a model during a drag frame', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string }>; edges: Array<{ id: string; data: Record<string, unknown> }> }
    vm.edges = vm.edges.map((edge, index) => ({ ...edge, data: { ...edge.data, routePoints: [{ x: 100 + index, y: 180 }] } }))
    await wrapper.vm.$nextTick()
    const emittedBeforeDrag = wrapper.emitted('update:modelValue')?.length ?? 0

    await flow.vm.$emit('node-drag-start', { node: { id: 'minister' }, nodes: [] })
    vm.nodes = vm.nodes.map(node => node.id === 'minister' ? { ...node, position: { x: 411, y: 233 } } : node)
    await wrapper.vm.$nextTick()

    expect(vm.edges.every(edge => 'routePoints' in edge.data)).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(emittedBeforeDrag)
  })

  it('keeps persisted route points stable while Vue Flow reports live node drag positions', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string; data: Record<string, any> }>; flow: { getNodes: { value: Array<{ id: string; position: { x: number; y: number }; dimensions: { width: number; height: number } }> } } }
    const moved = vm.nodes.find(node => node.id === 'gwMinister')!
    const direct = vm.edges.find(edge => edge.source === 'apply' && edge.target === 'minister')!
    const directIndex = vm.edges.findIndex(edge => edge.id === direct.id)
    const reject = vm.edges.find(edge => edge.data.branch === 'reject' && edge.source === 'gwMinister')!
    const rejectIndex = vm.edges.findIndex(edge => edge.id === reject.id)
    vm.edges[rejectIndex] = { ...reject, data: { ...reject.data, routePoints: [{ x: 435, y: 430 }, { x: 435, y: 454 }, { x: 650, y: 454 }, { x: 650, y: 100 }, { x: 275, y: 100 }, { x: 275, y: 145 }] } }
    vm.edges[directIndex] = { ...direct, data: { ...direct.data, routePoints: [{ x: 275, y: 213 }, { x: 275, y: 237 }, { x: 435, y: 237 }, { x: 435, y: 285 }] } }
    const untouchedIndex = vm.edges.findIndex(edge => edge.source === 'start')
    const untouched = vm.edges[untouchedIndex]
    const directRoute = structuredClone(vm.edges[directIndex].data.routePoints)
    const rejectRoute = structuredClone(vm.edges[rejectIndex].data.routePoints)
    vm.flow.getNodes.value = vm.nodes.map(node => ({ ...node, position: node.id === moved.id ? { x: 460, y: 500 } : node.position, dimensions: { width: 190, height: 68 } }))
    await flow.vm.$emit('node-drag-start', { node: moved, nodes: [moved] })
    await flow.vm.$emit('node-drag', { node: { ...moved, position: { x: 460, y: 500 } }, nodes: [{ ...moved, position: { x: 460, y: 500 } }] })
    await wrapper.vm.$nextTick()
    expect(vm.edges[rejectIndex].data.routePoints).toEqual(rejectRoute)
    expect(vm.edges[directIndex].data.routePoints).toEqual(directRoute)
    expect(vm.edges[untouchedIndex]).toBe(untouched)
  })

  it('keeps orthogonal routes continuous when Vue Flow reports moving handle positions', () => {
    const route = [{ x: 20, y: 30 }, { x: 20, y: 54 }, { x: 180, y: 54 }, { x: 180, y: 200 }]
    const next = followRouteEndpoints(route, { x: 36, y: 44 }, { x: 180, y: 230 })
    expect(next).toEqual([{ x: 36, y: 44 }, { x: 36, y: 54 }, { x: 180, y: 54 }, { x: 180, y: 230 }])
    expect(route).toEqual([{ x: 20, y: 30 }, { x: 20, y: 54 }, { x: 180, y: 54 }, { x: 180, y: 200 }])
  })

  it('uses the live handles for straight ELK routes with fewer than three points', () => {
    expect(followRouteEndpoints([{ x: 20, y: 30 }, { x: 20, y: 200 }], { x: 50, y: 80 }, { x: 90, y: 250 }))
      .toEqual([{ x: 50, y: 80 }, { x: 50, y: 250 }, { x: 90, y: 250 }])
  })

  it('keeps a two-point vertical ELK route orthogonal when only the target moves horizontally', () => {
    expect(followRouteEndpoints([{ x: 100, y: 20 }, { x: 100, y: 120 }], { x: 100, y: 20 }, { x: 140, y: 120 }))
      .toEqual([{ x: 100, y: 20 }, { x: 100, y: 120 }, { x: 140, y: 120 }])
  })

  it('keeps the orthogonal segment connected to the live handle when endpoint drift changes route direction', () => {
    const route = [{ x: 108, y: 390.5 }, { x: 108, y: 417.5 }]
    expect(followRouteEndpoints(route, { x: 108, y: 390.5 }, { x: 108, y: 516.5 }))
      .toEqual([{ x: 108, y: 390.5 }, { x: 108, y: 516.5 }])
  })

  it('commits a node drag once on drag stop and keeps the final coordinates undoable', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }> }
    await flow.vm.$emit('node-drag-start', { node: { id: 'minister' }, nodes: [] })
    vm.nodes = vm.nodes.map(node => node.id === 'minister' ? { ...node, position: { x: 411, y: 233 } } : node)
    await wrapper.vm.$nextTick()
    await flow.vm.$emit('node-drag-stop', { node: { id: 'minister' }, nodes: [] })
    await wrapper.vm.$nextTick()
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'minister')).toMatchObject(validModel.nodes.find(node => node.id === 'minister')!)
  })

  it('restores route points with their flow when undoing and redoing a node drag', async () => {
    const route = [{ x: 275, y: 213 }, { x: 275, y: 237 }, { x: 435, y: 237 }, { x: 435, y: 285 }]
    const document = { format: 'workflow-designer', version: 1, model: validModel, editor: { routes: { 'flow-1': route } } }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: document } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }> }
    await flow.vm.$emit('node-drag-start', { node: { id: 'minister' }, nodes: [] })
    vm.nodes = vm.nodes.map(node => node.id === 'minister' ? { ...node, position: { x: 411, y: 233 } } : node)
    await wrapper.vm.$nextTick()
    await flow.vm.$emit('node-drag-stop', { node: { id: 'minister' }, nodes: [] })
    await wrapper.vm.$nextTick()
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    let exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel; editor: { routes?: Record<string, unknown> } } }).exportDesign()
    expect(exported.model.nodes.find(node => node.id === 'minister')).toMatchObject(validModel.nodes.find(node => node.id === 'minister')!)
    expect(exported.editor.routes?.['flow-1']).toEqual(route)
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    exported = (wrapper.vm as unknown as { exportDesign: () => typeof exported }).exportDesign()
    expect(exported.model.nodes.find(node => node.id === 'minister')).toMatchObject({ x: 411, y: 233 })
    expect(exported.editor.routes?.['flow-1']).toEqual(route)
  })

  it('rebuilds right-side reject routes from the final node coordinates after dragging', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string; data: Record<string, any> }> }
    const reject = vm.edges.find(edge => edge.data.branch === 'reject')!
    const sourceBefore = vm.nodes.find(node => node.id === reject.source)!.position

    await flow.vm.$emit('node-drag-start', { node: { id: reject.source }, nodes: [] })
    vm.nodes = vm.nodes.map(node => node.id === reject.source ? { ...node, position: { x: 480, y: 520 } } : node)
    await wrapper.vm.$nextTick()
    await flow.vm.$emit('node-drag-stop', { node: { id: reject.source }, nodes: [] })
    await wrapper.vm.$nextTick()

    const route = vm.edges.find(edge => edge.id === reject.id)!.data.routePoints as Array<{ x: number; y: number }>
    expect(route).toHaveLength(6)
    expect(route[0]).toMatchObject({ x: 480 + 190 / 2, y: 520 + 68 })
    expect(route.at(-1)).toMatchObject({ x: vm.nodes.find(node => node.id === reject.target)!.position.x + 190 / 2 })
    expect(route[2].x).toBeGreaterThan(Math.max(...vm.nodes.map(node => node.position.x + 190)))
    expect(route[0]).not.toMatchObject({ x: sourceBefore.x + 190 / 2 })
  })

  it('waits for real Vue Flow node measurements before applying the host initial layout', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { autoLayoutOnInit: true } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    expect(flow.props('fitViewOnInit')).toBe(false)
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }> }
    const initialPosition = vm.nodes[0].position
    await flow.vm.$emit('init')
    expect(vm.nodes[0].position).toEqual(initialPosition)
    const measured = vm.nodes.map(node => ({
      ...node,
      dimensions: { width: 190, height: 76 },
      handleBounds: { source: [], target: [] },
    }))
    const flowState = (wrapper.vm as unknown as { flow: { getNodes: { value: unknown[] } } }).flow
    flowState.getNodes.value = measured
    await flow.vm.$emit('nodes-initialized')
    await vi.waitFor(() => expect(vm.nodes.some((node, index) => node.position.x !== initialPosition.x && index === 0)).toBe(true))
    const fitView = (wrapper.vm as unknown as { flow: { fitView: ReturnType<typeof vi.fn> } }).flow.fitView
    await vi.waitFor(() => expect(fitView).toHaveBeenCalledWith({ padding: 0.12, duration: 260 }))
    expect((wrapper.find('button[aria-label="撤销"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('records manual automatic layout as one undoable graph edit', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const before = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    await wrapper.findAll('button').find(button => button.text() === '自动布局')!.trigger('click')
    await vi.waitFor(() => expect((wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }> }).nodes.find(node => node.id === 'end')?.position.y).toBeGreaterThan(600))
    const nodes = (wrapper.vm as unknown as { nodes: Array<{ id: string; position: { x: number; y: number } }> }).nodes
    expect(nodes.find(node => node.id === 'start')!.position.x).toBe(nodes.find(node => node.id === 'apply')!.position.x)
    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.map(node => [node.id, node.x, node.y]))
      .toEqual(before.nodes.map(node => [node.id, node.x, node.y]))
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'end')!.y).toBeGreaterThan(600)
  })

  it('offers reusable JSON workflow templates and replaces the canvas through the template picker', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('button').find(button => button.text() === '流程模板')!.trigger('click')
    expect(wrapper.find('[role="dialog"][aria-labelledby="wfd-template-title"]').exists()).toBe(true)
    expect(wrapper.findAll('.wfd-template-option')).toHaveLength(workflowTemplates.length)
    await wrapper.findAll('.wfd-template-option input').find(input => (input.element as HTMLInputElement).value === 'vote-approval')!.setValue(true)
    await wrapper.findAll('button').find(button => button.text() === '使用模板')!.trigger('click')
    await wrapper.vm.$nextTick()
    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign()
    expect(exported.model.processId).toBe('vote-approval')
    expect(exported.model.nodes.find(node => node.type === 'countersign')).toMatchObject({ approveMode: 'VOTE', passRate: '0.7', sequential: true })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ model: { processId: 'vote-approval' } })
  })

  it('includes the deployed message wait and one-minute timer templates with their runtime settings', () => {
    const messageWait = workflowTemplates.find(item => item.id === 'msg-wait')!
    expect(messageWait.sourceProcessDefinitionId).toBe('msg-wait:1:31189f2a-d9ae-11f1-b314-00155d21c8ae')
    expect(messageWait.model.nodes.filter(node => node.type === 'approval')).toHaveLength(2)
    expect(messageWait.model.nodes.find(node => node.type === 'receive')).toMatchObject({ type: 'receive', messageName: 'msg_wait_name' })
    expect(messageWait.model.flows).toHaveLength(4)

    const timer = workflowTemplates.find(item => item.id === 'timer01')!
    expect(timer.sourceProcessDefinitionId).toBe('timer01:1:32ead321-d9a4-11f1-b314-00155d21c8ae')
    expect(timer.model.nodes.filter(node => node.type === 'approval')).toHaveLength(2)
    expect(timer.model.nodes.find(node => node.type === 'timer')).toMatchObject({ type: 'timer', timerType: 'duration', timerValue: 'PT1M' })
    expect(timer.model.flows).toHaveLength(4)
  })

  it('shows the deployed definition ids and applies the message and timer templates', async () => {
    for (const templateId of ['msg-wait', 'timer01']) {
      const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
      await wrapper.findAll('button').find(button => button.text() === '流程模板')!.trigger('click')
      await wrapper.findAll('.wfd-template-option input').find(input => (input.element as HTMLInputElement).value === templateId)!.setValue(true)
      const template = workflowTemplates.find(item => item.id === templateId)!
      expect(wrapper.find('.wfd-template-preview').text()).toContain(template.sourceProcessDefinitionId)
      await wrapper.findAll('button').find(button => button.text() === '使用模板')!.trigger('click')
      await wrapper.vm.$nextTick()
      const model = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
      expect(model.processId).toBe(templateId)
      if (templateId === 'msg-wait') {
        expect(model.nodes.find(node => node.type === 'receive')).toMatchObject({ messageName: 'msg_wait_name' })
      } else {
        expect(model.nodes.find(node => node.type === 'timer')).toMatchObject({ timerType: 'duration', timerValue: 'PT1M' })
      }
      const nodeIds = new Set(model.nodes.map(node => node.id))
      expect(model.flows.every(flow => nodeIds.has(flow.source) && nodeIds.has(flow.target))).toBe(true)
      wrapper.unmount()
    }
  })

  it('can independently collapse and expand the node library and inspector', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const library = wrapper.find('aside[aria-label="节点库"]')
    const inspector = wrapper.find('aside[aria-label="属性面板"]')
    await library.find('button[aria-label="折叠节点库"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.wfd-workspace').classes()).toContain('wfd-library-collapsed')
    expect(library.find('button[aria-label="展开节点库"]').exists()).toBe(true)
    await inspector.find('button[aria-label="折叠属性面板"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.wfd-workspace').classes()).toContain('wfd-properties-collapsed')
    expect(inspector.find('button[aria-label="展开属性面板"]').exists()).toBe(true)
  })

  it('offers React-compatible approval mode selection and reminders on a countersign node', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[4].trigger('click')
    expect(wrapper.text()).toContain('会签 · 所有人通过（ALL）')
    expect(wrapper.text()).toContain('或签 · 任一人通过（ANY）')
    expect(wrapper.text()).toContain('按比例通过（VOTE）')
    expect(wrapper.find('details.wfd-advanced').attributes('open')).toBeDefined()
    await wrapper.findAll('select').find(select => select.element.value === 'disabled')!.setValue('enabled')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('提醒时长')
    expect(wrapper.text()).toContain('提醒名称')
    expect(wrapper.find('select[aria-label="超时处理方式"]').element.value).toBe('notify')
  })

  it('configures timeout action and return target in the reminder business JSON', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.findAll('.vue-flow__node')[2].trigger('click')
    await wrapper.findAll('select').find(select => select.element.value === 'disabled')!.setValue('enabled')
    await wrapper.find('select[aria-label="超时处理方式"]').setValue('return')
    const target = wrapper.find('select[aria-label="超时退回目标"]')
    expect(Array.from((target.element as HTMLSelectElement).options).map(option => option.value)).toContain('apply')
    await target.setValue('apply')

    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.nodes.find(node => node.id === 'minister')?.reminder).toMatchObject({ action: 'return', target: 'apply' })
    expect(exported.nodes.find(node => node.id === 'minister')?.reminder).not.toHaveProperty('terminate')
  })

  it('blocks invalid reminder action and target combinations', () => {
    const reminderModel = { ...validModel, nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, reminder: { action: 'return' } } : node) } as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: reminderModel, compile: vi.fn() } })
    expect(wrapper.findAll('button').find(button => button.text().includes('生成 BPMN XML'))!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('超时退回需要同层目标')
  })

  it('preserves existing timeout reminder JSON fields when editing another reminder field', async () => {
    const reminderModel = { ...validModel, nodes: validModel.nodes.map(node => node.id === 'minister' ? { ...node, reminder: { action: 'return', target: 'apply', duration: 'PT10M', name: '超时退回' } } : node) } as WorkflowModel
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: reminderModel } })
    await wrapper.findAll('.vue-flow__node')[2].trigger('click')
    const duration = wrapper.find('.wfd-inspector input[placeholder^="ISO-8601"]')
    await duration.setValue('PT20M')
    await duration.trigger('change')
    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    expect(exported.nodes.find(node => node.id === 'minister')?.reminder).toMatchObject({ action: 'return', target: 'apply', duration: 'PT20M', name: '超时退回' })
  })

  it('routes approval-specific edits through model publication, history, and compile', async () => {
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    await wrapper.findAll('.vue-flow__node')[1]!.trigger('click')
    const form = wrapper.get('.wfd-inspector input[placeholder="例如：project-form"]')
    await form.setValue('purchase-request')
    await form.trigger('change')

    const getForm = () => (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } })
      .exportDesign().model.nodes.find(node => node.id === 'apply')?.form
    expect(getForm()).toBe('purchase-request')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      model: { nodes: expect.arrayContaining([expect.objectContaining({ id: 'apply', form: 'purchase-request' })]) },
    })

    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect(getForm()).toBeUndefined()
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect(getForm()).toBe('purchase-request')

    await (wrapper.vm as unknown as { compile: () => Promise<unknown> }).compile()
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce())
    expect((compile.mock.calls[0]![0] as WorkflowModel).nodes.find(node => node.id === 'apply')?.form).toBe('purchase-request')
  })

  it('configures service countersign and passes its business fields to the compile callback', async () => {
    const serviceModel = {
      ...validModel,
      nodes: validModel.nodes.map(node => node.id === 'apply'
        ? { ...node, type: 'service', serviceName: 'legacy-stock-check', serviceUrl: 'https://example.com/stock' }
        : node),
    } as WorkflowModel
    const compile = vi.fn().mockResolvedValue({ bpmnXml: '<definitions />' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: serviceModel, compile } })
    await wrapper.findAll('.vue-flow__node')[1].trigger('click')

    const enabled = wrapper.find('select[aria-label="服务会签"]')
    expect((enabled.element as HTMLSelectElement).value).toBe('disabled')
    await enabled.setValue('enabled')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('select[aria-label="服务会签方式"]').element.value).toBe('ALL')
    expect(wrapper.find('select[aria-label="服务执行顺序"]').element.value).toBe('false')

    await wrapper.find('select[aria-label="服务会签方式"]').setValue('VOTE')
    const passRate = wrapper.find('.wfd-inspector input[inputmode="decimal"]')
    await passRate.setValue('0.7')
    await passRate.trigger('change')

    const exported = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model
    const configured = exported.nodes.find(node => node.id === 'apply')!
    expect(configured).toMatchObject({
      type: 'service', serviceName: 'legacy-stock-check', serviceUrl: 'https://example.com/stock',
      countersign: true, approveMode: 'VOTE', sequential: false, passRate: '0.7',
    })

    await wrapper.findAll('button').find(button => button.text() === '生成 BPMN XML')!.trigger('click')
    await vi.waitFor(() => expect(compile).toHaveBeenCalledTimes(1))
    expect((compile.mock.calls[0][0] as WorkflowModel).nodes.find(node => node.id === 'apply')).toMatchObject({
      type: 'service', countersign: true, approveMode: 'VOTE', sequential: false, passRate: '0.7',
    })

    await wrapper.find('select[aria-label="服务会签"]').setValue('disabled')
    const disabled = (wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')!
    expect(disabled).toMatchObject({ serviceName: 'legacy-stock-check', serviceUrl: 'https://example.com/stock', countersign: false })
    expect(disabled).not.toHaveProperty('approveMode')
    expect(disabled).not.toHaveProperty('sequential')
    expect(disabled).not.toHaveProperty('passRate')
    await wrapper.find('select[aria-label="服务会签"]').setValue('enabled')
    await wrapper.find('select[aria-label="服务会签方式"]').setValue('VOTE')
    await wrapper.find('.wfd-inspector input[inputmode="decimal"]').setValue('0.7')
    await wrapper.find('.wfd-inspector input[inputmode="decimal"]').trigger('change')

    await wrapper.find('button[aria-label="撤销"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')?.passRate).toBeUndefined()
    await wrapper.find('button[aria-label="重做"]').trigger('click')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.nodes.find(node => node.id === 'apply')?.passRate).toBe('0.7')
  })

  it('shows the service multi-call mode on the service node card', () => {
    const node = {
      id: 'inventory', type: 'workflowNode', selected: false, connectable: true, draggable: true, dragging: false,
      position: { x: 0, y: 0 }, dimensions: { width: 190, height: 68 }, resizing: false, zIndex: 1, events: {},
      data: { kind: 'service', name: '库存检查', custom: {}, original: { id: 'inventory', type: 'service', name: '库存检查', x: 0, y: 0, countersign: true, approveMode: 'ANY' } },
    }
    const wrapper = mount(WorkflowNode, { props: node as never })
    expect(wrapper.text()).toContain('ANY 或签')
  })

  it('keeps future envelopes read-only and exposes the original through exportDesign', async () => {
    const future = { format: 'workflow-designer', version: 5, model: validModel, editor: { future: ['preserve'] } }
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: future } })
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as unknown as { exportDesign: () => unknown }).exportDesign()).toEqual(future)
    expect((wrapper.findAll('button').find(button => button.text() === '生成 BPMN XML')!.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('只读方式展示')
  })

  it('exposes the complete design envelope through exportDesign', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as unknown as { exportDesign: () => unknown }).exportDesign()).toMatchObject({
      format: 'workflow-designer', version: 1, model: validModel, editor: expect.any(Object),
    })
  })

  it('persists pure viewport pans in the editor envelope', async () => {
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel } })
    const flow = wrapper.findComponent({ name: 'VueFlowTestHost' })
    await flow.vm.$emit('move-end', { flowTransform: { x: 42, y: -18, zoom: 1 } })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ editor: { viewport: { x: 42, y: -18, zoom: 1 } } })
  })

  it('disables compilation while unknown business fields remain in the emitted model', async () => {
    const model = { ...validModel, compilerHint: { future: true } }
    const compile = vi.fn()
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: model, compile } })
    expect((wrapper.findAll('button').find(button => button.text() === '生成 BPMN XML')!.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('禁止编译')
    expect((wrapper.vm as unknown as { exportDesign: () => { model: WorkflowModel } }).exportDesign().model.compilerHint).toEqual({ future: true })
    expect(compile).not.toHaveBeenCalled()
  })

  it('imports pasted business JSON and invokes the host compiler with its v1 model', async () => {
    const compile = vi.fn().mockResolvedValue({ code: 'OK', data: { bpmnXml: '<definitions />' } })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile } })
    await wrapper.findAll('button').find(button => button.text() === '导入 / 转换 JSON')!.trigger('click')
    await wrapper.find('textarea[aria-label="业务 JSON"]').setValue(JSON.stringify(validModel))
    await wrapper.findAll('button').find(button => button.text() === '转换为 BPMN XML')!.trigger('click')
    await vi.waitFor(() => expect(compile).toHaveBeenCalledWith(validModel))
    expect(wrapper.text()).toContain('BPMN XML')
  })

  it('deploys only after explicit confirmation through the host callback', async () => {
    const deploy = vi.fn().mockResolvedValue({ taskKey: validModel.processId, version: 2, deploymentId: 'deployment-1', processDefinitionId: 'project-approval:2' })
    const wrapper = mount(WorkflowDesigner, { props: { modelValue: validModel, compile: vi.fn(), deploy } })
    await wrapper.findAll('button').find(button => button.text() === '发布任务模板')!.trigger('click')
    expect(deploy).not.toHaveBeenCalled()
    await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click')
    await vi.waitFor(() => expect(deploy).toHaveBeenCalledWith(validModel))
    expect(wrapper.text()).toContain('任务模板发布完成')
    expect(wrapper.text()).toContain('deployment-1')
  })
})
