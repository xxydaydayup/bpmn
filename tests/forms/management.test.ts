import { mount, flushPromises } from '@vue/test-utils'
import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElMessageBox } from 'element-plus'
import FormManagementView from '../../src/views/FormManagementView.vue'
import type { BusinessForm, FormGateway, FormHistory } from '../../src/api/workflow/forms'

beforeAll(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } })
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0; vi.restoreAllMocks() })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
const schema = { id: 'leave', type: 'default', schemaVersion: 19, components: [{ id: 'reason-id', type: 'textfield', key: 'reason', label: '说明', validate: { required: true } }] }

it('opens, edits, previews, saves, publishes, rolls back and changes availability through the page', async () => {
  let value: BusinessForm = { formKey: 'leave', formName: '请假单', version: 0, status: 'DRAFT', formJson: schema }
  const versions: FormHistory[] = []
  const publishing = deferred<BusinessForm>()
  let publishCalls = 0, saveFails = true
  const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')
  const gateway = {
    list: async () => [value], get: async () => value,
    update: async (_key, input) => { if (saveFails) throw new Error('保存失败'); return value = { ...value, ...input, status: 'DRAFT' } },
    publish: async () => { publishCalls++; value = { ...value, status: 'PUBLISHED', version: 1 }; versions.push({ ...value }); return publishing.promise },
    history: async () => versions,
    rollback: async (_key, version) => { expect(version).toBe(1); value = { ...value, status: 'PUBLISHED', version: 2 }; versions.push({ ...value }); return value },
    disable: async () => value = { ...value, status: 'DISABLED' },
    enable: async () => value = { ...value, status: 'PUBLISHED' },
    delete: async () => undefined,
  } satisfies Partial<FormGateway>
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: FormManagementView, props: { gateway } }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router, ElementPlus] }, attachTo: document.body })
  wrappers.push(wrapper)
  const button = (name: string) => wrapper.findAll('button').filter(item => item.text() === name).at(-1)!
  await flushPromises(); await button('打开').trigger('click'); await flushPromises()
  await expect.poll(() => wrapper.find('.form-surface[aria-busy="false"]').exists()).toBe(true)
  expect((wrapper.get('.metadata input').element as HTMLInputElement).disabled).toBe(true)
  await wrapper.findAll('.metadata input')[1]!.setValue('改后名称')
  await button('预览').trigger('click'); await flushPromises()
  await expect.poll(() => wrapper.find('.form-surface input[type="text"]').exists()).toBe(true)
  await button('保存草稿').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('保存失败')
  expect((wrapper.findAll('.metadata input')[1]!.element as HTMLInputElement).value).toBe('改后名称')
  saveFails = false
  await button('保存草稿').trigger('click'); await flushPromises()
  await expect.poll(() => (button('发布已保存草稿').element as HTMLButtonElement).disabled).toBe(false)
  expect(value.formJson).toEqual(schema)
  await button('发布已保存草稿').trigger('click'); await flushPromises()
  await button('发布已保存草稿').trigger('click'); await flushPromises()
  expect(publishCalls).toBe(1)
  publishing.resolve(value); await flushPromises()
  expect(wrapper.text()).toContain('v1')
  expect(confirm).toHaveBeenCalled()
  await button('发布历史').trigger('click'); await flushPromises()
  // The first preview button is the editor toolbar; the second previews the history row.
  await wrapper.findAll('button').filter(item => item.text() === '预览').at(-1)!.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('历史快照 · v1')
  await button('回滚为新版本').trigger('click'); await flushPromises()
  expect(value.version).toBe(2); expect(versions[0]!.version).toBe(1)
  const historyDialog = wrapper.findAll('.el-dialog').at(-1)!
  await historyDialog.get('.el-dialog__headerbtn').trigger('click'); await flushPromises()
  await button('停用').trigger('click'); await flushPromises()
  expect(value.status).toBe('DISABLED')
  await button('启用').trigger('click'); await flushPromises()
  expect(value.status).toBe('PUBLISHED'); expect(value.version).toBe(2)
})
