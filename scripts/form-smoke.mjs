// Run against the development proxy; credentials remain in Vite's server configuration.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import ts from 'typescript'

const base = process.env.FORM_SMOKE_BASE_URL || 'http://localhost:5171'
const stamp = new Date().toISOString().replace(/\D/g, '')
const key = 'form_smoke_' + stamp
const processKey = 'process_' + key
const report = { checkedAt: new Date().toISOString(), base, key, processKey, checks: [], resources: {}, cleanup: [] }
const keep = process.argv.includes('--keep')
const record = (name, details) => { report.checks.push({ name, details }); console.log('PASS ' + name) }
async function request(config) {
  const uri = new URL('/api' + config.url, base)
  for (const [name, value] of Object.entries(config.params || {})) if (value !== undefined) uri.searchParams.set(name, value)
  const response = await fetch(uri, {
    method: config.method || 'GET', signal: config.signal ?? AbortSignal.timeout(20000),
    ...(config.data !== undefined ? { body: config.data instanceof FormData ? config.data : JSON.stringify(config.data), headers: config.data instanceof FormData ? {} : { 'Content-Type': 'application/json' } } : {}),
  })
  const body = await response.json()
  if (!response.ok || body.code !== 'OK') throw Object.assign(new Error(config.method + ' ' + config.url + ': ' + (body.message || response.status)), { status: response.status, response: { status: response.status, data: body } })
  return body
}
const call = async (method, url, data, params) => (await request({ method, url: '/v1' + url, data, params })).data
const source = await readFile(new URL('../src/api/workflow/forms.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/import \{ request \} from ['"]@\/utils\/request['"];?/, 'const request = () => { throw new Error("Inject smoke requester") };')
const formsUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const { createFormGateway } = await import(formsUrl)
const bindingSource = await readFile(new URL('../src/api/workflow/formBinding.ts', import.meta.url), 'utf8')
const bindingCode = ts.transpileModule(bindingSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from ['"]\.\/forms['"]/, 'from ' + JSON.stringify(formsUrl))
const { validateFormBindings } = await import('data:text/javascript;base64,' + Buffer.from(bindingCode).toString('base64'))
const forms = createFormGateway(request)
const schema = { id: key, type: 'default', schemaVersion: 19, components: [
  { id: 'text-id', type: 'textfield', key: 'reason', label: '申请说明 v1', validate: { required: true } },
  { id: 'number-id', type: 'number', key: 'amount', label: '金额' },
  { id: 'boolean-id', type: 'checkbox', key: 'confirmed', label: '确认' },
  { id: 'array-id', type: 'checklist', key: 'departments', label: '部门', values: [{ label: '财务', value: 'finance' }, { label: '研发', value: 'engineering' }] },
  { id: 'object-id', type: 'expression', key: 'details', label: '明细', expression: '={ note: "对象保留" }', computeOn: 'change' },
  { id: 'vote-id', type: 'radio', key: 'vote', label: '表决', values: [{ label: '同意', value: 'agree' }, { label: '驳回', value: 'reject' }], defaultValue: 'agree' },
] }
const model = { processId: processKey, processName: '表单闭环验收 ' + stamp, nodes: [
  { id: 'start', type: 'start', name: '开始' },
  { id: 'apply', type: 'approval', name: '申请', form: 'legacy-camunda-form', bizFormKey: 'form:' + key + '@1' },
  { id: 'review', type: 'approval', name: '复核', bizFormKey: 'form:' + key + '@1' },
  { id: 'sign', type: 'countersign', name: '会签', approveMode: 'ALL', sequential: false, bizFormKey: 'form:' + key + '@1' },
  { id: 'end', type: 'end', name: '结束' },
], flows: [{ source: 'start', target: 'apply' }, { source: 'apply', target: 'review' }, { source: 'review', target: 'sign' }, { source: 'sign', target: 'end' }] }
let formCreated = false, template, instance
async function tasks() { return call('GET', '/tasks', undefined, { processInstanceId: instance.processInstanceId, maxResults: 100 }) }
async function currentTask(node) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = (await tasks()).find(task => task.taskDefinitionKey === node)
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('No current task for ' + node)
}
async function engine(method, path, data) {
  const response = await fetch(base + '/api/camunda' + path, { method, headers: { 'Content-Type': 'application/json' }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Engine ' + method + ' ' + path + ': ' + response.status)
  const text = await response.text()
  return text ? JSON.parse(text) : undefined
}
try {
  const draft = await forms.create({ formKey: key, formName: '闭环验收表单 ' + stamp, formJson: schema })
  formCreated = true
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.version, 0)
  const v1 = await forms.publish(key)
  assert.equal(v1.version, 1); assert.equal(v1.status, 'PUBLISHED')
  record('create and publish v1', { key, version: v1.version })
  await validateFormBindings(model, forms)
  const compilation = await call('POST', '/bpmn/json2xml', model)
  assert.ok(compilation.bpmnXml.includes('apply_bizFormKey'))
  assert.ok(compilation.bpmnXml.includes('camunda:formKey="legacy-camunda-form"'))
  await mkdir('.scratch/form-smoke', { recursive: true })
  await writeFile('.scratch/form-smoke/' + key + '.bpmn', compilation.bpmnXml)
  const multipart = new FormData()
  multipart.append('deployment-name', model.processName)
  multipart.append('template-key', processKey); multipart.append('template-name', model.processName)
  multipart.append('startable', 'true'); multipart.append('suspended', 'false')
  multipart.append('display-json', JSON.stringify(model))
  multipart.append('file', new Blob([compilation.bpmnXml], { type: 'application/xml' }), processKey + '.bpmn')
  template = await call('POST', '/template', multipart)
  report.resources.template = template
  instance = await call('POST', '/task/instances/start', { templateKey: processKey, businessKey: key, variables: { apply_assignee: 'demo', review_assignee: 'demo', sign_approverList: ['demo'], reason: '预填', amount: 0, confirmed: false } })
  report.resources.instance = instance
  const apply = await currentTask('apply')
  report.resources.firstTask = apply.id
  const first = await forms.task(apply.id)
  assert.equal(first.type, 'form'); assert.equal(first.data.components[0].label, '申请说明 v1')
  assert.equal(first.values.reason, '预填'); assert.equal(first.values.amount, 0); assert.equal(first.values.confirmed, false)
  const variables = await engine('GET', '/process-instance/' + instance.processInstanceId + '/variables')
  assert.equal(variables.apply_bizFormKey.value, 'form:' + key + '@1')
  record('compiled binding and actual task prefill', { taskId: apply.id, binding: variables.apply_bizFormKey, values: first.values })
  const v2schema = structuredClone(schema); v2schema.components[0].label = '申请说明 v2'
  const edited = await forms.update(key, { formName: v1.formName, formJson: v2schema })
  assert.equal(edited.status, 'DRAFT')
  assert.equal((await forms.publish(key)).version, 2)
  await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: 'form:' + key + '@latest', type: 'String' })
  assert.equal((await forms.task(apply.id)).data.components[0].label, '申请说明 v2')
  await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: 'form:' + key + '@1', type: 'String' })
  assert.equal((await forms.rollback(key, 1)).version, 3)
  assert.equal((await forms.task(apply.id)).data.components[0].label, '申请说明 v1')
  // Change only this dedicated instance to exercise the legacy latest parser, then restore it.
  await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: 'form:' + key + '@latest', type: 'String' })
  assert.deepEqual((await forms.task(apply.id)).data, (await forms.history(key)).find(item => item.version === 3).formJson)
  await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: 'form:' + key + '@1', type: 'String' })
  record('v2 publish and rollback v3 preserve fixed v1; latest resolves v3', { versions: (await forms.history(key)).map(row => row.version) })
  await forms.disable(key)
  await assert.rejects(validateFormBindings(model, forms), /尚未发布或已停用/)
  assert.equal((await forms.task(apply.id)).type, 'form')
  assert.equal((await forms.list({ status: 'PUBLISHED', nameLike: v1.formName })).some(row => row.formKey === key), false)
  await forms.enable(key)
  record('disable hides new candidates while fixed snapshots remain readable; enable keeps v3', { version: (await forms.get(key)).version })
  for (const [reference, expected] of [['route:/smoke/order', 'route'], ['form:missing_' + stamp + '@99', 'none'], ['', 'none']]) {
    await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: reference, type: 'String' })
    assert.equal((await forms.task(apply.id)).type, expected)
  }
  record('route, unavailable version and unbound legacy compatibility', { route: '/smoke/order', unavailable: 'none', unbound: 'none' })
  await engine('PUT', '/process-instance/' + instance.processInstanceId + '/variables/apply_bizFormKey', { value: 'form:' + key + '@1', type: 'String' })
  const values = { reason: '实测原 key', amount: 12.5, confirmed: true, departments: ['finance', 'engineering'], details: { note: '对象保留' }, vote: 'agree' }
  await forms.complete(apply.id, values)
  const review = await currentTask('review')
  const prefill = await forms.task(review.id)
  report.resources.reviewTask = review.id
  report.checks.push({ name: 'observed next-task values', details: prefill.values })
  for (const [field, value] of Object.entries(values)) assert.deepEqual(prefill.values[field], value, field + ' JSON type must survive')
  const saved = await engine('GET', '/process-instance/' + instance.processInstanceId + '/variables')
  assert.equal(saved.apply_reason, undefined)
  record('String Boolean Number Array Object complete and next-task roundtrip', { values: prefill.values, types: Object.fromEntries(Object.keys(values).map(field => [field, saved[field]?.type])) })
  await forms.complete(review.id, { ...values, reason: '复核完成' })
  const sign = await currentTask('sign')
  assert.equal((await forms.task(sign.id)).values.reason, '复核完成')
  await forms.delete(key); formCreated = false
  await assert.rejects(validateFormBindings(model, forms), /无法核对表单/)
  assert.equal((await forms.task(sign.id)).type, 'form')
  record('deleted master retains readable fixed snapshot for a running task', { taskId: sign.id, reference: 'form:' + key + '@1' })
  await forms.complete(sign.id, { ...values, reason: '会签完成', vote: 'agree' })
  record('approval and countersign task progression', { completed: [apply.id, review.id, sign.id] })
  assert.ok((await forms.history(key)).some(row => row.version === 1))
  const recreated = await forms.create({ formKey: key, formName: v1.formName, formJson: schema }); formCreated = true
  assert.equal((await forms.publish(key)).version, 4)
  record('delete retains history; recreated key continues at v4', { recreatedVersion: recreated.version })
  if (keep) {
    const uiInstance = await call('POST', '/task/instances/start', { templateKey: processKey, businessKey: key + '_ui', variables: { apply_assignee: 'demo', review_assignee: 'demo', sign_approverList: ['demo'], reason: '浏览器验收预填', amount: 15, confirmed: false } })
    report.resources.uiInstance = uiInstance
  }
  report.ok = true
} catch (cause) {
  report.ok = false; report.failure = cause.message
  console.error('FAIL ' + cause.message)
  process.exitCode = 1
} finally {
  if (!keep) {
    if (formCreated) { try { await forms.delete(key); report.cleanup.push('form master deleted; history retained') } catch (cause) { report.cleanup.push(cause.message) } }
    if (template) {
      try { await call('DELETE', '/template/' + processKey); report.cleanup.push('business template deleted') } catch (cause) { report.cleanup.push(cause.message) }
      try { await engine('DELETE', '/deployment/' + template.deploymentId + '?cascade=true&skipCustomListeners=true&skipIoMappings=true'); report.cleanup.push('dedicated engine deployment deleted') } catch (cause) { report.cleanup.push(cause.message) }
    }
  } else report.cleanup.push('kept for inspection; use recorded keys to clean up')
  await mkdir('.scratch/form-smoke', { recursive: true })
  await writeFile('.scratch/form-smoke/' + key + '.json', JSON.stringify(report, null, 2))
  console.log('Report: .scratch/form-smoke/' + key + '.json')
}
