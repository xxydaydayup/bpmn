import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'
import type { WorkflowModel, WorkflowNodeRecord, WorkflowSubProcessDataSource, WorkflowSubProcessDisplayJson, WorkflowSubProcessFragment, WorkflowSubProcessModel, WorkflowSubProcessQuery } from '@workflow/designer/types'

interface ApiResponse<T> { code: string; data?: T | null; message?: string }
type Requester = <T>(config: AxiosRequestConfig) => Promise<T>
type ApiRecord = Record<string, unknown>

export interface SubProcessLibraryGateway extends WorkflowSubProcessDataSource {
  listPage: (query: WorkflowSubProcessQuery & { firstResult: number; maxResults: number }, signal?: AbortSignal) => Promise<WorkflowSubProcessFragment[]>
  create: (input: { name: string; description?: string; displayJson: WorkflowSubProcessDisplayJson }) => Promise<WorkflowSubProcessFragment>
  update: (key: string, input: { name?: string; description?: string; displayJson?: WorkflowSubProcessDisplayJson }) => Promise<WorkflowSubProcessFragment>
  delete: (key: string) => Promise<void>
}

const basePath = '/v1/sub-process'
const encodeKey = (key: string) => encodeURIComponent(key)

function assertResponse<T>(response: ApiResponse<T>, fallback: string): T {
  if (response?.code !== 'OK') throw Object.assign(new Error(response?.message || fallback), { code: response?.code })
  if (response.data === null || response.data === undefined) throw new Error(fallback)
  return response.data
}

function assertSuccess(response: ApiResponse<unknown>, fallback: string): void {
  if (response?.code !== 'OK') throw Object.assign(new Error(response?.message || fallback), { code: response?.code })
}

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApiRecord : {}
}

function normalizeFragment(value: unknown): WorkflowSubProcessFragment {
  const row = asRecord(value)
  const displayJson = asRecord(row.displayJson) as unknown as WorkflowSubProcessModel
  return {
    key: String(row.subProcessKey ?? ''),
    name: String(row.subProcessName ?? row.subProcessKey ?? ''),
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
    displayJson: { ...displayJson, nodes: Array.isArray(displayJson.nodes) ? displayJson.nodes : [], ...(Array.isArray(displayJson.flows) ? { flows: displayJson.flows } : {}) },
  }
}

function displayJson(value: WorkflowSubProcessDisplayJson): WorkflowSubProcessDisplayJson {
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) throw new Error('子流程片段至少需要一个节点。')
  return JSON.parse(JSON.stringify(value)) as WorkflowSubProcessDisplayJson
}

type CompilerProcess = Pick<WorkflowModel, 'nodes'> & Partial<Pick<WorkflowModel, 'processId' | 'processName' | 'flows'>>
export function toBpmnCompilerJson(model: WorkflowModel): Record<string, unknown> {
  const toProcess = (process: CompilerProcess): Record<string, unknown> => ({
    ...(process.processId !== undefined ? { processId: process.processId } : {}),
    ...(process.processName !== undefined ? { processName: process.processName } : {}),
    nodes: process.nodes.map((node: WorkflowNodeRecord) => {
      const { subProcessKey: _subProcessKey, subProcessName: _subProcessName, ...compilerNode } = node
      return node.type === 'subProcess' && node.process
        ? { ...compilerNode, process: toProcess(node.process) }
        : compilerNode
    }),
    ...(process.flows !== undefined ? { flows: process.flows } : {}),
  })
  const result = toProcess(model)
  return { ...result, ...(model.bizFormKey !== undefined ? { bizFormKey: model.bizFormKey } : {}) }
}

async function sendSubProcessRequest<T>(send: Requester, config: AxiosRequestConfig, fallback: string, responseMode: 'data' | 'success' = 'data'): Promise<T> {
  try {
    const response = await send<ApiResponse<T>>(config)
    if (responseMode === 'success') { assertSuccess(response, fallback); return undefined as T }
    return assertResponse(response, fallback)
  } catch (cause) {
    const error = cause as { message?: string; code?: string; response?: { status?: number; data?: unknown } }
    const body = asRecord(error?.response?.data)
    const message = typeof body.message === 'string' ? body.message : error?.response?.status === 404
      ? '子流程片段不存在或已被删除。'
      : error?.response?.status === 409
        ? '子流程片段 key 已存在，请刷新后重试。'
        : error?.message || fallback
    throw Object.assign(new Error(message), { code: body.code ?? error?.code, status: error?.response?.status })
  }
}

export function createSubProcessLibraryGateway(send: Requester = request): SubProcessLibraryGateway {
  const listPage = async (query: WorkflowSubProcessQuery & { firstResult: number; maxResults: number }, signal?: AbortSignal) => {
    const firstResult = Math.max(0, query.firstResult)
    const maxResults = Math.max(1, query.maxResults)
    const requests: Promise<WorkflowSubProcessFragment[]>[] = []
    if (query.key?.trim() && query.name?.trim() && query.key.trim() === query.name.trim()) {
      const keyword = query.key.trim()
      for (const field of ['keyLike', 'nameLike'] as const) {
        const params = { [field]: keyword, firstResult: 0, maxResults: firstResult + maxResults }
        requests.push(sendSubProcessRequest<unknown[]>(send, { method: 'GET', url: basePath, params, signal }, '读取子流程片段失败').then(data => {
          if (!Array.isArray(data)) throw new Error('子流程片段列表响应格式无效。')
          return data.map(normalizeFragment)
        }))
      }
    } else {
      const params = {
        ...(query.key?.trim() ? { keyLike: query.key.trim() } : {}),
        ...(query.name?.trim() ? { nameLike: query.name.trim() } : {}),
        firstResult, maxResults,
      }
      requests.push(sendSubProcessRequest<unknown[]>(send, { method: 'GET', url: basePath, params, signal }, '读取子流程片段失败').then(data => {
        if (!Array.isArray(data)) throw new Error('子流程片段列表响应格式无效。')
        return data.map(normalizeFragment)
      }))
    }
    const results = await Promise.all(requests)
    if (results.length === 1) return results[0]!
    const unique = new Map<string, WorkflowSubProcessFragment>()
    for (const row of results.flat()) unique.set(row.key, row)
    return [...unique.values()]
      .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
      .slice(firstResult, firstResult + maxResults)
  }
  return {
    async listPage(query, signal) { return listPage(query, signal) },
    async list(query = {}) { return listPage({ ...query, firstResult: 0, maxResults: 100 }) },
    async get(key: string, signal?: AbortSignal) {
      return normalizeFragment(await sendSubProcessRequest<unknown>(send, { method: 'GET', url: basePath + '/' + encodeKey(key), signal }, '读取子流程片段失败'))
    },
    async create(input) {
      const body = { subProcessName: input.name.trim(), ...(input.description?.trim() ? { description: input.description.trim() } : {}), displayJson: displayJson(input.displayJson) }
      return normalizeFragment(await sendSubProcessRequest<unknown>(send, { method: 'POST', url: basePath, data: body }, '创建子流程片段失败'))
    },
    async update(key, input) {
      const body = {
        ...(input.name !== undefined ? { subProcessName: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.displayJson ? { displayJson: displayJson(input.displayJson) } : {}),
      }
      return normalizeFragment(await sendSubProcessRequest<unknown>(send, { method: 'PUT', url: basePath + '/' + encodeKey(key), data: body }, '更新子流程片段失败'))
    },
    async delete(key) {
      await sendSubProcessRequest<void>(send, { method: 'DELETE', url: basePath + '/' + encodeKey(key) }, '删除子流程片段失败', 'success')
    },
  }
}

export const subProcessLibraryGateway = createSubProcessLibraryGateway()
