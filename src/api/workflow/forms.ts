import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'

export type FormSchema = Record<string, unknown> & { components?: Record<string, unknown>[] }
export interface BusinessForm {
  formKey: string
  formName: string
  description?: string
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  version: number
  formJson: FormSchema
  updatedAt?: string
}
export interface FormHistory { formKey: string; formName: string; version: number; formJson: FormSchema; createdAt?: string; publishedBy?: string }
export interface FormQuery { nameLike?: string; status?: string; firstResult?: number; maxResults?: number }
export type TaskBusinessForm = { type: 'form'; data: FormSchema; values: Record<string, unknown> } | { type: 'route'; data: string; values?: never } | { type: 'none'; data: null; values?: never }
export interface FormWrite { formKey: string; formName: string; description?: string; formJson: FormSchema }
export interface FormGateway {
  list(query?: FormQuery, signal?: AbortSignal): Promise<BusinessForm[]>
  get(key: string, signal?: AbortSignal): Promise<BusinessForm>
  create(input: FormWrite): Promise<BusinessForm>
  update(key: string, input: Omit<FormWrite, 'formKey'>): Promise<BusinessForm>
  publish(key: string): Promise<BusinessForm>
  history(key: string, query?: FormQuery, signal?: AbortSignal): Promise<FormHistory[]>
  rollback(key: string, version: number): Promise<BusinessForm>
  enable(key: string): Promise<BusinessForm>
  disable(key: string): Promise<BusinessForm>
  delete(key: string): Promise<void>
  task(taskId: string, signal?: AbortSignal): Promise<TaskBusinessForm>
  complete(taskId: string, values: Record<string, unknown>): Promise<void>
}
type Requester = <T>(config: AxiosRequestConfig) => Promise<T>

export function formError(cause: unknown): string {
  const error = cause as { message?: string; response?: { data?: { message?: string }; status?: number } }
  return error?.response?.data?.message || error?.message || '表单操作失败，请稍后重试'
}
export function uncertainWrite(cause: unknown) {
  const error = cause as { status?: number; response?: { status?: number } }
  const status = error?.status ?? error?.response?.status
  return !status || status >= 500 || status === 408
}

// Let the engine infer primitive and serializable collection types from JSON values.
// The current Camunda installation has no Spin Json serializer.
export function formVariables(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => [
    key, { value },
  ]))
}

export function createFormGateway(send: Requester = request): FormGateway {
  async function call<T>(method: string, url: string, data?: unknown, params?: FormQuery, signal?: AbortSignal): Promise<T> {
    const response = await send<{ code: string; data: T; message?: string }>({ method, url: '/v1' + url, ...(data !== undefined ? { data } : {}), ...(params ? { params } : {}), signal })
    if (response?.code !== 'OK') throw Object.assign(new Error(response?.message || '后端未确认表单操作成功'), { status: response?.code === 'INTERNAL_ERROR' || !response?.code ? 500 : 400, code: response?.code })
    return response.data
  }
  const resource = (key: string) => '/form/' + encodeURIComponent(key)
  return {
    list: (query, signal) => call('GET', '/form', undefined, query, signal),
    get: (key, signal) => call('GET', resource(key), undefined, undefined, signal),
    create: input => call('POST', '/form', input),
    update: (key, input) => call('PUT', resource(key), input),
    publish: key => call('POST', resource(key) + '/publish', {}),
    history: (key, query, signal) => call('GET', resource(key) + '/history', undefined, query, signal),
    rollback: (key, version) => call('POST', resource(key) + '/rollback', { version }),
    enable: key => call('POST', resource(key) + '/enable', {}),
    disable: key => call('POST', resource(key) + '/disable', {}),
    delete: async key => { await call('DELETE', resource(key)) },
    task: (taskId, signal) => call('GET', '/tasks/' + encodeURIComponent(taskId) + '/bizForm', undefined, undefined, signal),
    complete: async (taskId, values) => { await call('POST', '/tasks/' + encodeURIComponent(taskId) + '/complete', { variables: formVariables(values) }) },
  }
}
export const formGateway = createFormGateway()

export function emptyForm(key = 'Form_1'): FormSchema {
  return { id: key, type: 'default', schemaVersion: 19, components: [] }
}
