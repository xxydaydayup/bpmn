import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/api/workflow/subProcessGateway.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const code = compiled
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
  assert.deepEqual(Object.keys(inner.process), ['processId', 'nodes', 'flows'])
  assert.equal(inner.process.nodes[0].process, undefined)
})
