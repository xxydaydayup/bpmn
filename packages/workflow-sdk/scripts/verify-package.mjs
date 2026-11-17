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
const examples = []
const installedExamples = join(consumer, 'node_modules/@workflow/sdk/examples')
for (const name of await readdir(installedExamples)) {
  if (name.endsWith('.json') && !name.startsWith('invalid-')) examples.push(JSON.parse(await readFile(join(installedExamples, name), 'utf8')))
}
await writeFile(join(consumer, 'examples.ts'), `import type { WorkflowModel } from '@workflow/sdk'
export const examples = ${JSON.stringify(examples, null, 2)} satisfies WorkflowModel[]
`)
await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022'], types: [], strict: true, noEmit: true }, include: ['consume.ts', 'examples.ts'] }))
const output = run([join(consumer, 'consume.mjs')])
run([fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url)), '-p', join(consumer, 'tsconfig.json')])
console.log(JSON.stringify({ archive: resolve(archive), consumer, runtime: output.trim(), typesWithoutDOM: 'PASS', runtimeDependencies: 0 }, null, 2))
