import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const vue = pathToFileURL(require.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const formsUrl = url(compile('../src/api/workflow/forms.ts').replace(/import \{ request \} from ['"]@\/utils\/request['"];?/, 'const request = () => { throw new Error("Unexpected default request") };'))
const { createFormGateway, formVariables, emptyForm, uncertainWrite } = await import(formsUrl)
const { useFormManagement } = await import(url(compile('../src/composables/useFormManagement.ts').replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vue)).replace(/from ['"]@\/api\/workflow\/forms['"]/g, 'from ' + JSON.stringify(formsUrl))))
const { validateFormBindings } = await import(url(compile('../src/api/workflow/formBinding.ts').replace(/from ['"]\.\/forms['"]/g, 'from ' + JSON.stringify(formsUrl))))
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const record = (patch = {}) => ({ formKey: 'leave', formName: '请假单', status: 'DRAFT', version: 0, formJson: emptyForm('leave'), ...patch })

test('form gateway follows lifecycle paths, immutable keys and variable types', async () => {
  const calls = []
  const gateway = createFormGateway(async config => { calls.push(config); return { code: 'OK', data: record() } })
  const controller = new AbortController()
  await gateway.list({ status: 'PUBLISHED', firstResult: 20, maxResults: 21 }, controller.signal)
  await gateway.get('form/a')
  await gateway.create({ formKey: 'leave', formName: '请假单', formJson: emptyForm() })
  await gateway.update('form/a', { formName: '新名称', formJson: emptyForm() })
  await gateway.publish('form/a')
  await gateway.history('form/a', { firstResult: 0, maxResults: 21 })
  await gateway.rollback('form/a', 2)
  await gateway.enable('form/a'); await gateway.disable('form/a'); await gateway.delete('form/a')
  await gateway.task('task/a', controller.signal)
  const values = { text: '你好', enabled: false, total: 0, list: [1, 'a'], object: { approved: true }, clear: null, absent: undefined }
  await gateway.complete('task/a', values)
  assert.equal(calls[0].signal, controller.signal)
  assert.equal(calls[1].url, '/v1/form/form%2Fa')
  assert.equal(calls[3].data.formKey, undefined)
  assert.equal(calls[4].url, '/v1/form/form%2Fa/publish')
  assert.deepEqual(calls[6].data, { version: 2 })
  assert.equal(calls[10].url, '/v1/tasks/task%2Fa/bizForm')
  assert.equal(calls[11].url, '/v1/tasks/task%2Fa/complete')
  assert.deepEqual(calls[11].data.variables, { text: { value: '你好' }, enabled: { value: false }, total: { value: 0 }, list: { value: [1, 'a'] }, object: { value: { approved: true } }, clear: { value: null } })
  assert.deepEqual(formVariables({ plain: 'value' }), { plain: { value: 'value' } })
  const failed = createFormGateway(async () => ({ code: 'NOT_ALLOWED', data: null, message: '无权限' }))
  await assert.rejects(failed.publish('leave'), /无权限/)
  const uncertain = createFormGateway(async () => ({ code: 'INTERNAL_ERROR', data: null, message: '存储异常' }))
  await assert.rejects(uncertain.publish('leave'), cause => uncertainWrite(cause))
})

test('saving a draft preserves editor JSON and failures preserve unsaved changes', async () => {
  let saved
  let fail = false
  const gateway = { list: async () => [], create: async input => { saved = input; return record(input) }, update: async (_key, input) => { if (fail) throw new Error('断网'); return record(input) } }
  const forms = useFormManagement(gateway)
  forms.create(); forms.draft.formKey = 'leave'; forms.draft.formName = '请假单'
  forms.schema.value = { ...emptyForm('leave'), components: [{ id: 'Field_1', type: 'textfield', key: 'reason', validate: { required: true } }] }
  assert.equal(await forms.save(), true)
  assert.equal(forms.dirty.value, false)
  assert.equal(saved.formJson.components[0].key, 'reason')
  forms.draft.formName = '未保存的名称'; fail = true
  assert.equal(await forms.save(), false)
  assert.equal(forms.draft.formName, '未保存的名称')
  assert.equal(forms.dirty.value, true)
  assert.match(forms.error.value, /断网/)
  forms.dispose()
})

test('late list and detail results cannot overwrite a newer search or new draft', async () => {
  const oldList = deferred(), newList = deferred(), oldDetail = deferred()
  let lists = 0
  const forms = useFormManagement({ list: () => ++lists === 1 ? oldList.promise : newList.promise, get: () => oldDetail.promise })
  const first = forms.load(), second = forms.search()
  newList.resolve([record({ formKey: 'new' })]); await second
  oldList.resolve([record({ formKey: 'old' })]); await first
  assert.equal(forms.rows.value[0].formKey, 'new')
  const opening = forms.open('leave')
  forms.create(); forms.draft.formName = '新草稿'
  oldDetail.resolve(record()); await opening
  assert.equal(forms.current.value, undefined)
  assert.equal(forms.draft.formName, '新草稿')
  forms.dispose()
})

test('publishing rejects duplicate requests and uncertainty requires explicit reconciliation', async () => {
  const publish = deferred()
  let publishCalls = 0
  const versions = [record({ status: 'PUBLISHED', version: 1 })]
  const forms = useFormManagement({ get: async () => versions[0], list: async () => versions, history: async () => versions, publish: () => { publishCalls++; return publish.promise } })
  await forms.open('leave')
  const first = forms.action('publish')
  await forms.action('publish')
  assert.equal(publishCalls, 1)
  publish.reject(new Error('请求超时')); await first
  assert.equal(forms.pendingWrite.value.key, 'leave')
  await forms.action('publish')
  assert.equal(publishCalls, 1)
  assert.match(forms.notice.value, /已核对/)
  assert.match(forms.error.value, /仍需人工核对/)
  forms.dispose()
})

test('rollback and availability keep backend versions and history semantics', async () => {
  let value = record({ status: 'PUBLISHED', version: 3 })
  const versions = [{ ...value, version: 1 }, { ...value, version: 3 }]
  const forms = useFormManagement({ get: async () => value, list: async () => [value], history: async () => versions, rollback: async (_key, version) => { assert.equal(version, 1); value = { ...value, version: 4 }; versions.push(value); return value }, disable: async () => value = { ...value, status: 'DISABLED' }, enable: async () => value = { ...value, status: 'PUBLISHED' }, delete: async () => undefined })
  await forms.open('leave'); await forms.action('rollback', 1)
  assert.equal(forms.current.value.version, 4)
  assert.equal(versions[0].version, 1)
  await forms.action('disable'); assert.equal(forms.current.value.status, 'DISABLED')
  await forms.action('enable'); assert.equal(forms.current.value.version, 4)
  await forms.action('delete'); assert.equal(forms.editing.value, false); assert.equal(versions.length, 3)
  forms.dispose()
})

test('binding validation checks old snapshots and nested nodes without changing legacy form', async () => {
  const node = { id: 'apply', type: 'approval', name: '审批', x: 0, y: 0, bizFormKey: 'form:leave@1', form: 'old-camunda-key' }
  const model = { processId: 'test', processName: '测试', nodes: [node], flows: [] }
  let status = 'PUBLISHED'
  const gateway = { get: async () => record({ status, version: 4 }), history: async () => [{ version: 1 }] }
  await validateFormBindings(model, gateway)
  assert.equal(node.form, 'old-camunda-key')
  assert.equal(node.bizFormKey, 'form:leave@1')
  status = 'DISABLED'
  await assert.rejects(validateFormBindings(model, gateway), /尚未发布或已停用/)
  status = 'PUBLISHED'
  await assert.rejects(validateFormBindings({ ...model, nodes: [{ ...node, bizFormKey: 'form:leave@8' }] }, gateway), /快照不存在/)
  await validateFormBindings({ ...model, nodes: [{ ...node, bizFormKey: undefined }] }, gateway)
  await assert.rejects(validateFormBindings({ ...model, nodes: [{ ...node, type: 'subProcess', process: { nodes: [{ ...node, bizFormKey: 'invalid' }] } }] }, gateway), /引用格式无效/)
})
