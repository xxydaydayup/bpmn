import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import WorkflowEmbedView from '@/views/WorkflowEmbedView.vue'
import type { BusinessWorkflowGateway, TaskTemplateDetail } from '@/api/workflow/types'
import './preview-setup'

const { loadInstance } = vi.hoisted(() => ({ loadInstance: vi.fn() }))
vi.mock('@/api/workflow/previewGateway', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/workflow/previewGateway')>(),
  workflowPreviewGateway: { load: loadInstance },
}))
const wrappers: ReturnType<typeof mount>[] = []
const model = {
  processId: 'leave', processName: '请假流程',
  nodes: [{ id: 'start', type: 'start', name: '提交', x: 0, y: 0 }, { id: 'review', type: 'approval', name: '部门审核', x: 0, y: 150 }, { id: 'end', type: 'end', name: '结束', x: 0, y: 300 }],
  flows: [{ id: 'f1', source: 'start', target: 'review' }, { id: 'f2', source: 'review', target: 'end' }],
}
const detail = (key = 'leave'): TaskTemplateDetail => ({
  id: 1, tenantId: 'tenant-a', taskKey: key, taskName: '请假审批', version: 3,
  deploymentId: 'deployment', processDefinitionKey: key, processDefinitionId: key + ':3:exact',
  startable: true, suspended: false, displayJson: model,
})
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }

async function open(url: string, getTemplate = vi.fn().mockResolvedValue(detail())) {
  const gateway: Pick<BusinessWorkflowGateway, 'getTemplate'> = { getTemplate }
  const router = createRouter({ history: createMemoryHistory('/workflow/'), routes: [{ path: '/workflow-preview', component: WorkflowEmbedView, props: { gateway } }] })
  await router.push(url)
  await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] }, attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router, getTemplate }
}

afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); vi.clearAllMocks(); vi.unstubAllEnvs() })

it('renders the template snapshot with real nodes and flows through a standalone subpath host', async () => {
  const input = detail()
  const before = JSON.stringify(input)
  const { wrapper, router, getTemplate } = await open('/workflow-preview?templateKey=leave', vi.fn().mockResolvedValue(input))
  await expect.poll(() => wrapper.findAll('.vue-flow__edge-path').length).toBe(2)
  expect(wrapper.findAll('[data-node-id]')).toHaveLength(3)
  expect(wrapper.text()).toContain('部门审核')
  expect(wrapper.text()).toContain('leave:3:exact')
  expect(wrapper.text()).toContain('请假审批')
  expect(wrapper.find('.sidebar').exists()).toBe(false)
  expect(router.resolve('/workflow-preview?templateKey=leave').href).toBe('/workflow/workflow-preview?templateKey=leave')
  expect(getTemplate).toHaveBeenCalledWith('leave', expect.any(AbortSignal))
  expect(JSON.stringify(input)).toBe(before)
})

it.each([
  '/workflow-preview',
  '/workflow-preview?templateKey=',
  '/workflow-preview?templateKey=a&templateKey=b',
  '/workflow-preview?templateKey=a&processInstanceId=b',
  '/workflow-preview?processInstanceId=a&processInstanceId=b',
  '/workflow-preview?templateKey=a&token=secret',
  '/workflow-preview?templateKey=a&apiUrl=https://elsewhere.example',
  '/workflow-preview?templateKey=a&origin=https://elsewhere.example',
])('rejects ambiguous or unsupported addresses without data requests: %s', async url => {
  const { wrapper, getTemplate } = await open(url)
  expect(wrapper.text()).toContain('预览地址无效')
  expect(getTemplate).not.toHaveBeenCalled()
  expect(loadInstance).not.toHaveBeenCalled()
})

it.each([[401, '登录已失效'], [403, '无权查看'], [404, '模板不存在'], [500, '模板加载失败']])('shows HTTP %s and recovers on retry without leaking raw server errors', async (status, text) => {
  const getTemplate = vi.fn().mockRejectedValueOnce(Object.assign(new Error('private stack'), { httpStatus: status })).mockResolvedValue(detail())
  const { wrapper } = await open('/workflow-preview?templateKey=leave', getTemplate)
  expect(wrapper.text()).toContain(text)
  expect(wrapper.text()).not.toContain('private stack')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('[data-node-id]')).toHaveLength(3)
})

it('clears old target content while loading and ignores a late response after query changes', async () => {
  const slow = deferred<TaskTemplateDetail>()
  const next = deferred<TaskTemplateDetail>()
  const getTemplate = vi.fn().mockResolvedValueOnce(detail()).mockImplementationOnce(() => slow.promise).mockImplementationOnce(() => next.promise)
  const { wrapper, router } = await open('/workflow-preview?templateKey=leave', getTemplate)
  expect(wrapper.text()).toContain('leave:3:exact')
  await router.push('/workflow-preview?templateKey=slow')
  expect(wrapper.text()).toContain('正在加载模板')
  expect(wrapper.text()).not.toContain('leave:3:exact')
  await router.push('/workflow-preview?templateKey=next')
  next.resolve({ ...detail('next'), taskName: '新的模板' })
  await flushPromises()
  slow.resolve({ ...detail('slow'), taskName: '过期模板' })
  await flushPromises()
  expect(wrapper.text()).toContain('新的模板')
  expect(wrapper.text()).not.toContain('过期模板')
  expect(getTemplate.mock.calls[1]![1].aborted).toBe(true)
})

it('shows missing business model and clears template data when switching to an instance', async () => {
  loadInstance.mockResolvedValue({ instance: { id: 'old-instance', processDefinitionId: 'leave:1:old', businessKey: 'business', state: 'COMPLETED', ended: true }, model, metadata: { name: '历史流程', key: 'leave', version: 1, processDefinitionId: 'leave:1:old' }, nodeStates: { review: 'completed' } })
  const { wrapper, router } = await open('/workflow-preview?templateKey=leave', vi.fn().mockResolvedValue({ ...detail(), displayJson: null }))
  expect(wrapper.text()).toContain('缺少业务工作流模型')
  await router.push('/workflow-preview?processInstanceId=old-instance')
  await flushPromises()
  await expect.poll(() => wrapper.findAll('[data-node-id]').length).toBe(3)
  expect(wrapper.text()).toContain('leave:1:old')
  expect(wrapper.text()).not.toContain('leave:3:exact')
  expect(wrapper.get('[data-node-id="review"]').attributes('data-state')).toBe('completed')
  expect(wrapper.text()).not.toContain('当前活动')
  expect(loadInstance).toHaveBeenCalledWith('old-instance', 'auto', expect.any(AbortSignal))
})

it('blocks cross-origin API configuration before any target is requested', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://other.example/api')
  const { wrapper, getTemplate } = await open('/workflow-preview?templateKey=leave')
  expect(wrapper.text()).toContain('须配置为同源地址')
  expect(getTemplate).not.toHaveBeenCalled()
})
