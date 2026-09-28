import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { parse, compileScript } = require('vue/compiler-sfc')
const vueUrl = pathToFileURL(require.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
const { effectScope, nextTick } = await import(vueUrl)
const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const latestUrl = moduleUrl(compile(source('src/utils/latestQuery.ts')))
const markersUrl = moduleUrl(compile(source('src/utils/activityMarkers.ts')))
const { createLatestQueryScope } = await import(latestUrl)
const { collectActiveActivityIds } = await import(markersUrl)
const fixtures = globalThis.__camundaConsoleFixtures = new Map()
let sequence = 0
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

async function mountConsole(overrides = {}) {
  const id = ++sequence
  const state = { mounted: [], unmounted: [], requests: [], messages: [] }
  state.gateway = new Proxy(overrides, { get(target, key) {
    if (key in target) return target[key]
    return async (...args) => {
      state.requests.push({ method: key, args })
      if (key === 'getVersion') return { version: '7.20.0' }
      if (key.startsWith('count')) return 0
      if (key.startsWith('list')) return []
      if (key === 'getDefinitionXml') return { id: args[0], bpmn20Xml: '<xml id="' + args[0] + '" />' }
      if (key === 'getActivityInstance') return { id: args[0], childActivityInstances: [] }
      if (key === 'getProcessInstanceVariables') return {}
    }
  } })
  fixtures.set(id, state)
  const bridge = 'const state = globalThis.__camundaConsoleFixtures.get(' + id + ');'
  const vueFacade = moduleUrl(bridge + 'export * from ' + JSON.stringify(vueUrl) + '; export const onMounted = fn => state.mounted.push(fn); export const onBeforeUnmount = fn => state.unmounted.push(fn);')
  const gatewayFacade = moduleUrl(bridge + 'export const camundaGateway = state.gateway;')
  const { descriptor } = parse(source('src/views/CamundaConsoleView.vue'))
  let code = compileScript(descriptor, { id: 'console-test-' + id }).content
  code = code.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueFacade))
  code = code.replace(/import\s*\{([^}]+)\}\s*from ['"]element-plus['"]/, (_, names) => names.split(',').map(n => n.trim()).map(n => {
    if (n === 'ElMessage') return 'const ElMessage = { success: value => globalThis.__camundaConsoleFixtures.get(' + id + ').messages.push(value) };'
    if (n === 'ElMessageBox') return 'const ElMessageBox = { confirm: async () => {}, prompt: async () => ({ value: "3" }) };'
    return 'const ' + n + ' = {};'
  }).join('\n'))
  code = code.replace(/import\s*\{([^}]+)\}\s*from ['"]@element-plus\/icons-vue['"]/, (_, names) => names.split(',').map(n => 'const ' + n.trim() + ' = {};').join('\n'))
  code = code.replace(/import initialDiagram from [^\n]+/, 'const initialDiagram = "<xml/>";')
  code = code.replace(/import ReadOnlyProcessDiagram from [^\n]+/, 'const ReadOnlyProcessDiagram = {};')
  code = code.replace(/from ['"]@\/api\/camunda\/gateway['"]/, 'from ' + JSON.stringify(gatewayFacade))
  code = code.replace(/from ['"]@\/utils\/latestQuery['"]/, 'from ' + JSON.stringify(latestUrl))
  code = code.replace(/from ['"]@\/utils\/activityMarkers['"]/, 'from ' + JSON.stringify(markersUrl))
  code = code.replace(/from ['"]axios['"]/, 'from ' + JSON.stringify(import.meta.resolve('axios')))
  const component = (await import(moduleUrl(compile(code)))).default
  const scope = effectScope()
  const vm = scope.run(() => component.setup({}, { expose() {} }))
  return { vm, state, dispose() { state.unmounted.forEach(fn => fn()); scope.stop(); fixtures.delete(id) } }
}

test('query channels abort superseded requests without cancelling independent channels', () => {
  const scope = createLatestQueryScope()
  const old = scope.begin('instances'), other = scope.begin('definitions'), current = scope.begin('instances')
  assert.equal(old.signal.aborted, true)
  old.finish()
  assert.equal(current.isCurrent(), true)
  assert.equal(other.isCurrent(), true)
  scope.dispose()
  assert.equal(current.signal.aborted, true)
  assert.equal(other.isCurrent(), false)
  assert.equal(scope.begin('after-unmount').signal.aborted, true)
})

test('overview distinguishes partial failures from genuine zero counts', async () => {
  const c = await mountConsole({ countTasks: async () => { throw new Error('Forbidden') } })
  try {
    await c.vm.refreshOverview()
    assert.equal(c.vm.engineState.value, 'partial')
    assert.equal(c.vm.counts.tasks, null)
    assert.equal(c.vm.counts.incidents, 0)
    assert.match(c.vm.error.value, /人工任务.*Forbidden/)
  } finally { c.dispose() }
})

test('failed reconnection clears stale version and does not report a healthy engine', async () => {
  let connected = true
  const c = await mountConsole({ getVersion: async () => { if (!connected) throw new Error('offline'); return { version: '7.20.0' } } })
  try {
    await c.vm.refreshOverview()
    connected = false
    await c.vm.refreshOverview()
    assert.equal(c.vm.version.value, undefined)
    assert.equal(c.vm.engineState.value, 'failed')
  } finally { c.dispose() }
})

test('definition XML ignores late responses and clears when its list refreshes', async () => {
  const a = deferred(), b = deferred()
  const c = await mountConsole({ getDefinitionXml: id => id === 'a' ? a.promise : b.promise })
  try {
    const first = c.vm.selectDefinition({ id: 'a', key: 'a' })
    const second = c.vm.selectDefinition({ id: 'b', key: 'b' })
    b.resolve({ bpmn20Xml: 'B' }); await second
    a.resolve({ bpmn20Xml: 'A' }); await first
    assert.equal(c.vm.selectedDefinitionXml.value, 'B')
    await c.vm.loadDefinitions()
    assert.equal(c.vm.selectedDefinition.value, undefined)
    assert.equal(c.vm.selectedDefinitionXml.value, '')
  } finally { c.dispose() }
})

test('switching instances keeps XML, variables and activities bound to the newest ID', async () => {
  const delayed = deferred()
  const c = await mountConsole({ getActivityInstance: id => id === 'a' ? delayed.promise : Promise.resolve({ id: 'b' }) })
  try {
    const first = c.vm.selectInstance({ id: 'a', definitionId: 'def-a' })
    await c.vm.selectInstance({ id: 'b', definitionId: 'def-b' })
    delayed.resolve({ id: 'a' }); await first
    assert.equal(c.vm.selectedActivity.value.id, 'b')
    assert.match(c.vm.selectedInstanceXml.value, /def-b/)
    const variableCall = c.state.requests.find(r => r.method === 'getProcessInstanceVariables')
    assert.equal(variableCall.args[1], false)
  } finally { c.dispose() }
})

test('search resets pagination, refresh keeps submitted filters, and reset clears them', async () => {
  const c = await mountConsole({ countProcessInstances: async () => 100 })
  try {
    c.vm.activeTab.value = 'instances'
    c.vm.pages.instances.page = 4
    c.vm.instanceBusinessKey.value = 'order-1'
    await c.vm.searchActiveTab()
    assert.equal(c.vm.pages.instances.page, 1)
    c.vm.instanceBusinessKey.value = 'not-submitted'
    await c.vm.changeActivePage(2)
    const call = c.state.requests.filter(r => r.method === 'listProcessInstances').at(-1)
    assert.equal(call.args[0].businessKey, 'order-1')
    assert.equal(call.args[0].firstResult, 20)
    await c.vm.searchActiveTab(true)
    assert.equal(c.vm.pages.instances.page, 1)
    assert.equal(c.state.requests.filter(r => r.method === 'listProcessInstances').at(-1).args[0].businessKey, undefined)
  } finally { c.dispose() }
})

test('external task filters use process instance and topic without applying user-task assignee', async () => {
  const c = await mountConsole()
  try {
    c.vm.activeTab.value = 'tasks'; c.vm.taskTab.value = 'external'
    await nextTick()
    c.vm.taskAssignee.value = 'alice'; c.vm.taskProcessInstanceId.value = 'instance-x'; c.vm.externalTopic.value = 'payments'
    await c.vm.searchActiveTab()
    const list = c.state.requests.filter(r => r.method === 'listExternalTasks').at(-1).args[0]
    const count = c.state.requests.filter(r => r.method === 'countExternalTasks').at(-1).args[0]
    assert.equal(list.processInstanceId, 'instance-x'); assert.equal(count.processInstanceId, 'instance-x')
    assert.equal(list.topicName, 'payments'); assert.equal(count.topicName, 'payments')
    assert.equal(list.assignee, undefined)
  } finally { c.dispose() }
})

test('historic query includes ongoing records and isolates failures from other tabs', async () => {
  const c = await mountConsole({ listTasks: async () => { throw new Error('tasks denied') } })
  try {
    c.vm.activeTab.value = 'tasks'; await c.vm.loadTasks()
    assert.match(c.vm.error.value, /tasks denied/)
    c.vm.activeTab.value = 'history'; await c.vm.loadHistory()
    assert.equal(c.vm.error.value, '')
    const q = c.state.requests.find(r => r.method === 'listHistoricProcessInstances').args[0]
    assert.equal(q.finished, undefined)
  } finally { c.dispose() }
})

test('unmount aborts requests and prevents a late result from populating the console', async () => {
  const pending = deferred(); let signal
  const c = await mountConsole({ listProcessInstances: (q, s) => { signal = s; return pending.promise } })
  const result = c.vm.loadInstances()
  c.dispose()
  assert.equal(signal.aborted, true)
  pending.resolve([{ id: 'late' }]); await result
  assert.deepEqual(c.vm.instances.value, [])
})

test('activity markers use BPMN IDs, deduplicate multi-instance bodies and include async transitions', () => {
  const ids = collectActiveActivityIds({ id: 'runtime-root', activityId: 'process', childActivityInstances: [{ id: 'runtime-mi', activityId: 'task#multiInstanceBody', childActivityInstances: [{ id: 'runtime-task', activityId: 'task' }] }], childTransitionInstances: [{ id: 'runtime-transition', activityId: 'async-task' }] })
  assert.deepEqual(ids.sort(), ['async-task', 'task'])
})

test('gateway sends only supported delete flags and propagates cancellation signals', async () => {
  const calls = []
  const id = ++sequence
  fixtures.set(id, { request: async config => { calls.push(config); return config.url.endsWith('/count') ? { count: 3 } : [] } })
  let code = compile(source('src/api/camunda/gateway.ts'))
  code = code.replace(/import \{ request \} from [^\n]+/, 'const request = globalThis.__camundaConsoleFixtures.get(' + id + ').request;')
  code = code.replace(/import \{ ensureDeploymentHistoryTimeToLive \} from [^\n]+/, 'const ensureDeploymentHistoryTimeToLive = xml => xml;')
  code = code.replace(/export \* from ['"]\.\/types['"];?/, '')
  const { camundaGateway: gateway } = await import(moduleUrl(code))
  try {
    const signal = new AbortController().signal
    await gateway.listProcessInstances({ firstResult: 20, maxResults: 20 }, signal)
    assert.equal(calls[0].signal, signal)
    assert.equal(calls[0].params.firstResult, 20)
    assert.equal(await gateway.countHistoricTasks({ processInstanceId: 'p' }, signal), 3)
    assert.equal(calls[1].url, '/camunda/history/task/count')
    await gateway.deleteProcessInstance('instance:1')
    assert.equal(calls[2].url, '/camunda/process-instance/instance%3A1')
    assert.deepEqual(Object.keys(calls[2].params).sort(), ['failIfNotExists', 'skipCustomListeners', 'skipIoMappings', 'skipSubprocesses'].sort())
  } finally { fixtures.delete(id) }
})
