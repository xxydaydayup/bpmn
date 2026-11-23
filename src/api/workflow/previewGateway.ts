import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'
import { collectActiveActivityIds } from '@/utils/activityMarkers'
import type { CamundaActivityInstance, CamundaHistoricActivity, CamundaHistoricProcessInstance, CamundaProcessDefinition, CamundaProcessInstance } from '@/api/camunda/types'

export type WorkflowPreviewMode = 'running' | 'historic' | 'auto'
export type PreviewNodeState = 'active' | 'completed' | 'canceled'
export interface WorkflowInstanceSnapshot {
  instance: { id: string; processDefinitionId: string; businessKey?: string; state: string; ended: boolean }
  model?: unknown
  bpmnXml?: string
  metadata: { name?: string; key?: string; version?: number; processDefinitionId: string }
  nodeStates: Record<string, PreviewNodeState>
  warning?: string
}
export interface WorkflowPreviewGateway {
  load(instanceId: string, mode: WorkflowPreviewMode, signal?: AbortSignal): Promise<WorkflowInstanceSnapshot>
}
type Requester = <T>(config: AxiosRequestConfig) => Promise<T>
type Row = Record<string, unknown>
const record = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) => typeof value === 'string' ? value : undefined
const segment = encodeURIComponent

export function previewHttpStatus(cause: unknown): number | undefined {
  if (!record(cause)) return undefined
  if (typeof cause.httpStatus === 'number') return cause.httpStatus
  return record(cause.response) && typeof cause.response.status === 'number' ? cause.response.status : undefined
}
function preserveAccessError(cause: unknown, signal?: AbortSignal) {
  if (signal?.aborted) throw cause
  if ([401, 403].includes(previewHttpStatus(cause) ?? 0)) throw cause
}
function failure(message: string, httpStatus?: number) { return Object.assign(new Error(message), { httpStatus }) }

/** Read only: all definition matching uses the actual immutable processDefinitionId. */
export function createWorkflowPreviewGateway(send: Requester = request): WorkflowPreviewGateway {
  async function read<T>(url: string, signal?: AbortSignal, params?: object) {
    signal?.throwIfAborted()
    return send<T>({ method: 'GET', url, signal, ...(params ? { params } : {}) })
  }
  async function business<T>(url: string, signal?: AbortSignal, params?: object): Promise<T> {
    const response = await read<{ code?: string; data: T }>(url, signal, params)
    if (!response || (response.code !== undefined && response.code !== 'OK') || !Object.hasOwn(response, 'data')) {
      throw failure('模板只读接口返回格式不支持，无法确认版本快照。')
    }
    return response.data
  }
  async function exactTemplate(definitionId: string, signal?: AbortSignal): Promise<Row | undefined> {
    const templates: Row[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await business<unknown>('/v1/template', signal, { firstResult: offset, maxResults: 100 })
      if (!Array.isArray(page) || page.some(item => !record(item))) throw failure('模板索引格式不支持。')
      templates.push(...page as Row[])
      if (page.length < 100) break
    }
    let match: { key: string; version: number } | undefined
    for (const row of templates) {
      const key = text(row.templateKey ?? row.taskKey)
      if (!key) continue
      if (row.processDefinitionId === definitionId) {
        const version = row.templateVersion ?? row.version
        if (typeof version === 'number' && Number.isInteger(version) && version > 0) match = { key, version }
      }
      if (match) break
    }
    if (!match) {
      for (const row of templates) {
        const key = text(row.templateKey ?? row.taskKey)
        if (!key) continue
        const history = await business<unknown>('/v1/template/' + segment(key) + '/history', signal)
        if (!Array.isArray(history) || history.some(item => !record(item))) throw failure('模板历史索引格式不支持。')
        const matches = (history as Row[]).filter(item => item.processDefinitionId === definitionId)
        if (matches.length > 1) throw failure('同一流程定义关联多个历史快照，无法可靠匹配。')
        const version = matches[0]?.templateVersion ?? matches[0]?.version
        if (typeof version === 'number' && Number.isInteger(version) && version > 0) { match = { key, version }; break }
      }
    }
    if (!match) return undefined
    const snapshot = await business<unknown>('/v1/template/' + segment(match.key) + '/history/' + match.version, signal)
    if (!record(snapshot) || snapshot.processDefinitionId !== definitionId
      || (snapshot.templateKey ?? snapshot.taskKey) !== match.key
      || (snapshot.templateVersion ?? snapshot.version) !== match.version) {
      throw failure('模板快照与实例流程定义版本不一致，已拒绝使用该业务模型。')
    }
    return snapshot
  }

  async function instanceRecord(id: string, mode: WorkflowPreviewMode, signal?: AbortSignal) {
    let running: CamundaProcessInstance | undefined
    if (mode !== 'historic') {
      try {
        running = await read<CamundaProcessInstance>('/camunda/process-instance/' + segment(id), signal)
        if (!record(running)) throw failure('运行实例接口返回格式不支持。')
      }
      catch (cause) { if (mode === 'running' || previewHttpStatus(cause) !== 404) throw cause }
    }
    if (running) {
      if (running.id !== id) throw failure('实例响应与当前请求不一致。')
      if (!running.definitionId) throw failure('实例缺少流程定义 ID，无法确定预览版本。')
      return { id, processDefinitionId: running.definitionId, businessKey: running.businessKey, ended: false, state: running.suspended ? 'SUSPENDED' : 'ACTIVE' }
    }
    const historical = await read<CamundaHistoricProcessInstance>('/camunda/history/process-instance/' + segment(id), signal)
    if (!historical || historical.id !== id) throw failure('未找到此流程实例。', 404)
    if (!historical.processDefinitionId) throw failure('历史实例缺少流程定义 ID，无法确定预览版本。')
    const ended = Boolean(historical.endTime) || ['COMPLETED', 'EXTERNALLY_TERMINATED', 'INTERNALLY_TERMINATED'].includes(historical.state ?? '')
    return { id, processDefinitionId: historical.processDefinitionId, businessKey: historical.businessKey, ended, state: historical.state || (ended ? 'COMPLETED' : 'ACTIVE') }
  }

  async function activities(instance: WorkflowInstanceSnapshot['instance'], signal?: AbortSignal) {
    const nodeStates: Record<string, PreviewNodeState> = Object.create(null)
    if (!instance.ended) {
      const tree = await read<CamundaActivityInstance>('/camunda/process-instance/' + segment(instance.id) + '/activity-instances', signal)
      if (!record(tree) || (tree.processInstanceId && tree.processInstanceId !== instance.id)
        || (tree.processDefinitionId && tree.processDefinitionId !== instance.processDefinitionId)) throw failure('活动树与当前实例或定义版本不匹配，未显示活动标记。')
      collectActiveActivityIds(tree).forEach(id => { nodeStates[id] = 'active' })
      return { nodeStates, warning: Object.keys(nodeStates).length ? '' : '接口未返回当前活动节点；当前活动树不代表完整历史轨迹。' }
    }
    const rows: CamundaHistoricActivity[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await read<CamundaHistoricActivity[]>('/camunda/history/activity-instance', signal, { processInstanceId: instance.id, firstResult: offset, maxResults: 100 })
      if (!Array.isArray(page)) throw failure('历史活动接口返回格式不支持。')
      rows.push(...page)
      if (page.length < 100) break
    }
    const mixed = new Set<string>()
    let mismatched = false
    for (const row of rows) {
      if ((row.processInstanceId && row.processInstanceId !== instance.id) || (row.processDefinitionId && row.processDefinitionId !== instance.processDefinitionId)) { mismatched = true; continue }
      if (!row.activityId) continue
      const state = row.canceled === true ? 'canceled' : row.endTime ? 'completed' : undefined
      if (!state) continue
      const id = row.activityId.replace(/#multiInstanceBody$/, '')
      if (nodeStates[id] && nodeStates[id] !== state) mixed.add(id)
      nodeStates[id] = state
    }
    mixed.forEach(id => { delete nodeStates[id] })
    const warnings = []
    if (!Object.keys(nodeStates).length) warnings.push('接口没有可展示的已完成或已取消历史活动记录。')
    if (mismatched) warnings.push('已忽略不属于当前实例或定义版本的历史活动。')
    if (mixed.size) warnings.push('部分节点存在多种历史状态，未合并为单一状态。')
    return { nodeStates, warning: warnings.join(' ') }
  }

  return {
    async load(id, mode, signal) {
      if (!id.trim()) throw failure('请选择流程实例。')
      const instance = await instanceRecord(id, mode, signal)
      const [templateResult, xmlResult, stateResult, definitionResult] = await Promise.allSettled([
        exactTemplate(instance.processDefinitionId, signal),
        read<{ id: string; bpmn20Xml: string }>('/camunda/process-definition/' + segment(instance.processDefinitionId) + '/xml', signal),
        activities(instance, signal),
        read<CamundaProcessDefinition>('/camunda/process-definition/' + segment(instance.processDefinitionId), signal),
      ])
      for (const result of [templateResult, xmlResult, stateResult, definitionResult]) { if (result.status === 'rejected') preserveAccessError(result.reason, signal) }
      const warnings: string[] = []
      const snapshot = templateResult.status === 'fulfilled' ? templateResult.value : undefined
      const definition = definitionResult.status === 'fulfilled' && definitionResult.value.id === instance.processDefinitionId ? definitionResult.value : undefined
      if (templateResult.status === 'rejected') warnings.push(templateResult.reason instanceof Error ? templateResult.reason.message : '准确版本的业务模型读取失败。')
      else if (!snapshot) warnings.push('未找到此流程定义 ID 对应的任务模板历史快照，业务流程图不可用。')
      let bpmnXml: string | undefined
      if (xmlResult.status === 'fulfilled' && xmlResult.value.id === instance.processDefinitionId && typeof xmlResult.value.bpmn20Xml === 'string') bpmnXml = xmlResult.value.bpmn20Xml
      else warnings.push('此流程定义 ID 的 BPMN XML 备用图不可用。')
      if (stateResult.status === 'rejected') warnings.push('活动记录读取失败，未显示节点状态：' + (stateResult.reason instanceof Error ? stateResult.reason.message : '查询失败'))
      else if (stateResult.value.warning) warnings.push(stateResult.value.warning)
      return {
        instance, model: snapshot?.displayJson, bpmnXml,
        metadata: { name: text(snapshot?.templateName ?? snapshot?.taskName) ?? definition?.name, key: text(snapshot?.templateKey ?? snapshot?.taskKey) ?? definition?.key,
          version: snapshot ? Number(snapshot.templateVersion ?? snapshot.version) : definition?.version, processDefinitionId: instance.processDefinitionId },
        nodeStates: stateResult.status === 'fulfilled' ? stateResult.value.nodeStates : {}, warning: warnings.join(' '),
      }
    },
  }
}

export const workflowPreviewGateway = createWorkflowPreviewGateway()
