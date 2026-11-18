import type { WorkflowModel } from './types.js'
import type { WorkflowDefinition } from './definition.js'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Variables = Record<string, JsonValue | undefined>
export type NodeParameters = Record<string, Variables>
export type WorkflowQuery = Record<string, string | number | boolean | undefined>
export interface WorkflowRequest {
  method: 'GET' | 'POST'; path: string; query?: WorkflowQuery; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal
}
export interface WorkflowResponse { status: number; body: unknown }
export type WorkflowRequester = (request: WorkflowRequest) => Promise<WorkflowResponse>
export interface OperationOptions { signal?: AbortSignal; timeoutMs?: number }
export interface CompleteOptions extends OperationOptions { templateSnapshot?: TemplateSnapshot }
export interface PublishOptions extends OperationOptions {
  name?: string
  /** @deprecated The gateway controls startability. true is accepted for compatibility but never sent; false is unsupported. */
  startable?: boolean
}
export interface WorkflowClientOptions { request: WorkflowRequester; timeoutMs?: number }
export interface ParameterRule {
  name: string; fieldKey?: string; nodeId?: string; nodeName?: string; nodeType?: string;
  type: string; source?: string; required?: boolean; value?: JsonValue; defaultValue?: JsonValue; description?: string
}
export interface ParameterIssue { code: string; message: string; path?: string; variableName?: string; nodeId?: string }
export interface TemplateSnapshot {
  templateKey: string; templateName?: string; templateVersion: number; deploymentId: string; processDefinitionId: string;
  processDefinitionKey?: string; processDefinitionVersion?: number; globalVariables: ParameterRule[]; displayJson?: WorkflowModel | null;
  bpmnXml?: string; startable?: boolean; suspended?: boolean; [key: string]: unknown
}
export interface Compilation { model: WorkflowModel; bpmnXml: string }
export type WorkflowSource = WorkflowModel | WorkflowDefinition
export interface StartRequirements {
  templateKey: string; processDefinitionId: string; required: ParameterRule[]; hints: ParameterRule[];
  rules: ParameterRule[]; diagnostics: ParameterIssue[]; template: TemplateSnapshot
}
export interface GatewayBranch { value: string; decisionValue?: JsonValue; targetNodeId?: string; targetNodeName?: string; variables: ParameterRule[]; nextGateway?: NextGateway | null }
export interface NextGateway { gatewayId: string; gatewayName?: string; decisionMode?: string; decisionVariable?: ParameterRule; branches: GatewayBranch[] }
export interface TaskRequirements {
  currentComplete: ParameterRule[]; gatewayDecision: ParameterRule[]; nextStartHints: ParameterRule[]; nextGateway?: NextGateway | null;
  processDefinitionId?: string; [key: string]: unknown
}
export interface TaskReference {
  id: string; processInstanceId: string; processDefinitionId: string; taskDefinitionKey: string;
  name?: string; assignee?: string | null; owner?: string | null; [key: string]: unknown
}
export interface StartInput {
  businessKey: string; nodes?: NodeParameters; variables?: Variables; callbackUrl?: string;
  parentBusinessKey?: string; predecessorConstraint?: boolean; extra?: { [key: string]: JsonValue }
}
export interface StartedInstance {
  processInstanceId: string; processDefinitionId: string; businessKey: string; templateKey: string;
  diagnostics: ParameterIssue[]; mappedProcessDefinitionId: string; [key: string]: unknown
}
export interface CompleteInput { decision?: 'agree' | 'reject'; fields?: Variables; nodes?: NodeParameters; variables?: Variables }
export interface TaskActionResult { taskId: string; status: string; assignee?: string; [key: string]: unknown }
export interface Page<T> { items: T[]; offset: number; limit: number; total?: number }
export interface Pagination { offset?: number; limit?: number }
export interface TaskQuery extends Pagination {
  processInstanceId?: string; assignee?: string; owner?: string; candidateUser?: string; candidateGroup?: string;
  processDefinitionKey?: string; processDefinitionId?: string; taskDefinitionKey?: string; name?: string; nameLike?: string;
  description?: string; priority?: number; minPriority?: number; maxPriority?: number; active?: boolean; suspended?: boolean;
  includeAssignedTasks?: boolean; sortBy?: string; sortOrder?: 'asc' | 'desc'
}
export interface HistoryQuery extends Pagination {
  activityId?: string; activityType?: string; assignee?: string; finished?: boolean; unfinished?: boolean; sortBy?: string; sortOrder?: 'asc' | 'desc'
}
export interface ActivityNode { activityId: string; activityName?: string; activityType?: string; startTime?: string; endTime?: string | null; [key: string]: unknown }
export interface WorkflowProgress {
  processInstanceId: string; processDefinitionId: string;
  state: 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'EXTERNALLY_TERMINATED' | 'INTERNALLY_TERMINATED' | (string & {});
  activeNodes: ActivityNode[]; completedNodes: ActivityNode[]; [key: string]: unknown
}
export interface HistoricActivity extends ActivityNode { id: string; processInstanceId: string; processDefinitionId?: string; taskId?: string; canceled?: boolean; assignee?: string; executionId?: string; durationInMillis?: number }
export type TaskForm = { type: 'form'; data: Record<string, unknown>; values: Variables } | { type: 'route'; data: string; values: Variables } | { type: 'none'; data: null; values: Variables }
export type MessageInput = { messageName: string; variables?: Variables; correlationKeys?: Variables } & (
  { processInstanceId: string; businessKey?: string } | { businessKey: string; processInstanceId?: string }
)
export interface MessageResult { messageName: string; status: string; results?: unknown[]; [key: string]: unknown }
export interface WorkflowClient {
  compile(source: WorkflowSource, options?: OperationOptions): Promise<Compilation>
  publish(source: WorkflowSource, options?: PublishOptions): Promise<TemplateSnapshot>
  getTemplate(key: string, options?: OperationOptions): Promise<TemplateSnapshot>
  getTemplateVersion(key: string, version: number, options?: OperationOptions): Promise<TemplateSnapshot>
  getStartRequirements(key: string, decisions?: WorkflowQuery, options?: OperationOptions): Promise<StartRequirements>
  start(key: string, input: StartInput, options?: OperationOptions): Promise<StartedInstance>
  listTasks(query?: TaskQuery, options?: OperationOptions): Promise<Page<TaskReference>>
  getTaskRequirements(task: TaskReference, options?: OperationOptions): Promise<TaskRequirements>
  getTaskForm(task: TaskReference, options?: OperationOptions): Promise<TaskForm>
  complete(task: TaskReference, input?: CompleteInput, options?: CompleteOptions): Promise<TaskActionResult>
  getProgress(processInstanceId: string, options?: OperationOptions): Promise<WorkflowProgress>
  listHistory(processInstanceId: string, query?: HistoryQuery, options?: OperationOptions): Promise<Page<HistoricActivity>>
  sendMessage(input: MessageInput, options?: OperationOptions): Promise<MessageResult>
  returnForReassignment(task: TaskReference, options?: OperationOptions): Promise<TaskActionResult>
  reassign(task: TaskReference, userId: string, options?: OperationOptions): Promise<TaskActionResult>
}
