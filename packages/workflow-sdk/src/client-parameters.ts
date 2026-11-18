import type { CompleteInput, JsonValue, NextGateway, NodeParameters, ParameterRule, TaskReference, TaskRequirements, TemplateSnapshot, Variables } from './client-types.js'
import type { WorkflowSubProcessModel } from './types.js'
import { parameterError, record } from './client-errors.js'

/** Serialize JSON without lossy coercion, executing toJSON, or accepting cyclic input. */
export function jsonCopy(value: unknown, operation: string, path = '', ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || !value) return parameterError(operation, 'INVALID_JSON_VALUE', '参数必须是可序列化的 JSON 值。', path)
  if (ancestors.has(value)) parameterError(operation, 'INVALID_JSON_VALUE', '参数不能包含循环引用。', path)
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) parameterError(operation, 'INVALID_JSON_VALUE', '参数对象必须是普通 JSON 对象。', path)
  if (Object.getOwnPropertySymbols(value).length) parameterError(operation, 'INVALID_JSON_VALUE', 'JSON 对象不能包含 Symbol 字段。', path)
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) parameterError(operation, 'INVALID_JSON_VALUE', 'JSON 参数不能包含访问器。', `${path}/${key}`)
  }
  ancestors.add(value)
  const out: JsonValue = Array.isArray(value) ? [] : {}
  const entries = Array.isArray(value) ? Array.from({ length: value.length }, (_, i) => [String(i), value[i]] as const) : Object.entries(value)
  for (const [key, child] of entries) {
    if (child === undefined && !Array.isArray(value)) continue
    Object.defineProperty(out, key, { value: jsonCopy(child, operation, `${path}/${key}`, ancestors), enumerable: true, configurable: true, writable: true })
  }
  ancestors.delete(value)
  return out
}
const stage = (rule: ParameterRule) => rule.source?.toLowerCase() || 'start'
const knownFields: Record<string, readonly string[]> = {
  approval: ['assignee', 'approved', 'passed', 'allowTransfer', 'bizFormKey', 'reminderDuration'],
  countersign: ['approverList', 'vote', 'passed', 'approveMode', 'passRate', 'sequential', 'allowTransfer', 'allowAddSigner', 'bizFormKey', 'reminderDuration'],
  service: ['serviceName', 'serviceUrl', 'serviceList', 'approveMode', 'passRate', 'sequential'],
  receive: ['messageName'], timer: ['timerValue'], condition: ['status'], subProcess: ['reminderDuration', 'bizFormKey'],
}
function matches(rule: ParameterRule, nodeId: string, field: string): boolean {
  if (rule.nodeId !== nodeId) return false
  if (rule.fieldKey) return rule.fieldKey === field
  if (!knownFields[rule.nodeType ?? '']?.includes(field)) return false
  return rule.name === (field === 'vote' && rule.nodeType === 'countersign' ? 'vote' : `${nodeId}_${field}`)
}
function validateType(value: JsonValue, rule: ParameterRule, operation: string) {
  if (value === null) return // A required field is checked separately; nullable optional business data is preserved.
  const type = rule.type.toLowerCase().replaceAll(' ', '')
  const valid = ['string', 'date'].includes(type) ? typeof value === 'string'
    : ['boolean', 'bool'].includes(type) ? typeof value === 'boolean'
      : ['integer', 'long', 'short'].includes(type) ? typeof value === 'number' && Number.isSafeInteger(value)
        : ['double', 'float', 'number'].includes(type) ? typeof value === 'number'
          : ['array', 'list', 'string[]', '[]string', 'array<string>', 'list<string>'].includes(type) ? Array.isArray(value) && (!type.includes('string') || value.every(item => typeof item === 'string'))
            : type === 'object' ? record(value) : true
  if (!valid) parameterError(operation, 'PARAMETER_TYPE', `变量 ${rule.name} 应符合 ${rule.type} 类型。`, `/variables/${rule.name}`)
}
function uniqueRules(rules: ParameterRule[]) {
  return rules.filter((rule, index) => rules.findIndex(other => other.name === rule.name && other.nodeId === rule.nodeId && other.fieldKey === rule.fieldKey && stage(other) === stage(rule)) === index)
}
// The current runtime contract uses a Boolean passed input for each human vote.
// Only an explicit complete rule makes it writable; service results stay owned by workers.
function humanPassed(rule: ParameterRule, nodeId: string, nodeType = rule.nodeType): boolean {
  return stage(rule) === 'complete' && ['approval', 'countersign'].includes(nodeType ?? '')
    && ['boolean', 'bool'].includes(rule.type.toLowerCase())
    && matches({ ...rule, nodeType }, nodeId, 'passed')
}
function protectPassed(rules: ParameterRule[], nodeId: string, nodeType: string) {
  const name = `${nodeId}_passed`
  if (rules.some(rule => rule.name === name && stage(rule) === 'engine')) return
  const personal = nodeType !== 'service' && rules.find(rule => humanPassed(rule, nodeId, nodeType))
  if (personal && personal.name === name) return
  // A fieldKey alias identifies the personal input, not an undeclared canonical aggregate.
  rules.push({ name, nodeId, nodeType, type: 'Boolean', source: 'engine', ...(personal ? { fieldKey: 'engineAggregate' } : {}) })
}

/** Match local nodes to backend activity IDs through exact rule names, never by splitting IDs. */
export function rulesWithModelProtection(rules: ParameterRule[], model?: WorkflowSubProcessModel | null): ParameterRule[] {
  const output = rules.map(rule => ({ ...rule }))
  function visit(process: WorkflowSubProcessModel, prefix = '') {
    if (!Array.isArray(process.nodes)) return
    for (const node of process.nodes) {
      const activityId = prefix + node.id
      const applicable = output.filter(rule => rule.nodeId === activityId)
      const fixed = new Map<string, unknown>([
        ['assignee', node.assignee], ['serviceName', node.serviceName], ['serviceUrl', node.serviceUrl],
        ['approveMode', node.approveMode], ['passRate', node.passRate], ['sequential', node.sequential],
        ['messageName', node.messageName], ['timerValue', node.timerValue], ['bizFormKey', node.bizFormKey],
        ['reminderDuration', node.reminder?.duration],
      ])
      for (const rule of applicable) {
        for (const [field, value] of fixed) {
          if (value !== undefined && value !== '' && (rule.fieldKey === field || (!rule.fieldKey && rule.name === `${activityId}_${field}`))) rule.source = 'engine'
        }
      }
      if (['approval', 'countersign', 'service'].includes(node.type)) {
        protectPassed(output, activityId, node.type)
        const name = `${activityId}_result`
        if (!output.some(rule => rule.name === name)) output.push({ name, nodeId: activityId, nodeType: node.type, type: 'Json', source: 'engine' })
      }
      if (node.type === 'subProcess' && node.process) visit(node.process, activityId + '_')
    }
  }
  if (model) visit(model)
  return output
}

export function mapParameters(operation: string, input: { variables?: Variables; fields?: Variables; nodes?: NodeParameters }, rules: ParameterRule[], allowed: Set<ParameterRule['source']> | undefined, currentNode?: string): Variables {
  const output: Variables = {}
  const allRules = uniqueRules(rules)
  function put(name: string, value: unknown, path: string) {
    if (value === undefined) return
    if (Object.hasOwn(output, name)) parameterError(operation, 'PARAMETER_CONFLICT', `多个输入来源映射到变量 ${name}。`, path)
    const declared = allRules.filter(rule => rule.name === name)
    if (declared.some(rule => stage(rule) === 'engine' || (rule.nodeType === 'service' && (rule.fieldKey === 'passed' || rule.name === `${rule.nodeId}_passed`)))) parameterError(operation, 'PARAMETER_READ_ONLY', `变量 ${name} 由引擎或模板写入。`, path)
    const permitted = declared.filter(rule => !allowed || allowed.has(stage(rule)))
    if (declared.length && !permitted.length) parameterError(operation, 'PARAMETER_STAGE', `变量 ${name} 不属于当前操作阶段。`, path)
    if (currentNode && permitted.some(rule => stage(rule) === 'complete' && ['approval', 'countersign'].includes(rule.nodeType ?? '') && rule.nodeId && rule.nodeId !== currentNode) && !permitted.some(rule => stage(rule) === 'complete' && rule.nodeId === currentNode)) parameterError(operation, 'PARAMETER_STAGE', '不能提交其他任务的审批意见。', path)
    if (permitted.some(rule => rule.name === 'vote' && rule.nodeType === 'countersign' && value !== 'agree' && value !== 'reject')) parameterError(operation, 'PARAMETER_TYPE', 'vote 只能是 agree 或 reject。', path)
    const copy = jsonCopy(value, operation, path)
    permitted.forEach(rule => validateType(copy, rule, operation))
    Object.defineProperty(output, name, { value: copy, enumerable: true, configurable: true, writable: true })
  }
  for (const source of ['variables', 'fields'] as const) {
    const raw = input[source]
    const values = raw === undefined ? undefined : jsonCopy(raw, operation, `/${source}`)
    if (values !== undefined && !record(values)) parameterError(operation, 'INVALID_ARGUMENT', `${source} 必须是对象。`, `/${source}`)
    for (const [name, value] of Object.entries(values ?? {})) put(name, value, `/${source}/${name}`)
  }
  const nodeValues = input.nodes === undefined ? {} : jsonCopy(input.nodes, operation, '/nodes')
  if (!record(nodeValues)) parameterError(operation, 'INVALID_ARGUMENT', 'nodes 必须按 activityId 索引。', '/nodes')
  for (const [nodeId, fields] of Object.entries(nodeValues)) {
    if (!record(fields)) parameterError(operation, 'INVALID_ARGUMENT', '节点参数必须是对象。', `/nodes/${nodeId}`)
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) continue
      const candidates = allRules.filter(rule => matches(rule, nodeId, field) && (!allowed || allowed.has(stage(rule)) || stage(rule) === 'engine'))
      const names = [...new Set(candidates.map(rule => rule.name))]
      if (names.length !== 1) parameterError(operation, 'PARAMETER_MAPPING_UNAVAILABLE', `无法唯一映射 ${nodeId}.${field}；可使用规则中的完整变量名。`, `/nodes/${nodeId}/${field}`)
      put(names[0]!, value, `/nodes/${nodeId}/${field}`)
    }
  }
  return output
}
export function checkRequired(variables: Variables, rules: ParameterRule[], operation: string) {
  for (const rule of uniqueRules(rules)) {
    if (!rule.required || stage(rule) === 'engine') continue
    const value = Object.hasOwn(variables, rule.name) ? variables[rule.name] : rule.value ?? rule.defaultValue
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) parameterError(operation, 'PARAMETER_REQUIRED', `缺少参数 ${rule.name}。`, `/variables/${rule.name}`)
  }
}
export function completionVariables(task: TaskReference, input: CompleteInput, req: TaskRequirements, snapshot?: TemplateSnapshot): Variables {
  const operation = 'complete'
  if (snapshot && snapshot.processDefinitionId !== task.processDefinitionId) parameterError(operation, 'TEMPLATE_VERSION_MISMATCH', '版本快照与任务的 processDefinitionId 不一致。', '/templateSnapshot')
  if (req.processDefinitionId && req.processDefinitionId !== task.processDefinitionId) parameterError(operation, 'TEMPLATE_VERSION_MISMATCH', '任务规则返回了其他流程定义版本。')
  const current = req.currentComplete.length ? req.currentComplete : snapshot?.globalVariables.filter(rule => rule.nodeId === task.taskDefinitionKey && stage(rule) === 'complete') ?? []
  function gatewayRules(gateway?: NextGateway | null): ParameterRule[] {
    return gateway ? [...(gateway.decisionVariable ? [gateway.decisionVariable] : []), ...gateway.branches.flatMap(branch => [...branch.variables, ...gatewayRules(branch.nextGateway)])] : []
  }
  const all = rulesWithModelProtection([...current, ...req.gatewayDecision, ...req.nextStartHints, ...gatewayRules(req.nextGateway), ...(snapshot?.globalVariables ?? [])], snapshot?.displayJson)
  // Protect undeclared aggregates even without a model snapshot. Explicit engine rules always win.
  for (const rule of [...all]) if (rule.nodeId && ['approval', 'countersign', 'service'].includes(rule.nodeType ?? '')) {
    protectPassed(all, rule.nodeId, rule.nodeType!)
  }
  if (input.decision !== undefined && !['agree', 'reject'].includes(input.decision)) parameterError(operation, 'INVALID_ARGUMENT', 'decision 只能是 agree 或 reject。', '/decision')
  let decision: Variables | undefined
  if (input.decision !== undefined) {
    const candidates = current.filter(rule => {
      const type = rule.nodeType ?? snapshot?.globalVariables.find(other => other.name === rule.name && other.nodeId === task.taskDefinitionKey)?.nodeType
      return stage(rule) === 'complete' && (!rule.nodeId || rule.nodeId === task.taskDefinitionKey) && (
        humanPassed(rule, task.taskDefinitionKey, type) ||
        (type === 'approval' && (rule.fieldKey === 'approved' || (!rule.fieldKey && rule.name === `${task.taskDefinitionKey}_approved`))) ||
        (type === 'countersign' && (rule.fieldKey === 'vote' || (!rule.fieldKey && rule.name === 'vote'))) ||
        (!!rule.fieldKey && ['approved', 'vote'].includes(rule.fieldKey))
      )
    })
    const names = [...new Set(candidates.map(rule => rule.name))]
    if (names.length !== 1) parameterError(operation, 'PARAMETER_MAPPING_UNAVAILABLE', '无法确定当前任务的 passed/approved/vote 变量；请使用后端完整变量名或提供匹配版本快照。', '/decision')
    const target = candidates[0]!
    decision = { [names[0]!]: target.fieldKey === 'vote' || (!target.fieldKey && target.name === 'vote') ? input.decision : input.decision === 'agree' }
  }
  // Keep decision as an independent input source to detect collisions with all caller inputs.
  const result = mapParameters(operation, input, all, new Set(['start', 'complete']), task.taskDefinitionKey)
  if (decision) {
    for (const [name, value] of Object.entries(decision)) {
      if (Object.hasOwn(result, name)) parameterError(operation, 'PARAMETER_CONFLICT', `审批决定与其他输入重复写入 ${name}。`, '/decision')
      const mapped = mapParameters(operation, { variables: { [name]: value } }, all, new Set(['complete']), task.taskDefinitionKey)
      Object.assign(result, mapped)
    }
  }
  function selectedRequirements(gateway?: NextGateway | null): ParameterRule[] {
    if (!gateway?.decisionVariable || gateway.decisionMode === 'expression') return []
    const variable = gateway.decisionVariable.name
    // Legacy aggregates can select hints from the decision without being written.
    const value = Object.hasOwn(result, variable) ? result[variable] : gateway.decisionMode === 'boolean' && input.decision !== undefined ? input.decision === 'agree' : undefined
    if (value === undefined) return []
    const branch = gateway.branches.find(branch => branch.value !== 'default' && (branch.decisionValue === value || branch.value === value)) ?? gateway.branches.find(branch => branch.value === 'default')
    return branch ? [...branch.variables, ...selectedRequirements(branch.nextGateway)] : []
  }
  const gatewayRequired = req.gatewayDecision.filter(rule => !all.some(other => other.name === rule.name && stage(other) === 'engine'))
  const required = [...current, ...gatewayRequired, ...selectedRequirements(req.nextGateway)].filter(rule => !all.some(other => other.name === rule.name && stage(other) === 'engine'))
  checkRequired(result, required, operation)
  return result
}
export const wrappedVariables = (values: Variables): Record<string, { value: JsonValue }> => Object.fromEntries(Object.entries(values).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined).map(([key, value]) => [key, { value }]))
