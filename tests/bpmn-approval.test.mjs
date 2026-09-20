import assert from 'node:assert/strict'
import test from 'node:test'
import { template, readApproval, approvalPatch, graph, validateWorkflow, apply } from './bpmn-test-utils.mjs'

test('single → multi → sequential/any → single preserves unrelated XML and original undo values', async () => {
  const { moddle, rootElement } = await template('serial-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Manager')
  const other = moddle.createAny('other:note', 'urn:other', { label: 'preserve me' })
  const ext = moddle.create('bpmn:ExtensionElements', { values: [other] })
  task.set('extensionElements', ext)
  assert.equal(readApproval(task).mode, 'single')
  apply(task, approvalPatch(moddle, task, 'approvalMode', 'all'))
  assert.deepEqual(readApproval(task).participants, ['manager'])
  assert.equal(task.get('wf:assignee'), undefined)
  const previousLoop = task.loopCharacteristics
  const previousConfig = task.extensionElements.values[1]
  apply(task, approvalPatch(moddle, task, 'participants', 'alice\nbob'))
  assert.equal(previousLoop.loopCardinality.body, '1')
  assert.equal(previousConfig.participants.length, 1)
  apply(task, approvalPatch(moddle, task, 'approvalOrder', 'sequential'))
  apply(task, approvalPatch(moddle, task, 'approvalMode', 'any'))
  assert.equal(readApproval(task).sequential, true)
  assert.equal(readApproval(task).mode, 'any')
  assert.deepEqual(readApproval(task).participants, ['alice','bob'])
  assert.deepEqual(readApproval(task).issues, [])
  assert.equal(task.extensionElements.values[0], other)
  const saved = await moddle.toXML(rootElement, { format: true })
  assert.match(saved.xml, /other:note label="preserve me"/)
  assert.match(saved.xml, /wf:participant userId="alice"/)
  assert.doesNotMatch(saved.xml, /completionCondition/)
  const restored = await moddle.fromXML(saved.xml)
  assert.equal(restored.warnings.length, 0)
  assert.deepEqual(graph(restored.rootElement), graph(rootElement))
  apply(task, approvalPatch(moddle, task, 'approvalMode', 'single'))
  assert.equal(task.loopCharacteristics, undefined)
  assert.equal(task.get('wf:assignee'), undefined) // Do not silently choose one of several users.
  assert.deepEqual(task.extensionElements.values, [other])
})

test('one-person list round-trips to a static single assignee, including XML-sensitive characters', async () => {
  const { moddle, rootElement } = await template('countersign-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  apply(task, approvalPatch(moddle, task, 'participants', '审批<&"'))
  const { xml } = await moddle.toXML(rootElement)
  const parsed = await moddle.fromXML(xml)
  assert.deepEqual(graph(parsed.rootElement), graph(rootElement))
  apply(task, approvalPatch(moddle, task, 'approvalMode', 'single'))
  assert.equal(task.get('wf:assignee'), '审批<&"')
})

test('blank/duplicate participants and mismatched counts block file validation', async () => {
  const { moddle, rootElement } = await template('countersign-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  apply(task, approvalPatch(moddle, task, 'participants', 'alice, alice, '))
  const codes = validateWorkflow(graph(rootElement)).map(issue => issue.code)
  assert.ok(codes.includes('empty-participants'))
  assert.ok(codes.includes('duplicate-participants'))
  assert.ok(!codes.includes('missing-assignee'))
  task.loopCharacteristics.loopCardinality.body = '99'
  assert.ok(readApproval(task).issues.some(issue => issue.code === 'approval-count-conflict'))
})

test('native loop toggles are detected and can be repaired without reinterpreting static assignees', async () => {
  const { moddle, rootElement } = await template('countersign-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  task.set('loopCharacteristics', undefined)
  task.set('wf:assignee', 'stale-user')
  assert.deepEqual(readApproval(task).issues.map(issue => issue.code), ['approval-loop-conflict','approval-assignee-conflict'])
  apply(task, approvalPatch(moddle, task, 'repairApproval', ''))
  assert.deepEqual(readApproval(task).issues, [])
  assert.equal(readApproval(task).participants.length, 3)
  task.set('extensionElements', undefined)
  assert.equal(readApproval(task).mode, 'unconfigured')
  assert.ok(readApproval(task).issues.some(issue => issue.code === 'missing-approval'))
  apply(task, approvalPatch(moddle, task, 'approvalMode', 'any'))
  assert.ok(readApproval(task).issues.some(issue => issue.code === 'empty-participants'))
})

test('foreign multi-instance bindings, conditions and future wf versions are preserved for XML editing', async () => {
  const { moddle, rootElement } = await template('countersign-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  task.loopCharacteristics.completionCondition = moddle.create('bpmn:FormalExpression', { body: 'external()', language: 'custom' })
  const before = (await moddle.toXML(rootElement)).xml
  assert.ok(readApproval(task).readOnlyReason)
  assert.throws(() => approvalPatch(moddle, task, 'participants', 'alice'))
  assert.equal((await moddle.toXML(rootElement)).xml, before)
  task.loopCharacteristics.completionCondition = undefined
  task.extensionElements.values[0].version = '2'
  assert.ok(readApproval(task).issues.some(issue => issue.code === 'invalid-approval'))
  assert.throws(() => approvalPatch(moddle, task, 'approvalMode', 'single'))
})

async function parallelGraph() { return graph((await template('parallel-approval')).rootElement)[0] }
function codes(process) { return validateWorkflow([process]).map(issue => issue.code) }
test('exclusive alternatives cannot become separate incoming edges of a parallel join', async () => {
  const process = await parallelGraph()
  process.flows.find(flow => flow.id === 'Flow_FinanceSkip').targetId = 'Gateway_ParallelJoin'
  assert.ok(codes(process).includes('parallel-alternative-join'))
})
test('bypassing a join, cross-branch connections and loops inside a parallel branch are rejected', async () => {
  const bypass = await parallelGraph()
  bypass.flows.find(flow => flow.id === 'Flow_LegalJoin').targetId = 'End_ParallelApproved'
  assert.ok(codes(bypass).includes('parallel-unmatched'))
  const cross = await parallelGraph()
  cross.flows.push({ id: 'Cross', sourceId: 'Task_ParallelLegal', targetId: 'Task_FinanceHead' })
  assert.ok(codes(cross).includes('parallel-cross-branch'))
  const loop = await parallelGraph()
  loop.flows.find(flow => flow.id === 'Flow_FinanceHead').targetId = 'Gateway_FinanceCheck'
  assert.ok(codes(loop).includes('parallel-branch-loop'))
})
test('XOR-only splits cannot feed a parallel join; outside entries are detected', async () => {
  const xor = await parallelGraph()
  xor.nodes.find(node => node.id === 'Gateway_ParallelSplit').type = 'bpmn:ExclusiveGateway'
  assert.ok(codes(xor).includes('parallel-orphan-join'))
  const outside = await parallelGraph()
  outside.flows.push({ id: 'Outside', sourceId: 'Task_ParallelApply', targetId: 'Task_FinanceHead' })
  assert.ok(codes(outside).includes('parallel-foreign-entry'))
})
test('nested parallel is explicitly outside the supported matching scope', async () => {
  const process = await parallelGraph()
  process.nodes.push({ id:'NestedSplit',type:'bpmn:ParallelGateway' },{ id:'NestedJoin',type:'bpmn:ParallelGateway' },{ id:'ExtraTask',type:'bpmn:UserTask',assignee:'another' })
  process.flows.find(flow => flow.id === 'Flow_ParallelLegal').targetId = 'NestedSplit'
  process.flows.find(flow => flow.id === 'Flow_LegalJoin').targetId = 'NestedJoin'
  process.flows.push({id:'n1',sourceId:'NestedSplit',targetId:'Task_ParallelLegal'},{id:'n2',sourceId:'NestedSplit',targetId:'ExtraTask'},{id:'n3',sourceId:'ExtraTask',targetId:'NestedJoin'},{id:'n4',sourceId:'NestedJoin',targetId:'Gateway_ParallelJoin'})
  const issues = validateWorkflow([process])
  assert.deepEqual(issues.map(issue => [issue.code,issue.severity]), [['nested-parallel','warning']])
})
