import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'
import type {
  BusinessTaskInstance,
  BusinessTaskQuery,
  BusinessUserTask,
  BusinessVariables,
  BusinessWorkflowGateway,
  StartBusinessTaskInput,
  TaskCompletionResult,
  TaskRefuseResult,
  TaskReassignResult,
  TaskTemplate,
  TaskTemplateDeleteResult,
  TaskTemplateDetail,
  TaskTemplateQuery,
  TaskTemplateVariable,
} from './types'

interface DataResponse<T> { data: T }
type WorkflowRequester = <T>(config: AxiosRequestConfig) => Promise<T>

const basePath = '/v1'
const pathSegment = (value: string) => encodeURIComponent(value)

type ApiRecord = Record<string, unknown>

function normalizeTemplateVariable(value: ApiRecord): TaskTemplateVariable {
  return {
    ...value,
    defaultValue: value.defaultValue !== undefined ? value.defaultValue : value.value,
  } as TaskTemplateVariable
}

/** Keep the UI's task terminology at the API boundary while accepting the backend's template terminology. */
function normalizeTemplate(value: ApiRecord): TaskTemplate {
  return {
    ...value,
    taskKey: value.taskKey ?? value.templateKey,
    taskName: value.taskName ?? value.templateName,
    ...(Array.isArray(value.globalVariables)
      ? { globalVariables: value.globalVariables.map(item => normalizeTemplateVariable(item as ApiRecord)) }
      : {}),
  } as TaskTemplate
}

function normalizeTemplateDetail(value: ApiRecord): TaskTemplateDetail {
  return normalizeTemplate(value) as TaskTemplateDetail
}

function normalizeTemplateDeleteResult(value: ApiRecord): TaskTemplateDeleteResult {
  return { ...value, taskKey: value.taskKey ?? value.templateKey } as TaskTemplateDeleteResult
}

function normalizeTaskInstance(value: ApiRecord): BusinessTaskInstance {
  return {
    ...value,
    taskKey: value.taskKey ?? value.templateKey,
    taskName: value.taskName ?? value.templateName,
    taskTemplateId: value.taskTemplateId ?? value.templateId,
  } as BusinessTaskInstance
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'process'
}

export function createBusinessWorkflowGateway(send: WorkflowRequester = request): BusinessWorkflowGateway {
  return {
    async publishTemplate(xml, deploymentName) {
      const form = new FormData()
      const name = deploymentName.trim() || '流程任务模板'
      form.append('deployment-name', name)
      form.append('file', new Blob([xml], { type: 'application/xml' }), safeFilename(name) + '.bpmn')
      const response = await send<DataResponse<ApiRecord>>({ method: 'POST', url: basePath + '/template', data: form })
      return normalizeTemplate(response.data)
    },

    async listTemplates(query?: TaskTemplateQuery, signal?: AbortSignal) {
      const response = await send<DataResponse<ApiRecord[]>>({ method: 'GET', url: basePath + '/template', params: query, signal })
      return response.data.map(normalizeTemplate)
    },

    async getTemplate(taskKey: string, signal?: AbortSignal) {
      const response = await send<DataResponse<ApiRecord>>({ method: 'GET', url: basePath + '/template/' + pathSegment(taskKey), signal })
      return normalizeTemplateDetail(response.data)
    },

    async deleteTemplate(taskKey: string) {
      const response = await send<DataResponse<ApiRecord>>({ method: 'DELETE', url: basePath + '/template/' + pathSegment(taskKey) })
      return normalizeTemplateDeleteResult(response.data)
    },

    async startTaskInstance(input: StartBusinessTaskInput) {
      const { taskKey, ...rest } = input
      const response = await send<DataResponse<ApiRecord>>({
        method: 'POST',
        url: basePath + '/task/instances/start',
        data: { templateKey: taskKey, ...rest },
      })
      return normalizeTaskInstance(response.data)
    },

    async listTasks(query?: BusinessTaskQuery, signal?: AbortSignal) {
      const response = await send<DataResponse<BusinessUserTask[]>>({ method: 'GET', url: basePath + '/tasks', params: query, signal })
      return response.data
    },

    async completeTask(taskId: string, variables: BusinessVariables = {}) {
      const response = await send<DataResponse<TaskCompletionResult>>({
        method: 'POST',
        url: basePath + '/tasks/' + pathSegment(taskId) + '/complete',
        data: { variables },
      })
      return response.data
    },

    async refuseTask(taskId: string) {
      const response = await send<DataResponse<TaskRefuseResult>>({
        method: 'POST',
        url: basePath + '/tasks/' + pathSegment(taskId) + '/refuse',
      })
      return response.data
    },

    async reassignTask(taskId: string, userId: string) {
      const response = await send<DataResponse<TaskReassignResult>>({
        method: 'POST',
        url: basePath + '/tasks/' + pathSegment(taskId) + '/reassign',
        data: { userId },
      })
      return response.data
    },
  }
}

export const businessWorkflowGateway = createBusinessWorkflowGateway()
