import type { WorkflowFormDataSource, WorkflowModel, WorkflowNodeRecord } from '@workflow/designer/types'
import { formGateway, type FormGateway } from './forms'

export function formDataSource(gateway: FormGateway = formGateway): WorkflowFormDataSource {
  const option = (form: { formKey: string; formName: string; version: number; status: string }) => ({ key: form.formKey, name: form.formName, version: form.version, status: form.status })
  return {
    list: async query => (await gateway.list({ ...query, status: 'PUBLISHED' }) ?? []).filter(row => row.status === 'PUBLISHED' && row.version > 0).map(option),
    get: async key => option(await gateway.get(key)),
  }
}
export const businessFormDataSource = formDataSource()

export async function validateFormBindings(model: WorkflowModel, gateway: FormGateway = formGateway) {
  const references = new Map<string, string[]>()
  const add = (value: unknown, label: string) => {
    if (typeof value !== 'string' || !value) return
    references.set(value, [...references.get(value) ?? [], label])
  }
  const visit = (nodes: WorkflowNodeRecord[], prefix = '') => {
    for (const node of nodes) {
      if (node.type === 'approval' || node.type === 'countersign') add(node.bizFormKey, prefix + (node.name || node.id))
      if (node.process) visit(node.process.nodes, prefix + node.name + ' / ')
    }
  }
  add(model.bizFormKey, '流程级业务表单'); visit(model.nodes)
  await Promise.all([...references].map(async ([reference, labels]) => {
    if (reference.startsWith('route:')) return
    const match = /^form:([^@]+)(?:@([1-9][0-9]*|latest))?$/.exec(reference)
    if (!match) throw new Error(labels.join('、') + '：业务表单引用格式无效')
    const form = await gateway.get(match[1]!).catch(cause => { throw new Error(labels.join('、') + '：无法核对表单 ' + match[1] + '（' + (cause instanceof Error ? cause.message : '目录读取失败') + '）') })
    if (form.status !== 'PUBLISHED' || form.version < 1) throw new Error(labels.join('、') + '：表单尚未发布或已停用，请重新选择')
    const version = match[2] && match[2] !== 'latest' ? Number(match[2]) : form.version
    let firstResult = 0
    for (;;) {
      const history = await gateway.history(form.formKey, { firstResult, maxResults: 100 }) ?? []
      if (history.some(row => row.version === version)) break
      if (history.length < 100) throw new Error(labels.join('、') + `：表单 v${version} 发布快照不存在`)
      firstResult += 100
    }
  }))
}
