import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkflowClient, WorkflowClientError } from '@workflow/sdk/client'
import { defineWorkflow, sequence, approval } from '@workflow/sdk/definition'
import { inspectWriteOutcome } from '../examples/write-recovery.mjs'

const definition = defineWorkflow({ key: 'project', name: '项目' }, sequence(approval('review'), approval('archive')))
const task = { id: 'task/1', processInstanceId: 'instance', processDefinitionId: 'definition-v1', taskDefinitionKey: 'review' }
const rule = (name, nodeId, nodeType, source, type = 'String', required = false, fieldKey) => ({ name, nodeId, nodeType, source, type, required, ...(fieldKey ? { fieldKey } : {}) })
const assignee = rule('review_assignee', 'review', 'approval', 'start', 'String', true)
const approved = rule('review_approved', 'review', 'approval', 'complete', 'Boolean', true)
const archive = rule('archive_assignee', 'archive', 'approval', 'start', 'String', true)
const passed = rule('review_passed', 'review', 'approval', 'engine', 'Boolean')
const snapshot = { templateKey: 'project', templateName: '项目', version: 1, deploymentId: 'deployment', processDefinitionId: task.processDefinitionId, globalVariables: [assignee, approved, archive, passed], displayJson: definition.toJSON() }
const requirements = { currentComplete: [approved], gatewayDecision: [], nextStartHints: [archive], nextGateway: null }
const ok = (data, status = 200) => ({ status, body: { code: 'OK', data, message: '' } })
function fixture(overrides = {}) {
  const calls = []
  const client = createWorkflowClient({ request: async request => {
    calls.push(request)
    if (overrides[request.path]) return overrides[request.path](request)
    if (request.path === '/bpmn/json2xml') return ok({ bpmnXml: '<bpmn:definitions />' })
    if (request.path === '/template') return ok({ ...snapshot, startable: true }, 201)
    if (request.path === '/template/project' || request.path.includes('/history/1')) return ok(snapshot)
    if (request.path.endsWith('/start-variables')) return ok([assignee])
    if (request.path.endsWith('/required-variables')) return ok(requirements)
    if (request.path === '/task/instances/start') return ok({ templateKey: 'project', businessKey: 'business', processInstanceId: 'instance', processDefinitionId: task.processDefinitionId }, 201)
    if (request.path.endsWith('/complete') || request.path.endsWith('/refuse') || request.path.endsWith('/reassign')) return ok({ taskId: task.id, status: 'completed' })
    throw new Error('Unexpected path ' + request.path)
  } })
  return { client, calls }
}
const code = expected => error => error instanceof WorkflowClientError && error.code === expected

test('compile/publish share standard input and multipart omits startable and preserves model snapshot', async () => {
  const { client, calls } = fixture()
  assert.equal(calls.length, 0)
  const compiled = await client.compile(definition.toJSON())
  const published = await client.publish(definition)
  assert.equal(published.templateVersion, 1)
  const multipart = calls.at(-1).body
  assert.equal(multipart.has('startable'), false)
  assert.equal(multipart.get('template-key'), 'project')
  assert.equal(multipart.get('file').type, 'application/xml')
  assert.equal(await multipart.get('file').text(), compiled.bpmnXml)
  assert.deepEqual(JSON.parse(multipart.get('display-json')), definition.toJSON())
  assert.equal(calls.at(-1).headers, undefined)
  assert.equal(published.startable, true)
  assert.ok(!calls.some(call => call.path.includes('/start')))
})

test('publish retains backend startability and accepts only compatible legacy options before I/O', async () => {
  const { client, calls } = fixture({ '/template': () => ok({ ...snapshot, startable: false }, 201) })
  const published = await client.publish(definition, { startable: true })
  assert.equal(published.startable, false)
  assert.equal(published.deploymentId, snapshot.deploymentId)
  assert.equal(calls.at(-1).body.has('startable'), false)
  assert.equal(calls.filter(call => call.path === '/template').length, 1)
  const unsupported = fixture()
  await assert.rejects(unsupported.client.publish(definition, { startable: false }), error => error.code === 'UNSUPPORTED_PUBLISH_OPTION' && error.operation === 'publish' && error.phase === 'parameters' && error.effect === 'none')
  await assert.rejects(unsupported.client.publish(definition, { startable: 'false' }), code('INVALID_ARGUMENT'))
  assert.equal(unsupported.calls.length, 0)
  const failedCompile = fixture({ '/bpmn/json2xml': () => ({ status: 422, body: { code: 'INVALID_MODEL', message: 'invalid' } }) })
  await assert.rejects(failedCompile.client.publish(definition), error => error.code === 'INVALID_MODEL' && error.operation === 'publish' && error.phase === 'compile' && error.effect === 'none')
  assert.equal(failedCompile.calls.length, 1)
  const controller = new AbortController()
  const cancelled = fixture({ '/bpmn/json2xml': () => { controller.abort(); return ok({ bpmnXml: '<definitions />' }) } })
  await assert.rejects(cancelled.client.publish(definition, { signal: controller.signal }), code('CANCELLED'))
  assert.ok(!cancelled.calls.some(call => call.path === '/template'))
})

test('start maps only declared node fields; later candidates are optional and JSON values survive', async () => {
  const { client, calls } = fixture()
  const values = { no: false, zero: 0, nil: null, empty: [], object: { a: 1 }, skip: undefined }
  await client.start('project', { businessKey: 'business', nodes: { review: { assignee: 'alice' } }, variables: values, predecessorConstraint: false })
  assert.deepEqual(calls.at(-1).body, { templateKey: 'project', businessKey: 'business', variables: { no: false, zero: 0, nil: null, empty: [], object: { a: 1 }, review_assignee: 'alice' }, predecessorConstraint: false })
  assert.ok(!calls.some(c => c.path.includes('_biz')))
  await assert.rejects(client.start('project', { businessKey: 'b', nodes: { review: { anything: true } } }), code('PARAMETER_MAPPING_UNAVAILABLE'))
  await assert.rejects(client.start('project', { businessKey: 'b', nodes: { review: { assignee: 'a' } }, variables: { review_assignee: 'a' } }), code('PARAMETER_CONFLICT'))
  await assert.rejects(client.start('project', { businessKey: 'b', variables: { review_passed: false } }), code('PARAMETER_READ_ONLY'))
})

test('one completion writes decision, original form fields, and following node parameters', async () => {
  const { client, calls } = fixture()
  await client.complete(task, { decision: 'reject', fields: { comment: '拒绝', amount: 0, checked: false, tags: [], meta: {}, nil: null }, nodes: { archive: { assignee: 'bob' } } })
  assert.deepEqual(calls.at(-1).body.variables, { review_approved: { value: false }, comment: { value: '拒绝' }, amount: { value: 0 }, checked: { value: false }, tags: { value: [] }, meta: { value: {} }, nil: { value: null }, archive_assignee: { value: 'bob' } })
  assert.equal(calls.filter(c => c.method === 'POST').length, 1)
  await assert.rejects(client.complete(task, { decision: 'agree', fields: { review_approved: true } }), code('PARAMETER_CONFLICT'))
  await assert.rejects(client.complete(task, { fields: { collision: 0 }, variables: { collision: 0 } }), code('PARAMETER_CONFLICT'))
  await assert.rejects(client.complete(task, { decision: 'agree', variables: { review_passed: false } }, { templateSnapshot: { ...snapshot, templateVersion: 1 } }), code('PARAMETER_READ_ONLY'))
})

test('public countersign vote and exact fieldKey mapping do not split underscored activity IDs', async () => {
  const vote = rule('vote', 'outer_inner_review', 'countersign', 'complete', 'String', true)
  const next = rule('backend_exact_name', 'next_node', 'approval', 'start', 'String', true, 'assignee')
  const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [vote], nextStartHints: [next] }) })
  await client.complete({ ...task, taskDefinitionKey: vote.nodeId }, { decision: 'reject', nodes: { next_node: { assignee: 'bob' } } })
  assert.deepEqual(calls.at(-1).body.variables, { vote: { value: 'reject' }, backend_exact_name: { value: 'bob' } })
})

test('current human passed rules map both decisions and validate only the chosen branch in one write', async () => {
  const input = rule('review_passed', 'review', 'approval', 'complete', 'Boolean', true)
  const nextGateway = { gatewayId: 'route', decisionMode: 'boolean', decisionVariable: input, branches: [
    { value: 'pass', decisionValue: true, variables: [archive] },
    { value: 'reject', decisionValue: false, variables: [] },
  ] }
  for (const decision of ['agree', 'reject']) {
    const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [input], gatewayDecision: [input], nextGateway }) })
    const currentSnapshot = { ...snapshot, globalVariables: [assignee, input, archive] }
    if (decision === 'agree') await assert.rejects(client.complete(task, { decision }, { templateSnapshot: currentSnapshot }), code('PARAMETER_REQUIRED'))
    await client.complete(task, { decision, fields: { checked: false, amount: 0 }, ...(decision === 'agree' ? { nodes: { archive: { assignee: 'bob' } } } : {}) }, { templateSnapshot: currentSnapshot })
    assert.deepEqual(calls.at(-1).body.variables, { checked: { value: false }, amount: { value: 0 }, review_passed: { value: decision === 'agree' }, ...(decision === 'agree' ? { archive_assignee: { value: 'bob' } } : {}) })
    assert.equal(calls.filter(call => call.method === 'POST').length, 1)
    assert.ok(!calls.some(call => call.path.startsWith('/template')))
    for (const source of ['variables', 'fields']) await assert.rejects(client.complete(task, { decision, [source]: { review_passed: false } }), code('PARAMETER_CONFLICT'))
    await assert.rejects(client.complete(task, { decision, nodes: { review: { passed: false } } }), code('PARAMETER_CONFLICT'))
  }
})

test('current countersign passed is a Boolean personal vote with exact nested activity mapping', async () => {
  for (const fieldKey of [undefined, 'passed']) {
    const input = rule(fieldKey ? 'backend_vote_input' : 'outer_inner_review_passed', 'outer_inner_review', 'countersign', 'complete', 'Boolean', true, fieldKey)
    const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [input] }) })
    for (const decision of ['agree', 'reject']) {
      await client.complete({ ...task, taskDefinitionKey: input.nodeId }, { decision })
      assert.deepEqual(calls.at(-1).body.variables, { [input.name]: { value: decision === 'agree' } })
    }
    await client.complete({ ...task, taskDefinitionKey: input.nodeId }, { nodes: { [input.nodeId]: { passed: false } } })
    assert.deepEqual(calls.at(-1).body.variables, { [input.name]: { value: false } })
    if (fieldKey) await assert.rejects(client.complete({ ...task, taskDefinitionKey: input.nodeId }, { variables: { outer_inner_review_passed: false } }), code('PARAMETER_READ_ONLY'))
    await assert.rejects(client.complete({ ...task, taskDefinitionKey: input.nodeId }, { variables: { [input.name]: 'reject' } }), code('PARAMETER_TYPE'))
  }
})

test('passed inputs keep service, engine and other human task results protected', async () => {
  for (const input of [
    rule('review_passed', 'review', 'approval', 'engine', 'Boolean'),
    rule('invoke_passed', 'invoke', 'service', 'complete', 'Boolean'),
    rule('worker_result', 'invoke', 'service', 'complete', 'Boolean', false, 'passed'),
    rule('archive_passed', 'archive', 'approval', 'complete', 'Boolean'),
  ]) {
    const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [], nextStartHints: [input] }) })
    await assert.rejects(client.complete(task, { variables: { [input.name]: false } }), code(input.nodeId === 'archive' ? 'PARAMETER_STAGE' : 'PARAMETER_READ_ONLY'))
    assert.ok(!calls.some(call => call.method === 'POST'))
  }
})

test('ambiguous, undeclared or wrong-stage decision contracts never cause a write', async () => {
  for (const inputs of [
    [approved, rule('review_passed', 'review', 'approval', 'complete', 'Boolean', true)],
    [rule('review_passed', 'review', 'approval', 'start', 'Boolean')],
    [rule('review_passed', 'review', 'approval', 'complete', 'String')],
    [rule('unknown', 'review', 'approval', 'complete', 'Boolean')],
  ]) {
    const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: inputs }) })
    await assert.rejects(client.complete(task, { decision: 'agree' }), code('PARAMETER_MAPPING_UNAVAILABLE'))
    assert.ok(!calls.some(call => call.method === 'POST'))
  }
})

test('matching snapshots protect fixed node values and shared vote belongs to the current task', async () => {
  const fixedModel = definition.toJSON()
  fixedModel.nodes.find(n => n.id === 'review').assignee = 'fixed-user'
  const { client } = fixture({ '/template/project': () => ok({ ...snapshot, displayJson: fixedModel }) })
  await assert.rejects(client.start('project', { businessKey: 'b', variables: { review_assignee: 'override' } }), code('PARAMETER_READ_ONLY'))
  const currentVote = rule('vote', 'first_sign', 'countersign', 'complete', 'String', true)
  const secondVote = rule('vote', 'second_sign', 'countersign', 'complete', 'String', true)
  const multi = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [currentVote] }) })
  await multi.client.complete({ ...task, taskDefinitionKey: 'first_sign' }, { decision: 'agree' }, { templateSnapshot: { ...snapshot, globalVariables: [currentVote, secondVote] } })
  assert.deepEqual(multi.calls.at(-1).body.variables.vote, { value: 'agree' })
})

test('explicit null cannot be replaced by a declared default, and branch unions remain hints', async () => {
  const { client } = fixture({ '/template/project/start-variables': () => ok([{ ...assignee, value: 'default' }]) })
  await assert.rejects(client.start('project', { businessKey: 'b', variables: { review_assignee: null } }), code('PARAMETER_REQUIRED'))
  const branch = fixture({ '/template/project': () => ok({ ...snapshot, displayJson: { processId: 'project', nodes: [{ id: 's', type: 'start' }, { id: 'g', type: 'condition' }], flows: [{ source: 's', target: 'g' }] } }), '/template/project/start-variables': () => ok([assignee, archive]) })
  const req = await branch.client.getStartRequirements('project')
  assert.equal(req.required.length, 0); assert.equal(req.hints.length, 2)
  const noTopology = fixture({ '/template/project': () => ok({ ...snapshot, displayJson: null }), '/template/project/start-variables': () => ({ status: 404, body: { code: 'NOT_FOUND', message: 'not implemented' } }) })
  assert.equal((await noTopology.client.getStartRequirements('project')).required.length, 0)
})

test('starting across a publish race returns the created instance and diagnoses its actual version', async () => {
  const { client, calls } = fixture({ '/task/instances/start': () => ok({ templateKey: 'project', businessKey: 'b', processInstanceId: 'created-once', processDefinitionId: 'v2' }, 201) })
  const result = await client.start('project', { businessKey: 'b', variables: { review_assignee: 'a' } })
  assert.equal(result.processInstanceId, 'created-once')
  assert.ok(result.diagnostics.some(i => i.code === 'START_VERSION_CHANGED'))
  assert.equal(calls.filter(c => c.method === 'POST').length, 1)
})

test('known status branch requirements validate only the selected branch without submitting others', async () => {
  const status = rule('route_status', 'route', 'condition', 'complete', 'String', true, 'status')
  const chosen = rule('finance_assignee', 'finance', 'approval', 'start', 'String', true)
  const other = rule('legal_assignee', 'legal', 'approval', 'start', 'String', true)
  const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({
    currentComplete: [], gatewayDecision: [status], nextStartHints: [chosen, other],
    nextGateway: { gatewayId: 'route', decisionMode: 'status', decisionVariable: status, branches: [
      { value: 'finance', decisionValue: 'finance', variables: [chosen] },
      { value: 'legal', decisionValue: 'legal', variables: [other] },
    ] },
  }) })
  await assert.rejects(client.complete(task, { nodes: { route: { status: 'finance' } } }), code('PARAMETER_REQUIRED'))
  await client.complete(task, { nodes: { route: { status: 'finance' }, finance: { assignee: 'bob' } } })
  assert.deepEqual(calls.at(-1).body.variables, { route_status: { value: 'finance' }, finance_assignee: { value: 'bob' } })
})

test('old task snapshots must exactly match and latest templates are never consulted', async () => {
  const { client, calls } = fixture()
  await assert.rejects(client.complete(task, { decision: 'agree' }, { templateSnapshot: { ...snapshot, processDefinitionId: 'v2' } }), code('TEMPLATE_VERSION_MISMATCH'))
  assert.equal(calls.length, 0)
  await client.complete(task, { decision: 'agree' })
  assert.ok(!calls.some(c => c.path.startsWith('/template')))
  const ambiguous = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [] }) })
  await assert.rejects(ambiguous.client.complete(task, { decision: 'agree' }), code('PARAMETER_MAPPING_UNAVAILABLE'))
})

test('transport keeps business errors, uncertain effects, compile context, cancellation, and never retries', async () => {
  const bad = fixture({ '/template': () => ({ status: 503, body: { code: 'DOWN', message: 'unavailable' } }) })
  await assert.rejects(bad.client.publish(definition), e => e.code === 'DOWN' && e.httpStatus === 503 && e.effect === 'unknown' && e.phase === 'publish' && !!e.resources.compilation)
  assert.equal(bad.calls.filter(c => c.path === '/template').length, 1)
  const business = fixture({ '/bpmn/json2xml': () => ({ status: 200, body: { code: 'INVALID_MODEL', message: 'wrong' } }) })
  await assert.rejects(business.client.publish(definition), e => e.code === 'INVALID_MODEL' && e.operation === 'publish' && e.effect === 'none')
  const malformed = fixture({ '/template': () => ok({ templateKey: 'project' }, 201) })
  await assert.rejects(malformed.client.publish(definition), e => e.code === 'PROTOCOL_ERROR' && e.effect === 'confirmed' && e.httpStatus === 201 && e.resources.templateKey === 'project')
  const cancelled = new AbortController(); cancelled.abort(new Error('cancelled'))
  const fresh = fixture()
  await assert.rejects(fresh.client.compile(definition, { signal: cancelled.signal }), code('CANCELLED'))
  assert.equal(fresh.calls.length, 0)
  const timeout = createWorkflowClient({ timeoutMs: 8, request: () => new Promise(() => {}) })
  await assert.rejects(timeout.compile(definition), code('TIMEOUT'))
  const invalid = [1n, NaN, Infinity, () => {}, new Date(), { cycle: null }]
  invalid.at(-1).cycle = invalid.at(-1)
  for (const value of invalid) await assert.rejects(fresh.client.start('project', { businessKey: 'b', variables: { value } }), code('INVALID_JSON_VALUE'))
})

test('progress keeps terminal distinctions, history repetitions, offsets, and targeted message wrappers', async () => {
  const rows = [{ id: 'h1', activityId: 'review', processInstanceId: 'instance' }, { id: 'h2', activityId: 'review', processInstanceId: 'instance' }]
  const { client, calls } = fixture({
    '/tasks': () => ok([task]),
    '/history/activity-instances': () => ok(rows),
    '/process-instances/instance/activity-status': () => ok({ processInstanceId: 'instance', processDefinitionId: 'v1', state: 'INTERNALLY_TERMINATED', activeNodes: [], completedNodes: [] }),
    '/messages': () => ok({ messageName: 'received', status: 'correlated' }),
  })
  assert.equal((await client.listTasks({ offset: 20, limit: 5 })).total, undefined)
  assert.deepEqual(calls.at(-1).query, { firstResult: 20, maxResults: 5 })
  assert.equal((await client.getProgress('instance')).state, 'INTERNALLY_TERMINATED')
  assert.deepEqual((await client.listHistory('instance', { offset: 3, limit: 2 })).items, rows)
  await assert.rejects(client.sendMessage({ messageName: 'received' }), code('MESSAGE_TARGET_REQUIRED'))
  await client.sendMessage({ messageName: 'received', processInstanceId: 'instance', variables: { checked: false }, correlationKeys: { amount: 0 } })
  assert.deepEqual(calls.at(-1).body.variables, { checked: { value: false } })
  assert.deepEqual(calls.at(-1).body.correlationKeys, { amount: { value: 0 } })
})

test('malformed successful responses retain HTTP status, resource, phase, and confirmed write context', async () => {
  const malformed = fixture({
    '/messages': () => ok({}, 202),
    '/tasks/task%2F1/bizForm': () => ok({ type: 'unknown' }, 200),
    '/template/project/history/1': () => ok({ ...snapshot, version: 2 }, 200),
    '/history/activity-instances': () => ok([{ id: 'row', activityId: 'review', processInstanceId: 'other' }], 200),
  })
  await assert.rejects(malformed.client.sendMessage({ messageName: 'received', processInstanceId: 'instance' }), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 202 && e.phase === 'message' && e.effect === 'confirmed' && e.resources.processInstanceId === 'instance')
  await assert.rejects(malformed.client.getTaskForm(task), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 200 && e.resources.taskId === task.id && e.effect === 'none')
  await assert.rejects(malformed.client.getTemplateVersion('project', 1), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 200 && e.resources.templateVersion === 1)
  await assert.rejects(malformed.client.listHistory('instance'), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 200 && e.resources.processInstanceId === 'instance')
  const primitive = fixture({ '/messages': () => ok(null, 202) })
  await assert.rejects(primitive.client.sendMessage({ messageName: 'received', businessKey: 'business' }), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 202 && e.effect === 'confirmed')
  const nested = fixture({ '/template': () => ok({ ...snapshot, globalVariables: 'invalid' }, 201) })
  await assert.rejects(nested.client.publish(definition), e => e.code === 'PROTOCOL_ERROR' && e.httpStatus === 201 && e.phase === 'publish' && e.effect === 'confirmed' && e.resources.templateKey === 'project')
  const preflight = fixture({ '/template/project': () => ({ status: 403, body: { code: 'DENIED', message: 'forbidden' } }) })
  await assert.rejects(preflight.client.start('project', { businessKey: 'business' }), e => e.operation === 'start' && e.phase === 'requirements' && e.httpStatus === 403 && e.effect === 'none' && e.resources.businessKey === 'business')
})

test('task queries preserve filters, offsets and encoded identities without inventing totals or completion', async () => {
  const key = '项目/a ?#'
  const id = '实例/a ?#'
  const encodedTask = { ...task, id: '任务/a ?#' }
  const { client, calls } = fixture({
    '/tasks': () => ok({ items: [encodedTask] }),
    ['/template/' + encodeURIComponent(key)]: () => ok({ ...snapshot, templateKey: key }),
    ['/tasks/' + encodeURIComponent(encodedTask.id) + '/bizForm']: () => ok({ type: 'none', data: null }),
    ['/process-instances/' + encodeURIComponent(id) + '/activity-status']: () => ok({ processInstanceId: id, processDefinitionId: 'v1', state: 'ACTIVE', activeNodes: [{ activityId: 'wait' }], completedNodes: [] }),
  })
  const page = await client.listTasks({ processInstanceId: id, assignee: '张 三&?', offset: 7, limit: 3 })
  assert.deepEqual(page, { items: [encodedTask], offset: 7, limit: 3 })
  assert.deepEqual(calls.at(-1).query, { processInstanceId: id, assignee: '张 三&?', firstResult: 7, maxResults: 3 })
  await client.getTemplate(key); assert.equal(calls.at(-1).path, '/template/' + encodeURIComponent(key))
  await client.getTaskForm(encodedTask); assert.equal(calls.at(-1).path, '/tasks/' + encodeURIComponent(encodedTask.id) + '/bizForm')
  const progress = await client.getProgress(id)
  assert.equal(progress.state, 'ACTIVE'); assert.deepEqual(progress.activeNodes, [{ activityId: 'wait' }])
  for (const query of [{ offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: NaN }]) await assert.rejects(client.listTasks(query), code('INVALID_ARGUMENT'))
})

test('query cancellation aborts the injected transport and a timed out query keeps its context', async () => {
  for (const mode of ['cancel', 'timeout']) {
    const controller = new AbortController()
    let transportedSignal
    const client = createWorkflowClient({ request: input => {
      transportedSignal = input.signal
      if (mode === 'cancel') controller.abort()
      return new Promise(() => {})
    } })
    await assert.rejects(client.listTasks({}, { signal: controller.signal, timeoutMs: 10 }), error => {
      assert.equal(error.code, mode === 'cancel' ? 'CANCELLED' : 'TIMEOUT')
      assert.equal(error.operation, 'listTasks'); assert.equal(error.phase, 'query'); assert.equal(error.effect, 'none')
      return true
    })
    assert.equal(transportedSignal.aborted, true)
  }
  const controller = new AbortController(); controller.abort()
  const fresh = fixture()
  await assert.rejects(fresh.client.listTasks({}, { signal: controller.signal }), code('CANCELLED'))
  assert.equal(fresh.calls.length, 0)
})

test('start and complete distinguish cancellation and timeouts before and after dispatching writes', async () => {
  for (const operation of ['start', 'complete']) for (const phase of ['requirements', operation]) for (const mode of ['cancel', 'timeout']) {
    const controller = new AbortController()
    const path = phase === 'requirements' ? (operation === 'start' ? '/template/project' : '/tasks/task%2F1/required-variables') : (operation === 'start' ? '/task/instances/start' : '/tasks/task%2F1/complete')
    const { client, calls } = fixture({ [path]: input => {
      if (mode === 'cancel') controller.abort()
      return new Promise(() => {})
    } })
    const options = { signal: controller.signal, timeoutMs: 12 }
    const promise = operation === 'start' ? client.start('project', { businessKey: 'b', nodes: { review: { assignee: 'a' } } }, options) : client.complete(task, { decision: 'agree' }, options)
    await assert.rejects(promise, error => {
      assert.equal(error.code, mode === 'cancel' ? 'CANCELLED' : 'TIMEOUT')
      assert.equal(error.operation, operation); assert.equal(error.phase, phase)
      assert.equal(error.effect, phase === 'requirements' ? 'none' : 'unknown')
      assert.equal(error.resources[operation === 'start' ? 'businessKey' : 'taskId'], operation === 'start' ? 'b' : task.id)
      return true
    })
    assert.equal(calls.filter(call => call.method === 'POST').length, phase === 'requirements' ? 0 : 1)
    assert.equal(calls.at(-1).signal.aborted, true)
  }
})

test('start and complete keep business failures and malformed response context without retrying', async () => {
  for (const operation of ['start', 'complete']) for (const [response, expectedCode, effect] of [
    [{ status: 409, body: { code: 'BUSINESS_KEY_EXISTS', message: 'duplicate' } }, 'BUSINESS_KEY_EXISTS', 'none'],
    [{ status: 200, body: { code: 'BUSINESS_REJECTED', message: 'rejected' } }, 'BUSINESS_REJECTED', 'unknown'],
    [ok({}, 201), 'PROTOCOL_ERROR', 'confirmed'],
  ]) {
    const path = operation === 'start' ? '/task/instances/start' : '/tasks/task%2F1/complete'
    const { client, calls } = fixture({ [path]: () => response })
    const promise = operation === 'start' ? client.start('project', { businessKey: 'b', nodes: { review: { assignee: 'a' } } }) : client.complete(task, { decision: 'agree' })
    await assert.rejects(promise, error => {
      assert.equal(error.code, expectedCode); assert.equal(error.effect, effect); assert.equal(error.httpStatus, response.status)
      assert.equal(error.operation, operation); assert.equal(error.phase, operation)
      assert.equal(error.resources[operation === 'start' ? 'businessKey' : 'taskId'], operation === 'start' ? 'b' : task.id)
      return true
    })
    assert.equal(calls.filter(call => call.method === 'POST').length, 1)
  }
})

test('executed start and complete with lost responses can be inspected through queries without a second write', async () => {
  let live = [], writes = 0
  const history = []
  const next = { ...task, id: 'next', taskDefinitionKey: 'archive' }
  const { client, calls } = fixture({
    '/task/instances/start': () => { writes++; live = [task]; throw new Error('response lost after creating instance') },
    '/tasks': () => ok(live),
    '/tasks/task%2F1/complete': () => {
      writes++; live = [next]
      history.push({ id: 'history-1', taskId: task.id, activityId: 'review', processInstanceId: 'instance', endTime: '2026-11-17T00:00:00Z' })
      throw new Error('response lost after completing task')
    },
    '/history/activity-instances': () => ok(history),
    '/process-instances/instance/activity-status': () => ok({ processInstanceId: 'instance', processDefinitionId: 'definition-v1', state: 'ACTIVE', activeNodes: [{ activityId: live[0].taskDefinitionKey }], completedNodes: [] }),
  })
  let startError, completeError
  await assert.rejects(client.start('project', { businessKey: 'b', nodes: { review: { assignee: 'a' } } }), error => { startError = error; return error.effect === 'unknown' && error.phase === 'start' })
  const startOutcome = await inspectWriteOutcome(client, startError)
  assert.deepEqual(startOutcome.candidates.items, [task])
  assert.equal(startOutcome.requiresBusinessKeyReconciliation, true)
  assert.equal(writes, 1)
  await assert.rejects(client.complete(task, { decision: 'agree' }), error => { completeError = error; return error.effect === 'unknown' && error.phase === 'complete' && error.resources.taskId === task.id })
  const completeOutcome = await inspectWriteOutcome(client, completeError)
  assert.deepEqual(completeOutcome.tasks.items, [next])
  assert.equal(completeOutcome.history.items[0].taskId, task.id)
  assert.equal(completeOutcome.progress.state, 'ACTIVE')
  assert.equal(writes, 2)
  assert.equal(calls.filter(call => call.method === 'POST').length, 2)
})

test('dynamic start decisions reach the requirements endpoint while branch candidates stay optional', async () => {
  const branchDefinition = defineWorkflow({ key: 'project' }, sequence(approval('review'))).toJSON()
  branchDefinition.nodes = [{ id: 's', type: 'start' }, { id: 'route', type: 'condition', statusVariable: 'state' }, { id: 'review', type: 'approval' }]
  branchDefinition.flows = [{ source: 's', target: 'route' }, { source: 'route', target: 'review', branch: 'ready' }]
  const { client, calls } = fixture({ '/template/project': () => ok({ ...snapshot, displayJson: branchDefinition }), '/template/project/start-variables': () => ok([assignee, archive]) })
  const requirements = await client.getStartRequirements('project', { route_status: 'ready', amount: 0, checked: false })
  assert.deepEqual(calls.at(-1).query, { route_status: 'ready', amount: 0, checked: false })
  assert.equal(requirements.required.length, 0)
  assert.equal(requirements.hints.length, 2)
  assert.ok(requirements.diagnostics.some(issue => issue.code === 'START_REQUIREMENTS_HINTS_ONLY'))
  await client.start('project', { businessKey: 'b', variables: { route_status: 'ready', checked: false }, nodes: { review: { assignee: 'a' } } })
  assert.equal(calls.at(-1).body.variables.archive_assignee, undefined)
})

test('message writes preserve no-match, ambiguity, permissions, cancellation and uncertain results', async () => {
  const input = { messageName: 'received', processInstanceId: 'instance' }
  for (const [status, errorCode, effect] of [[404, 'MESSAGE_NOT_FOUND', 'none'], [409, 'MESSAGE_AMBIGUOUS', 'none'], [403, 'FORBIDDEN', 'none'], [500, 'MESSAGE_CORRELATION_FAILED', 'unknown']]) {
    const { client, calls } = fixture({ '/messages': () => ({ status, body: { code: errorCode, message: 'backend result' } }) })
    await assert.rejects(client.sendMessage(input), error => error.code === errorCode && error.httpStatus === status && error.phase === 'message' && error.effect === effect && error.resources.processInstanceId === 'instance')
    assert.equal(calls.length, 1)
  }
  const controller = new AbortController()
  const cancelled = fixture({ '/messages': () => { controller.abort(); return new Promise(() => {}) } })
  await assert.rejects(cancelled.client.sendMessage(input, { signal: controller.signal }), error => error.code === 'CANCELLED' && error.effect === 'unknown' && error.phase === 'message')
  assert.equal(cancelled.calls.length, 1)
  const missingTimer = rule('wait_timerValue', 'wait', 'timer', 'start', 'String', true)
  const timer = fixture({ '/template/project': () => ok({ ...snapshot, globalVariables: [missingTimer] }), '/template/project/start-variables': () => ok([missingTimer]) })
  await assert.rejects(timer.client.start('project', { businessKey: 'b' }), error => error.code === 'PARAMETER_REQUIRED' && error.issues.some(issue => issue.path.includes('wait_timerValue')))
  assert.ok(!timer.calls.some(call => call.method === 'POST'))
})

test('reassignment keeps task references and backend errors and never adds a compensating write', async () => {
  for (const action of ['returnForReassignment', 'reassign']) for (const mode of ['forbidden', 'invalid', 'network', 'cancelled', 'timeout', 'malformed']) {
    const controller = new AbortController()
    const path = '/tasks/task%2F1/' + (action === 'reassign' ? 'reassign' : 'refuse')
    const { client, calls } = fixture({ [path]: () => {
      if (mode === 'forbidden') return { status: 403, body: { code: 'TRANSFER_NOT_ALLOWED', message: 'restricted' } }
      if (mode === 'invalid') return { status: 404, body: { code: 'TASK_NOT_FOUND', message: 'missing' } }
      if (mode === 'network') throw new Error('response lost')
      if (mode === 'malformed') return ok({}, 202)
      if (mode === 'cancelled') controller.abort()
      return new Promise(() => {})
    } })
    const options = { signal: controller.signal, timeoutMs: 10 }
    await assert.rejects(action === 'reassign' ? client.reassign(task, 'new-user', options) : client.returnForReassignment(task, options), error => {
      assert.equal(error.operation, action); assert.equal(error.phase, 'reassignment'); assert.equal(error.resources.taskId, task.id)
      assert.equal(error.resources.processInstanceId, task.processInstanceId)
      assert.equal(error.effect, ['forbidden', 'invalid'].includes(mode) ? 'none' : mode === 'malformed' ? 'confirmed' : 'unknown')
      assert.equal(error.code, { forbidden: 'TRANSFER_NOT_ALLOWED', invalid: 'TASK_NOT_FOUND', network: 'NETWORK_ERROR', cancelled: 'CANCELLED', timeout: 'TIMEOUT', malformed: 'PROTOCOL_ERROR' }[mode])
      return true
    })
    assert.equal(calls.length, 1)
    if (action === 'reassign') assert.deepEqual(calls[0].body, { userId: 'new-user' })
  }
})

test('a lost publish response retains compilation for read-only version reconciliation', async () => {
  let writes = 0, persisted
  const { client } = fixture({ '/template': input => {
    writes++; persisted = { ...snapshot, displayJson: JSON.parse(input.body.get('display-json')) }
    throw new Error('response lost after deployment')
  }, '/template/project': () => ok(persisted) })
  let lost
  await assert.rejects(client.publish(definition), error => {
    lost = error
    return error.effect === 'unknown' && error.phase === 'publish' && error.resources.templateKey === 'project' && !!error.resources.compilation
  })
  const observed = await inspectWriteOutcome(client, lost)
  assert.equal(observed.requiresVersionReconciliation, true)
  assert.equal(observed.current.deploymentId, snapshot.deploymentId)
  assert.equal(writes, 1)
})

test('parameter mapping failures retain task and business context without submitting engine-owned results', async () => {
  const drifted = rule('review_passed', 'review', 'approval', 'complete', 'Boolean', true)
  const { client, calls } = fixture({ '/tasks/task%2F1/required-variables': () => ok({ ...requirements, currentComplete: [drifted], gatewayDecision: [drifted] }) })
  await assert.rejects(client.complete(task, { decision: 'reject' }, { templateSnapshot: snapshot }), error => {
    assert.equal(error.code, 'PARAMETER_READ_ONLY'); assert.equal(error.phase, 'parameters')
    assert.equal(error.resources.taskId, task.id); assert.equal(error.resources.processDefinitionId, task.processDefinitionId)
    assert.equal(error.resources.processInstanceId, task.processInstanceId); assert.equal(error.resources.taskDefinitionKey, task.taskDefinitionKey)
    assert.equal(error.effect, 'none')
    return true
  })
  await assert.rejects(client.complete(task, { variables: { review_passed: false } }, { templateSnapshot: snapshot }), error => error.code === 'PARAMETER_READ_ONLY' && error.resources.taskId === task.id)
  await assert.rejects(client.start('project', { businessKey: 'missing-assignee' }), error => error.code === 'PARAMETER_REQUIRED' && error.resources.businessKey === 'missing-assignee' && error.resources.templateKey === 'project' && error.resources.mappedProcessDefinitionId === task.processDefinitionId)
  assert.ok(!calls.some(call => call.method === 'POST'))
})
