import assert from 'node:assert/strict'
import test from 'node:test'
import { validateWorkflowModel, toBpmnCompilerJson, WorkflowModelError } from '@workflow/sdk'
import { defineWorkflow, sequence, approval, countersign, choice, parallel, service, receive, timer, subProcess, end } from '@workflow/sdk/definition'

test('existing configurable constructors preserve opaque bizJson through nested standard output', () => {
  const bizJson = "  中文 <&> \"review\"\nreview_bizJson: 非 JSON  "
  const model = defineWorkflow({ key: 'business_data' }, sequence(
    approval('review', { bizJson }), countersign('sign', { bizJson }), service('call', { bizJson }),
    receive('receipt', { bizJson }), timer('wait', { bizJson }),
    choice('route', { bizJson, branches: [{ branch: 'a', body: approval('a') }, { branch: 'default', body: approval('b') }] }),
    subProcess('outer', subProcess('inner', approval('review', { bizJson }), { bizJson: '内层' }), { bizJson: '外层' }),
    end('done', { bizJson: '' }),
  )).toJSON()
  for (const id of ['review', 'sign', 'call', 'receipt', 'wait', 'route']) assert.equal(model.nodes.find(node => node.id === id).bizJson, bizJson)
  const outer = model.nodes.find(node => node.id === 'outer')
  assert.equal(outer.bizJson, '外层')
  const inner = outer.process.nodes.find(node => node.id === 'inner')
  assert.equal(inner.bizJson, '内层')
  assert.equal(inner.process.nodes.find(node => node.id === 'review').bizJson, bizJson)
  assert.equal(model.nodes.find(node => node.id === 'done').bizJson, '')
  assert.ok(!Object.hasOwn(model.nodes.find(node => node.type === 'start'), 'bizJson'))
  assert.deepEqual(toBpmnCompilerJson(model), model)
  for (const invalid of [{}, [], null, 1, false]) {
    for (const build of [
      () => approval('bad', { bizJson: invalid }),
      () => defineWorkflow({ key: 'bad' }, subProcess('sub', approval('inner'), { bizJson: invalid })),
      () => defineWorkflow({ key: 'bad' }, choice('c', { bizJson: invalid, branches: [{ branch: 'a', body: approval('a') }, { branch: 'default', body: approval('b') }] })),
    ]) assert.throws(build, error => error instanceof WorkflowModelError && error.issues.some(issue => issue.code === 'field-type'))
  }
})

test('definitions export independent deterministic models and preserve caller options', () => {
  const options = { name: '审核', reminder: { action: 'notify', duration: 'PT1H' } }
  const activity = approval('review', options)
  options.name = 'changed'; options.reminder.duration = 'P2D'
  const definition = defineWorkflow({ key: 'serial', name: '串行' }, sequence(activity, countersign('sign', { mode: 'VOTE', passRate: '.7' })))
  const model = definition.toJSON()
  assert.equal(validateWorkflowModel(model).valid, true)
  assert.equal(model.nodes.find(n => n.id === 'review').name, '审核')
  assert.equal(model.nodes.find(n => n.id === 'review').reminder.duration, 'PT1H')
  assert.equal(model.nodes.find(n => n.id === 'sign').approveMode, 'VOTE')
  assert.deepEqual(model.flows.map(f => [f.source, f.target]), [['review', 'sign'], ['__wf_serial_start', 'review'], ['sign', '__wf_serial_end']])
  model.nodes[0].name = 'mutated'
  assert.notDeepEqual(definition.toJSON(), model)
  assert.deepEqual(definition.toJSON(), defineWorkflow({ key: 'serial', name: '串行' }, sequence(activity, countersign('sign', { mode: 'VOTE', passRate: '.7' }))).toJSON())
  assert.equal(Object.isFrozen(activity.node.reminder), true)
})

test('exclusive branch ends do not continue, all live branches join subsequent activity', () => {
  const model = defineWorkflow({ key: 'decision' }, sequence(approval('review'), choice('result', { branches: [
    { branch: 'pass', body: approval('finance') }, { branch: 'reject', body: end('rejected') },
  ] }), approval('archive'))).toJSON()
  assert.equal(validateWorkflowModel(model).valid, true)
  assert.ok(model.flows.some(f => f.source === 'finance' && f.target === 'archive'))
  assert.ok(!model.flows.some(f => f.source === 'rejected'))
  for (const branches of [
    [{ branch: 'new', body: approval('a') }, { branch: 'default', body: approval('b') }],
    [{ conditionExpression: '${amount > 100}', body: approval('a') }, { branch: 'default', body: approval('b') }],
  ]) assert.equal(validateWorkflowModel(defineWorkflow({ key: 'state' }, choice('route', { statusVariable: 'status', branches })).toJSON()).valid, true)
})

test('parallel forks and joins, nested local IDs, waits, services, and metadata remain standard v1', () => {
  const local = sequence(approval('review', { bizType: 'audit', bizFormKey: 'form:review@1', allowTransfer: false }), timer('wait', { timerValue: 'PT1S' }))
  const definition = defineWorkflow({ key: 'nested' }, sequence(parallel('departments', [
    subProcess('finance', subProcess('inner', local)), subProcess('legal', local),
  ]), receive('receipt', { messageName: 'paid' }), service('notify', { countersign: true, mode: 'ANY', sequential: false })))
  const model = definition.toJSON()
  assert.equal(validateWorkflowModel(model).valid, true)
  assert.deepEqual(model.flows.filter(f => f.target === '__wf_departments_join').map(f => f.source), ['finance', 'legal'])
  assert.equal(model.nodes.find(n => n.id === 'finance').process.nodes.find(n => n.id === 'inner').process.nodes.find(n => n.id === 'review').bizType, 'audit')
  assert.equal(model.nodes.find(n => n.id === 'notify').countersign, true)
})

test('invalid definitions fail with structured diagnostics before I/O', () => {
  const invalid = [
    () => sequence(),
    () => approval('__wf_reserved'),
    () => approval('review', { serviceUrl: 'unexpected' }),
    () => countersign('review', { mode: 'VOTE', passRate: '0' }),
    () => service('svc', { mode: 'ALL' }),
    () => defineWorkflow({ key: 'bad' }, sequence(approval('same'), approval('same'))),
    () => defineWorkflow({ key: 'bad' }, sequence(end('done'), approval('later'))),
    () => defineWorkflow({ key: 'bad' }, parallel('fork', [approval('a'), end('done')])),
    () => defineWorkflow({ key: 'bad' }, parallel('fork', [choice('c', { branches: [{ branch: 'a', body: approval('a') }, { branch: 'default', body: end('done') }] }), approval('b')])),
    () => defineWorkflow({ key: 'bad' }, choice('c', { branches: [{ branch: 'pass', body: approval('a') }, { branch: 'reject', body: approval('b') }] })),
    () => defineWorkflow({ key: 'bad' }, subProcess('sub', approval('inner', { reminder: { action: 'return', target: 'outside' } }))),
    () => choice('c', { branches: [{ branch: 'default', body: end('a') }, { branch: 'default', body: end('b') }] }),
  ]
  for (const build of invalid) assert.throws(build, error => error instanceof WorkflowModelError && error.issues.some(i => i.severity === 'error'))
})

test('nested parallel branches join each level before continuing in caller order', () => {
  const make = () => defineWorkflow({ key: 'nested_parallel' }, sequence(parallel('outer', [
    sequence(parallel('inner', [approval('finance'), approval('legal')]), approval('manager')),
    approval('audit'),
  ]), approval('archive'))).toJSON()
  const model = make()
  assert.deepEqual(model, make())
  assert.equal(validateWorkflowModel(model).valid, true)
  const incoming = id => model.flows.filter(flow => flow.target === id).map(flow => flow.source)
  const outgoing = id => model.flows.filter(flow => flow.source === id).map(flow => flow.target)
  assert.deepEqual(outgoing('outer'), ['inner', 'audit'])
  assert.deepEqual(outgoing('inner'), ['finance', 'legal'])
  assert.deepEqual(incoming('__wf_inner_join'), ['finance', 'legal'])
  assert.deepEqual(outgoing('__wf_inner_join'), ['manager'])
  assert.deepEqual(incoming('__wf_outer_join'), ['manager', 'audit'])
  assert.deepEqual(outgoing('__wf_outer_join'), ['archive'])
})
