import { request } from '@/utils/request'
import type {
  CamundaActivityInstance,
  CamundaDeployment,
  CamundaHistoricActivity,
  CamundaHistoricProcessInstance,
  CamundaHistoricTask,
  CamundaHistoricVariableInstance,
  CamundaProcessDefinition,
  CamundaProcessDefinitionXml,
  CamundaProcessInstance,
  CamundaTask,
  DeploymentOptions,
  HistoricActivityQuery,
  HistoricProcessInstanceQuery,
  HistoricTaskQuery,
  HistoricVariableQuery,
  WorkflowGateway,
} from './types'
import { ensureDeploymentHistoryTimeToLive } from './deploymentXml'

const basePath = '/camunda'
const resourcePath = (resource: string) => `${basePath}/${resource.split('/').map(encodeURIComponent).join('/')}`

export const camundaGateway: WorkflowGateway = {
  async deploy(xml, deploymentName, options: DeploymentOptions = {}) {
    const form = new FormData()
    form.append('deployment-name', deploymentName || 'BPMN Workspace 部署')
    form.append('enable-duplicate-filtering', String(options.enableDuplicateFiltering ?? true))
    form.append('deploy-changed-only', String(options.deployChangedOnly ?? true))
    if (options.source) form.append('deployment-source', options.source)
    form.append('data', new Blob([ensureDeploymentHistoryTimeToLive(xml)], { type: 'application/xml' }), `${deploymentName || 'process'}.bpmn`)
    return request<CamundaDeployment>({ method: 'POST', url: resourcePath('deployment/create'), data: form })
  },

  listDefinitions(query) {
    return request<CamundaProcessDefinition[]>({ method: 'GET', url: resourcePath('process-definition'), params: query })
  },

  getDefinitionXml(id) {
    return request<CamundaProcessDefinitionXml>({ method: 'GET', url: resourcePath(`process-definition/${id}/xml`) })
  },

  startByKey(key, variables = {}, businessKey) {
    return request<CamundaProcessInstance>({
      method: 'POST',
      url: resourcePath(`process-definition/key/${key}/start`),
      data: { ...(businessKey ? { businessKey } : {}), variables },
    })
  },

  startById(id, variables = {}, businessKey) {
    return request<CamundaProcessInstance>({
      method: 'POST',
      url: resourcePath(`process-definition/${id}/start`),
      data: { ...(businessKey ? { businessKey } : {}), variables },
    })
  },

  listTasks(query) {
    return request<CamundaTask[]>({ method: 'GET', url: resourcePath('task'), params: query })
  },

  async claimTask(taskId, userId) {
    await request<void>({ method: 'POST', url: resourcePath(`task/${taskId}/claim`), data: { userId } })
  },

  async completeTask(taskId, variables = {}) {
    await request<void>({ method: 'POST', url: resourcePath(`task/${taskId}/complete`), data: { variables } })
  },

  getActivityInstance(processInstanceId) {
    return request<CamundaActivityInstance>({ method: 'GET', url: resourcePath(`process-instance/${processInstanceId}/activity-instances`) })
  },

  getProcessInstance(processInstanceId) {
    return request<CamundaProcessInstance>({ method: 'GET', url: resourcePath(`process-instance/${processInstanceId}`) })
  },

  listHistoricProcessInstances(query?: HistoricProcessInstanceQuery) {
    return request<CamundaHistoricProcessInstance[]>({ method: 'GET', url: resourcePath('history/process-instance'), params: query })
  },

  listHistoricTasks(query?: HistoricTaskQuery) {
    return request<CamundaHistoricTask[]>({ method: 'GET', url: resourcePath('history/task'), params: query })
  },

  listHistoricActivities(query?: HistoricActivityQuery) {
    return request<CamundaHistoricActivity[]>({ method: 'GET', url: resourcePath('history/activity-instance'), params: query })
  },

  listHistoricVariables(query: HistoricVariableQuery) {
    return request<CamundaHistoricVariableInstance[]>({ method: 'GET', url: resourcePath('history/variable-instance'), params: query })
  },

  async deleteDeployment(deploymentId, cascade = true) {
    await request<void>({
      method: 'DELETE',
      url: resourcePath(`deployment/${deploymentId}`),
      params: { cascade, skipCustomListeners: true, skipIoMappings: true },
    })
  },
}

export * from './types'
