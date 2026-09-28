export interface CamundaProcessDefinition {
  id: string
  key: string
  name?: string
  version?: number
  versionTag?: string
  deploymentId?: string
  resource?: string
  diagram?: string
  suspended?: boolean
  tenantId?: string
}

export interface CamundaDeployment {
  id: string
  name?: string
  deploymentTime?: string
  source?: string
  tenantId?: string
  deployedProcessDefinitions?: Record<string, CamundaProcessDefinition>
}

export interface CamundaDeploymentResource {
  id: string
  name: string
  deploymentId?: string
}

export interface CamundaCountResult {
  count: number
}

export interface CamundaProcessDefinitionXml {
  id: string
  bpmn20Xml: string
}

export interface CamundaVariable {
  value: unknown
  type?: 'String' | 'Boolean' | 'Integer' | 'Long' | 'Double' | 'Date' | 'Json' | 'Object' | 'Bytes'
  valueInfo?: Record<string, unknown>
}

export type CamundaVariables = Record<string, CamundaVariable>

export interface CamundaProcessInstance {
  id: string
  definitionId?: string
  definitionKey?: string
  businessKey?: string
  ended?: boolean
  suspended?: boolean
  tenantId?: string
}

export interface CamundaJob {
  id: string
  jobDefinitionId?: string
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  executionId?: string
  exceptionMessage?: string
  retries?: number
  due?: string
  createTime?: string
  repeat?: string
  priority?: number
  suspended?: boolean
  jobType?: string
  jobConfiguration?: string
  deploymentId?: string
  tenantId?: string
  failedActivityId?: string
  activityId?: string
  batchId?: string
}

export interface CamundaIncident {
  id: string
  incidentType?: string
  incidentMessage?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processInstanceId?: string
  executionId?: string
  activityId?: string
  failedActivityId?: string
  causeIncidentId?: string
  rootCauseIncidentId?: string
  configuration?: string
  tenantId?: string
  incidentTimestamp?: string
  jobDefinitionId?: string
  annotation?: string
}

export interface CamundaExternalTask {
  id: string
  topicName?: string
  workerId?: string
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  activityId?: string
  activityInstanceId?: string
  executionId?: string
  lockExpirationTime?: string
  priority?: number
  retries?: number
  errorMessage?: string
  errorDetails?: string
  suspended?: boolean
  tenantId?: string
  businessKey?: string
}

export interface CamundaVersion {
  version: string
}

export interface CamundaMetric {
  name: string
  reporter?: string
  value?: number
  timestamp?: string
}

export interface CamundaHistoricOperationLog {
  id: string
  userId?: string
  timestamp?: string
  operationType?: string
  entityType?: string
  deploymentId?: string
  jobId?: string
  operationId?: string
  property?: string
  orgValue?: string
  newValue?: string
  jobDefinitionId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processInstanceId?: string
  rootProcessInstanceId?: string
  executionId?: string
  taskId?: string
  batchId?: string
  userOperationId?: string
  externalTaskId?: string
  annotation?: string
  category?: string
  tenantId?: string
}

export interface CamundaTask {
  id: string
  name?: string
  taskDefinitionKey?: string
  processInstanceId?: string
  processDefinitionId?: string
  assignee?: string
  owner?: string
  created?: string
  due?: string
  followUp?: string
  delegationState?: string
  description?: string
  executionId?: string
  priority?: number
  suspended?: boolean
  formKey?: string
  tenantId?: string
}

export interface CamundaActivityInstance {
  id: string
  activityId?: string
  activityName?: string
  activityType?: string
  processInstanceId?: string
  processDefinitionId?: string
  childActivityInstances?: CamundaActivityInstance[]
  childTransitionInstances?: Array<{ id: string; activityId?: string }>
}

export interface CamundaHistoricProcessInstance {
  id: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processDefinitionName?: string
  businessKey?: string
  startTime?: string
  endTime?: string
  durationInMillis?: number
  state?: string
  deleteReason?: string
  superProcessInstanceId?: string
}

export interface CamundaHistoricTask {
  id: string
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  taskDefinitionKey?: string
  name?: string
  assignee?: string
  owner?: string
  startTime?: string
  endTime?: string
  durationInMillis?: number
  deleteReason?: string
  priority?: number
}

export interface CamundaHistoricActivity {
  id: string
  activityId?: string
  activityName?: string
  activityType?: string
  processInstanceId?: string
  processDefinitionId?: string
  activityInstanceId?: string
  taskId?: string
  startTime?: string
  endTime?: string
  durationInMillis?: number
  canceled?: boolean
  completeScope?: boolean
  incidentIds?: string[]
}

export interface CamundaHistoricVariableInstance {
  id: string
  processInstanceId?: string
  executionId?: string
  activityInstanceId?: string
  name?: string
  type?: string
  value?: unknown
  createTime?: string
  removalTime?: string
}

export interface DeploymentOptions {
  enableDuplicateFiltering?: boolean
  deployChangedOnly?: boolean
  source?: string
}

export interface ProcessDefinitionQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processDefinitionId?: string
  key?: string
  keyLike?: string
  name?: string
  nameLike?: string
  version?: number
  versionTag?: string
  versionTagLike?: string
  resourceName?: string
  resourceNameLike?: string
  deploymentId?: string
  startableBy?: string
  incidentType?: string
  incidentId?: string
  incidentMessage?: string
  incidentMessageLike?: string
  latestVersion?: boolean
  active?: boolean
  suspended?: boolean
  tenantIdIn?: string
  withoutTenantId?: boolean
  includeDefinitionsWithoutTenantId?: boolean
  firstResult?: number
  maxResults?: number
}

export interface DeploymentQuery {
  id?: string
  name?: string
  nameLike?: string
  source?: string
  withoutSource?: boolean
  tenantIdIn?: string
  withoutTenantId?: boolean
  includeDeploymentsWithoutTenantId?: boolean
  sortBy?: 'id' | 'name' | 'deploymentTime' | 'tenantId'
  sortOrder?: 'asc' | 'desc'
  firstResult?: number
  maxResults?: number
}

export interface ProcessInstanceQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processInstanceIds?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processDefinitionKeyIn?: string
  businessKey?: string
  businessKeyLike?: string
  deploymentId?: string
  superProcessInstance?: string
  subProcessInstance?: string
  active?: boolean
  suspended?: boolean
  withIncident?: boolean
  incidentType?: string
  incidentMessage?: string
  incidentMessageLike?: string
  tenantIdIn?: string
  withoutTenantId?: boolean
  rootProcessInstancesOnly?: boolean
  firstResult?: number
  maxResults?: number
}

export interface TaskQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  taskId?: string
  taskName?: string
  taskNameLike?: string
  taskDescription?: string
  taskDescriptionLike?: string
  processDefinitionId?: string
  processInstanceIdIn?: string
  processDefinitionKeyIn?: string
  processInstanceBusinessKey?: string
  processInstanceBusinessKeyLike?: string
  priority?: number
  minPriority?: number
  maxPriority?: number
  processInstanceId?: string
  processDefinitionKey?: string
  assignee?: string
  assigneeLike?: string
  owner?: string
  ownerLike?: string
  candidateUser?: string
  candidateGroup?: string
  candidateGroups?: string
  due?: string
  dueBefore?: string
  dueAfter?: string
  followUp?: string
  followUpBefore?: string
  followUpAfter?: string
  delegationState?: string
  active?: boolean
  suspended?: boolean
  unassigned?: boolean
  assigned?: boolean
  tenantIdIn?: string
  withoutTenantId?: boolean
  firstResult?: number
  maxResults?: number
}

export interface JobQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  jobId?: string
  jobDefinitionId?: string
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  executionId?: string
  executable?: boolean
  withException?: boolean
  exceptionMessage?: string
  exceptionMessageLike?: string
  withRetriesLeft?: boolean
  noRetriesLeft?: boolean
  dueDates?: string
  dueDate?: string
  duedateHigherThan?: string
  duedateLowerThan?: string
  active?: boolean
  suspended?: boolean
  jobType?: string
  jobPriority?: number
  tenantIdIn?: string
  withoutTenantId?: boolean
  firstResult?: number
  maxResults?: number
}

export interface IncidentQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  incidentId?: string
  incidentType?: string
  incidentMessage?: string
  incidentMessageLike?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processInstanceId?: string
  executionId?: string
  activityId?: string
  causeIncidentId?: string
  rootCauseIncidentId?: string
  configuration?: string
  tenantIdIn?: string
  withoutTenantId?: boolean
  firstResult?: number
  maxResults?: number
}

export interface ExternalTaskQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  externalTaskId?: string
  topicName?: string
  workerId?: string
  locked?: boolean
  notLocked?: boolean
  withoutWorkerId?: boolean
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  activityId?: string
  activityInstanceId?: string
  executionId?: string
  businessKey?: string
  businessKeyLike?: string
  tenantIdIn?: string
  withoutTenantId?: boolean
  includeExternalTaskLocalVariables?: boolean
  includeExecutionVariables?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricProcessInstanceQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  businessKey?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricTaskQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processInstanceId?: string
  processDefinitionId?: string
  taskDefinitionKey?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricActivityQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processInstanceId?: string
  processDefinitionId?: string
  activityType?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricVariableQuery {
  deserializeValues?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  processInstanceId?: string
  processDefinitionId?: string
  variableName?: string
  firstResult?: number
  maxResults?: number
}

export interface HistoricOperationLogQuery {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  deploymentId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  processInstanceId?: string
  taskId?: string
  jobDefinitionId?: string
  batchId?: string
  userId?: string
  operationType?: string
  entityType?: string
  property?: string
  category?: string
  timestampBefore?: string
  timestampAfter?: string
  tenantIdIn?: string
  withoutTenantId?: boolean
  firstResult?: number
  maxResults?: number
}

export interface SuspendedStateOptions {
  suspended: boolean
  includeProcessInstances?: boolean
  executionDate?: string
}

export interface ProcessInstanceDeleteOptions {
  skipCustomListeners?: boolean
  skipIoMappings?: boolean
  skipSubprocesses?: boolean
  failIfNotExists?: boolean
}

export interface WorkflowGateway {
  deploy(xml: string, deploymentName?: string, options?: DeploymentOptions): Promise<CamundaDeployment>
  countDeployments(query?: DeploymentQuery, signal?: AbortSignal): Promise<number>
  listDeployments(query?: DeploymentQuery, signal?: AbortSignal): Promise<CamundaDeployment[]>
  listDeploymentResources(deploymentId: string, signal?: AbortSignal): Promise<CamundaDeploymentResource[]>
  listDefinitions(query?: ProcessDefinitionQuery, signal?: AbortSignal): Promise<CamundaProcessDefinition[]>
  countDefinitions(query?: ProcessDefinitionQuery, signal?: AbortSignal): Promise<number>
  getDefinitionXml(id: string, signal?: AbortSignal): Promise<CamundaProcessDefinitionXml>
  getDefinitionDiagram(id: string, signal?: AbortSignal): Promise<Blob>
  setDefinitionSuspended(id: string, options: SuspendedStateOptions): Promise<void>
  startByKey(key: string, variables?: CamundaVariables, businessKey?: string): Promise<CamundaProcessInstance>
  startById(id: string, variables?: CamundaVariables, businessKey?: string): Promise<CamundaProcessInstance>
  listProcessInstances(query?: ProcessInstanceQuery, signal?: AbortSignal): Promise<CamundaProcessInstance[]>
  countProcessInstances(query?: ProcessInstanceQuery, signal?: AbortSignal): Promise<number>
  getProcessInstanceVariables(processInstanceId: string, deserializeValues?: boolean, signal?: AbortSignal): Promise<CamundaVariables>
  setProcessInstanceSuspended(processInstanceId: string, suspended: boolean): Promise<void>
  deleteProcessInstance(processInstanceId: string, options?: ProcessInstanceDeleteOptions): Promise<void>
  listTasks(query?: TaskQuery, signal?: AbortSignal): Promise<CamundaTask[]>
  countTasks(query?: TaskQuery, signal?: AbortSignal): Promise<number>
  getTask(taskId: string, signal?: AbortSignal): Promise<CamundaTask>
  getTaskVariables(taskId: string, deserializeValues?: boolean, signal?: AbortSignal): Promise<CamundaVariables>
  claimTask(taskId: string, userId: string): Promise<void>
  completeTask(taskId: string, variables?: CamundaVariables): Promise<void>
  listJobs(query?: JobQuery, signal?: AbortSignal): Promise<CamundaJob[]>
  countJobs(query?: JobQuery, signal?: AbortSignal): Promise<number>
  getJob(jobId: string, signal?: AbortSignal): Promise<CamundaJob>
  getJobExceptionStacktrace(jobId: string, signal?: AbortSignal): Promise<string>
  setJobRetries(jobId: string, retries: number): Promise<void>
  executeJob(jobId: string): Promise<void>
  listIncidents(query?: IncidentQuery, signal?: AbortSignal): Promise<CamundaIncident[]>
  countIncidents(query?: IncidentQuery, signal?: AbortSignal): Promise<number>
  getIncident(incidentId: string, signal?: AbortSignal): Promise<CamundaIncident>
  listExternalTasks(query?: ExternalTaskQuery, signal?: AbortSignal): Promise<CamundaExternalTask[]>
  countExternalTasks(query?: ExternalTaskQuery, signal?: AbortSignal): Promise<number>
  getExternalTask(externalTaskId: string, signal?: AbortSignal): Promise<CamundaExternalTask>
  getVersion(signal?: AbortSignal): Promise<CamundaVersion>
  listMetrics(query?: { name?: string; reporter?: string; startDate?: string; endDate?: string; firstResult?: number; maxResults?: number }, signal?: AbortSignal): Promise<CamundaMetric[]>
  getActivityInstance(processInstanceId: string, signal?: AbortSignal): Promise<CamundaActivityInstance>
  getProcessInstance(processInstanceId: string, signal?: AbortSignal): Promise<CamundaProcessInstance>
  countHistoricProcessInstances(query?: HistoricProcessInstanceQuery, signal?: AbortSignal): Promise<number>
  listHistoricProcessInstances(query?: HistoricProcessInstanceQuery, signal?: AbortSignal): Promise<CamundaHistoricProcessInstance[]>
  countHistoricTasks(query?: HistoricTaskQuery, signal?: AbortSignal): Promise<number>
  listHistoricTasks(query?: HistoricTaskQuery, signal?: AbortSignal): Promise<CamundaHistoricTask[]>
  countHistoricActivities(query?: HistoricActivityQuery, signal?: AbortSignal): Promise<number>
  listHistoricActivities(query?: HistoricActivityQuery, signal?: AbortSignal): Promise<CamundaHistoricActivity[]>
  countHistoricVariables(query?: HistoricVariableQuery, signal?: AbortSignal): Promise<number>
  listHistoricVariables(query: HistoricVariableQuery, signal?: AbortSignal): Promise<CamundaHistoricVariableInstance[]>
  listHistoricOperationLogs(query?: HistoricOperationLogQuery, signal?: AbortSignal): Promise<CamundaHistoricOperationLog[]>
  countHistoricOperationLogs(query?: HistoricOperationLogQuery, signal?: AbortSignal): Promise<number>
  deleteDeployment(deploymentId: string, cascade?: boolean): Promise<void>
}
