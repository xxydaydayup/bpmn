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
  const detail = { taskKey: 'leave/approval', bpmnXml: '<bpmn />' }
  const gateway = createBusinessWorkflowGateway(async config => {
    calls.push(config)
    return { data: detail }
  })

  assert.deepEqual(await gateway.getTemplate('leave/approval'), detail)
  assert.deepEqual(await gateway.deleteTemplate('leave/approval'), detail)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, '/v1/task/deployments/leave%2Fapproval')
  assert.equal(calls[1].method, 'DELETE')
  assert.equal(calls[1].url, '/v1/task/deployments/leave%2Fapproval')
})
