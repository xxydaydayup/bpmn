import { beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/utils/request', () => ({ requestWithStatus: mock.send }))
import { workflowClient, workflowRequest } from '@/api/workflow/client'
import { defineWorkflow, approval, subProcess } from '@workflow/sdk/definition'

beforeEach(() => { mock.send.mockReset() })

it('keeps node business data in host compile requests and the published display model', async () => {
  const bizJson = "  中文 <&> \"review\"\nreview_bizJson: 保留  "
  const source = defineWorkflow({ key: 'business_data', name: '业务数据' },
    subProcess('outer', subProcess('inner', approval('review', { bizJson }), { bizJson: '内层容器' }), { bizJson: '外层容器' }))
  const model = source.toJSON()
  mock.send.mockImplementation(async ({ url, data }) => {
    if (url === '/v1/bpmn/json2xml') return { status: 200, body: { code: 'OK', data: { bpmnXml: '<definitions />' } } }
    expect(url).toBe('/v1/template')
    expect(JSON.parse((data as FormData).get('display-json') as string)).toEqual(model)
    return { status: 201, body: { code: 'OK', data: { templateKey: 'business_data', templateName: '业务数据', version: 1, deploymentId: 'deployment', processDefinitionId: 'definition', displayJson: model } } }
  })
  expect((await workflowClient.compile(model)).model).toEqual(model)
  await workflowClient.publish(source)
  const compiles = mock.send.mock.calls.filter(([request]) => request.url === '/v1/bpmn/json2xml')
  expect(compiles).toHaveLength(2)
  for (const [request] of compiles) expect(request.data).toEqual(model)
  expect(mock.send).toHaveBeenCalledTimes(3)
})

it('adapts relative paths without losing HTTP status, multipart identity, or cancellation', async () => {
  const signal = new AbortController().signal
  const form = new FormData()
  form.append('template-key', 'project')
  mock.send.mockResolvedValue({ status: 201, body: { code: 'OK', data: {} } })
  const result = await workflowRequest({ method: 'POST', path: '/template', query: { value: false }, body: form, signal })
  expect(result.status).toBe(201)
  expect(mock.send).toHaveBeenCalledWith({ method: 'POST', url: '/v1/template', params: { value: false }, data: form, headers: undefined, signal })
})

it('keeps transport status and gateway error details through the public client', async () => {
  const cause = { response: { status: 403, data: { code: 'FORBIDDEN', message: '禁止访问' } } }
  mock.send.mockRejectedValue(cause)
  const error = await workflowClient.getTemplate('key/with/slash').catch(error => error)
  expect(error.code).toBe('FORBIDDEN')
  expect(error.httpStatus).toBe(403)
  expect(error.effect).toBe('none')
  expect(error.cause).toBe(cause)
  expect(mock.send.mock.calls[0]?.[0].url).toBe('/v1/template/key%2Fwith%2Fslash')
})
