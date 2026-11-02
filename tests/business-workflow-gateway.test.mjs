import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/api/workflow/gateway.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')

test('business task actions follow the Swagger paths and request bodies', async () => {
  const calls = []
  const code = compiled.replace(
    /import \{ request \} from ['"]@\/utils\/request['"];?/,
    'const request = async () => { throw new Error("Unexpected default request"); };',
  )
  const { createBusinessWorkflowGateway } = await import(moduleUrl(code))
  const gateway = createBusinessWorkflowGateway(async config => {
    calls.push(config)
    return { data: { taskId: 'task/1', status: 'ok', assignee: 'alice' } }
  })

  await gateway.refuseTask('task/1')
  await gateway.reassignTask('task/1', 'alice')

  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, '/v1/tasks/task%2F1/refuse')
  assert.equal(calls[0].data, undefined)
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].url, '/v1/tasks/task%2F1/reassign')
  assert.deepEqual(calls[1].data, { userId: 'alice' })
})

test('task template detail and delete follow the Swagger contract', async () => {
  const calls = []
  const code = compiled.replace(
    /import \{ request \} from ['"]@\/utils\/request['"];?/,
    'const request = async () => { throw new Error("Unexpected default request"); };',
  )
  const { createBusinessWorkflowGateway } = await import(moduleUrl(code))
  const detail = { templateKey: 'leave/approval', templateName: '请假审批', bpmnXml: '<bpmn />' }
  const gateway = createBusinessWorkflowGateway(async config => {
    calls.push(config)
    return config.method === 'DELETE'
      ? { data: { templateKey: 'leave/approval', status: 'deleted' } }
      : { data: detail }
  })

  assert.deepEqual(await gateway.getTemplate('leave/approval'), { ...detail, taskKey: 'leave/approval', taskName: '请假审批' })
  assert.deepEqual(await gateway.deleteTemplate('leave/approval'), { templateKey: 'leave/approval', status: 'deleted', taskKey: 'leave/approval' })
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, '/v1/template/leave%2Fapproval')
  assert.equal(calls[1].method, 'DELETE')
  assert.equal(calls[1].url, '/v1/template/leave%2Fapproval')
})

test('template listing uses current Swagger path and normalizes backend fields', async () => {
  const calls = []
  const code = compiled.replace(
    /import \{ request \} from ['"]@\/utils\/request['"];?/,
    'const request = async () => { throw new Error("Unexpected default request"); };',
  )
  const { createBusinessWorkflowGateway } = await import(moduleUrl(code))
  const gateway = createBusinessWorkflowGateway(async config => {
    calls.push(config)
    return { data: [{ templateKey: 'leave', templateName: '请假审批', globalVariables: [{ name: 'applicant', type: 'String', value: 'alice', source: 'start', required: true }] }] }
  })

  const rows = await gateway.listTemplates({ maxResults: 100 })
  assert.equal(calls[0].url, '/v1/template')
  assert.deepEqual(calls[0].params, { maxResults: 100 })
  assert.equal(rows[0].taskKey, 'leave')
  assert.equal(rows[0].taskName, '请假审批')
  assert.equal(rows[0].globalVariables[0].defaultValue, 'alice')
})

test('publishing and starting use current Swagger contracts', async () => {
  const code = compiled.replace(
    /import \{ request \} from ['"]@\/utils\/request['"];?/,
    'const request = async () => { throw new Error("Unexpected default request"); };',
  )
  const { createBusinessWorkflowGateway } = await import(moduleUrl(code))
  let publishConfig
  const publisher = createBusinessWorkflowGateway(async config => {
    publishConfig = config
    return { data: { templateKey: 'leave', templateName: '请假审批' } }
  })
  const published = await publisher.publishTemplate('<bpmn />', '请假审批')
  assert.equal(publishConfig.url, '/v1/template')
  assert.equal(publishConfig.method, 'POST')
  assert.equal(publishConfig.data.get('deployment-name'), '请假审批')
  assert.equal(published.taskKey, 'leave')
  assert.equal(published.taskName, '请假审批')

  let startConfig
  const starter = createBusinessWorkflowGateway(async config => {
    startConfig = config
    return { data: { id: 4, templateKey: 'leave', templateName: '请假审批', templateId: 3, businessKey: 'leave-1', processInstanceId: 'instance-1' } }
  })
  const instance = await starter.startTaskInstance({ taskKey: 'leave', businessKey: 'leave-1', variables: { applicant: 'alice' } })
  assert.equal(startConfig.url, '/v1/task/instances/start')
  assert.deepEqual(startConfig.data, { templateKey: 'leave', businessKey: 'leave-1', variables: { applicant: 'alice' } })
  assert.equal(instance.taskKey, 'leave')
  assert.equal(instance.taskName, '请假审批')
  assert.equal(instance.taskTemplateId, 3)
})
