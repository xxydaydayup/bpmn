import assert from 'node:assert/strict'
import * as d from '@workflow/sdk/definition'
import { runCountersignWorkflow } from '@workflow/sdk/examples/countersign-client.mjs'
import { runSubprocessWorkflow } from '@workflow/sdk/examples/subprocess-client.mjs'

/** Full settlement checks, separate from the historical all-agree smoke matrix. */
export async function checkApprovalAndSubprocess({ sdk, scenario, publish, start, tasks, taskAt, finish, raw, report, request }) {
  await scenario('recursive-delivered-compile', async () => {
    const definition = d.defineWorkflow({ key: report.prefix + '_recursive_compile' }, d.subProcess('outer_box', d.subProcess('inner_zone', d.sequence(
      d.countersign('outer_box_inner_zone_sign', { mode: 'VOTE', passRate: '0.5' }),
      d.choice('outer_box_inner_zone_decision', { branches: [{ branch: 'pass', body: d.parallel('outer_box_inner_zone_teams', [d.approval('outer_box_inner_zone_finance'), d.approval('outer_box_inner_zone_legal')]) }, { branch: 'reject', body: d.end('outer_box_inner_zone_local_end') }] }),
      d.receive('outer_box_inner_zone_receipt', { messageName: report.prefix + '_nested_message' }), d.timer('outer_box_inner_zone_cooldown', { timerValue: 'PT1S' }),
    ))))
    const compiled = await sdk.compile(definition)
    for (const id of ['outer_box_inner_zone_sign', 'outer_box_inner_zone_finance', 'outer_box_inner_zone_receipt', 'outer_box_inner_zone_cooldown', 'outer_box_inner_zone_local_end']) assert.ok(compiled.bpmnXml.includes(id), 'Missing nested compiled node ' + id)
    assert.deepEqual(compiled.model, definition.toJSON())
    return compiled
  })
  const cases = [
    ['ALL', false, 'pass', ['agree', 'agree', 'agree']],
    ['ALL', false, 'reject', ['reject']],
    ['ANY', false, 'pass', ['reject', 'agree']],
    ['ANY', false, 'reject', ['reject', 'reject', 'reject']],
    ['VOTE', false, 'pass', ['agree', 'reject', 'agree']],
    ['VOTE', false, 'reject', ['agree', 'reject', 'reject']],
    ['ALL', true, 'pass', ['agree', 'agree', 'agree']],
    ['ALL', true, 'reject', ['agree', 'reject']],
  ]
  for (const [mode, sequential, outcome, decisions] of cases) {
    await scenario(`settlement-${mode}-${sequential ? 'sequential-' : ''}${outcome}`, async () => {
      const template = await publish(`settle_${mode}_${sequential}_${outcome}`, d.sequence(
        d.countersign('sign', { mode, sequential, ...(mode === 'VOTE' ? { passRate: '0.6666666666666666' } : {}) }),
        d.choice('result', { branches: [
          { branch: 'pass', body: d.approval('accepted') },
          { branch: 'reject', body: d.end('rejected') },
        ] }),
        d.approval('archive', { assignee: 'sdk-archive' }),
      ))
      const participants = ['sdk-a', 'sdk-b', 'sdk-c']
      const instance = await start(template, { sign: { approverList: participants } })
      const evidence = { instance, initial: await tasks(instance), votes: [] }
      report.scenarios.at(-1).evidence = evidence
      assert.deepEqual(evidence.initial.map(t => t.assignee).sort(), sequential ? ['sdk-a'] : participants)
      for (let i = 0; i < decisions.length; i++) {
        const live = await tasks(instance)
        const task = live.find(t => t.taskDefinitionKey === 'sign' && t.assignee === participants[i])
        assert.ok(task, 'Expected participant task: ' + participants[i])
        const requirements = await sdk.getTaskRequirements(task)
        const vote = { task, decision: decisions[i], requirements }; evidence.votes.push(vote)
        const offset = report.requests.length
        const configureAt = mode === 'ALL' && outcome === 'pass' ? 1 : 0
        await sdk.complete(task, { decision: decisions[i], fields: { comment: `个人意见 ${i}`, checked: false, amount: 0 }, ...(i === configureAt ? { nodes: { accepted: { assignee: 'sdk-accepted' } } } : {}) }, { templateSnapshot: template })
        vote.writes = report.requests.slice(offset).filter(r => r.method === 'POST')
        assert.equal(vote.writes.length, 1)
        const inputRule = requirements.currentComplete.find(r => r.nodeId === task.taskDefinitionKey && r.source === 'complete' && r.type === 'Boolean')
        assert.ok(inputRule, 'Backend must declare the personal Boolean input')
        assert.deepEqual(vote.writes[0].body.variables[inputRule.name], { value: decisions[i] === 'agree' })
        assert.deepEqual(vote.writes[0].body.variables.checked, { value: false })
        vote.after = await tasks(instance)
        vote.variables = await raw('GET', '/api/camunda/history/variable-instance?processInstanceId=' + instance.processInstanceId)
        if (i < decisions.length - 1) {
          assert.ok(vote.after.every(t => t.taskDefinitionKey === 'sign'), 'No outcome before settlement')
          assert.deepEqual(vote.after.map(t => t.assignee).sort(), sequential ? [participants[i + 1]] : participants.slice(i + 1))
          assert.equal((await sdk.getProgress(instance.processInstanceId)).state, 'ACTIVE')
        }
      }
      assert.ok(!(await tasks(instance)).some(t => t.taskDefinitionKey === 'sign'), 'Remaining signer tasks must leave runtime at settlement')
      if (outcome === 'pass') {
        const accepted = await taskAt(instance, 'accepted'); assert.equal(accepted.assignee, 'sdk-accepted')
        await sdk.complete(accepted, {}, { templateSnapshot: template })
        await sdk.complete(await taskAt(instance, 'archive'), {}, { templateSnapshot: template })
      }
      Object.assign(evidence, await finish(instance, ['sign', outcome === 'pass' ? 'accepted' : 'rejected', ...(outcome === 'pass' ? ['archive'] : [])]))
      assert.ok(!evidence.path.some(h => h.activityId === (outcome === 'pass' ? 'rejected' : 'accepted')))
      if (outcome === 'reject') assert.ok(!evidence.path.some(h => h.activityId === 'archive'))
      evidence.historicTasks = await raw('GET', '/api/camunda/history/task?processInstanceId=' + instance.processInstanceId)
      const signers = evidence.historicTasks.filter(t => t.taskDefinitionKey === 'sign')
      assert.equal(signers.length, sequential ? decisions.length : participants.length)
      for (const vote of evidence.votes) assert.ok(signers.some(t => t.id === vote.task.id && t.endTime && t.deleteReason === 'completed'))
      const unsubmitted = signers.filter(t => !evidence.votes.some(v => v.task.id === t.id))
      assert.ok(unsubmitted.every(t => t.endTime && t.deleteReason !== 'completed'), 'Unsubmitted parallel tasks must be cancelled')
      return evidence
    })
  }

  for (const decisions of [['agree', 'reject'], ['reject', 'agree']]) {
    await scenario('subprocess-reuse-' + decisions.join('-'), async () => {
      const shared = scope => d.sequence(d.approval(scope + '_review', { x: 120, y: 80 }), d.choice(scope + '_route', { branches: [
        { branch: 'pass', body: d.parallel(scope + '_teams', [d.approval(scope + '_finance'), d.approval(scope + '_legal')]) },
        { branch: 'reject', body: d.end(scope + '_local_end') },
      ] }), d.approval(scope + '_settled'))
      const body = d.sequence(d.subProcess('outer_box', d.sequence(d.subProcess('inner_zone', shared('outer_box_inner_zone')), d.approval('outer_box_resume'))), d.subProcess('second_box', shared('second_box')), d.approval('archive'))
      const template = await publish('reuse_' + decisions.join('_'), body)
      const rules = template.globalVariables.filter(r => r.source === 'start' && r.nodeType === 'approval' && (r.fieldKey === 'assignee' || r.name === r.nodeId + '_assignee'))
      const nodes = Object.fromEntries(rules.map(r => [r.nodeId, { assignee: 'sdk-' + r.nodeId }]))
      const instance = await start(template, nodes)
      const evidence = { instance, rules, tasks: [] }; report.scenarios.at(-1).evidence = evidence
      const executed = []
      for (const [index, prefix] of ['outer_box_inner_zone_', 'second_box_'].entries()) {
        const review = await taskAt(instance, prefix + 'review')
        assert.equal(review.assignee, nodes[review.taskDefinitionKey].assignee)
        evidence.tasks.push(review); executed.push(review.taskDefinitionKey)
        await sdk.complete(review, { decision: decisions[index], fields: { comment: prefix, checked: false }, nodes }, { templateSnapshot: template })
        if (decisions[index] === 'agree') {
          const live = await tasks(instance)
          assert.deepEqual(live.map(t => t.taskDefinitionKey).sort(), [prefix + 'finance', prefix + 'legal'])
          for (const name of ['finance', 'legal', 'settled']) {
            const task = await taskAt(instance, prefix + name)
            assert.equal(task.assignee, nodes[task.taskDefinitionKey].assignee)
            evidence.tasks.push(task); executed.push(task.taskDefinitionKey)
            await sdk.complete(task, { fields: { comment: prefix + name }, nodes }, { templateSnapshot: template })
          }
        } else executed.push(prefix + 'local_end')
        if (index === 0) {
          const resumed = await taskAt(instance, 'outer_box_resume')
          assert.equal(resumed.assignee, nodes.outer_box_resume.assignee)
          evidence.tasks.push(resumed); executed.push(resumed.taskDefinitionKey)
          await sdk.complete(resumed, { nodes }, { templateSnapshot: template })
        }
      }
      const archive = await taskAt(instance, 'archive'); assert.equal(archive.assignee, nodes.archive.assignee)
      await sdk.complete(archive, {}, { templateSnapshot: template }); executed.push('archive')
      Object.assign(evidence, await finish(instance, executed))
      for (const [i, prefix] of ['outer_box_inner_zone_', 'second_box_'].entries()) {
        assert.ok(!evidence.path.some(h => h.activityId === prefix + (decisions[i] === 'agree' ? 'local_end' : 'settled')))
      }
      evidence.variables = await raw('GET', '/api/camunda/history/variable-instance?processInstanceId=' + instance.processInstanceId)
      assert.ok(evidence.variables.some(v => v.name === 'comment'))
      assert.ok(!evidence.variables.some(v => v.name.endsWith('_comment')))
      return evidence
    })
  }

  for (const kind of ['countersign', 'subprocess']) await scenario('consumer-' + kind, async () => {
    const key = report.prefix + '_consumer_' + kind
    const trackedRequest = async input => {
      const response = await request(input)
      if (input.method === 'POST' && input.path === '/template' && response.body?.code === 'OK') {
        const value = response.body.data
        assert.equal(value.templateKey, key)
        report.resources.push({ label: 'consumer-' + kind, templateKey: key, deploymentId: value.deploymentId, processDefinitionId: value.processDefinitionId, templateVersion: value.templateVersion })
      }
      if (input.path === '/task/instances/start' && response.body?.code === 'OK') report.resources.at(-1).instances = [response.body.data]
      return response
    }
    const common = { request: trackedRequest, key, businessKey: key + '_business' }
    const value = kind === 'countersign'
      ? await runCountersignWorkflow({ ...common, participants: ['sdk-a', 'sdk-b', 'sdk-c'], decisions: ['reject', 'agree', 'reject'], mode: 'ANY', nextAssignee: 'sdk-accepted' })
      : await runSubprocessWorkflow({ ...common, resolveAssignee: id => 'sdk-' + id, decide: id => id === 'outer_box_inner_zone_review' ? 'reject' : 'agree' })
    report.scenarios.at(-1).evidence = value
    assert.equal(value.progress.state, 'COMPLETED')
    if (kind === 'countersign') assert.deepEqual(value.submitted.map(v => v.decision), ['reject', 'agree'])
    else assert.ok(value.completed.some(t => t.taskDefinitionKey === 'outer_box_resume'))
    return { ...value, ...(await finish(value.instance, kind === 'countersign' ? ['sign', 'accepted', 'archive'] : ['outer_box_inner_zone_local_end', 'outer_box_resume', 'second_box_finance', 'archive'])) }
  })
}
