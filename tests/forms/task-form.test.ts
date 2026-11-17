import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TaskBusinessForm from '../../src/components/forms/TaskBusinessForm.vue'
import type { FormGateway, TaskBusinessForm as TaskForm } from '../../src/api/workflow/forms'

const schema = { id: 'smoke', type: 'default', schemaVersion: 19, components: [
  { id: 'title-id', type: 'textfield', key: 'title', label: '申请说明', validate: { required: true } },
  { id: 'amount-id', type: 'number', key: 'amount', label: '金额' },
  { id: 'approved-id', type: 'checkbox', key: 'approved', label: '确认' },
] }
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0 })

function render(gateway: Partial<FormGateway>) {
  const wrapper = mount(TaskBusinessForm, { props: { taskId: 'task-1', gateway: gateway as FormGateway }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}
async function ready(wrapper: ReturnType<typeof render>) {
  await flushPromises()
  await expect.poll(() => wrapper.find('input[type="text"]').exists()).toBe(true)
  await expect.poll(() => (wrapper.get('button').element as HTMLButtonElement).disabled).toBe(false)
  await flushPromises()
}

describe('task form with the official viewer', () => {
  it('prefills, validates, preserves input on failure and completes once using only current keys', async () => {
    const calls: unknown[] = []
    const completion = deferred<void>()
    let fail = true
    const wrapper = render({
      task: async () => ({ type: 'form', data: schema, values: { title: '旧值', amount: 0, approved: false, unrelated: '不应提交' } }),
      complete: async (id, values) => { calls.push({ id, values }); if (fail) throw new Error('任务冲突 409'); await completion.promise },
    })
    await ready(wrapper)
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('旧值')
    expect(calls).toHaveLength(0)
    await wrapper.get('input[type="text"]').setValue('')
    await wrapper.get('input[type="text"]').trigger('blur')
    await wrapper.get('input[type="text"]').trigger('focusout')
    await new Promise(resolve => setTimeout(resolve, 350))
    await wrapper.get('.task-business-form > button').trigger('click')
    await flushPromises()
    expect(calls).toHaveLength(0)
    expect(wrapper.text()).toContain('必填')
    await wrapper.get('input[type="text"]').setValue('保留输入')
    await wrapper.get('input[type="text"]').trigger('blur')
    await wrapper.get('input[type="text"]').trigger('focusout')
    await new Promise(resolve => setTimeout(resolve, 350))
    await wrapper.get('.task-business-form > button').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('任务冲突 409')
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('保留输入')
    expect(calls[0]).toEqual({ id: 'task-1', values: { title: '保留输入', amount: 0, approved: false } })
    fail = false
    await wrapper.get('.task-business-form > button').trigger('click'); await wrapper.get('.task-business-form > button').trigger('click')
    expect(calls).toHaveLength(2)
    completion.resolve(); await flushPromises()
    expect(wrapper.emitted('completed')).toEqual([['task-1']])
  })

  it('isolates late task responses, route, none and request errors', async () => {
    const old = deferred<TaskForm>()
    const wrapper = render({ task: async id => {
      if (id === 'task-1') return old.promise
      if (id === 'route') return { type: 'route', data: '/orders/1' }
      if (id === 'none') return { type: 'none', data: null }
      throw new Error('无权限 403')
    } })
    await wrapper.setProps({ taskId: 'route' }); await flushPromises()
    expect(wrapper.text()).toContain('/orders/1')
    old.resolve({ type: 'form', data: schema, values: { title: '过期内容' } }); await flushPromises()
    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.setProps({ taskId: 'none' }); await flushPromises()
    expect(wrapper.text()).toContain('未返回业务表单')
    await wrapper.setProps({ taskId: 'denied' }); await flushPromises()
    expect(wrapper.text()).toContain('无权限 403')
    expect(wrapper.text()).not.toContain('未返回业务表单')
  })

  it('reports unsupported types and malformed schemas without offering a valid submission', async () => {
    let completed = 0
    const wrapper = render({ task: async id => id === 'invalid'
      ? { type: 'form', data: { type: 'not-a-form' }, values: {} }
      : { type: 'future-type', data: null } as unknown as TaskForm,
    complete: async () => { completed++ },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂不支持此表单类型')
    await wrapper.setProps({ taskId: 'invalid' }); await flushPromises()
    await expect.poll(() => wrapper.text().includes('表单无法加载')).toBe(true)
    expect((wrapper.get('.task-business-form > button').element as HTMLButtonElement).disabled).toBe(true)
    expect(completed).toBe(0)
  })
})
