import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { validateWorkflowModel, toBpmnCompilerJson, WorkflowModelError, workflowModelSchema, workflowSdkCompatibility, WORKFLOW_NODE_TYPES } from '../dist/index.js'

const load = name => JSON.parse(readFileSync(new URL('../examples/' + name + '.json', import.meta.url)))
const schema = new Ajv2020({ strict: true }).compile(workflowModelSchema)
const issues = input => validateWorkflowModel(input).issues
const has = (input, code, path) => assert.ok(issues(input).some(issue => issue.code === code && issue.severity === 'error' && issue.path === path), JSON.stringify(issues(input)))
const task = config => ({ processId: 'review', nodes: [{ id: 'review', type: 'approval', ...config }] })

test('bizJson is an optional opaque string on every standard node, including nested nodes', () => {
  const value = "  非 JSON：中文 \"review\" <tag>&\nreview_bizJson = 保持原文  "
  for (const type of WORKFLOW_NODE_TYPES) {
    for (const bizJson of [value, '', '   ']) {
      const input = task({ type, bizJson, ...(type === 'subProcess' ? { process: { nodes: [{ id: 'inner', type: 'approval', bizJson: value }] } } : {}) })
      assert.equal(schema(input), true, JSON.stringify(schema.errors))
      assert.equal(validateWorkflowModel(input).valid, true, JSON.stringify(issues(input)))
      assert.deepEqual(toBpmnCompilerJson(input), input)
    }
  }
  assert.ok(!Object.hasOwn(toBpmnCompilerJson(task({})).nodes[0], 'bizJson'))
  const nested = load('nested')
  nested.nodes[1].bizJson = '容器'
  nested.nodes[1].process.nodes[2].bizJson = '内层容器'
  nested.nodes[1].process.nodes[2].process.nodes[1].bizJson = value
  const before = structuredClone(nested)
  assert.deepEqual(toBpmnCompilerJson(nested), before)
  assert.deepEqual(nested, before)
})

test('invalid bizJson types preserve input and report the exact local scope before compilation', () => {
  for (const bizJson of [{ key: 'value' }, ['value'], null, 42, false]) {
    const input = task({ bizJson })
    const before = structuredClone(input)
    assert.equal(schema(input), false)
    has(input, 'field-type', '/nodes/0/bizJson')
    assert.throws(() => toBpmnCompilerJson(input), WorkflowModelError)
    assert.deepEqual(input, before)
    const nested = load('nested')
    nested.nodes[1].process.nodes[2].process.nodes[1].bizJson = bizJson
    assert.ok(issues(nested).some(issue => issue.code === 'field-type' && issue.path === '/nodes/1/process/nodes/2/process/nodes/1/bizJson' && JSON.stringify(issue.scope) === JSON.stringify(['left', 'inner'])), JSON.stringify(issues(nested)))
    assert.throws(() => toBpmnCompilerJson(nested), WorkflowModelError)
  }
})

test('shipped examples validate through Schema and the public API; exports are independent copies', () => {
  for (const file of readdirSync(new URL('../examples/', import.meta.url)).filter(name => name.endsWith('.json') && !name.startsWith('invalid-'))) {
    const input = load(file.slice(0, -5)), before = JSON.stringify(input)
    assert.equal(schema(input), true, JSON.stringify(schema.errors))
    assert.equal(validateWorkflowModel(input).valid, true, file + ': ' + JSON.stringify(issues(input)))
    const output = toBpmnCompilerJson(input)
    assert.deepEqual(output, input)
    assert.notEqual(output.nodes, input.nodes)
    assert.equal(JSON.stringify(input), before)
  }
  for (const file of readdirSync(new URL('../examples/', import.meta.url)).filter(name => name.startsWith('invalid-'))) {
    const invalid = load(file.slice(0, -5))
    assert.equal(validateWorkflowModel(invalid).valid, false, file)
    assert.throws(() => toBpmnCompilerJson(invalid), WorkflowModelError)
  }
})

test('protocol snapshot and generated Schema remain traceable and do not drift', () => {
  const snapshotBytes = readFileSync(new URL('../' + workflowSdkCompatibility.snapshot, import.meta.url))
  assert.equal(createHash('sha256').update(snapshotBytes).digest('hex'), workflowSdkCompatibility.sha256)
  const backend = JSON.parse(snapshotBytes)
  assert.equal(backend.version, workflowSdkCompatibility.backendSpecVersion)
  assert.deepEqual(backend.node.fields.type.allowed, WORKFLOW_NODE_TYPES)
  assert.deepEqual(Object.keys(backend.node.fields).sort(), Object.keys(workflowModelSchema.$defs.node.properties).sort())
  const schemaBytes = readFileSync(new URL('../' + workflowSdkCompatibility.jsonSchema.snapshot, import.meta.url))
  assert.equal(createHash('sha256').update(schemaBytes).digest('hex'), workflowSdkCompatibility.jsonSchema.sha256)
  const backendSchema = JSON.parse(schemaBytes)
  assert.equal(backendSchema.$defs.nodeBase.properties.bizJson.type, 'string')
  const childBusinessFields = Object.keys(backendSchema.$defs.subProcessBody.properties).filter(key => !['subProcessKey', 'subProcessName'].includes(key)).sort()
  assert.deepEqual(Object.keys(workflowModelSchema.$defs.process.properties).sort(), childBusinessFields)
  assert.deepEqual(JSON.parse(readFileSync(new URL('../schema/workflow-model-v1.schema.json', import.meta.url))), workflowModelSchema)
  assert.deepEqual(JSON.parse(readFileSync(new URL('../../workflow-designer/schema/workflow-model-v1.schema.json', import.meta.url))), workflowModelSchema)
})

test('subprocess bodies preserve bizFormKey while process identity belongs to the root', () => {
  const input = { processId: 'root', processName: 'Root', bizFormKey: 'form:root@1', nodes: [{
    id: 'child', type: 'subProcess', process: { bizFormKey: 'form:child@2', nodes: [{
      id: 'nested', type: 'subProcess', process: { bizFormKey: 'form:nested@3', nodes: [{ id: 'review', type: 'approval' }] },
    }] },
  }] }
  const before = structuredClone(input)
  assert.equal(schema(input), true, JSON.stringify(schema.errors))
  assert.deepEqual(toBpmnCompilerJson(input), before)
  assert.deepEqual(input, before)
  for (const key of ['processId', 'processName']) {
    const invalid = structuredClone(input)
    invalid.nodes[0].process[key] = 'legacy'
    has(invalid, 'unknown-field', '/nodes/0/process/' + key)
  }
})

test('optional fields, runtime inputs, explicit false, local IDs and order are kept without editor policies', () => {
  const input = { processId: 'minimal', nodes: [{ id: 'a', type: 'approval', allowTransfer: false }, { id: 'e1', type: 'end' }, { id: 'e2', type: 'end' }], flows: [{ id: 'loop', source: 'a', target: 'a' }] }
  assert.equal(validateWorkflowModel(input).valid, true)
  assert.deepEqual(toBpmnCompilerJson(input), input)
  assert.deepEqual(toBpmnCompilerJson(task({})), task({}))
  assert.ok(!Object.hasOwn(toBpmnCompilerJson(task({})), 'flows'))
  assert.equal(toBpmnCompilerJson(task({ assignee: undefined })).nodes[0].assignee, undefined)
})

test('untrusted malformed input returns diagnostics and export throws a structured error', () => {
  for (const value of [null, 1, [], {}, { processId: 'x', nodes: [] }, { processId: 'x', nodes: [null], flows: [null] }, { processId: 'x', nodes: [{ id: 'x', type: 'subProcess', process: [] }] }]) {
    assert.equal(validateWorkflowModel(value).valid, false)
    assert.throws(() => toBpmnCompilerJson(value), error => error instanceof WorkflowModelError && error.issues.length > 0)
  }
  for (const [config, path] of [[{ allowTransfer: 'false' }, '/nodes/0/allowTransfer'], [{ x: 0.25 }, '/nodes/0/x'], [{ timerValue: null }, '/nodes/0/timerValue']]) {
    const input = task(config)
    assert.equal(schema(input), false)
    has(input, 'field-type', path)
  }
  const cyclic = task({ type: 'subProcess' }); cyclic.nodes[0].process = cyclic
  has(cyclic, 'cyclic-input', '/nodes/0/process')
})

test('unknown fields, future node types, envelopes and historical terminate cannot silently lose data', () => {
  for (const [input, path, code] of [[task({ future: { policy: 1 } }), '/nodes/0/future', 'unknown-field'], [task({ type: 'future' }), '/nodes/0/type', 'unknown-node-type'], [task({ reminder: { terminate: false } }), '/nodes/0/reminder/terminate', 'unknown-field'], [JSON.parse('{"processId":"x","nodes":[{"id":"n","type":"end","__proto__":{"a":1}}]}'), '/nodes/0/__proto__', 'unknown-field']]) {
    const before = JSON.stringify(input)
    has(input, code, path)
    assert.throws(() => toBpmnCompilerJson(input), WorkflowModelError)
    assert.equal(JSON.stringify(input), before)
  }
  assert.equal(validateWorkflowModel({ format: 'workflow-designer', version: 1, model: task({}) }).valid, false)
})

test('duplicate IDs and cross-scope links use root-relative JSON Pointers', () => {
  has({ processId: 'x', nodes: [{ id: 'a', type: 'approval' }, { id: 'a', type: 'end' }] }, 'duplicate-node-id', '/nodes/1/id')
  has({ ...task({}), flows: [{ id: 'f', source: 'review', target: 'review' }, { id: 'f', source: 'absent', target: 'review' }] }, 'duplicate-flow-id', '/flows/1/id')
  const input = load('invalid-cross-scope')
  has(input, 'flow-reference', '/nodes/1/process/flows/0/target')
  assert.deepEqual(issues(input).find(issue => issue.code === 'flow-reference').scope, ['left'])
  const nested = load('nested'); nested.nodes[1].process.nodes[2].process.nodes[1].reminder.target = 'left'
  has(nested, 'reminder-target-invalid', '/nodes/1/process/nodes/2/process/nodes/1/reminder/target')
})

test('node and explicit flow definitions are globally unique while omitted flow IDs stay optional', () => {
  const model = { processId: 'review', nodes: [
    { id: 'review', type: 'approval' },
    { id: 'left', type: 'subProcess', process: { nodes: [{ id: 'inner', type: 'approval' }], flows: [{ id: 'inside-flow', source: 'inner', target: 'inner' }] } },
  ], flows: [{ id: 'outside-flow', source: 'review', target: 'left' }] }
  assert.equal(validateWorkflowModel(model).valid, true)
  const crossLayerNode = structuredClone(model)
  crossLayerNode.nodes[1].process.nodes[0].id = 'review'
  crossLayerNode.nodes[1].process.flows = []
  has(crossLayerNode, 'duplicate-node-id', '/nodes/1/process/nodes/0/id')
  assert.deepEqual(issues(crossLayerNode).find(issue => issue.code === 'duplicate-node-id').scope, ['left'])
  const crossLayerFlow = structuredClone(model)
  crossLayerFlow.nodes[1].process.flows[0].id = 'outside-flow'
  has(crossLayerFlow, 'duplicate-flow-id', '/nodes/1/process/flows/0/id')
  const crossKind = structuredClone(model)
  crossKind.nodes[1].process.flows[0].id = 'review'
  has(crossKind, 'duplicate-definition-id', '/nodes/1/process/flows/0/id')
  const nestedMetadata = structuredClone(model)
  nestedMetadata.nodes[1].process.processId = 'review'
  has(nestedMetadata, 'unknown-field', '/nodes/1/process/processId')
  const omitted = { processId: 'flow_a_b', nodes: [{ id: 'a', type: 'approval' }, { id: 'b', type: 'approval' }, { id: 'flow_a_b', type: 'end' }], flows: [
    { source: 'a', target: 'b' }, { source: 'a', target: 'b' }, { id: 'flow_b_a', source: 'a', target: 'b' }, { source: 'b', target: 'a' },
  ] }
  assert.equal(validateWorkflowModel(omitted).valid, true, JSON.stringify(issues(omitted)))
  assert.deepEqual(toBpmnCompilerJson(omitted), omitted)
})

test('shared process objects are checked at every path and cycles still terminate', () => {
  const process = { nodes: [{ id: 'inner', type: 'approval' }], flows: [{ id: 'transition', source: 'inner', target: 'inner' }] }
  const model = { processId: 'shared', nodes: [
    { id: 'left', type: 'subProcess', process }, { id: 'right', type: 'subProcess', process },
  ] }
  has(model, 'duplicate-node-id', '/nodes/1/process/nodes/0/id')
  has(model, 'duplicate-flow-id', '/nodes/1/process/flows/0/id')
  const cyclic = { processId: 'cycle', nodes: [] }
  cyclic.nodes.push({ id: 'container', type: 'subProcess', process: cyclic })
  has(cyclic, 'cyclic-input', '/nodes/0/process')
})

test('vote rates, node switches and service countersign preserve runtime configuration', () => {
  has(task({ type: 'countersign', approveMode: 'VOTE' }), 'pass-rate-required', '/nodes/0/passRate')
  for (const passRate of ['0', '1.1', '-1', 'NaN', '0x1']) has(task({ type: 'service', countersign: true, approveMode: 'VOTE', passRate }), 'pass-rate-range', '/nodes/0/passRate')
  has(task({ type: 'countersign', sequential: true, allowAddSigner: true }), 'allow-add-signer-sequential', '/nodes/0/allowAddSigner')
  has(task({ type: 'service', allowTransfer: false }), 'allow-transfer-node-type', '/nodes/0/allowTransfer')
  has(task({ type: 'service', allowAddSigner: false }), 'allow-add-signer-node-type', '/nodes/0/allowAddSigner')
  assert.equal(validateWorkflowModel(task({ type: 'countersign', sequential: true, allowAddSigner: false })).valid, true)
  assert.equal(validateWorkflowModel(task({ type: 'service', countersign: true })).valid, true)
})

test('branch inference respects explicit EL, default and generated state modes', () => {
  const input = load('state-branches')
  has({ ...input, flows: [...input.flows, { source: 'g', target: 'ok', branch: 'default' }] }, 'default-branch-duplicate', `/flows/${input.flows.length}/branch`)
  const missing = structuredClone(input); delete missing.flows[1].branch
  has(missing, 'condition-state-required', '/flows/1/branch')
  const automatic = structuredClone(input); delete automatic.flows[1].branch; delete automatic.flows[2].branch
  assert.equal(validateWorkflowModel(automatic).valid, true)
  assert.deepEqual(toBpmnCompilerJson(automatic), automatic)
  const duplicate = structuredClone(input); duplicate.flows[2].branch = 'accepted'
  has(duplicate, 'condition-state-duplicate', '/flows/2/branch')
  const mixed = structuredClone(input); mixed.flows[2].branch = 'pass'
  has(mixed, 'condition-branch-mixed', '/nodes/1')
  const explicit = structuredClone(input); explicit.flows[2].conditionExpression = '${ businessFlag == true }'
  assert.equal(validateWorkflowModel(explicit).valid, true)
  assert.equal(toBpmnCompilerJson(explicit).flows[2].conditionExpression, '${ businessFlag == true }')
  const defaultEL = structuredClone(input); defaultEL.flows[3].conditionExpression = '${true}'
  has(defaultEL, 'default-branch-expression', '/flows/3/conditionExpression')
  const bool = load('boolean-branches'); bool.flows[1].source = 's'
  has(bool, 'condition-boolean-upstream', '/nodes/2')
  const parallel = load('parallel'); parallel.flows[1].branch = 'pass'
  has(parallel, 'parallel-outgoing-condition', '/flows/1/branch')
})

test('wait and timeout validation keeps omitted runtime values and does not derive execution nodes', () => {
  for (const config of [{ type: 'timer', timerValue: 'tomorrow' }, { type: 'timer', timerType: 'date', timerValue: '2026-02-30T10:00:00' }, { type: 'timer', timerType: 'cycle', timerValue: 'R3/nope' }]) has(task(config), 'timer-value-format', '/nodes/0/timerValue')
  has(task({ reminder: { action: 'return' } }), 'reminder-target-required', '/nodes/0/reminder/target')
  has(task({ reminder: { action: 'notify', target: '' } }), 'reminder-target-unexpected', '/nodes/0/reminder/target')
  has(task({ type: 'service', reminder: {} }), 'reminder-node-type', '/nodes/0/reminder')
  has(task({ reminder: { duration: 'one day' } }), 'reminder-duration', '/nodes/0/reminder/duration')
  const output = toBpmnCompilerJson(load('timeouts'))
  assert.deepEqual(output.nodes.map(node => node.id), ['start', 'apply', 'review', 'final', 'end'])
  for (const config of [{ type: 'timer' }, { type: 'receive' }, { reminder: {} }]) assert.equal(validateWorkflowModel(task(config)).valid, true)
})

test('legacy types emit warnings and are passed through without semantic upgrades', () => {
  const input = { processId: 'old', nodes: ['startEvent', 'userTask', 'exclusiveGateway', 'parallelGateway', 'endEvent', 'receiveTask'].map(type => ({ id: type, type })) }
  assert.equal(validateWorkflowModel(input).valid, true)
  assert.equal(issues(input).filter(issue => issue.code === 'legacy-node-type' && issue.severity === 'warning').length, 6)
  assert.deepEqual(toBpmnCompilerJson(input), input)
})

test('malformed entries do not shift JSON Pointer indices of independent semantic errors', () => {
  const input = { processId: 'mixed', nodes: [null, { id: 'g', type: 'condition' }, { id: 'e', type: 'end' }], flows: [null, { source: 'missing', target: 'g' }, { source: 'g', target: 'e', branch: 'pass' }] }
  has(input, 'flow-reference', '/flows/1/source')
  has(input, 'condition-boolean-upstream', '/nodes/1')
})

test('two-level subprocesses compose branches, multi-actor services, waits and same-level returns', () => {
  const nested = load('nested')
  const inner = nested.nodes[1].process.nodes[2].process
  const composite = load('parallel')
  const boolean = load('boolean-branches')
  const branches = { nodes: boolean.nodes, flows: boolean.flows }
  const rename = (process, prefix) => {
    const map = new Map(process.nodes.map(node => [node.id, prefix + node.id]))
    for (const node of process.nodes) {
      node.id = map.get(node.id)
      if (node.reminder?.target) node.reminder.target = map.get(node.reminder.target) ?? node.reminder.target
    }
    for (const flow of process.flows ?? []) {
      flow.source = map.get(flow.source) ?? flow.source
      flow.target = map.get(flow.target) ?? flow.target
      if (flow.id) flow.id = prefix + flow.id
    }
  }
  rename(composite, 'composite_')
  rename(branches, 'branches_')
  inner.nodes.splice(2, 0,
    { id: 'parallel', type: 'subProcess', process: { nodes: composite.nodes, flows: composite.flows } },
    { id: 'branches', type: 'subProcess', process: branches },
    { id: 'multi', type: 'countersign', approveMode: 'VOTE', passRate: '0.75', sequential: false, allowAddSigner: false },
    { id: 'service', type: 'service', countersign: true, approveMode: 'ANY' },
    { id: 'wait', type: 'receive' }, { id: 'timer', type: 'timer', timerType: 'cycle', timerValue: 'R3/PT10H' })
  const original = structuredClone(nested)
  assert.equal(schema(nested), true, JSON.stringify(schema.errors))
  assert.deepEqual(toBpmnCompilerJson(nested), original)
  assert.deepEqual(nested, original)
  inner.nodes.find(node => node.id === 'multi').passRate = '2'
  const rate = issues(nested).find(issue => issue.code === 'pass-rate-range')
  assert.equal(rate.path, '/nodes/1/process/nodes/2/process/nodes/4/passRate')
  assert.deepEqual(rate.scope, ['left', 'inner'])
  inner.nodes[1].reminder.target = 'right'
  has(nested, 'reminder-target-invalid', '/nodes/1/process/nodes/2/process/nodes/1/reminder/target')
})
