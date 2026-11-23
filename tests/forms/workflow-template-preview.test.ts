import './preview-setup'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElDialog, ElLoading } from 'element-plus'
import BusinessWorkflowView from '@/views/BusinessWorkflowView.vue'
import WorkflowSnapshotPreview from '@/components/workflow/WorkflowSnapshotPreview.vue'

const api = vi.hoisted(() => ({ listTemplates: vi.fn(), listTasks: vi.fn(), getTemplate: vi.fn() }))
vi.mock('@/api/workflow/sdkGateway', () => ({ businessWorkflowGateway: api }))
vi.mock('@/api/workflow', () => ({ businessWorkflowGateway: api, verifyBusinessEngineConsistency: vi.fn() }))

const model = { processId: 'leave', processName: '请假审批', nodes: [
  { id: 'start', type: 'start', name: '开始', x: 50, y: 50 },
  { id: 'approve', type: 'approval', name: '经理审核', x: 50, y: 200 },
  { id: 'end', type: 'end', name: '结束', x: 50, y: 350 },
], flows: [{ id: 'f1', source: 'start', target: 'approve' }, { id: 'f2', source: 'approve', target: 'end' }] }
const detail = { taskKey: 'leave', taskName: '请假模板', version: 2, processDefinitionId: 'leave:2:old', displayJson: model, bpmnXml: '<invalid />' }
const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.clearAllMocks() })

it('opens published template details through the workbench and draws the response snapshot', async () => {
  const original = JSON.stringify(model)
  api.listTemplates.mockResolvedValue([detail])
  api.listTasks.mockResolvedValue([])
  api.getTemplate.mockResolvedValue(detail)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: BusinessWorkflowView }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, {
    attachTo: document.body,
    global: { plugins: [router], directives: { loading: ElLoading.directive }, stubs: { teleport: true, transition: false } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '详情')!.trigger('click')
  await flushPromises()
  // Element Plus announces that the dialog's opening transition has finished.
  wrapper.findAllComponents(ElDialog).at(-1)!.vm.$emit('opened')
  await flushPromises()
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  await expect.poll(() => wrapper.findAll('.vue-flow__edge').length).toBe(2)
  expect(wrapper.text()).toContain('经理审核')
  expect(wrapper.text()).toContain('leave:2:old')
  expect(wrapper.text()).toContain('请假模板')
  expect(wrapper.find('.djs-container').exists()).toBe(false)
  expect(JSON.stringify(model)).toBe(original)
  await wrapper.findAll('button').find(button => button.text() === '关闭')!.trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
})

it('clears a previous graph on invalid or missing model and exposes an explicit XML fallback', async () => {
  const wrapper = mount(WorkflowSnapshotPreview, { props: { model, bpmnXml: '<invalid />' } })
  wrappers.push(wrapper)
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  await wrapper.setProps({ model: { nodes: [{ id: 'a', type: 'start' }, { id: 'a', type: 'end' }] } })
  await flushPromises()
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  expect(wrapper.text()).toContain('重复标识')
  expect(wrapper.findAll('button').some(button => button.text() === '查看 BPMN XML 备用图')).toBe(true)
  await wrapper.setProps({ model: null })
  expect(wrapper.text()).toContain('缺少业务工作流模型')
  expect(wrapper.find('.djs-container').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '查看 BPMN XML 备用图')!.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('BPMN XML 备用视图')
  expect(wrapper.text()).toContain('failed to parse')
  await wrapper.setProps({ model, bpmnXml: '' })
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  expect(wrapper.text()).not.toContain('BPMN XML 备用视图')
})
