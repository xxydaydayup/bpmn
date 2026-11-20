import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const moduleUrlFor = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const definitionValidationUrl = moduleUrlFor(transpile('../packages/workflow-designer/src/definition-id-validation.ts'))
const definitionIdsUrl = moduleUrlFor(transpile('../packages/workflow-designer/src/definition-ids.ts')
  .replace(/from ['"]\.\/definition-id-validation['"]/g, 'from ' + JSON.stringify(definitionValidationUrl)))
const boundarySource = readFileSync(new URL('../packages/workflow-designer/src/compiler-model.ts', import.meta.url), 'utf8')
const boundaryCode = ts.transpileModule(boundarySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace("'@workflow/sdk'", JSON.stringify(new URL('../packages/workflow-sdk/dist/index.js', import.meta.url).href))
  .replace(/from ['"]\.\/definition-ids['"]/g, 'from ' + JSON.stringify(definitionIdsUrl))
  .replace(/from ['"]\.\/definition-id-validation['"]/g, 'from ' + JSON.stringify(definitionValidationUrl))
const boundaryUrl = moduleUrlFor(boundaryCode)
const source = readFileSync(new URL('../src/api/workflow/subProcessGateway.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const code = compiled
  .replace("'@workflow/designer'", JSON.stringify(boundaryUrl))
  .replace(/import \{ request \} from ['"]@\/utils\/request['"];?/, 'const request = async () => { throw new Error("Unexpected default request"); };')
  .replace(/import type [^;]+;?\n/g, '')
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')

test('subprocess gateway maps list, detail, create, update, delete and recursive displayJson', async () => {
  const calls = []
  const fragment = {
    subProcessKey: 'frag/child', subProcessName: '审批片段',
    displayJson: { bizFormKey: 'form:request', nodes: [{ id: 'nested', type: 'subProcess', process: { nodes: [{ id: 'inner', type: 'approval' }] } }] },
  }
  const { createSubProcessLibraryGateway } = await import(moduleUrl)
  const gateway = createSubProcessLibraryGateway(async config => {
    calls.push(config)
    if (config.method === 'GET' && config.params) return { code: 'OK', data: [fragment] }
    if (config.method === 'DELETE') return { code: 'OK' }
    return { code: 'OK', data: fragment }
  })

  const rows = await gateway.listPage({ key: 'frag', name: '', firstResult: 20, maxResults: 10 })
  assert.equal(calls[0].url, '/v1/sub-process')
  assert.deepEqual(calls[0].params, { keyLike: 'frag', firstResult: 20, maxResults: 10 })
  assert.equal(rows[0].key, 'frag/child')
  assert.equal(rows[0].name, '审批片段')

  const detail = await gateway.get('frag/child')
  assert.equal(calls[1].url, '/v1/sub-process/frag%2Fchild')
  assert.equal(detail.displayJson.nodes[0].process.nodes[0].id, 'inner')

  await gateway.create({ name: '新片段', displayJson: fragment.displayJson })
  assert.equal(calls[2].method, 'POST')
  assert.equal(calls[2].url, '/v1/sub-process')
  assert.deepEqual(calls[2].data, { subProcessName: '新片段', displayJson: fragment.displayJson })

  await gateway.update('frag/child', { name: '更新片段', displayJson: fragment.displayJson })
  assert.equal(calls[3].method, 'PUT')
  assert.equal(calls[3].url, '/v1/sub-process/frag%2Fchild')
  assert.deepEqual(calls[3].data, { subProcessName: '更新片段', displayJson: fragment.displayJson })

  await gateway.delete('frag/child')
  assert.equal(calls[4].method, 'DELETE')
  assert.equal(calls[4].url, '/v1/sub-process/frag%2Fchild')
})

test('subprocess gateway surfaces backend business errors and rejects empty fragment content', async () => {
  const { createSubProcessLibraryGateway } = await import(moduleUrl)
  const gateway = createSubProcessLibraryGateway(async () => ({ code: 'INVALID', message: 'invalid fragment' }))
  await assert.rejects(gateway.create({ name: '空内容', displayJson: { nodes: [] } }), /至少需要一个节点/)
  await assert.rejects(gateway.get('missing'), /invalid fragment/)
})

test('fragment editor create and update preserve process form bindings in the saved payload', async () => {
  const pageSource = readFileSync(new URL('../src/views/SubProcessLibraryView.vue', import.meta.url), 'utf8')
  const script = pageSource.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1]
  const page = ts.createSourceFile('SubProcessLibraryView.ts', script, ts.ScriptTarget.Latest, true)
  const saveDeclaration = page.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'save')
  assert.ok(saveDeclaration, 'the fragment page must expose its actual save function')
  const saveCode = ts.transpileModule(saveDeclaration.getText(page), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const createSave = new Function('dependencies', `
    const { saving, design, editorRef, editorName, editorDescription, editingKey, subProcessLibraryGateway, router, ElMessage } = dependencies;
    let lastSavedModel = '';
    ${saveCode}
    return save;
  `)
  const { createSubProcessLibraryGateway } = await import(moduleUrl)
  for (const existingKey of ['', 'fragment-existing']) for (const bizFormKey of ['form:fragment@2', undefined]) {
    const calls = []
    const model = {
      processId: 'fragment', processName: '审批片段', ...(bizFormKey !== undefined ? { bizFormKey } : {}),
      nodes: [{ id: 'nested', type: 'subProcess', process: { bizFormKey: 'form:nested@3', nodes: [{ id: 'review', type: 'approval' }] } }],
      flows: [], width: 800, height: 480,
    }
    const before = structuredClone(model)
    const gateway = createSubProcessLibraryGateway(async config => {
      calls.push(config)
      return { code: 'OK', data: { subProcessKey: existingKey || 'fragment-created', subProcessName: config.data.subProcessName, displayJson: config.data.displayJson } }
    })
    const saving = { value: false }
    const save = createSave({
      saving, design: { value: { model } }, editorRef: { value: { validate: () => [], exportDesign: () => ({ model }) } },
      editorName: { value: '审批片段' }, editorDescription: { value: '' }, editingKey: { value: existingKey },
      subProcessLibraryGateway: gateway, router: { replace: async () => {} },
      ElMessage: { success() {}, error(message) { throw new Error(message) }, warning(message) { throw new Error(message) }, info(message) { throw new Error(message) } },
    })
    await save()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, existingKey ? 'PUT' : 'POST')
    assert.deepEqual(calls[0].data.displayJson, before)
    assert.equal(Object.hasOwn(calls[0].data.displayJson, 'bizFormKey'), bizFormKey !== undefined)
    assert.deepEqual(model, before)
    assert.equal(saving.value, false)
  }
})

test('compiler payload follows recursive bpmn spec and removes designer-only metadata at each level', async () => {
  const { toBpmnCompilerJson } = await import(moduleUrl)
  const model = {
    processId: 'main', processName: '主流程', bizFormKey: 'form:main', width: 1200, height: 800,
    nodes: [{
      id: 'sub', type: 'subProcess', name: '外层', subProcessKey: 'outer', subProcessName: '外层来源', x: 10, y: 20,
      process: {
        processId: 'snapshot-process-id', processName: '快照标题',
        nodes: [{
          id: 'inner-sub', type: 'subProcess', name: '内层', subProcessKey: 'inner', subProcessName: '内层来源', x: 1, y: 2,
          process: { processId: 'ignored-inner', nodes: [{ id: 'approve', type: 'approval', name: '审批', x: 3, y: 4 }], flows: [], width: 300 },
        }],
        flows: [], width: 600, height: 400,
      },
    }],
    flows: [],
  }
  const result = toBpmnCompilerJson(model)
  assert.equal(result.processId, 'main')
  assert.equal(result.bizFormKey, 'form:main')
  assert.equal('width' in result, false)
  const outer = result.nodes[0]
  assert.equal('subProcessKey' in outer, false)
  assert.equal('subProcessName' in outer, false)
  assert.equal('width' in outer.process, false)
  const inner = outer.process.nodes[0]
  assert.equal('subProcessKey' in inner, false)
  assert.deepEqual(Object.keys(inner.process), ['nodes', 'flows'])
  assert.equal(inner.process.nodes[0].process, undefined)
})
