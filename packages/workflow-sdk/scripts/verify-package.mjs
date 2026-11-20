import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const archive = process.argv.slice(2).find(value => value !== '--')
if (!archive) throw new Error('请提供 SDK tgz 路径。')
const packageManager = process.env.npm_execpath
if (!packageManager) throw new Error('请通过 pnpm verify:package 运行。')
const consumer = await mkdtemp(join(tmpdir(), 'workflow-sdk-consumer-'))
function run(args, cwd = consumer) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 60000 })
  if (result.status !== 0) throw new Error(result.stdout + result.stderr + (result.error?.message ?? ''))
  return result.stdout
}
await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
run([packageManager, 'add', resolve(archive), '--offline', '--ignore-scripts'])
const installed = JSON.parse(await readFile(join(consumer, 'node_modules/@workflow/sdk/package.json'), 'utf8'))
assert.equal(Object.keys(installed.dependencies ?? {}).length, 0)
assert.equal(Object.keys(installed.peerDependencies ?? {}).length, 0)
assert.ok(!JSON.stringify(installed).includes('workspace:'))
await writeFile(join(consumer, 'consume.mjs'), `
import assert from 'node:assert/strict'
globalThis.fetch = () => { throw new Error('Offline consumer must not request network') }
const sdk = await import('@workflow/sdk')
const definitions = await import('@workflow/sdk/definition')
const clients = await import('@workflow/sdk/client')
const { runSerialWorkflow } = await import('@workflow/sdk/examples/serial-client.mjs')
const { inspectWriteOutcome } = await import('@workflow/sdk/examples/write-recovery.mjs')
const { runParallelWorkflow } = await import('@workflow/sdk/examples/parallel-client.mjs')
const { runWaitWorkflow } = await import('@workflow/sdk/examples/wait-client.mjs')
const { returnAndReassign } = await import('@workflow/sdk/examples/reassignment-client.mjs')
const { runApprovalWorkflow } = await import('@workflow/sdk/examples/branch-client.mjs')
const { runCountersignWorkflow } = await import('@workflow/sdk/examples/countersign-client.mjs')
const { runSubprocessWorkflow, reusableSubprocessDefinition } = await import('@workflow/sdk/examples/subprocess-client.mjs')
assert.equal(typeof runSerialWorkflow, 'function')
assert.equal(typeof inspectWriteOutcome, 'function')
assert.equal(typeof runParallelWorkflow, 'function')
assert.equal(typeof runWaitWorkflow, 'function')
assert.equal(typeof returnAndReassign, 'function')
assert.equal(typeof runApprovalWorkflow, 'function')
assert.equal(typeof runCountersignWorkflow, 'function')
assert.equal(typeof runSubprocessWorkflow, 'function')
assert.equal(sdk.validateWorkflowModel(reusableSubprocessDefinition('installed_reuse').toJSON()).valid, true)
const definition = definitions.defineWorkflow({ key: 'installed' }, definitions.approval('review'))
assert.equal(sdk.validateWorkflowModel(definition.toJSON()).valid, true)
let requests = 0
const client = clients.createWorkflowClient({ request: async () => { requests++; return { status: 200, body: { code: 'OK', data: { bpmnXml: '<definitions />' } } } } })
assert.equal(requests, 0)
assert.equal((await client.compile(definition)).bpmnXml, '<definitions />')
assert.equal(requests, 1)
let writes = 0
const publisher = clients.createWorkflowClient({ request: async input => {
  if (input.path === '/bpmn/json2xml') return { status: 200, body: { code: 'OK', data: { bpmnXml: '<definitions />' } } }
  writes++
  assert.equal(input.body.has('startable'), false)
  return { status: 201, body: { code: 'OK', data: { templateKey: 'installed', templateVersion: 1, deploymentId: 'deployment', processDefinitionId: 'definition', startable: true, globalVariables: [] } } }
} })
assert.equal((await publisher.publish(definition)).deploymentId, 'deployment')
await assert.rejects(publisher.publish(definition, { startable: false }), error => error.code === 'UNSUPPORTED_PUBLISH_OPTION' && error.effect === 'none')
assert.equal(writes, 1)
let startWrites = 0
const installedSnapshot = { templateKey: 'installed', templateVersion: 1, deploymentId: 'deployment', processDefinitionId: 'definition', displayJson: definition.toJSON(), globalVariables: [] }
const recovery = clients.createWorkflowClient({ request: async input => {
  if (input.path === '/template/installed') return { status: 200, body: { code: 'OK', data: installedSnapshot } }
  if (input.path.endsWith('/start-variables') || input.path === '/tasks') return { status: 200, body: { code: 'OK', data: [] } }
  if (input.path === '/task/instances/start') { startWrites++; throw new Error('lost response after write') }
  throw new Error('Unexpected request ' + input.path)
} })
let lost
await assert.rejects(recovery.start('installed', { businessKey: 'business' }), error => { lost = error; return error.operation === 'start' && error.phase === 'start' && error.effect === 'unknown' && error.resources.businessKey === 'business' })
assert.equal((await inspectWriteOutcome(recovery, lost)).requiresBusinessKeyReconciliation, true)
assert.equal(startWrites, 1)
let published, completed = false, recoveryWrites = 0
const installedTask = { id: 'task', processInstanceId: 'instance', processDefinitionId: 'definition', taskDefinitionKey: 'review' }
const passedRule = { name: 'review_passed', nodeId: 'review', nodeType: 'approval', source: 'complete', type: 'Boolean', required: true }
const passedWrites = []
const currentRuntime = clients.createWorkflowClient({ request: async input => {
  if (input.path.endsWith('/required-variables')) return { status: 200, body: { code: 'OK', data: { currentComplete: [passedRule], gatewayDecision: [], nextStartHints: [] } } }
  passedWrites.push(input)
  return { status: 200, body: { code: 'OK', data: { taskId: 'task', status: 'completed' } } }
} })
await currentRuntime.complete(installedTask, { decision: 'reject', fields: { checked: false } })
assert.equal(passedWrites.length, 1)
assert.deepEqual(passedWrites[0].body.variables, { checked: { value: false }, review_passed: { value: false } })
const personal = { ...passedRule, name: 'sign_passed', nodeId: 'sign', nodeType: 'countersign' }
const nextAssignee = { name: 'accepted_assignee', nodeId: 'accepted', nodeType: 'approval', source: 'start', type: 'String', required: true, provided: true }
let signWrites = 0
const signer = clients.createWorkflowClient({ request: async input => {
  if (input.path.endsWith('/required-variables')) return { status: 200, body: { code: 'OK', data: { currentComplete: [personal], gatewayDecision: [personal], nextStartHints: [nextAssignee], nextGateway: { gatewayId: 'result', decisionMode: 'boolean', decisionVariable: personal, branches: [{ value: 'pass', decisionValue: true, variables: [nextAssignee] }] } } } }
  signWrites++
  return { status: 200, body: { code: 'OK', data: { taskId: 'task', status: 'completed' } } }
} })
const signTask = { ...installedTask, taskDefinitionKey: 'sign' }
await signer.complete(signTask, { decision: 'agree' })
for (const assignee of ['', null]) await assert.rejects(signer.complete(signTask, { decision: 'agree', nodes: { accepted: { assignee } } }), error => error.code === 'PARAMETER_REQUIRED' && error.effect === 'none')
assert.equal(signWrites, 1)
const serviceModel = definitions.defineWorkflow({ key: 'installed' }, definitions.subProcess('outer_box', definitions.service('invoke_step', { countersign: true }))).toJSON()
const protectedService = clients.createWorkflowClient({ request: async input => {
  if (input.path === '/template/installed') return { status: 200, body: { code: 'OK', data: { ...installedSnapshot, displayJson: serviceModel } } }
  if (input.path.endsWith('/start-variables')) return { status: 200, body: { code: 'OK', data: [] } }
  throw new Error('Worker-owned result must be rejected before a write')
} })
await assert.rejects(protectedService.start('installed', { businessKey: 'result-protection', variables: { invoke_step_result_0: false } }), error => error.code === 'PARAMETER_READ_ONLY' && error.effect === 'none')
const lostWrites = clients.createWorkflowClient({ request: async input => {
  const ok = data => ({ status: 200, body: { code: 'OK', data } })
  if (input.path === '/bpmn/json2xml') return ok({ bpmnXml: '<definitions />' })
  if (input.path === '/template') { recoveryWrites++; published = installedSnapshot; throw new Error('lost publish response') }
  if (input.path === '/template/installed') return ok(published)
  if (input.path.endsWith('/required-variables')) return ok({ currentComplete: [], gatewayDecision: [], nextStartHints: [] })
  if (input.path.endsWith('/complete')) { recoveryWrites++; completed = true; throw new Error('lost complete response') }
  if (input.path === '/tasks') return ok(completed ? [] : [installedTask])
  if (input.path.endsWith('/activity-status')) return ok({ processInstanceId: 'instance', processDefinitionId: 'definition', state: completed ? 'COMPLETED' : 'ACTIVE', activeNodes: [], completedNodes: [] })
  if (input.path === '/history/activity-instances') return ok([{ id: 'history', processInstanceId: 'instance', activityId: 'review', taskId: 'task', endTime: '2026-11-17T00:00:00Z' }])
  throw new Error('Unexpected request ' + input.path)
} })
let publishError, completeError
await assert.rejects(lostWrites.publish(definition), error => { publishError = error; return error.effect === 'unknown' && error.phase === 'publish' && !!error.resources.compilation })
assert.equal((await inspectWriteOutcome(lostWrites, publishError)).requiresVersionReconciliation, true)
await assert.rejects(lostWrites.complete(installedTask), error => { completeError = error; return error.effect === 'unknown' && error.phase === 'complete' && error.resources.taskId === 'task' })
assert.equal((await inspectWriteOutcome(lostWrites, completeError)).history.items[0].taskId, 'task')
assert.equal(recoveryWrites, 2)
const { default: model } = await import('@workflow/sdk/examples/serial.json', { with: { type: 'json' } })
const { default: schema } = await import('@workflow/sdk/schema/workflow-model-v1.schema.json', { with: { type: 'json' } })
assert.equal(typeof globalThis.document, 'undefined')
assert.equal(sdk.validateWorkflowModel(model).valid, true)
const payload = sdk.toBpmnCompilerJson(model)
assert.deepEqual(payload, model)
assert.notEqual(payload.nodes, model.nodes)
assert.deepEqual(schema, sdk.workflowModelSchema)
assert.equal(sdk.workflowSdkCompatibility.sdkVersion, '${installed.version}')
assert.throws(() => sdk.toBpmnCompilerJson({ ...model, future: 1 }), sdk.WorkflowModelError)
console.log('Offline ESM / Schema / immutable export / error contract: PASS')
`)
await writeFile(join(consumer, 'consume.ts'), `
import { validateWorkflowModel, toBpmnCompilerJson, workflowModelSchema, type WorkflowModel, type WorkflowNode, type WorkflowFlow, type WorkflowValidationIssue } from '@workflow/sdk'
const node: WorkflowNode = { id: 's', type: 'start' }
const flow: WorkflowFlow = { source: 's', target: 'e' }
const model: WorkflowModel = { processId: 'consumer', nodes: [node, { id: 'e', type: 'end' }], flows: [flow] }
const issues: WorkflowValidationIssue[] = validateWorkflowModel(model).issues
const output: WorkflowModel = toBpmnCompilerJson(model)
void [issues, output, workflowModelSchema]
// @ts-expect-error passRate is a wire-format string
const wrong: WorkflowNode = { id: 'n', type: 'countersign', passRate: 0.7 }
void wrong
`)
await writeFile(join(consumer, 'definition.ts'), `
import { defineWorkflow, sequence, approval, subProcess } from '@workflow/sdk/definition'
import type { WorkflowModel } from '@workflow/sdk'
const definition = defineWorkflow({ key: 'offline' }, sequence(approval('review'), subProcess('nested', approval('nested_review'))))
const model: WorkflowModel = definition.toJSON()
void model
`)
const examples = []
const installedExamples = join(consumer, 'node_modules/@workflow/sdk/examples')
for (const name of await readdir(installedExamples)) {
  if (name.endsWith('.json') && !name.startsWith('invalid-')) examples.push(JSON.parse(await readFile(join(installedExamples, name), 'utf8')))
}
await writeFile(join(consumer, 'examples.ts'), `import type { WorkflowModel } from '@workflow/sdk'
export const examples = ${JSON.stringify(examples, null, 2)} satisfies WorkflowModel[]
`)
await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022'], types: [], strict: true, noEmit: true }, include: ['consume.ts', 'definition.ts', 'examples.ts'] }))
await writeFile(join(consumer, 'runtime.ts'), `
import { defineWorkflow, sequence, approval, countersign, service, parallel, subProcess, timer } from '@workflow/sdk/definition'
import { createWorkflowClient, type WorkflowRequester, type TaskReference } from '@workflow/sdk/client'
const definition = defineWorkflow({ key: 'runtime' }, sequence(approval('review'), parallel('teams', [subProcess('finance', approval('finance_review')), subProcess('legal', approval('legal_review'))]), timer('wait', { timerType: 'duration', timerValue: 'PT1S' }), countersign('sign', { mode: 'VOTE', passRate: '.7' }), service('notify', { countersign: true, mode: 'ALL' })))
const request: WorkflowRequester = async () => ({ status: 200, body: {} })
const client = createWorkflowClient({ request })
void client.publish(definition)
void client.publish(definition, { startable: true }) // deprecated compatibility option is never sent
const task: TaskReference = { id: 't', processInstanceId: 'p', processDefinitionId: 'd', taskDefinitionKey: 'review' }
void client.compile(definition)
void client.complete(task, { fields: { checked: false, amount: 0, nullable: null } })
void countersign('sequential', { mode: 'ALL', sequential: true, allowAddSigner: false })
void client.complete({ ...task, taskDefinitionKey: 'finance_review' }, { decision: 'reject', nodes: { archive: { assignee: 'next' } } })
// @ts-expect-error VOTE ratios remain protocol strings
countersign('wrong_rate', { mode: 'VOTE', passRate: 0.7 })
// @ts-expect-error sequential must be Boolean
countersign('wrong_order', { sequential: 'true' })
// @ts-expect-error approval does not expose timer configuration
approval('wrong', { timerValue: 'PT1S' })
// @ts-expect-error service mode requires countersign=true
service('wrong', { mode: 'ALL' })
`)
await writeFile(join(consumer, 'tsconfig.runtime.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], types: [], strict: true, noEmit: true }, include: ['runtime.ts'] }))
await writeFile(join(consumer, 'browser.ts'), `
import { defineWorkflow, approval } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'
import { validateWorkflowModel } from '@workflow/sdk'
const definition = defineWorkflow({ key: 'browser' }, approval('review'))
globalThis.workflowExample = { definition, validateWorkflowModel, createWorkflowClient }
`)
const output = run([join(consumer, 'consume.mjs')])
run([fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', join(consumer, 'tsconfig.json')])
run([fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', join(consumer, 'tsconfig.runtime.json')])
const { build } = await import('vite')
await build({ root: consumer, configFile: false, logLevel: 'error', build: { lib: { entry: join(consumer, 'browser.ts'), formats: ['es'], fileName: 'browser' }, outDir: join(consumer, 'browser-dist'), minify: false } })
console.log(JSON.stringify({ archive: resolve(archive), consumer, runtime: output.trim(), modelAndDefinitionTypesWithoutDOM: 'PASS', clientTypes: 'PASS', browserBundle: 'PASS', runtimeDependencies: 0 }, null, 2))
