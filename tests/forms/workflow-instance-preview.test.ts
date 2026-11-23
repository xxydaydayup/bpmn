import './preview-setup'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import type { AxiosRequestConfig } from 'axios'
import WorkflowInstancePreview from '@/components/workflow/WorkflowInstancePreview.vue'
import { createWorkflowPreviewGateway, type WorkflowInstanceSnapshot, type WorkflowPreviewGateway } from '@/api/workflow/previewGateway'

const model = { processId: 'leave', processName: '旧版流程', nodes: [
  { id: 'start', type: 'start', name: '开始', x: 50, y: 50 },
  { id: 'approve', type: 'approval', name: '旧版经理审核', x: 50, y: 200 },
  { id: 'end', type: 'end', name: '结束', x: 50, y: 350 },
], flows: [{ id: 'f1', source: 'start', target: 'approve' }, { id: 'f2', source: 'approve', target: 'end' }] }
const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
const httpFailure = (status: number) => Object.assign(new Error('HTTP ' + status), { response: { status } })

function scenario(options: { history?: boolean; missing?: boolean; mismatch?: boolean; denied?: boolean } = {}) {
  const calls: AxiosRequestConfig[] = []
  const send = async <T,>(config: AxiosRequestConfig): Promise<T> => {
    calls.push(config)
    const url = config.url!
    let response: unknown
    if (options.denied && url === '/camunda/process-instance/instance') throw httpFailure(403)
    if (url === '/camunda/process-instance/instance') {
      if (options.history) throw httpFailure(404)
      response = { id: 'instance', definitionId: 'leave:1:old', businessKey: 'business-1' }
    } else if (url === '/camunda/history/process-instance/instance') {
      response = { id: 'instance', processDefinitionId: 'leave:1:old', businessKey: 'business-1', endTime: '2026-11-23T00:00:00', state: 'COMPLETED' }
    } else if (url === '/camunda/process-instance/instance/activity-instances') {
      response = { id: 'instance:tree', processInstanceId: 'instance', processDefinitionId: 'leave:1:old', childActivityInstances: [{ id: 'runtime-id', activityId: 'approve' }, { id: 'unmatched', activityId: 'missing-node' }] }
    } else if (url === '/camunda/history/activity-instance') {
      response = [
        { id: 'h1', processInstanceId: 'instance', processDefinitionId: 'leave:1:old', activityId: 'start', endTime: '2026-11-23T00:00:00' },
        { id: 'h2', processInstanceId: 'instance', processDefinitionId: 'leave:1:old', activityId: 'approve', endTime: '2026-11-23T00:00:00', canceled: true },
        { id: 'h3', processInstanceId: 'instance', processDefinitionId: 'leave:1:old', activityId: 'end', endTime: null },
      ]
    } else if (url === '/camunda/process-definition/leave%3A1%3Aold') response = { id: 'leave:1:old', key: 'leave', name: '请假定义', version: 1 }
    else if (url === '/camunda/process-definition/leave%3A1%3Aold/xml') response = { id: 'leave:1:old', bpmn20Xml: '<invalid />' }
    else if (url === '/v1/template') response = { code: 'OK', data: [{ templateKey: 'leave', version: 2, processDefinitionId: 'leave:2:new', displayJson: { nodes: [{ id: 'new', type: 'start', name: '新版本不应显示' }] } }] }
    else if (url === '/v1/template/leave/history') response = { code: 'OK', data: options.missing ? [] : [{ version: 1, processDefinitionId: 'leave:1:old' }] }
    else if (url === '/v1/template/leave/history/1') response = { code: 'OK', data: { templateKey: 'leave', templateName: '请假旧版模板', version: 1, processDefinitionId: options.mismatch ? 'leave:2:new' : 'leave:1:old', displayJson: model } }
    else throw new Error('Unexpected request: ' + url)
    return response as T
  }
  return { calls, send, gateway: createWorkflowPreviewGateway(send) }
}
function render(gateway: WorkflowPreviewGateway, mode: 'auto' | 'historic' | 'running' = 'auto') {
  const wrapper = mount(WorkflowInstancePreview, { props: { instanceId: 'instance', mode, gateway }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}

it('renders the precise historical version and marks real activity IDs in the running host', async () => {
  const before = JSON.stringify(model)
  const { gateway, calls } = scenario()
  const wrapper = render(gateway)
  expect(wrapper.text()).toContain('正在加载流程实例')
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  await expect.poll(() => wrapper.findAll('.vue-flow__edge').length).toBe(2)
  expect(wrapper.text()).toContain('旧版经理审核')
  expect(wrapper.text()).toContain('请假旧版模板')
  expect(wrapper.text()).toContain('leave:1:old')
  expect(wrapper.text()).toContain('business-1')
  expect(wrapper.text()).not.toContain('新版本不应显示')
  expect(wrapper.get('[data-node-id="approve"]').attributes('data-state')).toBe('active')
  expect(wrapper.text()).toContain('missing-node')
  expect(wrapper.text()).toContain('无法与当前外层模型节点匹配')
  expect(calls.some(call => call.url === '/v1/template/leave/history/1')).toBe(true)
  expect(calls.every(call => call.method === 'GET')).toBe(true)
  expect(calls.some(call => /variables|bizForm/.test(call.url!))).toBe(false)
  expect(JSON.stringify(model)).toBe(before)
})

it('resolves ended instances and only displays explicitly completed or canceled history', async () => {
  const { gateway, calls } = scenario({ history: true })
  const wrapper = render(gateway)
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  expect(wrapper.text()).toContain('历史实例详情 · 已完成')
  expect(wrapper.get('[data-node-id="start"]').attributes('data-state')).toBe('completed')
  expect(wrapper.get('[data-node-id="approve"]').attributes('data-state')).toBe('canceled')
  expect(wrapper.get('[data-node-id="end"]').attributes('data-state')).toBeUndefined()
  expect(wrapper.find('[data-state="active"]').exists()).toBe(false)
  expect(calls.some(call => call.url?.endsWith('/activity-instances'))).toBe(false)
  expect(wrapper.text()).toContain('不推断顺序流')
})

it.each([{ missing: true }, { mismatch: true }])('exposes only the same definition XML fallback for unavailable business snapshots (%s)', async options => {
  const { gateway, calls } = scenario(options)
  const wrapper = render(gateway)
  await flushPromises()
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  expect(wrapper.text()).toContain('业务流程图不可用')
  expect(wrapper.text()).toContain('请假定义')
  expect(wrapper.find('.snapshot-metadata').text()).toContain('版本1')
  if ('mismatch' in options) expect(wrapper.text()).toContain('定义版本不一致')
  const fallback = wrapper.findAll('button').find(button => button.text() === '查看 BPMN XML 备用图')!
  expect(fallback.exists()).toBe(true)
  await fallback.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('BPMN XML 备用视图')
  expect(calls.some(call => call.url === '/camunda/process-definition/leave%3A1%3Aold/xml')).toBe(true)
  expect(calls.some(call => call.url === '/v1/template/leave')).toBe(false)
})

it('isolates late instance responses, aborts on switch, and clears the graph on close', async () => {
  const pending = deferred<WorkflowInstanceSnapshot>()
  let oldSignal: AbortSignal | undefined
  const snapshot = (id: string): WorkflowInstanceSnapshot => ({ instance: { id, processDefinitionId: id + ':1', ended: false, state: 'ACTIVE' }, model, metadata: { processDefinitionId: id + ':1' }, nodeStates: {} })
  const gateway: WorkflowPreviewGateway = { load: vi.fn((id: string, _mode, signal) => { if (id === 'instance') { oldSignal = signal; return pending.promise }; return Promise.resolve(snapshot(id)) }) }
  const wrapper = render(gateway)
  await wrapper.setProps({ instanceId: 'new-instance' })
  await expect.poll(() => wrapper.findAll('.vue-flow__node').length).toBe(3)
  expect(oldSignal?.aborted).toBe(true)
  pending.resolve(snapshot('instance')); await flushPromises()
  expect(wrapper.text()).toContain('new-instance:1')
  expect(wrapper.text()).not.toMatch(/流程实例 IDinstance/)
  await wrapper.setProps({ instanceId: '' })
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  expect(wrapper.text()).toContain('选择流程实例')
})

it.each([401, 403, 404])('shows a distinct HTTP %s state with retry and no graph', async status => {
  const gateway = { load: vi.fn().mockRejectedValue(httpFailure(status)) }
  const wrapper = render(gateway)
  await flushPromises()
  expect(wrapper.text()).toContain(status === 401 ? '尚未认证' : status === 403 ? '无权查看' : '不存在或已被清理')
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  await wrapper.findAll('button').find(button => button.text() === '重试')!.trigger('click'); await flushPromises()
  expect(gateway.load).toHaveBeenCalledTimes(2)
})

it('does not turn forbidden instance data into a historical lookup or XML fallback', async () => {
  const { gateway, calls } = scenario({ denied: true })
  await expect(gateway.load('instance', 'auto')).rejects.toMatchObject({ response: { status: 403 } })
  expect(calls).toHaveLength(1)
})

it('reports missing activity data without fabricating history and distinguishes an unavailable exact XML', async () => {
  const { send } = scenario({ missing: true })
  const gateway = createWorkflowPreviewGateway(async config => {
    if (config.url?.endsWith('/xml') || config.url?.endsWith('/activity-instances')) throw httpFailure(404)
    return send(config)
  })
  const wrapper = render(gateway)
  await flushPromises()
  expect(wrapper.text()).toContain('活动记录读取失败')
  expect(wrapper.text()).toContain('也没有可用的 BPMN XML')
  expect(wrapper.findAll('.vue-flow__node')).toHaveLength(0)
  expect(wrapper.findAll('button').some(button => button.text() === '查看 BPMN XML 备用图')).toBe(false)
})
