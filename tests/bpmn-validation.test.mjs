import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateWorkflow, isValidBpmnId, BpmnModdle, descriptor, graph } from './bpmn-test-utils.mjs'

for (const filename of ['serial-approval', 'amount-approval', 'parallel-approval', 'countersign-approval', 'any-sign-approval', 'rework-approval']) {
  test(`${filename}: real moddle import/export preserves valid template, attributes and DI`, async () => {
    const moddle = new BpmnModdle({ wf: descriptor })
    const original = readFileSync(new URL(`../src/bpmn/templates/${filename}.bpmn`, import.meta.url), 'utf8')
    const parsed = await moddle.fromXML(original)
    assert.equal(parsed.warnings.length, 0)
    assert.deepEqual(validateWorkflow(graph(parsed.rootElement)), [])
    const saved = await moddle.toXML(parsed.rootElement, { format: true })
    const reloaded = await moddle.fromXML(saved.xml)
    assert.equal(reloaded.warnings.length, 0)
    assert.deepEqual(graph(reloaded.rootElement), graph(parsed.rootElement))
    assert.match(saved.xml, /bpmndi:BPMNDiagram/)
    assert.match(saved.xml, /wf:assignee=/)
    if (filename === 'amount-approval') {
      assert.equal(graph(reloaded.rootElement)[0].flows.find(flow => flow.id === 'Flow_High').condition, 'amount > 5000')
      assert.equal(graph(reloaded.rootElement)[0].nodes.find(node => node.id === 'Gateway_Amount').defaultFlowId, 'Flow_Standard')
    }
  })
}

const baseProcess = () => ({ id: 'Process_Test', nodes: [
  { id: 'Start', type: 'bpmn:StartEvent' }, { id: 'Task', type: 'bpmn:UserTask', assignee: 'alice' }, { id: 'End', type: 'bpmn:EndEvent' },
], flows: [{ id: 'f1', sourceId: 'Start', targetId: 'Task' }, { id: 'f2', sourceId: 'Task', targetId: 'End' }] })
const codes = process => validateWorkflow([process]).map(issue => issue.code)

test('assignee is required but a form reference is optional', () => {
  const process = baseProcess()
  assert.deepEqual(codes(process), [])
  process.nodes[1].assignee = '  '
  assert.deepEqual(codes(process), ['missing-assignee'])
})

test('disconnected nodes and dangling references are reported', () => {
  const process = baseProcess()
  process.flows[0].targetId = 'Missing'
  const result = codes(process)
  assert.ok(result.includes('invalid-connection'))
  assert.ok(result.includes('unreachable'))
  assert.ok(result.includes('no-end-path'))
})

test('a valid retry loop with an exit is allowed; a trapped cycle is rejected', () => {
  const process = baseProcess()
  process.nodes.push({ id: 'Gateway', type: 'bpmn:ExclusiveGateway', defaultFlowId: 'exit' })
  process.flows[1].targetId = 'Gateway'
  process.flows.push({ id: 'retry', sourceId: 'Gateway', targetId: 'Task', condition: 'retry' }, { id: 'exit', sourceId: 'Gateway', targetId: 'End' })
  assert.deepEqual(codes(process), [])
  process.flows = process.flows.filter(flow => flow.id !== 'exit')
  assert.ok(codes(process).includes('no-end-path'))
  assert.ok(codes(process).includes('invalid-default'))
})

test('conditions are required only for non-default XOR branches; missing default is a warning', () => {
  const process = baseProcess()
  process.nodes[1] = { id: 'Task', type: 'bpmn:ExclusiveGateway', defaultFlowId: 'f2' }
  process.flows.push({ id: 'extra', sourceId: 'Task', targetId: 'End' })
  assert.deepEqual(codes(process), ['missing-condition'])
  process.flows[2].condition = 'opaque expression with unknown syntax'
  assert.deepEqual(codes(process), [])
  delete process.nodes[1].defaultFlowId
  process.flows[1].condition = 'other'
  const issues = validateWorkflow([process])
  assert.deepEqual(issues.map(issue => [issue.code, issue.severity]), [['missing-default', 'warning']])
})

test('default references must belong to the source and cannot also have a condition', () => {
  const process = baseProcess()
  process.nodes[1].defaultFlowId = 'f1'
  assert.ok(codes(process).includes('invalid-default'))
  process.nodes[1].defaultFlowId = 'f2'
  process.flows[1].condition = 'amount > 5000'
  assert.ok(codes(process).includes('default-condition'))
})

test('XOR merge does not require conditions on its single outgoing flow', () => {
  const process = baseProcess()
  process.nodes[1] = { id: 'Task', type: 'bpmn:ExclusiveGateway' }
  assert.deepEqual(codes(process), [])
})

test('invalid and duplicate IDs, missing start and end are reported', () => {
  const process = baseProcess()
  process.id = 'not valid'
  process.nodes = [{ id: 'Task', type: 'bpmn:UserTask', assignee: 'alice' }, { id: 'Task', type: 'bpmn:UserTask', assignee: 'bob' }]
  process.flows = []
  for (const code of ['invalid-id', 'duplicate-id', 'missing-start', 'missing-end']) assert.ok(codes(process).includes(code))
  for (const id of ['Process_1', '_approval', '审批流程', 'process.v1']) assert.equal(isValidBpmnId(id), true)
  for (const id of ['', '1Process', 'bad id', 'prefix:id']) assert.equal(isValidBpmnId(id), false)
})

test('advanced flow semantics are explicitly marked as unchecked', () => {
  const process = baseProcess()
  process.nodes.push({ id: 'Boundary', type: 'bpmn:BoundaryEvent' })
  assert.deepEqual(codes(process), ['unsupported-node'])
  assert.equal(validateWorkflow([process])[0].severity, 'warning')
})
