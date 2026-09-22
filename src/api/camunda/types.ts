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
  key?: string
  deploymentId?: string
  latestVersion?: boolean
  active?: boolean
  suspended?: boolean
  tenantIdIn?: string
  firstResult?: number
  maxResults?: number
}

export interface TaskQuery {
  processInstanceId?: string
  processDefinitionKey?: string
  assignee?: string
  candidateUser?: string
  candidateGroup?: string
  active?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricProcessInstanceQuery {
  processInstanceId?: string
  processDefinitionId?: string
  processDefinitionKey?: string
  businessKey?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricTaskQuery {
  processInstanceId?: string
  processDefinitionId?: string
  taskDefinitionKey?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricActivityQuery {
  processInstanceId?: string
  processDefinitionId?: string
  activityType?: string
  finished?: boolean
  firstResult?: number
  maxResults?: number
}

export interface HistoricVariableQuery {
  processInstanceId?: string
  processDefinitionId?: string
  variableName?: string
  firstResult?: number
  maxResults?: number
}

export interface WorkflowGateway {
  deploy(xml: string, deploymentName?: string, options?: DeploymentOptions): Promise<CamundaDeployment>
  listDefinitions(query?: ProcessDefinitionQuery): Promise<CamundaProcessDefinition[]>
  getDefinitionXml(id: string): Promise<CamundaProcessDefinitionXml>
  startByKey(key: string, variables?: CamundaVariables, businessKey?: string): Promise<CamundaProcessInstance>
  startById(id: string, variables?: CamundaVariables, businessKey?: string): Promise<CamundaProcessInstance>
  listTasks(query?: TaskQuery): Promise<CamundaTask[]>
  claimTask(taskId: string, userId: string): Promise<void>
  completeTask(taskId: string, variables?: CamundaVariables): Promise<void>
  getActivityInstance(processInstanceId: string): Promise<CamundaActivityInstance>
  getProcessInstance(processInstanceId: string): Promise<CamundaProcessInstance>
  listHistoricProcessInstances(query?: HistoricProcessInstanceQuery): Promise<CamundaHistoricProcessInstance[]>
  listHistoricTasks(query?: HistoricTaskQuery): Promise<CamundaHistoricTask[]>
  listHistoricActivities(query?: HistoricActivityQuery): Promise<CamundaHistoricActivity[]>
  listHistoricVariables(query: HistoricVariableQuery): Promise<CamundaHistoricVariableInstance[]>
  deleteDeployment(deploymentId: string, cascade?: boolean): Promise<void>
}
