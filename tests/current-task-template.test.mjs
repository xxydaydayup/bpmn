import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const vueUrl = import.meta.resolve('vue')
const source = readFileSync(new URL('../src/composables/useCurrentTaskTemplate.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { effectScope, nextTick, ref } = await import(vueUrl)
const { useCurrentTaskTemplate } = await import(moduleUrl(compiled))
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('designer loads the current task template XML after its canvas is ready', async () => {
  const taskKey = ref('leave')
  const ready = ref(false)
  const busy = ref(false)
  const imports = []
  const calls = []
  const gateway = { getTemplate: async (key, signal) => {
    calls.push({ key, signal })
    return { taskKey: key, bpmnXml: '<bpmn:definitions />' }
  } }
  const scope = effectScope()
  const state = scope.run(() => useCurrentTaskTemplate(taskKey, ready, busy, async xml => {
    imports.push(xml)
    return true
  }, gateway, async () => true))

  try {
    assert.equal(calls.length, 0)
    ready.value = true
    await nextTick()
    await tick()
    assert.equal(calls[0].key, 'leave')
    assert.equal(imports[0], '<bpmn:definitions />')
    assert.equal(state.loading.value, false)
    assert.equal(state.error.value, '')
  } finally {
    scope.stop()
  }
})

test('designer reports unavailable XML and isolates a superseded template request', async () => {
  const taskKey = ref('old')
  const ready = ref(true)
  const busy = ref(false)
  const imports = []
  const pending = new Map()
  const gateway = { getTemplate: (key, signal) => new Promise((resolve, reject) => pending.set(key, { resolve, reject, signal })) }
  const scope = effectScope()
  const state = scope.run(() => useCurrentTaskTemplate(taskKey, ready, busy, async xml => {
    imports.push(xml)
    return true
  }, gateway, async () => true))

  try {
    await nextTick()
    taskKey.value = 'current'
    await nextTick()
    assert.equal(pending.get('old').signal.aborted, true)
    pending.get('old').resolve({ taskKey: 'old', bpmnXml: '<old />' })
    pending.get('current').resolve({ taskKey: 'current', bpmnXml: '' })
    await tick()
    assert.deepEqual(imports, [])
    assert.match(state.error.value, /没有可编辑的 BPMN 流程 XML/)

    taskKey.value = 'missing'
    await nextTick()
    pending.get('missing').reject(new Error('任务模板不存在'))
    await tick()
    assert.equal(state.error.value, '任务模板不存在')
  } finally {
    scope.stop()
  }
})

test('clearing the template route during XML import restores the default diagram afterward', async () => {
  const taskKey = ref('leave')
  const ready = ref(true)
  const busy = ref(false)
  let finishImport
  let resetCount = 0
  const scope = effectScope()
  const state = scope.run(() => useCurrentTaskTemplate(taskKey, ready, busy, async () => new Promise(resolve => {
    finishImport = resolve
  }), {
    getTemplate: async key => ({ taskKey: key, bpmnXml: '<template />' }),
  }, async () => { resetCount += 1; return true }))

  try {
    await tick()
    taskKey.value = undefined
    await nextTick()
    finishImport(true)
    await tick()
    assert.equal(resetCount, 1)
    assert.equal(state.error.value, '')
  } finally {
    scope.stop()
  }
})

test('serializes old and new template imports so the old XML cannot finish last', async () => {
  const taskKey = ref('old')
  const ready = ref(true)
  const busy = ref(false)
  const imports = []
  const pending = []
  const scope = effectScope()
  const state = scope.run(() => useCurrentTaskTemplate(taskKey, ready, busy, async xml => {
    imports.push(xml)
    return new Promise(resolve => pending.push(resolve))
  }, {
    getTemplate: async key => ({ taskKey: key, bpmnXml: `<${key} />` }),
  }, async () => true))

  try {
    await tick()
    taskKey.value = 'new'
    await nextTick()
    await tick()
    assert.deepEqual(imports, ['<old />'])
    pending.shift()(true)
    await tick()
    assert.deepEqual(imports, ['<old />', '<new />'])
    pending.shift()(true)
    await tick()
    assert.equal(state.error.value, '')
  } finally {
    scope.stop()
  }
})
