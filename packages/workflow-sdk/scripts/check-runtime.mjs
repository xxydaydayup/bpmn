// Explicit integration entry point. Creates only UUID-scoped resources and cleans those up.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createWorkflowClient } from '@workflow/sdk/client'
import * as d from '@workflow/sdk/definition'
import { createFetchRequest } from '../examples/fetch-request.mjs'

const base = process.env.WORKFLOW_SMOKE_BASE_URL ?? 'http://localhost:5171'
const tenant = process.env.WORKFLOW_SMOKE_TENANT ?? 'tenant-a'
const prefix = 'sdk_' + randomUUID().replaceAll('-', '')
const directory = resolve(process.env.WORKFLOW_SMOKE_REPORT_DIR ?? '.scratch/workflow-function-sdk/verification')
const fetchRequest = createFetchRequest(base + '/api/v1')
const request = async input => {
  const tracked = /start-variables|required-variables|[/]complete$|[/]instances[/]start$/.test(input.path)
  const entry = tracked ? { method: input.method, path: input.path, query: input.query, body: input.body } : undefined
  if (entry) report.requests.push(entry)
  const response = await fetchRequest(input)
  if (entry) Object.assign(entry, { status: response.status, response: response.body })
  return response
}
const sdk = createWorkflowClient({ request, timeoutMs: 20000 })
const report = { date: new Date().toISOString(), sdkVersion: '0.2.0', base, tenant, prefix, environment: {}, requests: [], scenarios: [], resources: [], cleanup: [] }
const keep = process.argv.includes('--keep')
const selected = process.env.WORKFLOW_SMOKE_SCENARIOS?.split(',')
const delay = ms => new Promise(done => setTimeout(done, ms))
async function raw(method, path, body) {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const text = await response.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`)
  return data
}
async function seedTaskCandidates(task) {
  const { loadEnv } = await import('vite')
  const env = loadEnv('development', process.cwd(), '')
  if (!env.CAMUNDA_PROXY_TARGET) throw new Error('候选身份夹具需要已配置的真实引擎地址。')
  const resource = report.resources.find(item => item.processDefinitionId === task.processDefinitionId && item.templateKey.startsWith(prefix))
  assert.ok(resource, 'Only seed candidate identities on this run scoped definition')
  const headers = { 'Content-Type': 'application/json', ...(env.CAMUNDA_PROXY_AUTH ? { Authorization: 'Basic ' + Buffer.from(env.CAMUNDA_PROXY_AUTH).toString('base64') } : {}) }
  const url = env.CAMUNDA_PROXY_TARGET.replace(/[/]$/, '') + '/engine-rest/task/' + encodeURIComponent(task.id)
  const observed = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  assert.equal(observed.status, 200)
  assert.equal((await observed.json()).processDefinitionId, resource.processDefinitionId)
  for (const identity of [{ userId: 'sdk-candidate', type: 'candidate' }, { groupId: 'sdk-candidate-group', type: 'candidate' }]) {
    const response = await fetch(url + '/identity-links', { method: 'POST', headers, body: JSON.stringify(identity), signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 204, 'Candidate fixture setup failed: ' + await response.text())
  }
}
async function unauthorizedClient() {
  const { loadEnv } = await import('vite')
  const gateway = process.env.WORKFLOW_SMOKE_AUTH_TEST_BASE_URL ?? loadEnv('development', process.cwd(), '').API_PROXY_TARGET
  if (!gateway) throw new Error('没有可验证鉴权的业务网关地址；开发代理注入合法鉴权，不能代替未授权请求。')
  return createWorkflowClient({ timeoutMs: 10000, request: createFetchRequest(gateway.replace(/[/]$/, '') + '/api/v1', { headers: { Authorization: 'Basic ' + Buffer.from('sdk-invalid-' + prefix + ':invalid').toString('base64') } }) })
}
async function until(read, accept, timeout = 18000) {
  const deadline = Date.now() + timeout
  let value
  do { value = await read(); if (accept(value)) return value; await delay(350) } while (Date.now() < deadline)
  throw new Error('Polling timed out: ' + JSON.stringify(value))
}
async function publish(label, body, key = `${prefix}_${label}`) {
  const definition = d.defineWorkflow({ key, name: 'SDK 隔离验收 ' + label }, body)
  const value = await sdk.publish(definition)
  report.resources.push({ label, templateKey: key, templateVersion: value.templateVersion, deploymentId: value.deploymentId, processDefinitionId: value.processDefinitionId, modelSha256: createHash('sha256').update(JSON.stringify(definition.toJSON())).digest('hex') })
  const definitions = await raw('GET', '/api/camunda/process-definition?deploymentId=' + encodeURIComponent(value.deploymentId))
  assert.ok(definitions.some(item => item.id === value.processDefinitionId && item.tenantId === tenant))
  return value
}
async function start(template, nodes = {}, variables = {}, suffix = '') {
  const instance = await sdk.start(template.templateKey, { businessKey: template.templateKey + suffix, nodes, variables })
  report.resources.at(-1).instances ??= []
  report.resources.at(-1).instances.push({ processInstanceId: instance.processInstanceId, processDefinitionId: instance.processDefinitionId, businessKey: instance.businessKey })
  return instance
}
const tasks = async instance => (await sdk.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 })).items
async function taskAt(instance, node) { return (await until(() => tasks(instance), rows => rows.some(task => task.taskDefinitionKey === node))).find(task => task.taskDefinitionKey === node) }
async function finish(instance, expectedNodes = [], state = 'COMPLETED') {
  const progress = await until(() => sdk.getProgress(instance.processInstanceId), value => value.state === state)
  const history = (await sdk.listHistory(instance.processInstanceId, { limit: 300 })).items
  const engine = await raw('GET', '/api/camunda/history/process-instance/' + encodeURIComponent(instance.processInstanceId))
  assert.equal(engine.state, state); assert.ok(engine.endTime)
  for (const node of expectedNodes) assert.ok(history.some(item => item.activityId === node), `Missing executed node ${node}`)
    if (state === 'COMPLETED') assert.ok(history.some(item => item.activityType === 'serviceTask' && item.endTime), 'task_finish worker must actually finish')
  return { progress, engine, taskIds: history.filter(item => item.taskId).map(item => item.taskId), path: history.map(item => ({ id: item.id, activityId: item.activityId, endTime: item.endTime, canceled: item.canceled })) }
}
async function scenario(name, run) {
  if (selected && !selected.includes(name)) return
  const entry = { name, startedAt: new Date().toISOString() }; report.scenarios.push(entry)
  try { entry.evidence = await run(); entry.status = 'passed'; console.log('PASS ' + name) } catch (error) { entry.status = 'failed'; entry.error = { message: error.message, code: error.code, httpStatus: error.httpStatus, effect: error.effect, phase: error.phase, resources: error.resources, cause: error.cause?.message }; console.log('FAIL ' + name + ': ' + error.message) }
}

try {
  report.environment.engine = await raw('GET', '/api/camunda/version')
  const current = await raw('GET', '/api/v1/template?maxResults=1')
  assert.equal(current.code, 'OK'); assert.ok(!current.data?.length || current.data[0].tenantId === tenant)
  report.environment.gateway = 'existing authenticated development proxy; build version not exposed'
  await scenario('compiler-recheck', async () => {
    const bodies = [
      ['reject', d.sequence(d.approval('review'), d.choice('result', { branches: [{ branch: 'pass', body: d.approval('accepted') }, { branch: 'reject', body: d.end('rejected') }] }))],
      ['nested-parallel', d.sequence(d.parallel('outer', [d.parallel('inner', [d.approval('finance'), d.approval('legal')]), d.approval('audit')]), d.approval('archive'))],
      ['message-timer', d.sequence(d.receive('receipt', { messageName: prefix + '_probe' }), d.timer('cooldown', { timerValue: 'PT5S' }), d.approval('archive'))],
      ['reassignment', d.approval('review', { allowTransfer: true })],
    ]
    const results = []
    for (const [name, body] of bodies) {
      const definition = d.defineWorkflow({ key: prefix + '_compile_' + name.replaceAll('-', '_') }, body)
      const startedAt = Date.now()
      const compiled = await sdk.compile(definition)
      assert.ok(compiled.bpmnXml.includes(definition.toJSON().processId))
      results.push({ name, elapsedMs: Date.now() - startedAt, modelSha256: createHash('sha256').update(JSON.stringify(compiled.model)).digest('hex'), xmlSha256: createHash('sha256').update(compiled.bpmnXml).digest('hex'), xmlLength: compiled.bpmnXml.length })
    }
    return results
  })
  await scenario('publish-minimal', async () => {
    const key = prefix + '_publish_minimal'
    const definition = d.defineWorkflow({ key, name: 'SDK 最小发布' }, d.sequence(d.approval('review', { assignee: 'sdk-fixed' }), d.approval('archive')))
    const calls = []
    const client = createWorkflowClient({ request: async input => { calls.push({ method: input.method, path: input.path, ...(input.body instanceof FormData ? { fields: Object.fromEntries([...input.body].filter(([name]) => name !== 'file')), filename: input.body.get('file')?.name } : {}) }); return request(input) } })
    const compiled = await client.compile(definition.toJSON())
    assert.ok(compiled.bpmnXml.includes(key)); assert.deepEqual(compiled.model, definition.toJSON())
    const template = await client.publish(definition, { name: 'SDK 最小发布模板' })
    report.resources.push({ label: 'publish-minimal', templateKey: key, templateVersion: template.templateVersion, deploymentId: template.deploymentId, processDefinitionId: template.processDefinitionId, modelSha256: createHash('sha256').update(JSON.stringify(definition.toJSON())).digest('hex') })
    const observed = await client.getTemplate(key)
    const definitions = await raw('GET', '/api/camunda/process-definition?deploymentId=' + encodeURIComponent(template.deploymentId))
    report.scenarios.at(-1).evidence = { template, observed, definitions, calls, compiledModel: compiled.model }
    assert.equal(observed.templateName, 'SDK 最小发布模板')
    assert.deepEqual(observed.displayJson, definition.toJSON())
    assert.ok(definitions.some(item => item.id === template.processDefinitionId && item.key === key && item.tenantId === tenant))
    assert.ok(!calls.some(call => call.path.includes('/start')))
    assert.equal(calls.filter(call => call.path === '/template').length, 1)
    assert.equal(Object.hasOwn(calls.find(call => call.path === '/template').fields, 'startable'), false)
    return { template, observed, definitions, calls, compiledModel: compiled.model }
  })
  await scenario('fixed-assignee-start', async () => {
    const template = await publish('fixed_start', d.approval('review', { assignee: 'sdk-fixed' }))
    const requirements = await sdk.getStartRequirements(template.templateKey)
    report.scenarios.at(-1).preflight = requirements
    const instance = await start(template)
    const task = await taskAt(instance, 'review'); assert.equal(task.assignee, 'sdk-fixed')
    await sdk.complete(task, {}, { templateSnapshot: template })
    return finish(instance, ['review'])
  })
  await scenario('fixed-assignee-next', async () => {
    const template = await publish('fixed_next', d.sequence(d.approval('review'), d.approval('archive', { assignee: 'sdk-fixed' })))
    const instance = await start(template, { review: { assignee: 'sdk-reviewer' } })
    const first = await taskAt(instance, 'review')
    report.scenarios.at(-1).preflight = await sdk.getTaskRequirements(first)
    await sdk.complete(first, { fields: { comment: '模板固定办理人' } }, { templateSnapshot: template })
    const next = await taskAt(instance, 'archive'); assert.equal(next.assignee, 'sdk-fixed')
    await sdk.complete(next, {}, { templateSnapshot: template })
    return finish(instance, ['review', 'archive'])
  })
  await scenario('serial-json', async () => {
    const template = await publish('serial', d.sequence(d.approval('review'), d.approval('archive')))
    const instance = await start(template, { review: { assignee: 'sdk-reviewer' } })
    const first = await taskAt(instance, 'review')
    await sdk.returnForReassignment(first)
    assert.ok(!(await taskAt(instance, 'review')).assignee)
    await sdk.reassign(first, 'sdk-reviewer')
    assert.equal((await taskAt(instance, 'review')).assignee, 'sdk-reviewer')
    assert.equal((await sdk.getTaskForm(first)).type, 'none')
    const values = { comment: '原 key 字段', amount: 0, checked: false, tags: ['sdk'], metadata: { source: 'sdk' }, nullable: null }
    await sdk.complete(first, { fields: values, nodes: { archive: { assignee: 'sdk-archiver' } } }, { templateSnapshot: template })
    const second = await taskAt(instance, 'archive')
    assert.equal(second.assignee, 'sdk-archiver')
    const observed = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    for (const [key, value] of Object.entries(values)) assert.deepEqual(observed[key]?.value, value)
    assert.equal(observed.review_comment, undefined)
    await sdk.complete(second, { fields: { archived: true } }, { templateSnapshot: template })
    return { ...(await finish(instance, ['review', 'archive'])), values }
  })
  await scenario('serial-write-recovery', async () => {
    const template = await publish('serial_recovery', d.sequence(d.approval('review'), d.approval('archive')))
    const businessKey = template.templateKey + '_business'
    const observations = [], errors = [], calls = []
    report.scenarios.at(-1).evidence = { observations, errors, calls }
    let losePath = '/task/instances/start'
    const client = createWorkflowClient({ timeoutMs: 20000, request: async input => {
      calls.push({ method: input.method, path: input.path })
      const response = await request(input)
      if (input.path === '/task/instances/start' && response.body?.code === 'OK' && response.body.data?.processInstanceId) {
        report.resources.at(-1).instances ??= []
        report.resources.at(-1).instances.push(response.body.data)
      }
      if (input.path === losePath) {
        losePath = undefined
        observations.push({ path: input.path, response })
        throw new Error('Acceptance harness dropped response after gateway executed the request')
      }
      return response
    } })
    const capture = async (run, operation, resourceName, resourceValue) => {
      await assert.rejects(run(), error => {
        errors.push({ code: error.code, operation: error.operation, phase: error.phase, effect: error.effect, resources: error.resources, httpStatus: error.httpStatus })
        assert.equal(error.operation, operation); assert.equal(error.phase, operation); assert.equal(error.effect, 'unknown')
        assert.equal(error.resources[resourceName], resourceValue)
        return true
      })
    }
    await capture(() => client.start(template.templateKey, { businessKey, nodes: { review: { assignee: 'sdk-recovery' } } }), 'start', 'businessKey', businessKey)
    assert.equal(calls.filter(call => call.path === '/task/instances/start').length, 1)
    const candidates = (await client.listTasks({ processDefinitionId: template.processDefinitionId, assignee: 'sdk-recovery', limit: 100 })).items
    assert.equal(candidates.length, 1)
    const first = candidates[0]
    const instance = { processInstanceId: first.processInstanceId, processDefinitionId: first.processDefinitionId, businessKey }
    assert.equal((await client.getProgress(instance.processInstanceId)).state, 'ACTIVE')
    const engineInstance = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId)
    assert.equal(engineInstance.businessKey, businessKey)
    let duplicate
    await assert.rejects(client.start(template.templateKey, { businessKey, nodes: { review: { assignee: 'sdk-recovery' } } }), error => {
      duplicate = { code: error.code, effect: error.effect, phase: error.phase, httpStatus: error.httpStatus, resources: error.resources }
      assert.equal(error.code, 'BUSINESS_KEY_EXISTS'); assert.equal(error.phase, 'start')
      return true
    })
    assert.equal(calls.filter(call => call.path === '/task/instances/start').length, 2)
    losePath = '/tasks/' + encodeURIComponent(first.id) + '/complete'
    await capture(() => client.complete(first, { fields: { comment: 'response lost', zero: 0, checked: false }, nodes: { archive: { assignee: 'sdk-recovered' } } }, { templateSnapshot: template }), 'complete', 'taskId', first.id)
    const next = await taskAt(instance, 'archive')
    assert.equal(next.assignee, 'sdk-recovered')
    assert.ok(!(await tasks(instance)).some(task => task.id === first.id))
    const history = (await client.listHistory(instance.processInstanceId, { limit: 100 })).items
    assert.ok(history.some(item => item.taskId === first.id && item.endTime))
    assert.equal(calls.filter(call => call.path.endsWith('/complete')).length, 1)
    await client.complete(next, {}, { templateSnapshot: template })
    return { observations, errors, calls, duplicate, recovered: { first, next, engineInstance }, ...(await finish(instance, ['review', 'archive'])) }
  })
  await scenario('reject', async () => {
    const template = await publish('reject', d.sequence(d.approval('review'), d.choice('result', { branches: [{ branch: 'pass', body: d.approval('accepted', {}) }, { branch: 'reject', body: d.end('rejected') }] }), d.approval('archive', { assignee: 'sdk-fixed' })))
    const instance = await start(template, { review: { assignee: 'sdk' } })
    const task = await taskAt(instance, 'review')
    const initial = { task, requirements: await sdk.getTaskRequirements(task), templateRules: template.globalVariables }
    report.scenarios.at(-1).evidence = initial
    await sdk.complete(task, { decision: 'reject', fields: { comment: 'reject original key', checked: false } }, { templateSnapshot: template })
    const evidence = await finish(instance, ['review', 'rejected'])
    assert.ok(!evidence.path.some(item => item.activityId === 'accepted'))
    assert.ok(!evidence.path.some(item => item.activityId === 'archive'))
    const variables = await raw('GET', '/api/camunda/history/variable-instance?processInstanceId=' + instance.processInstanceId)
    assert.equal(variables.find(variable => variable.name === 'review_passed')?.value, false)
    assert.equal(variables.find(variable => variable.name === 'comment')?.value, 'reject original key')
    return { ...initial, variables, ...evidence }
  })
  await scenario('decision-json', async () => {
    const template = await publish('decision_json', d.sequence(d.countersign('sign', { mode: 'ALL' }), d.approval('archive')))
    const instance = await start(template, { sign: { approverList: ['sdk'] } })
    const task = await taskAt(instance, 'sign')
    const fields = { comment: '表决与表单一次提交', zero: 0, checked: false, labels: [], details: {}, nullable: null }
    await sdk.complete(task, { decision: 'agree', fields, nodes: { archive: { assignee: 'sdk-next' } } }, { templateSnapshot: template })
    const next = await taskAt(instance, 'archive'); assert.equal(next.assignee, 'sdk-next')
    const values = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    for (const [key, value] of Object.entries(fields)) assert.deepEqual(values[key]?.value, value)
    assert.equal(values.sign_comment, undefined)
    await sdk.complete(next)
    return { fields, ...(await finish(instance, ['sign', 'archive'])) }
  })
  await scenario('approval-agree', async () => {
    const template = await publish('agree', d.sequence(d.approval('review'), d.choice('result', { branches: [
      { branch: 'pass', body: d.approval('accepted') }, { branch: 'reject', body: d.end('rejected') },
    ] }), d.approval('archive', { assignee: 'sdk-fixed' })))
    const instance = await start(template, { review: { assignee: 'sdk-review' } })
    const first = await taskAt(instance, 'review')
    const requirements = await sdk.getTaskRequirements(first)
    report.scenarios.at(-1).evidence = { requirements }
    await sdk.complete(first, { decision: 'agree', fields: { comment: 'agree with original key', checked: false }, nodes: { accepted: { assignee: 'sdk-accepted' } } }, { templateSnapshot: template })
    const next = await taskAt(instance, 'accepted'); assert.equal(next.assignee, 'sdk-accepted')
    const variables = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    assert.equal(variables.review_passed?.value, true)
    assert.equal(variables.comment?.value, 'agree with original key'); assert.equal(variables.checked?.value, false)
    assert.equal(variables.review_comment, undefined); assert.equal(variables.review_approved, undefined)
    await sdk.complete(next, {}, { templateSnapshot: template })
    await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
    const evidence = await finish(instance, ['review', 'accepted', 'archive'])
    assert.ok(!evidence.path.some(item => item.activityId === 'rejected'))
    return { requirements, variables, ...evidence }
  })
  await scenario('status-default', async () => {
    const template = await publish('status', d.choice('route', { statusVariable: 'state', branches: [
      { branch: 'ready', body: d.approval('ready') }, { branch: 'default', body: d.approval('fallback') },
    ] }))
    const evidence = []
    report.scenarios.at(-1).evidence = evidence
    for (const [state, expected] of [['ready', 'ready'], ['unknown', 'fallback']]) {
      const variables = { state }
      const requirements = await sdk.getStartRequirements(template.templateKey, variables)
      const entry = { state, expected, requirements }; evidence.push(entry)
      try {
      await assert.rejects(sdk.start(template.templateKey, { businessKey: template.templateKey + '_missing_' + state, variables }), error => {
        entry.missingSelected = { code: error.code, message: error.message, effect: error.effect, httpStatus: error.httpStatus, issues: error.issues }
        assert.equal(error.effect, 'none'); assert.ok(['VARIABLE_VALIDATION_FAILED', 'PARAMETER_REQUIRED'].includes(error.code)); return true
      })
      const instance = await start(template, { [expected]: { assignee: 'sdk-status' } }, variables, '_' + state)
      const task = await taskAt(instance, expected)
      assert.equal((await tasks(instance)).length, 1)
      await sdk.complete(task, {}, { templateSnapshot: template })
      Object.assign(entry, await finish(instance, [expected]))
      assert.ok(!entry.path.some(item => item.activityId === (expected === 'ready' ? 'fallback' : 'ready')))
      } catch (error) { entry.failure = { code: error.code, httpStatus: error.httpStatus, message: error.message, phase: error.phase, effect: error.effect, resources: error.resources } }
    }
    assert.ok(evidence.every(entry => !entry.failure), 'Dynamic status branch failed: ' + JSON.stringify(evidence.filter(entry => entry.failure).map(entry => ({ state: entry.state, ...entry.failure }))))
    return evidence
  })
  await scenario('amount', async () => {
    const template = await publish('amount', d.choice('amount_route', { branches: [{ conditionExpression: '${amount > 100}', body: d.approval('large', {}) }, { branch: 'default', body: d.approval('small', {}) }] }))
    const evidence = []
    report.scenarios.at(-1).evidence = evidence
    for (const [amount, expected] of [[101, 'large'], [0, 'small']]) {
      const entry = { amount, expected, requirements: await sdk.getStartRequirements(template.templateKey, { amount }) }; evidence.push(entry)
      try {
        const instance = await start(template, { [expected]: { assignee: 'sdk-amount' } }, { amount }, '_' + amount)
        const task = await taskAt(instance, expected); assert.equal(task.assignee, 'sdk-amount')
        await sdk.complete(task, {}, { templateSnapshot: template })
        Object.assign(entry, await finish(instance, [expected]))
        assert.ok(!entry.path.some(item => item.activityId === (expected === 'large' ? 'small' : 'large')))
      } catch (error) { entry.failure = { code: error.code, httpStatus: error.httpStatus, message: error.message, phase: error.phase, effect: error.effect, resources: error.resources } }
    }
    assert.ok(evidence.every(entry => !entry.failure), 'Expression branch failed: ' + JSON.stringify(evidence.filter(entry => entry.failure).map(entry => ({ amount: entry.amount, ...entry.failure }))))
    return evidence
  })
  await scenario('status-fixed-default', async () => {
    const template = await publish('status_fixed', d.choice('route', { statusVariable: 'state', branches: [
      { branch: 'ready', body: d.approval('ready', { assignee: 'sdk-ready' }) },
      { branch: 'default', body: d.approval('fallback', { assignee: 'sdk-fallback' }) },
    ] }))
    const evidence = []; report.scenarios.at(-1).evidence = evidence
    for (const [state, expected] of [['ready', 'ready'], ['unknown', 'fallback']]) {
      const instance = await start(template, {}, { state }, '_' + state)
      const task = await taskAt(instance, expected)
      assert.equal(task.assignee, 'sdk-' + expected); assert.equal((await tasks(instance)).length, 1)
      await sdk.complete(task, { fields: { state, checked: false } }, { templateSnapshot: template })
      const actual = await finish(instance, [expected])
      assert.ok(!actual.path.some(item => item.activityId === (expected === 'ready' ? 'fallback' : 'ready')))
      evidence.push({ state, expected, task, ...actual })
    }
    return evidence
  })
  for (const [mode, sequential, votes, count] of [['ALL', false, ['agree', 'agree'], 2], ['ANY', false, ['agree'], 1], ['VOTE', false, ['agree'], 1], ['ALL', true, ['agree', 'agree'], 2]]) {
    await scenario('countersign-' + mode + (sequential ? '-sequential' : ''), async () => {
      const label = 'sign_' + mode + (sequential ? '_seq' : '')
      const template = await publish(label, d.sequence(d.countersign('sign', { mode, sequential, ...(mode === 'VOTE' ? { passRate: '0.5' } : {}) }), d.approval('archive', {})))
      const instance = await start(template, { sign: { approverList: ['sdk-a', 'sdk-b'] }, archive: { assignee: 'sdk' } })
      const initial = await tasks(instance); assert.equal(initial.length, sequential ? 1 : 2)
      const completed = []
      for (const vote of votes) {
        const live = await tasks(instance); const task = live.find(item => item.taskDefinitionKey === 'sign'); if (!task) break
        await sdk.complete(task, { decision: vote }, { templateSnapshot: template }); completed.push(task.id)
      }
      assert.equal(completed.length, count)
      const archive = await taskAt(instance, 'archive'); assert.ok(!(await tasks(instance)).some(t => t.taskDefinitionKey === 'sign'))
      const vars = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables');
      await sdk.complete(archive)
      return { initialTaskCount: initial.length, completed, results: Object.fromEntries(Object.entries(vars).filter(([key]) => key === 'vote' || key.startsWith('sign_')).map(([key, value]) => [key, value.value])), ...(await finish(instance, ['sign', 'archive'])) }
    })
  }
  await scenario('parallel', async () => {
    const template = await publish('parallel', d.sequence(d.parallel('departments', [d.approval('finance', {}), d.approval('legal', {})]), d.approval('archive', {})))
    const instance = await start(template, { finance: { assignee: 'sdk' }, legal: { assignee: 'sdk' }, archive: { assignee: 'sdk' } })
    const initial = await tasks(instance); assert.equal(initial.length, 2)
    await sdk.complete(initial.find(t => t.taskDefinitionKey === 'finance'))
    assert.deepEqual((await tasks(instance)).map(t => t.taskDefinitionKey), ['legal'])
    await sdk.complete(await taskAt(instance, 'legal')); await sdk.complete(await taskAt(instance, 'archive'))
    return finish(instance, ['finance', 'legal', '__wf_departments_join', 'archive'])
  })
  await scenario('message-timer-subprocess', async () => {
    const local = () => d.approval('review')
    const template = await publish('nested', d.sequence(d.subProcess('outer', d.subProcess('inner', local())), d.subProcess('other', local()), d.receive('receipt', { messageName: prefix + '_received' }), d.timer('cooldown', { timerType: 'duration', timerValue: 'PT2S' }), d.approval('archive', {})))
    const rules = await sdk.getStartRequirements(template.templateKey)
    const assignees = rules.rules.filter(rule => rule.name.endsWith('_assignee') && rule.source === 'start' && rule.required)
    const nodes = Object.fromEntries(assignees.map(rule => [rule.nodeId, { assignee: 'sdk_' + rule.nodeId }]))
    const instance = await start(template, nodes)
    const keys = []
    for (let i = 0; i < 2; i++) { const task = (await tasks(instance))[0]; assert.ok(task.taskDefinitionKey.endsWith('_review')); keys.push(task.taskDefinitionKey); assert.equal(task.assignee, 'sdk_' + task.taskDefinitionKey); await sdk.complete(task) }
    assert.notEqual(keys[0], keys[1])
    assert.equal((await tasks(instance)).length, 0)
    const waiting = await sdk.getProgress(instance.processInstanceId); assert.equal(waiting.state, 'ACTIVE'); assert.ok(waiting.activeNodes.some(n => n.activityId === 'receipt'))
    await sdk.sendMessage({ businessKey: instance.businessKey, messageName: prefix + '_received', variables: { received: true } })
    await sdk.complete(await taskAt(instance, 'archive'))
    return { expandedIds: keys, ...(await finish(instance, [...keys, 'receipt', 'cooldown', 'archive'])) }
  })
  await scenario('nested-parallel', async () => {
    const template = await publish('nested_parallel', d.sequence(d.parallel('outer', [
      d.sequence(d.parallel('inner', [d.approval('finance'), d.approval('legal')]), d.approval('manager')), d.approval('audit'),
    ]), d.approval('archive')))
    const nodes = Object.fromEntries(['finance', 'legal', 'manager', 'audit', 'archive'].map(id => [id, { assignee: 'sdk-' + id }]))
    const instance = await start(template, nodes)
    const observations = []
    for (const [node, expected] of [
      ['finance', ['audit', 'finance', 'legal']], ['legal', ['audit', 'legal']], ['manager', ['audit', 'manager']], ['audit', ['audit']], ['archive', ['archive']],
    ]) {
      const live = await tasks(instance)
      observations.push({ node, tasks: live, progress: await sdk.getProgress(instance.processInstanceId) })
      assert.deepEqual(live.map(task => task.taskDefinitionKey).sort(), expected)
      const task = live.find(task => task.taskDefinitionKey === node)
      assert.equal(task.assignee, 'sdk-' + node)
      await sdk.complete(task, { fields: { comment: node } }, { templateSnapshot: template })
    }
    return { observations, ...(await finish(instance, ['finance', 'legal', '__wf_inner_join', 'manager', 'audit', '__wf_outer_join', 'archive'])) }
  })
  await scenario('installed-parallel-consumer', async () => {
    const installedRoot = process.env.WORKFLOW_SMOKE_INSTALLED_ROOT
    if (!installedRoot) throw new Error('请提供实际 tgz 安装消费者目录 WORKFLOW_SMOKE_INSTALLED_ROOT。')
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const resolveInstalled = createRequire(resolve(installedRoot, 'package.json'))
    const { runParallelWorkflow } = await import(pathToFileURL(resolveInstalled.resolve('@workflow/sdk/examples/parallel-client.mjs')).href)
    const artifact = resolve(process.env.WORKFLOW_SMOKE_PACKAGE ?? '.scratch/workflow-function-sdk/artifacts/workflow-sdk-0.2.0.tgz')
    const artifactSha256 = createHash('sha256').update(await readFile(artifact)).digest('hex')
    const key = prefix + '_installed_parallel'
    const observed = []
    const result = await runParallelWorkflow({ key, businessKey: key, assignee: 'sdk-installed', request: async input => {
      const response = await request(input)
      observed.push({ method: input.method, path: input.path, status: response.status, code: response.body?.code })
      if (input.method === 'POST' && input.path === '/template' && response.body?.code === 'OK') {
        const value = response.body.data
        assert.equal(value.templateKey, key)
        report.resources.push({ label: 'installed-parallel-consumer', templateKey: key, deploymentId: value.deploymentId, processDefinitionId: value.processDefinitionId, templateVersion: value.templateVersion ?? value.version, consumer: installedRoot })
      }
      if (input.path === '/task/instances/start' && response.body?.code === 'OK') report.resources.at(-1).instances = [response.body.data]
      return response
    } })
    assert.equal(result.progress.state, 'COMPLETED')
    return { consumer: installedRoot, artifact, artifactSha256, observed, observations: result.observations, ...(await finish(result.instance, ['finance', 'legal', '__wf_inner_join', 'manager', 'audit', '__wf_outer_join', 'archive'])) }
  })
  for (const decision of ['agree', 'reject']) await scenario('installed-approval-' + decision, async () => {
    const installedRoot = process.env.WORKFLOW_SMOKE_INSTALLED_ROOT
    if (!installedRoot) throw new Error('请提供实际 tgz 安装消费者目录 WORKFLOW_SMOKE_INSTALLED_ROOT。')
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const resolveInstalled = createRequire(resolve(installedRoot, 'package.json'))
    const { runApprovalWorkflow } = await import(pathToFileURL(resolveInstalled.resolve('@workflow/sdk/examples/branch-client.mjs')).href)
    const artifact = resolve(process.env.WORKFLOW_SMOKE_PACKAGE ?? '.scratch/workflow-function-sdk/artifacts/workflow-sdk-0.2.0.tgz')
    const artifactSha256 = createHash('sha256').update(await readFile(artifact)).digest('hex')
    const key = prefix + '_installed_' + decision
    const observed = []
    const result = await runApprovalWorkflow({ key, businessKey: key, reviewer: 'sdk-installed', nextAssignee: 'sdk-installed-next', decision, request: async input => {
      const response = await request(input)
      observed.push({ method: input.method, path: input.path, body: input.body instanceof FormData ? undefined : input.body, status: response.status, code: response.body?.code })
      if (input.method === 'POST' && input.path === '/template' && response.body?.code === 'OK') {
        const value = response.body.data
        assert.equal(value.templateKey, key)
        report.resources.push({ label: 'installed-approval-' + decision, templateKey: key, deploymentId: value.deploymentId, processDefinitionId: value.processDefinitionId, templateVersion: value.templateVersion ?? value.version, consumer: installedRoot })
      }
      if (input.path === '/task/instances/start' && response.body?.code === 'OK') report.resources.at(-1).instances = [response.body.data]
      return response
    } })
    const completion = observed.find(item => item.body?.variables?.review_passed)
    assert.equal(completion.body.variables.review_passed.value, decision === 'agree')
    assert.equal(completion.body.variables.checked.value, false)
    assert.equal(observed.filter(item => item.path.endsWith('/complete')).length, decision === 'agree' ? 3 : 1)
    const actual = await finish(result.instance, decision === 'agree' ? ['review', 'accepted', 'archive'] : ['review', 'rejected'])
    assert.ok(!actual.path.some(item => item.activityId === (decision === 'agree' ? 'rejected' : 'accepted')))
    if (decision === 'reject') assert.ok(!actual.path.some(item => item.activityId === 'archive'))
    return { consumer: installedRoot, artifact, artifactSha256, decision, observed, ...actual }
  })
  await scenario('message-timer-observation', async () => {
    const template = await publish('wait_observation', d.sequence(d.receive('receipt', { messageName: prefix + '_receipt' }), d.timer('cooldown', { timerType: 'duration', timerValue: 'PT5S' }), d.approval('archive', { assignee: 'sdk' })))
    const instance = await start(template)
    const waiting = await sdk.getProgress(instance.processInstanceId)
    assert.equal(waiting.state, 'ACTIVE'); assert.equal((await tasks(instance)).length, 0)
    assert.ok(waiting.activeNodes.some(node => node.activityId === 'receipt'))
    let wrongMessage
    await assert.rejects(sdk.sendMessage({ businessKey: instance.businessKey, messageName: prefix + '_wrong' }), error => {
      wrongMessage = { code: error.code, effect: error.effect, phase: error.phase, httpStatus: error.httpStatus }
      return true
    })
    assert.ok((await sdk.getProgress(instance.processInstanceId)).activeNodes.some(node => node.activityId === 'receipt'))
    const sentAt = Date.now()
    await sdk.sendMessage({ businessKey: instance.businessKey, messageName: prefix + '_receipt', variables: { received: true, zero: 0, checked: false } })
    const before = await sdk.getProgress(instance.processInstanceId)
    const observedAt = Date.now()
    assert.equal(before.state, 'ACTIVE'); assert.ok(before.activeNodes.some(node => node.activityId === 'cooldown'))
    assert.equal((await tasks(instance)).length, 0)
    const variables = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    assert.equal(variables.received.value, true); assert.equal(variables.zero.value, 0); assert.equal(variables.checked.value, false)
    await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
    const finishedAt = Date.now()
    assert.ok(finishedAt - sentAt >= 4500)
    return { waiting, wrongMessage, before, sentAt, observedAt, finishedAt, ...(await finish(instance, ['receipt', 'cooldown', 'archive'])) }
  })
  await scenario('message-runtime-parameters', async () => {
    const messageName = prefix + '_runtime_receipt'
    const template = await publish('wait_runtime', d.sequence(d.receive('receipt'), d.timer('cooldown'), d.approval('archive', { assignee: 'sdk' })))
    const requirements = await sdk.getStartRequirements(template.templateKey)
    report.scenarios.at(-1).evidence = { requirements }
    const instance = await start(template, { receipt: { messageName }, cooldown: { timerValue: 'PT2S' } }, { checked: false, amount: 0 })
    const waiting = await sdk.getProgress(instance.processInstanceId)
    assert.equal(waiting.state, 'ACTIVE'); assert.ok(waiting.activeNodes.some(node => node.activityId === 'receipt'))
    await sdk.sendMessage({ messageName, businessKey: instance.businessKey, correlationKeys: { checked: false, amount: 0 }, variables: { receiptData: { source: 'runtime' } } })
    const before = await sdk.getProgress(instance.processInstanceId)
    assert.ok(before.activeNodes.some(node => node.activityId === 'cooldown'))
    const task = await taskAt(instance, 'archive')
    const variables = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    assert.deepEqual(variables.receiptData.value, { source: 'runtime' })
    await sdk.complete(task, {}, { templateSnapshot: template })
    return { requirements, waiting, before, ...(await finish(instance, ['receipt', 'cooldown', 'archive'])) }
  })
  await scenario('timer-required', async () => {
    const template = await publish('timer_required', d.sequence(d.timer('wait'), d.approval('archive', { assignee: 'sdk' })))
    const requirements = await sdk.getStartRequirements(template.templateKey)
    let failure
    await assert.rejects(sdk.start(template.templateKey, { businessKey: template.templateKey + '_missing' }), error => {
      failure = { code: error.code, phase: error.phase, effect: error.effect, resources: error.resources, issues: error.issues }
      assert.equal(error.code, 'PARAMETER_REQUIRED'); assert.ok(error.issues.some(issue => issue.path.includes('wait_timerValue'))); return true
    })
    const instance = await start(template, { wait: { timerValue: 'PT2S' } })
    await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
    return { requirements, failure, ...(await finish(instance, ['wait', 'archive'])) }
  })
  await scenario('message-ambiguity', async () => {
    const messageName = prefix + '_ambiguous'
    const template = await publish('ambiguous', d.parallel('receipts', [d.receive('first', { messageName }), d.receive('second', { messageName })]))
    const instance = await start(template)
    const before = await sdk.getProgress(instance.processInstanceId)
    assert.equal((await tasks(instance)).length, 0); assert.equal(before.state, 'ACTIVE')
    assert.ok(['first', 'second'].every(id => before.activeNodes.some(node => node.activityId === id)))
    let failure
    await assert.rejects(sdk.sendMessage({ messageName, businessKey: instance.businessKey }), error => {
      failure = { code: error.code, httpStatus: error.httpStatus, effect: error.effect, phase: error.phase, resources: error.resources, message: error.message }
      assert.equal(error.code, 'MESSAGE_CORRELATION_FAILED'); return true
    })
    const after = await sdk.getProgress(instance.processInstanceId)
    assert.equal(after.state, 'ACTIVE'); assert.ok(['first', 'second'].every(id => after.activeNodes.some(node => node.activityId === id)))
    return { before, failure, after, history: (await sdk.listHistory(instance.processInstanceId, { limit: 100 })).items, termination: 'Not completed by design; scoped deployment cascade cleanup cancels waiting instance' }
  })
  await scenario('message-unauthorized', async () => {
    const denied = await unauthorizedClient()
    const messageName = prefix + '_authorized'
    const template = await publish('message_auth', d.receive('receipt', { messageName }))
    const instance = await start(template)
    let failure
    await assert.rejects(denied.sendMessage({ messageName, businessKey: instance.businessKey }), error => {
      failure = { code: error.code, httpStatus: error.httpStatus, effect: error.effect, phase: error.phase, resources: error.resources }
      assert.ok([401, 403].includes(error.httpStatus)); assert.equal(error.effect, 'none'); return true
    })
    const unchanged = await sdk.getProgress(instance.processInstanceId)
    assert.ok(unchanged.activeNodes.some(node => node.activityId === 'receipt')); assert.equal(unchanged.state, 'ACTIVE')
    await sdk.sendMessage({ messageName, businessKey: instance.businessKey })
    return { failure, unchanged, ...(await finish(instance, ['receipt'])) }
  })
  await scenario('reassignment-identity', async () => {
    const template = await publish('reassignment', d.approval('review', { allowTransfer: true }))
    const instance = await start(template, { review: { assignee: 'sdk-original' } })
    const task = await taskAt(instance, 'review')
    // Seed candidate links only on this UUID-scoped task to verify the business action clears them.
    await seedTaskCandidates(task)
    const before = { task, links: await raw('GET', '/api/camunda/task/' + task.id + '/identity-links') }
    const evidence = { before }; report.scenarios.at(-1).evidence = evidence
    assert.ok(before.links.some(link => link.userId === 'sdk-candidate' && link.type === 'candidate'))
    assert.ok(before.links.some(link => link.groupId === 'sdk-candidate-group' && link.type === 'candidate'))
    try { await sdk.returnForReassignment(task) } catch (error) {
      evidence.afterFailure = { task: await taskAt(instance, 'review'), links: await raw('GET', '/api/camunda/task/' + task.id + '/identity-links'), progress: await sdk.getProgress(instance.processInstanceId) }
      throw error
    }
    const returned = await taskAt(instance, 'review')
    const links = await raw('GET', '/api/camunda/task/' + task.id + '/identity-links')
    assert.equal(returned.id, task.id); assert.ok(!returned.assignee)
    assert.ok(!links.some(link => link.type === 'candidate'))
    assert.equal((await sdk.getProgress(instance.processInstanceId)).state, 'ACTIVE')
    await sdk.reassign(returned, 'sdk-new')
    const assigned = (await sdk.listTasks({ processInstanceId: instance.processInstanceId, assignee: 'sdk-new' })).items
    const old = (await sdk.listTasks({ processInstanceId: instance.processInstanceId, assignee: 'sdk-original' })).items
    assert.equal(assigned.length, 1); assert.equal(assigned[0].id, task.id); assert.equal(old.length, 0)
    await sdk.complete(assigned[0], {}, { templateSnapshot: template })
    const absent = { ...task, id: prefix + '_missing_task' }
    const failures = []
    for (const action of [() => sdk.returnForReassignment(absent), () => sdk.reassign(absent, 'sdk')]) await assert.rejects(action(), error => {
      failures.push({ code: error.code, effect: error.effect, httpStatus: error.httpStatus, phase: error.phase, resources: error.resources }); return true
    })
    return { before, returned, links, assigned, old, failures, ...(await finish(instance, ['review'])) }
  })
  await scenario('reassignment-restricted', async () => {
    const template = await publish('restricted', d.approval('review', { allowTransfer: false }))
    assert.equal(template.displayJson.nodes.find(node => node.id === 'review').allowTransfer, false)
    const instance = await start(template, { review: { assignee: 'sdk-original' } })
    const task = await taskAt(instance, 'review')
    const failures = []
    report.scenarios.at(-1).evidence = { task, failures }
    const variables = await raw('GET', '/api/camunda/process-instance/' + instance.processInstanceId + '/variables')
    assert.equal(variables.review_allowTransfer.value, false)
    await assert.rejects(sdk.reassign(task, 'sdk-new'), error => {
      failures.push({ code: error.code, effect: error.effect, httpStatus: error.httpStatus, phase: error.phase, resources: error.resources })
      assert.equal(error.httpStatus, 403); assert.equal(error.effect, 'none'); return true
    })
    assert.equal((await taskAt(instance, 'review')).assignee, 'sdk-original')
    await sdk.complete(task, {}, { templateSnapshot: template })
    return { task, failures, fixedAllowTransfer: variables.review_allowTransfer.value, ...(await finish(instance, ['review'])) }
  })
  await scenario('reassignment-candidates', async () => {
    const template = await publish('reassign_candidates', d.approval('review', { allowTransfer: true }))
    const instance = await start(template, { review: { assignee: 'sdk-original' } })
    const task = await taskAt(instance, 'review')
    await seedTaskCandidates(task)
    const evidence = { before: { task, links: await raw('GET', '/api/camunda/task/' + task.id + '/identity-links') } }
    report.scenarios.at(-1).evidence = evidence
    try { await sdk.reassign(task, 'sdk-new') } catch (error) {
      evidence.afterFailure = { task: await taskAt(instance, 'review'), links: await raw('GET', '/api/camunda/task/' + task.id + '/identity-links'), progress: await sdk.getProgress(instance.processInstanceId) }
      throw error
    }
    const assigned = await taskAt(instance, 'review')
    const links = await raw('GET', '/api/camunda/task/' + task.id + '/identity-links')
    assert.equal(assigned.id, task.id); assert.equal(assigned.assignee, 'sdk-new')
    assert.ok(!links.some(link => link.type === 'candidate'))
    await sdk.complete(assigned, {}, { templateSnapshot: template })
    return { ...evidence, assigned, links, ...(await finish(instance, ['review'])) }
  })
  await scenario('reassignment-unauthorized', async () => {
    const denied = await unauthorizedClient()
    const template = await publish('unauthorized', d.approval('review'))
    const instance = await start(template, { review: { assignee: 'sdk-original' } })
    const task = await taskAt(instance, 'review')
    const failures = []
    report.scenarios.at(-1).evidence = { task, failures }
    for (const action of [() => denied.returnForReassignment(task), () => denied.reassign(task, 'sdk-new')]) await assert.rejects(action(), error => {
      failures.push({ code: error.code, httpStatus: error.httpStatus, effect: error.effect, phase: error.phase, resources: error.resources })
      assert.ok([401, 403].includes(error.httpStatus)); assert.equal(error.effect, 'none'); return true
    })
    const unchanged = await taskAt(instance, 'review')
    assert.equal(unchanged.id, task.id); assert.equal(unchanged.assignee, 'sdk-original')
    await sdk.complete(unchanged, {}, { templateSnapshot: template })
    return { task, failures, unchanged, ...(await finish(instance, ['review'])) }
  })
  await scenario('message-instance', async () => {
    const template = await publish('message_instance', d.receive('receipt', { messageName: prefix + '_single' }))
    const instance = await start(template)
    await sdk.sendMessage({ processInstanceId: instance.processInstanceId, messageName: prefix + '_single' })
    return finish(instance, ['receipt'])
  })
  for (const action of ['notify', 'return', 'end']) await scenario('timeout-' + action, async () => {
    const template = await publish('timeout_' + action, d.sequence(d.approval('first', {}), d.approval('review', { reminder: { duration: 'PT2S', action, ...(action === 'return' ? { target: 'first' } : {}) } })))
    const instance = await start(template, { first: { assignee: 'sdk' } })
    await sdk.complete(await taskAt(instance, 'first'), { nodes: { review: { assignee: 'sdk' } } })
    const review = await taskAt(instance, 'review')
    if (action === 'end') {
      const progress = await until(() => sdk.getProgress(instance.processInstanceId), value => value.state === 'COMPLETED' || value.state === 'INTERNALLY_TERMINATED')
      const engine = await raw('GET', '/api/camunda/history/process-instance/' + instance.processInstanceId)
      assert.ok(engine.endTime)
      return { progress, engine, history: (await sdk.listHistory(instance.processInstanceId, { limit: 100 })).items }
    }
    if (action === 'return') { const again = await taskAt(instance, 'first'); assert.notEqual(again.id, review.id); return { returnedTaskId: again.id, current: await sdk.getProgress(instance.processInstanceId), history: (await sdk.listHistory(instance.processInstanceId, { limit: 100 })).items } }
    await until(() => sdk.listHistory(instance.processInstanceId, { limit: 100 }), page => page.items.some(h => h.activityId.includes('reminder') && h.endTime))
    assert.equal((await tasks(instance))[0].id, review.id); await sdk.complete(review)
    return finish(instance, ['review'])
  })
  await scenario('versions', async () => {
    const one = await publish('versions', d.countersign('old_review', { mode: 'ALL' }))
    const instance = await start(one, { old_review: { approverList: ['sdk'] } })
    const oldTask = await taskAt(instance, 'old_review')
    const two = await publish('versions_v2', d.approval('new_review', {}), one.templateKey)
    assert.notEqual(two.processDefinitionId, one.processDefinitionId)
    const oldSnapshot = await sdk.getTemplateVersion(one.templateKey, one.templateVersion)
    const requirements = await sdk.getTaskRequirements(oldTask)
    assert.ok(requirements.currentComplete.some(rule => rule.nodeId === 'old_review' && rule.name === 'vote'))
    await sdk.complete(oldTask, { decision: 'agree' }, { templateSnapshot: oldSnapshot })
    return { versions: [one.processDefinitionId, two.processDefinitionId], ...(await finish(instance, ['old_review'])) }
  })
  for (const multi of [false, true]) await scenario(multi ? 'service-countersign' : 'service', async () => {
    const serviceUrl = process.env.WORKFLOW_SMOKE_SERVICE_URL
    if (!serviceUrl) throw new Error('WORKFLOW_SMOKE_SERVICE_URL 未配置；需要 worker 可访问的真实业务服务，不能用手动完成 external task 替代。')
    const template = await publish(multi ? 'services' : 'service', d.sequence(d.service('invoke', { serviceName: 'sdk-verification', serviceUrl, ...(multi ? { countersign: true, mode: 'ALL' } : {}) }), d.approval('archive', {})))
    const instance = await start(template, { archive: { assignee: 'sdk' }, ...(multi ? { invoke: { serviceList: [{ serviceName: 'sdk-a' }, { serviceName: 'sdk-b' }] } } : {}) })
    await sdk.complete(await taskAt(instance, 'archive'))
    return finish(instance, ['invoke', 'archive'])
  })
} catch (error) { report.failure = error.message; console.error(error) } finally {
  for (const resource of [...report.resources].reverse()) {
    if (keep) { report.cleanup.push({ templateKey: resource.templateKey, status: 'kept' }); continue }
    try {
      const definitions = await raw('GET', '/api/camunda/process-definition?deploymentId=' + encodeURIComponent(resource.deploymentId))
      assert.ok(resource.templateKey.startsWith(prefix)); assert.ok(definitions.some(d => d.id === resource.processDefinitionId && d.key === resource.templateKey && d.tenantId === tenant))
      const r = await fetch(base + '/api/v1/template/' + encodeURIComponent(resource.templateKey), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error('Template cleanup: ' + r.status)
      await raw('DELETE', '/api/camunda/deployment/' + encodeURIComponent(resource.deploymentId) + '?cascade=true&skipCustomListeners=true&skipIoMappings=true')
      report.cleanup.push({ templateKey: resource.templateKey, deploymentId: resource.deploymentId, status: 'cleaned', retained: 'business instance rows / template history may remain by backend contract' })
    } catch (error) { report.cleanup.push({ templateKey: resource.templateKey, deploymentId: resource.deploymentId, status: 'failed', error: error.message }) }
  }
  report.ok = !report.failure && report.scenarios.every(s => s.status === 'passed') && report.cleanup.every(c => c.status !== 'failed')
  await mkdir(directory, { recursive: true }); const filename = resolve(directory, prefix + '.json'); await writeFile(filename, JSON.stringify(report, null, 2)); console.log('Report: ' + filename)
  if (!report.ok) process.exitCode = 1
}
