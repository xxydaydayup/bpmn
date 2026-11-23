import './preview-setup'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElLoading } from 'element-plus'
import CamundaConsoleView from '@/views/CamundaConsoleView.vue'

const api = vi.hoisted(() => ({
  load: vi.fn(), listHistoricProcessInstances: vi.fn(), listProcessInstances: vi.fn(),
  getActivityInstance: vi.fn(), getProcessInstanceVariables: vi.fn(), getDefinitionXml: vi.fn(),
}))
vi.mock('@/api/workflow/previewGateway', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/workflow/previewGateway')>(),
  workflowPreviewGateway: { load: api.load },
}))
vi.mock('@/api/camunda/gateway', () => ({ camundaGateway: new Proxy(api, { get(target, key) {
  if (key in target) return target[key as keyof typeof target]
  if (key === 'getVersion') return async () => ({ version: '7.20.0' })
  if (String(key).startsWith('count')) return async () => 1
  return async () => []
} }) }))
const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.clearAllMocks() })
const model = { processId: 'leave', nodes: [
  { id: 'start', type: 'start', name: '开始', x: 50, y: 50 },
  { id: 'review', type: 'approval', name: '实例经理审批', x: 50, y: 200 },
  { id: 'end', type: 'end', name: '结束', x: 50, y: 350 },
], flows: [{ id: 'f1', source: 'start', target: 'review' }, { id: 'f2', source: 'review', target: 'end' }] }

it('opens history from its row action, renders state and version, and clears on close; running selection shares the renderer', async () => {
  api.listHistoricProcessInstances.mockResolvedValue([{ id: 'historic-1', businessKey: 'history-business', processDefinitionId: 'leave:1:old', endTime: '2026-11-23T00:00:00' }])
  api.listProcessInstances.mockResolvedValue([{ id: 'running-1', businessKey: 'running-business', definitionId: 'leave:1:old' }])
  api.getActivityInstance.mockResolvedValue({ id: 'tree', childActivityInstances: [] })
  api.getProcessInstanceVariables.mockResolvedValue({})
  api.getDefinitionXml.mockResolvedValue({ id: 'leave:1:old', bpmn20Xml: '<invalid />' })
  api.load.mockImplementation(async (id: string) => ({ instance: { id, processDefinitionId: 'leave:1:old', ended: id === 'historic-1', state: id === 'historic-1' ? 'COMPLETED' : 'ACTIVE' },
    model, metadata: { name: '请假历史版本', key: 'leave', version: 1, processDefinitionId: 'leave:1:old' },
    nodeStates: { review: id === 'historic-1' ? 'completed' : 'active' } }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: CamundaConsoleView }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { attachTo: document.body,
    global: { plugins: [router], directives: { loading: ElLoading.directive }, stubs: { teleport: true, transition: false } } })
  wrappers.push(wrapper)
  await flushPromises()
  const button = (label: string) => wrapper.findAll('button').find(item => item.text() === label)!
  await button('历史查询').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('history-business')
  await button('查看详情').trigger('click')
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  await expect.poll(() => wrapper.findAll('.vue-flow__edge').length).toBe(2)
  expect(wrapper.text()).toContain('实例经理审批')
  expect(wrapper.text()).toContain('leave:1:old')
  expect(wrapper.get('[data-node-id="review"]').attributes('data-state')).toBe('completed')
  expect(wrapper.find('[data-state="active"]').exists()).toBe(false)
  await button('关闭').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  await button('运行实例').trigger('click'); await flushPromises()
  const row = wrapper.findAll('tbody tr').find(item => item.text().includes('running-business'))!
  await row.trigger('click')
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  expect(wrapper.get('[data-node-id="review"]').attributes('data-state')).toBe('active')
  expect(wrapper.text()).not.toContain('历史实例详情')
  await button('任务查询').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
})
