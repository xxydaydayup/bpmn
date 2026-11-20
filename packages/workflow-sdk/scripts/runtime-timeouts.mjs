import assert from 'node:assert/strict'
import * as d from '@workflow/sdk/definition'

/** Engine-owned boundary actions; notification delivery needs a separate receiver. */
export async function checkTimeouts({ sdk, scenario, publish, start, tasks, taskAt, finish, raw, report, until }) {
  const history = instance => sdk.listHistory(instance.processInstanceId, { limit: 300 }).then(page => page.items)
  const historicTasks = instance => raw('GET', '/api/camunda/history/task?processInstanceId=' + instance.processInstanceId)
  const variables = instance => raw('GET', '/api/camunda/history/variable-instance?processInstanceId=' + instance.processInstanceId)
  const capture = evidence => { report.scenarios.at(-1).evidence = evidence; return evidence }
  async function deployed(template, timerId) {
    const xml = await raw('GET', '/api/camunda/process-definition/' + encodeURIComponent(template.processDefinitionId) + '/xml')
    assert.ok(xml.bpmn20Xml.includes(timerId), 'Backend must derive the boundary timer')
    assert.ok(!JSON.stringify(template.displayJson).includes(timerId), 'Derived timers must stay out of the business model')
    return { model: template.displayJson, xml: xml.bpmn20Xml }
  }
  function cancelled(rows, ids) {
    for (const id of ids) assert.ok(rows.some(t => t.id === id && t.endTime && t.deleteReason !== 'completed'), 'Timed out task must be cancelled: ' + id)
  }
  async function originalFields(instance, expected) {
    const rows = await variables(instance)
    for (const [name, value] of Object.entries(expected)) assert.deepEqual(rows.find(v => v.name === name)?.value, value)
    assert.ok(!rows.some(v => v.name.endsWith('_comment')), 'Business field keys must remain unprefixed')
    return rows
  }

  for (const nested of [false, true]) await scenario(nested ? 'timeout-nested-return' : 'timeout-runtime-return', async () => {
    const local = d.sequence(d.approval('first_step'), d.approval('review_step', { reminder: { action: 'return', target: 'first_step' } }))
    const body = nested ? d.sequence(d.subProcess('outer_box', d.subProcess('inner_zone', local)), d.approval('archive')) : d.sequence(local, d.approval('archive'))
    const firstId = 'first_step', reviewId = 'review_step'
    const template = await publish(nested ? 'timeout_nested_return' : 'timeout_runtime_return', body)
    const evidence = capture({ compiled: await deployed(template, reviewId + '_reminderTimer') })
    const nodes = { [firstId]: { assignee: 'sdk-first' }, [reviewId]: { assignee: 'sdk-review', reminderDuration: 'PT4S' }, archive: { assignee: 'sdk-archive' } }
    const instance = await start(template, nodes); evidence.instance = instance
    const first = await taskAt(instance, firstId)
    const fields = { comment: nested ? '子流程原 key' : '超时原 key', amount: 0, checked: false }
    await sdk.complete(first, { fields, nodes }, { templateSnapshot: template })
    const review = await taskAt(instance, reviewId); evidence.initial = { first, review, progress: await sdk.getProgress(instance.processInstanceId) }
    const again = await taskAt(instance, firstId); evidence.returned = again
    assert.notEqual(again.id, first.id); assert.equal(again.assignee, 'sdk-first')
    evidence.afterReturn = { tasks: await tasks(instance), history: await history(instance), historicTasks: await historicTasks(instance), progress: await sdk.getProgress(instance.processInstanceId) }
    assert.deepEqual(evidence.afterReturn.tasks.map(t => t.taskDefinitionKey), [firstId])
    assert.equal(evidence.afterReturn.progress.state, 'ACTIVE')
    cancelled(evidence.afterReturn.historicTasks, [review.id])
    assert.ok(!evidence.afterReturn.history.some(h => h.activityId === 'archive'))
    evidence.variables = await originalFields(instance, fields)
    await sdk.complete(again, { nodes: { [reviewId]: { reminderDuration: 'PT30S' } } }, { templateSnapshot: template })
    const recovered = await taskAt(instance, reviewId); assert.notEqual(recovered.id, review.id)
    await sdk.complete(recovered, {}, { templateSnapshot: template })
    await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
    Object.assign(evidence, await finish(instance, [firstId, reviewId, 'archive']))
    return evidence
  })

  for (const kind of ['subprocess', 'countersign']) await scenario('timeout-' + kind + '-return', async () => {
    const waiting = kind === 'subprocess'
      ? d.subProcess('waiting_box', d.parallel('teams', [d.approval('finance'), d.approval('legal')]), { reminder: { action: 'return', target: 'first_step' } })
      : d.countersign('waiting_box', { mode: 'ALL', reminder: { action: 'return', target: 'first_step' } })
    const template = await publish('timeout_' + kind + '_return', d.sequence(d.approval('first_step'), waiting, d.approval('archive')))
    const evidence = capture({ compiled: await deployed(template, 'waiting_box_reminderTimer') })
    const nodes = { first_step: { assignee: 'sdk-first' }, waiting_box: { reminderDuration: 'PT4S', ...(kind === 'countersign' ? { approverList: ['sdk-a', 'sdk-b', 'sdk-c'] } : {}) }, ...(kind === 'subprocess' ? { finance: { assignee: 'sdk-finance' }, legal: { assignee: 'sdk-legal' } } : {}), archive: { assignee: 'sdk-archive' } }
    const instance = await start(template, nodes); evidence.instance = instance
    const first = await taskAt(instance, 'first_step')
    await sdk.complete(first, { fields: { comment: kind + ' cancellation', checked: false }, nodes }, { templateSnapshot: template })
    const initial = await until(() => tasks(instance), rows => rows.length === (kind === 'subprocess' ? 2 : 3))
    evidence.initial = initial
    assert.ok(initial.every(t => kind === 'subprocess' ? ['finance', 'legal'].includes(t.taskDefinitionKey) : t.taskDefinitionKey === 'waiting_box'))
    const again = await taskAt(instance, 'first_step'); evidence.returned = again
    assert.notEqual(again.id, first.id)
    evidence.afterReturn = { tasks: await tasks(instance), historicTasks: await historicTasks(instance), history: await history(instance), progress: await sdk.getProgress(instance.processInstanceId) }
    assert.deepEqual(evidence.afterReturn.tasks.map(t => t.id), [again.id])
    cancelled(evidence.afterReturn.historicTasks, initial.map(t => t.id))
    assert.equal(evidence.afterReturn.progress.state, 'ACTIVE')
    assert.ok(!evidence.afterReturn.history.some(h => h.activityId === 'archive'))
    evidence.variables = await originalFields(instance, { comment: kind + ' cancellation', checked: false })
    await sdk.complete(again, { nodes: { waiting_box: { reminderDuration: 'PT30S' } } }, { templateSnapshot: template })
    const recovered = await until(() => tasks(instance), rows => rows.length === initial.length)
    for (const task of recovered) await sdk.complete(task, kind === 'countersign' ? { decision: 'agree' } : {}, { templateSnapshot: template })
    await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
    Object.assign(evidence, await finish(instance, ['first_step', 'archive']))
    return evidence
  })

  for (const boundary of ['subprocess', 'nested-approval']) await scenario('timeout-' + boundary + '-end', async () => {
    const inner = d.parallel('teams', [d.approval('review', boundary === 'nested-approval' ? { reminder: { action: 'end' } } : {}), d.approval('legal')])
    const box = d.subProcess('outer_box', d.subProcess('inner_zone', inner), boundary === 'subprocess' ? { reminder: { action: 'end' } } : {})
    const template = await publish('timeout_' + boundary.replaceAll('-', '_') + '_end', d.sequence(d.parallel('work', [box, d.approval('sibling')]), d.approval('archive')))
    const timerNode = boundary === 'subprocess' ? 'outer_box' : 'review'
    const evidence = capture({ compiled: await deployed(template, timerNode + '_reminderTimer') })
    assert.ok(evidence.compiled.xml.includes(timerNode + '_timeoutEnd'))
    assert.ok(evidence.compiled.xml.includes('terminateEventDefinition'))
    const nodes = { review: { assignee: 'sdk-review' }, legal: { assignee: 'sdk-legal' }, sibling: { assignee: 'sdk-sibling' }, archive: { assignee: 'sdk-archive' } }
    nodes[timerNode] = { ...nodes[timerNode], reminderDuration: 'PT4S' }
    const instance = await start(template, nodes); evidence.instance = instance
    const initial = await until(() => tasks(instance), rows => rows.length === 3); evidence.initial = initial
    assert.deepEqual(initial.map(t => t.taskDefinitionKey).sort(), ['legal', 'review', 'sibling'])
    // Preserve the actual state and activity history even if termination violates the contract.
    await until(() => history(instance), rows => rows.some(h => h.activityId === timerNode + '_timeoutEnd' && h.endTime))
    evidence.afterTimeout = { progress: await sdk.getProgress(instance.processInstanceId), tasks: await tasks(instance), history: await history(instance), historicTasks: await historicTasks(instance), engine: await raw('GET', '/api/camunda/history/process-instance/' + instance.processInstanceId), externalTasks: await raw('GET', '/api/camunda/external-task?processInstanceId=' + instance.processInstanceId) }
    const deadline = Date.now() + 7000
    evidence.settlementObservations = []
    do {
      const observed = { at: new Date().toISOString(), progress: await sdk.getProgress(instance.processInstanceId), tasks: await tasks(instance) }
      evidence.settlementObservations.push(observed)
      if (!observed.tasks.length && ['COMPLETED', 'INTERNALLY_TERMINATED'].includes(observed.progress.state)) break
      await new Promise(done => setTimeout(done, 500))
    } while (Date.now() < deadline)
    evidence.engineAfterSettling = { tasks: await raw('GET', '/api/camunda/task?processInstanceId=' + instance.processInstanceId), instance: await raw('GET', '/api/camunda/history/process-instance/' + instance.processInstanceId), externalTasks: await raw('GET', '/api/camunda/external-task?processInstanceId=' + instance.processInstanceId) }
    assert.equal(evidence.settlementObservations.at(-1).tasks.length, 0, 'Timeout end must cancel every parallel/subprocess task after bounded settling')
    const progress = await until(() => sdk.getProgress(instance.processInstanceId), value => ['COMPLETED', 'INTERNALLY_TERMINATED'].includes(value.state))
    const engine = await raw('GET', '/api/camunda/history/process-instance/' + instance.processInstanceId)
    assert.equal(engine.state, progress.state); assert.ok(engine.endTime)
    evidence.terminal = { progress, engine, history: await history(instance), historicTasks: await historicTasks(instance), externalTasks: await raw('GET', '/api/camunda/external-task?processInstanceId=' + instance.processInstanceId) }
    cancelled(evidence.terminal.historicTasks, initial.map(t => t.id))
    assert.equal(evidence.terminal.externalTasks.length, 0)
    assert.ok(!evidence.terminal.history.some(h => h.activityId === 'archive'))
    assert.ok(evidence.terminal.history.some(h => h.activityType === 'serviceTask' && h.endTime), 'Finish worker must actually execute')
    return evidence
  })
}
