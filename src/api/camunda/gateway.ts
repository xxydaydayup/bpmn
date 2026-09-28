import { request } from '@/utils/request'
import type {
  CamundaActivityInstance,
  CamundaDeployment,
  CamundaDeploymentResource,
  CamundaHistoricActivity,
  CamundaHistoricOperationLog,
  CamundaHistoricProcessInstance,
  CamundaHistoricTask,
  CamundaHistoricVariableInstance,
  CamundaIncident,
  CamundaExternalTask,
  CamundaJob,
  CamundaMetric,
  CamundaProcessDefinition,
  CamundaProcessDefinitionXml,
  CamundaProcessInstance,
  CamundaTask,
  CamundaVariables,
  CamundaVersion,
  DeploymentQuery,
  DeploymentOptions,
  ExternalTaskQuery,
  HistoricActivityQuery,
  HistoricOperationLogQuery,
  HistoricProcessInstanceQuery,
  HistoricTaskQuery,
  HistoricVariableQuery,
  IncidentQuery,
  JobQuery,
  ProcessInstanceDeleteOptions,
  ProcessInstanceQuery,
  SuspendedStateOptions,
  ProcessDefinitionQuery,
  TaskQuery,
  WorkflowGateway,
} from './types'
import { ensureDeploymentHistoryTimeToLive } from './deploymentXml'

const basePath = '/camunda'
const resourcePath = (resource: string) => `${basePath}/${resource.split('/').map(encodeURIComponent).join('/')}`

async function countResource(resource: string, params?: object, signal?: AbortSignal): Promise<number> {
  const result = await request<{ count: number }>({ method: 'GET', url: resourcePath(resource), params, signal })
  return result.count
}

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

  countDeployments(query?: DeploymentQuery, signal?: AbortSignal) {
    return countResource('deployment/count', query, signal)
  },

  listDeployments(query?: DeploymentQuery, signal?: AbortSignal) {
    return request<CamundaDeployment[]>({ method: 'GET', url: resourcePath('deployment'), params: query, signal })
  },

  listDeploymentResources(deploymentId, signal?: AbortSignal) {
    return request<CamundaDeploymentResource[]>({ method: 'GET', url: resourcePath(`deployment/${deploymentId}/resources`), signal })
  },

  listDefinitions(query?: ProcessDefinitionQuery, signal?: AbortSignal) {
    return request<CamundaProcessDefinition[]>({ method: 'GET', url: resourcePath('process-definition'), params: query, signal })
  },

  countDefinitions(query?: ProcessDefinitionQuery, signal?: AbortSignal) {
    return countResource('process-definition/count', query, signal)
  },

  getDefinitionXml(id, signal?: AbortSignal) {
    return request<CamundaProcessDefinitionXml>({ method: 'GET', url: resourcePath(`process-definition/${id}/xml`), signal })
  },

  getDefinitionDiagram(id, signal?: AbortSignal) {
    return request<Blob>({ method: 'GET', url: resourcePath(`process-definition/${id}/diagram`), responseType: 'blob', signal })
  },

  async setDefinitionSuspended(id, options: SuspendedStateOptions) {
    await request<void>({ method: 'PUT', url: resourcePath(`process-definition/${id}/suspended`), data: options })
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

  listProcessInstances(query?: ProcessInstanceQuery, signal?: AbortSignal) {
    return request<CamundaProcessInstance[]>({ method: 'GET', url: resourcePath('process-instance'), params: query, signal })
  },

  countProcessInstances(query?: ProcessInstanceQuery, signal?: AbortSignal) {
    return countResource('process-instance/count', query, signal)
  },

  getProcessInstanceVariables(processInstanceId, deserializeValues = false, signal?: AbortSignal) {
    return request<CamundaVariables>({
      method: 'GET',
      url: resourcePath(`process-instance/${processInstanceId}/variables`),
      params: { deserializeValues },
      signal,
    })
  },

  async setProcessInstanceSuspended(processInstanceId, suspended) {
    await request<void>({ method: 'PUT', url: resourcePath(`process-instance/${processInstanceId}/suspended`), data: { suspended } })
  },

  async deleteProcessInstance(processInstanceId, options: ProcessInstanceDeleteOptions = {}) {
    await request<void>({
      method: 'DELETE',
      url: resourcePath(`process-instance/${processInstanceId}`),
      params: {
        skipCustomListeners: options.skipCustomListeners ?? false,
        skipIoMappings: options.skipIoMappings ?? false,
        skipSubprocesses: options.skipSubprocesses ?? false,
        failIfNotExists: options.failIfNotExists ?? true,
      },
    })
  },

  listTasks(query?: TaskQuery, signal?: AbortSignal) {
    return request<CamundaTask[]>({ method: 'GET', url: resourcePath('task'), params: query, signal })
  },

  countTasks(query?: TaskQuery, signal?: AbortSignal) {
    return countResource('task/count', query, signal)
  },

  getTask(taskId, signal?: AbortSignal) {
    return request<CamundaTask>({ method: 'GET', url: resourcePath(`task/${taskId}`), signal })
  },

  getTaskVariables(taskId, deserializeValues = false, signal?: AbortSignal) {
    return request<CamundaVariables>({
      method: 'GET',
      url: resourcePath(`task/${taskId}/variables`),
      params: { deserializeValues },
      signal,
    })
  },

  async claimTask(taskId, userId) {
    await request<void>({ method: 'POST', url: resourcePath(`task/${taskId}/claim`), data: { userId } })
  },

  async completeTask(taskId, variables = {}) {
    await request<void>({ method: 'POST', url: resourcePath(`task/${taskId}/complete`), data: { variables } })
  },

  listJobs(query?: JobQuery, signal?: AbortSignal) {
    return request<CamundaJob[]>({ method: 'GET', url: resourcePath('job'), params: query, signal })
  },

  countJobs(query?: JobQuery, signal?: AbortSignal) {
    return countResource('job/count', query, signal)
  },

  getJob(jobId, signal?: AbortSignal) {
    return request<CamundaJob>({ method: 'GET', url: resourcePath(`job/${jobId}`), signal })
  },

  getJobExceptionStacktrace(jobId, signal?: AbortSignal) {
    return request<string>({ method: 'GET', url: resourcePath(`job/${jobId}/exception-stacktrace`), responseType: 'text', signal })
  },

  async setJobRetries(jobId, retries) {
    await request<void>({ method: 'PUT', url: resourcePath(`job/${jobId}/retries`), data: { retries } })
  },

  async executeJob(jobId) {
    await request<void>({ method: 'POST', url: resourcePath(`job/${jobId}/execute`) })
  },

  listIncidents(query?: IncidentQuery, signal?: AbortSignal) {
    return request<CamundaIncident[]>({ method: 'GET', url: resourcePath('incident'), params: query, signal })
  },

  countIncidents(query?: IncidentQuery, signal?: AbortSignal) {
    return countResource('incident/count', query, signal)
  },

  getIncident(incidentId, signal?: AbortSignal) {
    return request<CamundaIncident>({ method: 'GET', url: resourcePath(`incident/${incidentId}`), signal })
  },

  listExternalTasks(query?: ExternalTaskQuery, signal?: AbortSignal) {
    return request<CamundaExternalTask[]>({ method: 'GET', url: resourcePath('external-task'), params: query, signal })
  },

  countExternalTasks(query?: ExternalTaskQuery, signal?: AbortSignal) {
    return countResource('external-task/count', query, signal)
  },

  getExternalTask(externalTaskId, signal?: AbortSignal) {
    return request<CamundaExternalTask>({ method: 'GET', url: resourcePath(`external-task/${externalTaskId}`), signal })
  },

  getVersion(signal) {
    return request<CamundaVersion>({ method: 'GET', url: resourcePath('version'), signal })
  },

  listMetrics(query, signal?: AbortSignal) {
    return request<CamundaMetric[]>({ method: 'GET', url: resourcePath('metrics'), params: query, signal })
  },

  getActivityInstance(processInstanceId, signal?: AbortSignal) {
    return request<CamundaActivityInstance>({ method: 'GET', url: resourcePath(`process-instance/${processInstanceId}/activity-instances`), signal })
  },

  getProcessInstance(processInstanceId, signal?: AbortSignal) {
    return request<CamundaProcessInstance>({ method: 'GET', url: resourcePath(`process-instance/${processInstanceId}`), signal })
  },

  countHistoricProcessInstances(query?: HistoricProcessInstanceQuery, signal?: AbortSignal) {
    return countResource('history/process-instance/count', query, signal)
  },

  listHistoricProcessInstances(query?: HistoricProcessInstanceQuery, signal?: AbortSignal) {
    return request<CamundaHistoricProcessInstance[]>({ method: 'GET', url: resourcePath('history/process-instance'), params: query, signal })
  },

  countHistoricTasks(query?: HistoricTaskQuery, signal?: AbortSignal) {
    return countResource('history/task/count', query, signal)
  },

  listHistoricTasks(query?: HistoricTaskQuery, signal?: AbortSignal) {
    return request<CamundaHistoricTask[]>({ method: 'GET', url: resourcePath('history/task'), params: query, signal })
  },

  countHistoricActivities(query?: HistoricActivityQuery, signal?: AbortSignal) {
    return countResource('history/activity-instance/count', query, signal)
  },

  listHistoricActivities(query?: HistoricActivityQuery, signal?: AbortSignal) {
    return request<CamundaHistoricActivity[]>({ method: 'GET', url: resourcePath('history/activity-instance'), params: query, signal })
  },

  countHistoricVariables(query?: HistoricVariableQuery, signal?: AbortSignal) {
    return countResource('history/variable-instance/count', query, signal)
  },

  listHistoricVariables(query: HistoricVariableQuery, signal?: AbortSignal) {
    return request<CamundaHistoricVariableInstance[]>({ method: 'GET', url: resourcePath('history/variable-instance'), params: query, signal })
  },

  listHistoricOperationLogs(query?: HistoricOperationLogQuery, signal?: AbortSignal) {
    return request<CamundaHistoricOperationLog[]>({ method: 'GET', url: resourcePath('history/user-operation'), params: query, signal })
  },

  countHistoricOperationLogs(query?: HistoricOperationLogQuery, signal?: AbortSignal) {
    return countResource('history/user-operation/count', query, signal)
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
