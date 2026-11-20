export const WORKFLOW_NODE_TYPES = ['start', 'approval', 'countersign', 'condition', 'parallel', 'service', 'receive', 'timer', 'subProcess', 'end'] as const
export const LEGACY_WORKFLOW_NODE_TYPES = ['startEvent', 'userTask', 'exclusiveGateway', 'parallelGateway', 'endEvent', 'receiveTask'] as const
export type WorkflowNodeType = typeof WORKFLOW_NODE_TYPES[number]
export type LegacyWorkflowNodeType = typeof LEGACY_WORKFLOW_NODE_TYPES[number]
export type WorkflowApproveMode = 'ALL' | 'ANY' | 'VOTE'
export type WorkflowTimerType = 'duration' | 'date' | 'cycle'
export type WorkflowBranch = string
export interface WorkflowReminder {
  duration?: string
  action?: 'notify' | 'return' | 'end'
  target?: string
  name?: string
}
export interface WorkflowNode {
  id: string
  type: WorkflowNodeType | LegacyWorkflowNodeType
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  bizType?: string
  bizJson?: string
  form?: string
  bizFormKey?: string
  assignee?: string
  statusVariable?: string
  result?: string
  messageName?: string
  timerType?: WorkflowTimerType
  timerValue?: string
  serviceName?: string
  serviceUrl?: string
  countersign?: boolean
  approveMode?: WorkflowApproveMode
  passRate?: string
  sequential?: boolean
  allowTransfer?: boolean
  allowAddSigner?: boolean
  reminder?: WorkflowReminder
  process?: WorkflowSubProcessModel
}
export interface WorkflowFlow {
  id?: string
  source: string
  target: string
  branch?: WorkflowBranch
  conditionExpression?: string
}
export interface WorkflowSubProcessModel {
  nodes: WorkflowNode[]
  flows?: WorkflowFlow[]
  bizFormKey?: string
}
export interface WorkflowModel extends WorkflowSubProcessModel { processId: string; processName?: string }
export type WorkflowNodeRecord = WorkflowNode
export type WorkflowFlowRecord = WorkflowFlow
export interface WorkflowValidationIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  /** RFC 6901 JSON Pointer, relative to the model root. */
  path: string
  nodeId?: string
  edgeId?: string
  /** Local subprocess container IDs, outermost first. */
  scope?: string[]
}
export interface WorkflowValidationResult { valid: boolean; issues: WorkflowValidationIssue[] }
