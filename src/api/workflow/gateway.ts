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
  TaskTemplate,
  TaskTemplateQuery,
} from './types'

interface DataResponse<T> { data: T }
type WorkflowRequester = <T>(config: AxiosRequestConfig) => Promise<T>

const basePath = '/v1'
const pathSegment = (value: string) => encodeURIComponent(value)

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
      const response = await send<DataResponse<TaskTemplate>>({ method: 'POST', url: basePath + '/task/deployments', data: form })
      return response.data
    },

    async listTemplates(query?: TaskTemplateQuery, signal?: AbortSignal) {
      const response = await send<DataResponse<TaskTemplate[]>>({ method: 'GET', url: basePath + '/task/deployments', params: query, signal })
      return response.data
    },

    async getTemplate(taskKey: string, signal?: AbortSignal) {
      const response = await send<DataResponse<TaskTemplate>>({ method: 'GET', url: basePath + '/task/deployments/' + pathSegment(taskKey), signal })
      return response.data
    },

    async startTaskInstance(input: StartBusinessTaskInput) {
      const response = await send<DataResponse<BusinessTaskInstance>>({ method: 'POST', url: basePath + '/task/instances/start', data: input })
      return response.data
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
  }
}

export const businessWorkflowGateway = createBusinessWorkflowGateway()
