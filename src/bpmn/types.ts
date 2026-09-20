import type { ApprovalSnapshot } from './approval'

export type NodePropertyField = 'id' | 'name' | 'assignee' | 'formKey' | 'conditionExpression' | 'defaultFlow'
  | 'approvalMode' | 'approvalOrder' | 'participants' | 'repairApproval'

/** Plain snapshots keep Vue reactivity away from bpmn-js model objects. */
export interface NodeProperties {
  kind: 'process' | 'node' | 'flow'
  id: string
  type: string
  name: string
  assignee: string
  formKey: string
  isUserTask: boolean
  approval: ApprovalSnapshot
  supportsConditions: boolean
  conditionExpression: string
  conditionLanguage: string
  isDefault: boolean
  defaultFlowId: string
  outgoingFlows: Array<{ id: string; label: string }>
}

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  elementId: string
  message: string
}
