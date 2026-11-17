import { mkdir, writeFile } from 'node:fs/promises'
const examples = new URL('../examples/', import.meta.url)
await mkdir(examples, { recursive: true })
const serial = (processId, activities) => {
  const nodes = [{ id: 'start', type: 'start' }, ...activities, { id: 'end', type: 'end' }]
  return { processId, nodes, flows: nodes.slice(1).map((node, i) => ({ source: nodes[i].id, target: node.id })) }
}
const models = {
  serial: serial('serial_approval', [{ id: 'apply', type: 'approval', assignee: 'demo-user', allowTransfer: false, form: 'legacy-form', bizFormKey: 'form:request@3', bizType: 'request.review' }]),
  countersign: serial('human_vote', [{ id: 'review', type: 'countersign', approveMode: 'VOTE', passRate: '0.7', sequential: false, allowAddSigner: false }]),
  service: serial('single_service', [{ id: 'check', type: 'service' }]),
  'service-countersign': serial('service_vote', [{ id: 'check', type: 'service', countersign: true, approveMode: 'ANY', sequential: false }]),
  waits: serial('message_and_timer', [{ id: 'ack', type: 'receive', messageName: 'request.acknowledged' }, { id: 'delay', type: 'timer', timerType: 'duration', timerValue: 'PT30M' }, { id: 'runtime', type: 'timer' }]),
  timeouts: serial('timeout_actions', [{ id: 'apply', type: 'approval', reminder: { duration: 'PT1H', action: 'notify' } }, { id: 'review', type: 'approval', reminder: { action: 'return', target: 'apply' } }, { id: 'final', type: 'approval', reminder: { action: 'end' } }]),
  'boolean-branches': { processId: 'boolean_branches', nodes: [{ id: 's', type: 'start' }, { id: 'review', type: 'approval' }, { id: 'g', type: 'condition' }, { id: 'yes', type: 'end' }, { id: 'no', type: 'end' }], flows: [{ source: 's', target: 'review' }, { source: 'review', target: 'g' }, { source: 'g', target: 'yes', branch: 'pass' }, { source: 'g', target: 'no', branch: 'reject' }] },
  'state-branches': { processId: 'state_branches', nodes: [{ id: 's', type: 'start' }, { id: 'g', type: 'condition', statusVariable: 'business_status' }, { id: 'ok', type: 'end' }, { id: 'retry', type: 'end' }, { id: 'fallback', type: 'end' }], flows: [{ source: 's', target: 'g' }, { source: 'g', target: 'ok', branch: 'accepted' }, { source: 'g', target: 'retry', branch: 'needs_changes' }, { source: 'g', target: 'fallback', branch: 'default' }] },
  parallel: { processId: 'parallel_review', nodes: [{ id: 's', type: 'start' }, { id: 'fork', type: 'parallel' }, { id: 'a', type: 'approval' }, { id: 'b', type: 'approval' }, { id: 'join', type: 'parallel' }, { id: 'e', type: 'end' }], flows: [{ source: 's', target: 'fork' }, { source: 'fork', target: 'a' }, { source: 'fork', target: 'b' }, { source: 'a', target: 'join' }, { source: 'b', target: 'join' }, { source: 'join', target: 'e' }] },
}
const { processId: _innerId, ...inner } = serial('unused', [{ id: 'apply', type: 'approval', x: 20, y: 80, reminder: { action: 'return', target: 'revise' } }, { id: 'revise', type: 'approval' }])
const { processId: _middleId, ...middle } = serial('unused', [{ id: 'apply', type: 'approval' }, { id: 'inner', type: 'subProcess', process: inner }])
models.nested = serial('nested_review', [{ id: 'left', type: 'subProcess', process: middle }, { id: 'right', type: 'subProcess', process: structuredClone(middle) }])
models['invalid-vote'] = serial('invalid_vote', [{ id: 'review', type: 'countersign', approveMode: 'VOTE' }])
models['invalid-parallel'] = structuredClone(models.parallel)
models['invalid-parallel'].flows[1].conditionExpression = '${true}'
models['invalid-branches'] = structuredClone(models['state-branches'])
models['invalid-branches'].flows[2].branch = 'accepted'
models['invalid-cross-scope'] = structuredClone(models.nested)
models['invalid-cross-scope'].nodes[1].process.flows[0].target = 'right'
for (const [name, model] of Object.entries(models)) await writeFile(new URL(name + '.json', examples), JSON.stringify(model, null, 2) + '\n')
