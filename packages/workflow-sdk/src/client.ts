import { toBpmnCompilerJson } from './validation.js'
import type { WorkflowSubProcessModel } from './types.js'
import type { Compilation, CompleteInput, CompleteOptions, GatewayBranch, HistoricActivity, HistoryQuery, MessageInput, MessageResult, NextGateway, OperationOptions, Page, ParameterRule, PublishOptions, StartInput, StartRequirements, TaskActionResult, TaskForm, TaskQuery, TaskReference, TaskRequirements, TemplateSnapshot, WorkflowClient, WorkflowClientOptions, WorkflowProgress, WorkflowQuery, WorkflowRequest, WorkflowSource } from './client-types.js'
import { parameterError, record, requireText, WorkflowClientError } from './client-errors.js'
import { checkRequired, completionVariables, jsonCopy, mapParameters, rulesWithModelProtection, wrappedVariables } from './client-parameters.js'
export * from './client-types.js'
export { WorkflowClientError } from './client-errors.js'
export type { WriteEffect, WorkflowErrorContext } from './client-errors.js'

const segment = (value: string, operation: string) => { requireText(value, operation, 'id/key'); return encodeURIComponent(value) }
const safeFilename = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'workflow'

/** Injected transport owns base URL and authentication. Constructing this client does no I/O. */
export function createWorkflowClient(config: WorkflowClientOptions): WorkflowClient {
  if (!config || typeof config.request !== 'function') parameterError('createWorkflowClient', 'INVALID_ARGUMENT', '需要 request 适配器。')
  function inputKeys(input: object, keys: readonly string[], operation: string) {
    for (const key of Object.keys(input)) if (!keys.includes(key)) parameterError(operation, 'INVALID_ARGUMENT', `未知参数 ${key}。`, '/' + key)
  }
  const responseContexts = new WeakMap<object, { operation: string; phase: string; resources: Record<string, unknown>; write: boolean; status: number }>()
  async function within<T>(operation: string, phase: string, resources: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
    try { return await run() } catch (cause) {
      if (!(cause instanceof WorkflowClientError)) throw cause
      throw new WorkflowClientError(cause.code, cause.message, { operation, phase: cause.operation === operation ? cause.phase : phase, resources: { ...cause.resources, ...resources }, httpStatus: cause.httpStatus, issues: cause.issues, effect: cause.effect, cause })
    }
  }
  function protocol(operation: string, phase: string, resources: Record<string, unknown> = {}, write = false, status?: number, value?: unknown): never {
    const response = value && typeof value === 'object' ? responseContexts.get(value) : undefined
    throw new WorkflowClientError('PROTOCOL_ERROR', '网关响应缺少必需字段或结构不符合契约。', { operation: response?.operation ?? operation, phase: response?.phase ?? phase, resources: response?.resources ?? resources, httpStatus: response?.status ?? status, effect: (response?.write ?? write) ? 'confirmed' : 'none' })
  }
  async function call(operation: string, phase: string, request: WorkflowRequest, options: OperationOptions = {}, resources: Record<string, unknown> = {}, write = false): Promise<unknown> {
    const timeoutMs = options.timeoutMs ?? config.timeoutMs
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) parameterError(operation, 'INVALID_ARGUMENT', 'timeoutMs 必须为正数。')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let dispatched = false
    const cancel = () => controller.abort(options.signal?.reason)
    const abort = new Promise<never>((_, reject) => { controller.signal.addEventListener('abort', () => reject(controller.signal.reason ?? new Error('Aborted')), { once: true }) })
    options.signal?.addEventListener('abort', cancel, { once: true })
    if (options.signal?.aborted) cancel()
    if (timeoutMs !== undefined) timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
    try {
      if (controller.signal.aborted) await abort
      dispatched = true
      const response = await Promise.race([config.request({ ...request, signal: controller.signal }), abort])
      if (!record(response) || typeof response.status !== 'number' || !Number.isInteger(response.status)) protocol(operation, phase, resources, write)
      const { status, body } = response
      if (status < 200 || status >= 300) throw new WorkflowClientError(record(body) && typeof body.code === 'string' ? body.code : 'HTTP_ERROR', record(body) && typeof body.message === 'string' ? body.message : `HTTP ${status}`, { operation, phase, httpStatus: status, resources, cause: body, effect: write && (status >= 500 || status === 408) ? 'unknown' : 'none' })
      if (!record(body) || typeof body.code !== 'string') protocol(operation, phase, resources, write, status)
      if (body.code !== 'OK') throw new WorkflowClientError(body.code, typeof body.message === 'string' ? body.message : '业务操作失败。', { operation, phase, httpStatus: status, resources, cause: body, effect: write ? 'unknown' : 'none' })
      if (!Object.hasOwn(body, 'data')) protocol(operation, phase, resources, write, status)
      if (!record(body.data) && !Array.isArray(body.data)) protocol(operation, phase, resources, write, status)
      const queue = [body.data]
      const visited = new Set<object>()
      while (queue.length) {
        const value = queue.pop()
        if (!value || typeof value !== 'object' || visited.has(value)) continue
        visited.add(value); responseContexts.set(value, { operation, phase, resources, write, status })
        queue.push(...Object.values(value))
      }
      return body.data
    } catch (cause) {
      if (cause instanceof WorkflowClientError) throw cause
      const error = record(cause) ? cause : {}
      const response = record(error.response) ? error.response : undefined
      const status = typeof response?.status === 'number' ? response.status : typeof error.status === 'number' ? error.status : undefined
      const body = response?.data
      const cancelled = controller.signal.aborted || error.name === 'AbortError' || error.code === 'ERR_CANCELED'
      const timedOut = controller.signal.reason?.name === 'TimeoutError' || error.code === 'ECONNABORTED'
      const code = record(body) && typeof body.code === 'string' ? body.code : timedOut ? 'TIMEOUT' : cancelled ? 'CANCELLED' : status ? 'HTTP_ERROR' : 'NETWORK_ERROR'
      throw new WorkflowClientError(code, record(body) && typeof body.message === 'string' ? body.message : cause instanceof Error ? cause.message : '请求失败。', { operation, phase, httpStatus: status, cause, resources, effect: write && dispatched && (!status || status >= 500 || status === 408) ? 'unknown' : 'none' })
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', cancel)
    }
  }
  function rules(value: unknown, operation: string, nullable = false, context = value): ParameterRule[] {
    if (nullable && (value === undefined || value === null)) return []
    if (!Array.isArray(value) || value.some(rule => !record(rule) || typeof rule.name !== 'string' || !rule.name || typeof rule.type !== 'string' || ['nodeId', 'nodeType', 'fieldKey', 'source'].some(key => rule[key] !== undefined && typeof rule[key] !== 'string') || (rule.required !== undefined && typeof rule.required !== 'boolean'))) protocol(operation, 'response', {}, false, undefined, context)
    return value as ParameterRule[]
  }
  function template(value: unknown, operation: string, write = false, resources: Record<string, unknown> = {}): TemplateSnapshot {
    if (!record(value) || !['templateKey', 'deploymentId', 'processDefinitionId'].every(key => typeof value[key] === 'string' && value[key]) || !Number.isInteger(value.templateVersion ?? value.version) || Number(value.templateVersion ?? value.version) < 1) protocol(operation, 'response', resources, write, undefined, value)
    return { ...value, templateVersion: Number(value.templateVersion ?? value.version), globalVariables: rules(value.globalVariables, operation, true, value) } as TemplateSnapshot
  }
  const taskResources = (task: TaskReference) => ({ taskId: task.id, processInstanceId: task.processInstanceId, processDefinitionId: task.processDefinitionId, taskDefinitionKey: task.taskDefinitionKey })
  function assertTask(task: TaskReference, operation: string) {
    if (!record(task)) parameterError(operation, 'INVALID_ARGUMENT', '需要完整任务引用。')
    for (const key of ['id', 'processInstanceId', 'processDefinitionId', 'taskDefinitionKey'] as const) requireText(task[key], operation, `task.${key}`)
  }
  function pagination(query: { offset?: number; limit?: number }, operation: string) {
    const { offset = 0, limit = 20 } = query
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) parameterError(operation, 'INVALID_ARGUMENT', 'offset 必须是非负整数，limit 必须是正整数。')
    return { offset, limit }
  }
  function page<T>(value: unknown, offset: number, limit: number, operation: string): Page<T> {
    if (Array.isArray(value)) return { items: value as T[], offset, limit }
    if (record(value) && Array.isArray(value.items) && (value.total === undefined || (Number.isInteger(value.total) && Number(value.total) >= 0))) return { items: value.items as T[], offset, limit, ...(value.total === undefined ? {} : { total: Number(value.total) }) }
    return protocol(operation, 'response', {}, false, undefined, value)
  }
  function gateway(value: unknown, operation: string, context = value): NextGateway | null | undefined {
    if (value === undefined || value === null) return value
    if (!record(value) || typeof value.gatewayId !== 'string' || !Array.isArray(value.branches)) protocol(operation, 'response', {}, false, undefined, context)
    return { ...value, ...(value.decisionVariable ? { decisionVariable: rules([value.decisionVariable], operation, false, value)[0] } : {}), branches: value.branches.map(branch => {
      if (!record(branch) || typeof branch.value !== 'string') protocol(operation, 'response', {}, false, undefined, value)
      return { ...branch, variables: rules(branch.variables, operation, true, branch), nextGateway: gateway(branch.nextGateway, operation, branch) } as GatewayBranch
    }) } as NextGateway
  }
  async function compile(source: WorkflowSource, options?: OperationOptions, operation = 'compile'): Promise<Compilation> {
    const model = toBpmnCompilerJson(record(source) && typeof source.toJSON === 'function' ? source.toJSON() : source)
    const value = await call(operation, 'compile', { method: 'POST', path: '/bpmn/json2xml', body: model }, options, { templateKey: model.processId })
    if (!record(value) || typeof value.bpmnXml !== 'string' || !value.bpmnXml.trim()) protocol(operation, 'compile', { templateKey: model.processId }, false, undefined, value)
    return { model, bpmnXml: value.bpmnXml }
  }
  async function getTemplate(key: string, options?: OperationOptions) { return template(await call('getTemplate', 'query', { method: 'GET', path: '/template/' + segment(key, 'getTemplate') }, options, { templateKey: key }), 'getTemplate') }
  async function getTaskRequirements(task: TaskReference, options?: OperationOptions): Promise<TaskRequirements> {
    assertTask(task, 'getTaskRequirements')
    const value = await call('getTaskRequirements', 'query', { method: 'GET', path: `/tasks/${segment(task.id, 'getTaskRequirements')}/required-variables` }, options, taskResources(task))
    if (!record(value) || !['currentComplete', 'gatewayDecision', 'nextStartHints'].every(key => Object.hasOwn(value, key))) protocol('getTaskRequirements', 'response', taskResources(task), false, undefined, value)
    if (value.processDefinitionId && value.processDefinitionId !== task.processDefinitionId) parameterError('getTaskRequirements', 'TEMPLATE_VERSION_MISMATCH', '任务规则与任务版本不一致。')
    return { ...value, currentComplete: rules(value.currentComplete, 'getTaskRequirements', true, value), gatewayDecision: rules(value.gatewayDecision, 'getTaskRequirements', true, value), nextStartHints: rules(value.nextStartHints, 'getTaskRequirements', true, value), nextGateway: gateway(value.nextGateway, 'getTaskRequirements', value) }
  }
  // Entry gateways return a candidate union. Avoid requiring every possible branch.
  function entryIsAmbiguous(model: WorkflowSubProcessModel | null | undefined): boolean {
    if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.flows)) return true
    const queue = model.nodes.filter(node => node.type === 'start').map(node => node.id)
    if (!queue.length) return true
    const visited = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = model.nodes.find(item => item.id === id)
      if (!node) return true
      if (node.type === 'condition' || node.type === 'subProcess') return true
      if (!['start', 'parallel'].includes(node.type)) continue
      model.flows.filter(flow => flow.source === id).forEach(flow => queue.push(flow.target))
    }
    return false
  }
  async function getStartRequirements(key: string, decisions: WorkflowQuery = {}, options?: OperationOptions): Promise<StartRequirements> {
    const snapshot = await getTemplate(key, options)
    const protectedRules = rulesWithModelProtection(snapshot.globalVariables, snapshot.displayJson)
    let required: ParameterRule[] = []
    let hints = snapshot.globalVariables.filter(rule => !rule.source || rule.source === 'start')
    const diagnostics = []
    try {
      const value = await call('getStartRequirements', 'requirements', { method: 'GET', path: `/template/${segment(key, 'getStartRequirements')}/start-variables`, query: decisions }, options, { templateKey: key, processDefinitionId: snapshot.processDefinitionId })
      const candidates = rules(value, 'getStartRequirements')
      if (entryIsAmbiguous(snapshot.displayJson)) { hints = candidates; diagnostics.push({ code: 'START_REQUIREMENTS_HINTS_ONLY', message: '入口存在分支、子流程或缺少拓扑；候选仅供提示，由后端校验实际路径。' }) } else required = candidates.filter(rule => !protectedRules.some(other => other.name === rule.name && other.source === 'engine'))
    } catch (cause) {
      if (!(cause instanceof WorkflowClientError) || cause.httpStatus !== 404) throw cause
      diagnostics.push({ code: 'START_REQUIREMENTS_UNAVAILABLE', message: '环境没有最小启动要求接口；全量规则仅作为提示。' })
    }
    return { templateKey: key, processDefinitionId: snapshot.processDefinitionId, required, hints, rules: protectedRules, diagnostics, template: snapshot }
  }
  function actionResult(value: unknown, operation: string, task: TaskReference): TaskActionResult {
    if (!record(value) || value.taskId !== task.id || typeof value.status !== 'string') protocol(operation, 'response', taskResources(task), true, undefined, value)
    return value as TaskActionResult
  }
  return {
    compile, getTemplate, getStartRequirements, getTaskRequirements,
    async publish(source: WorkflowSource, options: PublishOptions = {}) {
      if (options.startable !== undefined && typeof options.startable !== 'boolean') parameterError('publish', 'INVALID_ARGUMENT', 'startable 必须是布尔值。')
      if (options.startable === false) parameterError('publish', 'UNSUPPORTED_PUBLISH_OPTION', '当前发布协议由后端管理可发起状态，不支持 startable=false；请移除该选项。', '/startable')
      if (options.name !== undefined) requireText(options.name, 'publish', 'name')
      const compiled = await compile(source, options, 'publish')
      const form = new FormData()
      const name = options.name ?? compiled.model.processName ?? compiled.model.processId
      form.append('deployment-name', name); form.append('template-key', compiled.model.processId); form.append('template-name', name)
      form.append('display-json', JSON.stringify(compiled.model))
      form.append('file', new Blob([compiled.bpmnXml], { type: 'application/xml' }), safeFilename(compiled.model.processId) + '.bpmn')
      const resources = { templateKey: compiled.model.processId, compilation: compiled }
      const value = await call('publish', 'publish', { method: 'POST', path: '/template', body: form }, options, resources, true)
      const published = template(value, 'publish', true, resources)
      return published
    },
    async getTemplateVersion(key: string, version: number, options?: OperationOptions) {
      if (!Number.isInteger(version) || version < 1) parameterError('getTemplateVersion', 'INVALID_ARGUMENT', 'version 必须为正整数。')
      const value = await call('getTemplateVersion', 'query', { method: 'GET', path: `/template/${segment(key, 'getTemplateVersion')}/history/${version}` }, options, { templateKey: key, templateVersion: version })
      const snapshot = template(value, 'getTemplateVersion')
      if (snapshot.templateVersion !== version || snapshot.templateKey !== key) protocol('getTemplateVersion', 'response', { templateKey: key, templateVersion: version }, false, undefined, value)
      return snapshot
    },
    async start(key: string, input: StartInput, options?: OperationOptions) {
      requireText(key, 'start', 'templateKey')
      if (!record(input)) parameterError('start', 'INVALID_ARGUMENT', '需要启动参数。')
      inputKeys(input, ['businessKey', 'nodes', 'variables', 'callbackUrl', 'parentBusinessKey', 'predecessorConstraint', 'extra'], 'start')
      requireText(input.businessKey, 'start', 'businessKey')
      if (input.predecessorConstraint !== undefined && typeof input.predecessorConstraint !== 'boolean') parameterError('start', 'INVALID_ARGUMENT', 'predecessorConstraint 必须是布尔值。')
      for (const field of ['callbackUrl', 'parentBusinessKey'] as const) if (input[field] !== undefined && typeof input[field] !== 'string') parameterError('start', 'INVALID_ARGUMENT', `${field} 必须是字符串。`)
      const decisions: WorkflowQuery = {}
      for (const [name, value] of Object.entries(input.variables ?? {})) if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') Object.defineProperty(decisions, name, { value, enumerable: true })
      const requirements = await within('start', 'requirements', { templateKey: key, businessKey: input.businessKey }, () => getStartRequirements(key, decisions, options))
      const variables = await within('start', 'parameters', { templateKey: key, businessKey: input.businessKey, mappedProcessDefinitionId: requirements.processDefinitionId }, async () => {
        const mapped = mapParameters('start', input, requirements.rules, new Set(['start']))
        checkRequired(mapped, requirements.required, 'start')
        return mapped
      })
      const { nodes: _nodes, variables: _variables, ...metadata } = input
      const body = jsonCopy({ templateKey: key, ...metadata, variables }, 'start')
      const resources = { templateKey: key, businessKey: input.businessKey, mappedProcessDefinitionId: requirements.processDefinitionId }
      const value = await call('start', 'start', { method: 'POST', path: '/task/instances/start', body }, options, resources, true)
      if (!record(value) || !['processInstanceId', 'processDefinitionId', 'businessKey', 'templateKey'].every(field => typeof value[field] === 'string' && value[field])) protocol('start', 'response', resources, true, undefined, value)
      const diagnostics = [...requirements.diagnostics]
      if (value.processDefinitionId !== requirements.processDefinitionId) diagnostics.push({ code: 'START_VERSION_CHANGED', message: '读取规则后模板版本发生变化；实例已创建，请按实际 processDefinitionId 核对。' })
      return { ...value, mappedProcessDefinitionId: requirements.processDefinitionId, diagnostics } as Awaited<ReturnType<WorkflowClient['start']>>
    },
    async listTasks(query: TaskQuery = {}, options?: OperationOptions) {
      const { offset, limit } = pagination(query, 'listTasks'); const { offset: _offset, limit: _limit, ...filters } = query
      const value = await call('listTasks', 'query', { method: 'GET', path: '/tasks', query: { ...filters, firstResult: offset, maxResults: limit } }, options)
      const result = page<TaskReference>(value, offset, limit, 'listTasks')
      if (result.items.some(task => !record(task) || !['id', 'processInstanceId', 'processDefinitionId', 'taskDefinitionKey'].every(key => typeof task[key] === 'string' && task[key]))) protocol('listTasks', 'response', {}, false, undefined, value)
      return result
    },
    async getTaskForm(task: TaskReference, options?: OperationOptions): Promise<TaskForm> {
      assertTask(task, 'getTaskForm')
      const value = await call('getTaskForm', 'query', { method: 'GET', path: `/tasks/${segment(task.id, 'getTaskForm')}/bizForm` }, options, taskResources(task))
      if (!record(value) || !['form', 'route', 'none'].includes(String(value.type)) || !(value.values === null || value.values === undefined || record(value.values)) || (value.type === 'form' && !record(value.data)) || (value.type === 'route' && typeof value.data !== 'string') || (value.type === 'none' && value.data !== null)) protocol('getTaskForm', 'response', taskResources(task), false, undefined, value)
      return { ...value, values: value.values ?? {} } as TaskForm
    },
    async complete(task: TaskReference, input: CompleteInput = {}, options: CompleteOptions = {}) {
      assertTask(task, 'complete'); if (!record(input)) parameterError('complete', 'INVALID_ARGUMENT', '办理参数必须是对象。')
      inputKeys(input, ['decision', 'fields', 'nodes', 'variables'], 'complete')
      if (options.templateSnapshot && options.templateSnapshot.processDefinitionId !== task.processDefinitionId) parameterError('complete', 'TEMPLATE_VERSION_MISMATCH', '任务与快照版本不一致。')
      const requirements = await within('complete', 'requirements', taskResources(task), () => getTaskRequirements(task, options))
      const variables = await within('complete', 'parameters', taskResources(task), async () => completionVariables(task, input, requirements, options.templateSnapshot))
      return actionResult(await call('complete', 'complete', { method: 'POST', path: `/tasks/${segment(task.id, 'complete')}/complete`, body: { variables: wrappedVariables(variables) } }, options, taskResources(task), true), 'complete', task)
    },
    async getProgress(processInstanceId: string, options?: OperationOptions) {
      const value = await call('getProgress', 'query', { method: 'GET', path: `/process-instances/${segment(processInstanceId, 'getProgress')}/activity-status` }, options, { processInstanceId })
      if (!record(value) || value.processInstanceId !== processInstanceId || typeof value.processDefinitionId !== 'string' || typeof value.state !== 'string' || !Array.isArray(value.activeNodes) || !Array.isArray(value.completedNodes) || [...value.activeNodes, ...value.completedNodes].some(node => !record(node) || typeof node.activityId !== 'string')) protocol('getProgress', 'response', { processInstanceId }, false, undefined, value)
      return value as unknown as WorkflowProgress
    },
    async listHistory(processInstanceId: string, query: HistoryQuery = {}, options?: OperationOptions) {
      requireText(processInstanceId, 'listHistory', 'processInstanceId'); const { offset, limit } = pagination(query, 'listHistory'); const { offset: _offset, limit: _limit, ...filters } = query
      const value = await call('listHistory', 'query', { method: 'GET', path: '/history/activity-instances', query: { ...filters, processInstanceId, firstResult: offset, maxResults: limit } }, options, { processInstanceId })
      const result = page<HistoricActivity>(value, offset, limit, 'listHistory')
      if (result.items.some(item => !record(item) || typeof item.id !== 'string' || typeof item.activityId !== 'string' || item.processInstanceId !== processInstanceId)) protocol('listHistory', 'response', { processInstanceId }, false, undefined, value)
      return result
    },
    async sendMessage(input: MessageInput, options?: OperationOptions): Promise<MessageResult> {
      if (!record(input)) parameterError('sendMessage', 'INVALID_ARGUMENT', '消息必须是对象。')
      requireText(input.messageName, 'sendMessage', 'messageName')
      if (!(typeof input.processInstanceId === 'string' && input.processInstanceId.trim()) && !(typeof input.businessKey === 'string' && input.businessKey.trim())) parameterError('sendMessage', 'MESSAGE_TARGET_REQUIRED', '发送消息必须指定 processInstanceId 或 businessKey。')
      if ('all' in input) parameterError('sendMessage', 'INVALID_ARGUMENT', '首版消息 API 不支持广播。')
      const variables = mapParameters('sendMessage', { variables: input.variables }, [], undefined)
      const correlationKeys = mapParameters('sendMessage', { variables: input.correlationKeys }, [], undefined)
      const body = jsonCopy({ messageName: input.messageName, processInstanceId: input.processInstanceId, businessKey: input.businessKey, variables: wrappedVariables(variables), correlationKeys: wrappedVariables(correlationKeys), all: false, resultEnabled: true }, 'sendMessage')
      const resources = { messageName: input.messageName, processInstanceId: input.processInstanceId, businessKey: input.businessKey }
      const value = await call('sendMessage', 'message', { method: 'POST', path: '/messages', body }, options, resources, true)
      if (!record(value) || value.messageName !== input.messageName || typeof value.status !== 'string') protocol('sendMessage', 'response', resources, true, undefined, value)
      return value as MessageResult
    },
    async returnForReassignment(task: TaskReference, options?: OperationOptions) {
      assertTask(task, 'returnForReassignment')
      return actionResult(await call('returnForReassignment', 'reassignment', { method: 'POST', path: `/tasks/${segment(task.id, 'returnForReassignment')}/refuse` }, options, taskResources(task), true), 'returnForReassignment', task)
    },
    async reassign(task: TaskReference, userId: string, options?: OperationOptions) {
      assertTask(task, 'reassign'); requireText(userId, 'reassign', 'userId')
      return actionResult(await call('reassign', 'reassignment', { method: 'POST', path: `/tasks/${segment(task.id, 'reassign')}/reassign`, body: { userId } }, options, taskResources(task), true), 'reassign', task)
    },
  }
}
