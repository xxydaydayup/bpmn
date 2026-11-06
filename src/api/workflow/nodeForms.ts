import type { BusinessVariables } from './types'

export type FormStage = 'start' | 'complete'
export type FormFieldKind = 'text' | 'boolean' | 'vote' | 'string-list' | 'service-list'
export type WorkflowNodeSnapshot = Record<string, unknown> & {
  id: string
  type: string
  name?: string
  serviceName?: string
  serviceUrl?: string
  countersign?: boolean
  messageName?: string
  timerType?: 'duration' | 'date' | 'cycle'
  timerValue?: string
}

export interface NodeFormField {
  key: string
  label: string
  kind: FormFieldKind
  required: boolean
  variableName?: string
  hint?: string
}

export interface NodeFormConfig {
  nodeId: string
  nodeName: string
  nodeType: string
  fields: NodeFormField[]
}

const NODE_FORMS: Record<string, Partial<Record<FormStage, (node: WorkflowNodeSnapshot) => NodeFormField[]>>> = {
  approval: {
    start: () => [{ key: 'assignee', label: '审批人', kind: 'text', required: true }],
    complete: () => [{ key: 'approved', label: '审批结果', kind: 'boolean', required: true }],
  },
  countersign: {
    start: () => [{ key: 'approverList', label: '审批参与人', kind: 'string-list', required: true }],
    complete: () => [{ key: 'vote', label: '表决结果', kind: 'vote', required: true }],
  },
  service: {
    start: node => node.countersign
      ? [{ key: 'serviceList', label: '服务列表', kind: 'service-list', required: true }]
      : [
          { key: 'serviceName', label: '服务名称', kind: 'text', required: false },
          { key: 'serviceUrl', label: '服务地址', kind: 'text', required: false },
        ],
  },
  receive: {
    start: node => node.messageName?.trim() ? [] : [{
      key: 'messageName', label: '消息名', kind: 'text', required: false, variableName: node.id + '_messageName',
      hint: '留空时后端使用节点标识作为消息名。业务方发送匹配消息后，流程会继续；此节点不会生成待办。',
    }],
  },
  timer: {
    start: node => node.timerValue?.trim() ? [] : [{
      key: 'timerValue', label: '定时时间', kind: 'text', required: true, variableName: node.id + '_timerValue',
      hint: '按等待条件填写；到期后流程自动继续。该节点不会生成待办。',
    }],
  },
}

export function buildNodeFormConfigs(nodes: WorkflowNodeSnapshot[], stage: FormStage, nodeId?: string): NodeFormConfig[] {
  return nodes.flatMap(node => {
    if (nodeId && node.id !== nodeId) return []
    const fields = NODE_FORMS[node.type]?.[stage]?.(node) ?? []
    if (!fields.length) return []
    return [{
      nodeId: node.id,
      nodeName: node.name || node.id,
      nodeType: node.type,
      fields,
    }]
  })
}

export function formValueKey(nodeId: string, fieldKey: string) {
  return nodeId + '.' + fieldKey
}

export function initialFormValues(configs: NodeFormConfig[], nodes: WorkflowNodeSnapshot[] = []): BusinessVariables {
  const values: BusinessVariables = {}
  for (const config of configs) {
    const node = nodes.find(item => item.id === config.nodeId)
    for (const field of config.fields) {
      if (field.key === 'serviceName' && node?.serviceName) values[formValueKey(config.nodeId, field.key)] = node.serviceName
      if (field.key === 'serviceUrl' && node?.serviceUrl) values[formValueKey(config.nodeId, field.key)] = node.serviceUrl
      if (field.key === 'serviceList' && (node?.serviceName || node?.serviceUrl)) {
        values[formValueKey(config.nodeId, field.key)] = [{ serviceName: node.serviceName || '', serviceUrl: node.serviceUrl || '' }]
      }
    }
  }
  return values
}

export function startVariableName(config: NodeFormConfig, field: NodeFormField) {
  return field.variableName ?? formValueKey(config.nodeId, field.key)
}

export function compileStartFormVariables(configs: NodeFormConfig[], formValues: BusinessVariables, baseVariables: BusinessVariables) {
  const variables = { ...baseVariables }
  for (const config of configs) {
    for (const field of config.fields) {
      if (!field.variableName) continue
      const rawValue = formValues[formValueKey(config.nodeId, field.key)]
      const empty = rawValue === undefined || rawValue === null || rawValue === '' || (Array.isArray(rawValue) && rawValue.length === 0)
      if (empty) {
        delete variables[startVariableName(config, field)]
        continue
      }
      let value = rawValue
      if (config.nodeType === 'timer' && field.key === 'timerValue' && typeof value === 'string') value = value.trim()
      variables[startVariableName(config, field)] = value
    }
  }
  return variables
}

function validDuration(value: string) {
  return /^P(?=\d|T\d)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/.test(value)
}

function validTimerValue(value: string, node: WorkflowNodeSnapshot | undefined) {
  const type = node?.timerType ?? 'duration'
  if (type === 'duration') return validDuration(value)
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/.exec(value)
    if (!match) return false
    const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
      && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
      && Number(offsetHour ?? 0) <= 23 && Number(offsetMinute ?? 0) <= 59 && Number.isFinite(Date.parse(value))
  }
  if (type === 'cycle') return /^R\d*\/P(?=\d|T\d)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/.test(value) || ((value.match(/\s+/g) ?? []).length >= 4 && /^[\w*/?,#LWa-zA-Z-]+(?:\s+[\w*/?,#LWa-zA-Z-]+){4,5}$/.test(value))
  return false
}

export function validateFormValues(configs: NodeFormConfig[], values: BusinessVariables, nodes: WorkflowNodeSnapshot[] = []) {
  const errors: Record<string, string> = {}
  for (const config of configs) {
    for (const field of config.fields) {
      const key = formValueKey(config.nodeId, field.key)
      const value = values[key]
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
      if (field.required && empty) {
        errors[key] = field.label + '为必填项'
      } else if (field.kind === 'service-list' && Array.isArray(value) && value.some(item => !(item as { serviceName?: string }).serviceName)) {
        errors[key] = '每项服务都需要填写服务名称'
      } else if (config.nodeType === 'timer' && field.key === 'timerValue' && !empty && !validTimerValue(String(value).trim(), nodes.find(node => node.id === config.nodeId))) {
        const type = nodes.find(node => node.id === config.nodeId)?.timerType ?? 'duration'
        errors[key] = type === 'duration' ? '请输入 ISO-8601 时长，例如 PT30M 或 P1D' : type === 'date' ? '请输入 ISO-8601 日期时间，例如 2026-12-31T23:59:59' : '请输入重复间隔（如 R3/PT10H）或 cron 表达式'
      }
    }
  }
  return errors
}

export function formSuggestionPreview(stage: FormStage, configs: NodeFormConfig[], values: BusinessVariables) {
  return JSON.stringify({
    stage,
    nodes: configs.map(config => ({
      nodeId: config.nodeId,
      nodeType: config.nodeType,
      fields: Object.fromEntries(config.fields.map(field => [
        field.key, values[formValueKey(config.nodeId, field.key)] ?? null,
      ])),
    })),
  }, null, 2)
}

export function variablesWithEngineValues(rules: Array<{ name: string; source?: string }>, variables: BusinessVariables): string[] {
  const engineNames = new Set(rules.filter(rule => rule.source?.toLowerCase() === 'engine').map(rule => rule.name))
  return Object.keys(variables).filter(name => engineNames.has(name))
}
