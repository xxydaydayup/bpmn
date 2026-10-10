export type BusinessVariables = Record<string, unknown>

export interface TaskTemplateVariable {
  name: string
  type: string
  required: boolean
  defaultValue?: unknown
  description?: string
}

export interface TaskTemplate {
  id: number
  tenantId: string
  taskKey: string
  taskName: string
  category?: string
  version: number
  deploymentId: string
  processDefinitionKey: string
  processDefinitionId: string
  versionTag?: string
  description?: string
  formKey?: string
  startable: boolean
  suspended: boolean
  globalVariables?: TaskTemplateVariable[]
  extra?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
}

export interface TaskTemplateDetail extends TaskTemplate {
  bpmnXml: string
}

export interface TaskTemplateDeleteResult {
  taskKey: string
  status: string
}

export interface TaskTemplateQuery {
  key?: string
  keyLike?: string
  nameLike?: string
  category?: string
  processDefinitionKey?: string
  suspendedOnly?: boolean
  firstResult?: number
  maxResults?: number
}

export interface BusinessTaskInstance {
  id: number
  tenantId: string
  taskKey: string
  taskName: string
  taskTemplateId: number
  businessKey: string
  processDefinitionKey: string
  processDefinitionId: string
  processInstanceId: string
  parentBusinessKey?: string
  predecessorConstraint?: boolean
  callbackUrl?: string
  status: string
  variables?: BusinessVariables
  extra?: Record<string, unknown> | null
  startedAt?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
}

export interface StartBusinessTaskInput {
  taskKey: string
  businessKey: string
  variables?: BusinessVariables
  startedBy?: string
  callbackUrl?: string
  extra?: Record<string, unknown>
  parentBusinessKey?: string
  predecessorConstraint?: boolean
}

export interface BusinessUserTask {
  id: string
  name?: string
  assignee?: string
  owner?: string
  description?: string
  priority?: number
  processDefinitionId?: string
  processDefinitionKey?: string
  processInstanceId?: string
  executionId?: string
  taskDefinitionKey?: string
  created?: string
  due?: string
  followUp?: string
  formKey?: string
  tenantId?: string
  variables?: BusinessVariables
  suspensionState?: number
}

export interface BusinessTaskQuery {
  assignee?: string
  owner?: string
  candidateUser?: string
  candidateGroup?: string
  processInstanceId?: string
  processDefinitionKey?: string
  processDefinitionId?: string
  taskDefinitionKey?: string
  name?: string
  nameLike?: string
  description?: string
  priority?: number
  minPriority?: number
  maxPriority?: number
  active?: boolean
  suspended?: boolean
  includeAssignedTasks?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  firstResult?: number
  maxResults?: number
}

export interface TaskCompletionResult {
  taskId: string
  status: string
}

export interface TaskRefuseResult {
  taskId: string
  status: string
}

export interface TaskReassignResult {
  taskId: string
  status: string
  assignee: string
}

export interface BusinessWorkflowGateway {
  publishTemplate(xml: string, deploymentName: string): Promise<TaskTemplate>
  listTemplates(query?: TaskTemplateQuery, signal?: AbortSignal): Promise<TaskTemplate[]>
  getTemplate(taskKey: string, signal?: AbortSignal): Promise<TaskTemplateDetail>
  deleteTemplate(taskKey: string): Promise<TaskTemplateDeleteResult>
  startTaskInstance(input: StartBusinessTaskInput): Promise<BusinessTaskInstance>
  listTasks(query?: BusinessTaskQuery, signal?: AbortSignal): Promise<BusinessUserTask[]>
  completeTask(taskId: string, variables?: BusinessVariables): Promise<TaskCompletionResult>
  refuseTask(taskId: string): Promise<TaskRefuseResult>
  reassignTask(taskId: string, userId: string): Promise<TaskReassignResult>
}
