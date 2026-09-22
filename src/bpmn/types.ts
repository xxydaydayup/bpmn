import type { MultiInstanceSnapshot } from './multiInstance'
import type { ServiceTaskSnapshot } from './serviceTask'

export type NodePropertyField = 'id' | 'name' | 'assignee' | 'candidateUsers' | 'candidateGroups' | 'formKey'
  | 'conditionExpression' | 'defaultFlow' | 'multiInstanceEnabled' | 'multiInstanceMode'
  | 'multiInstanceOrder' | 'multiInstanceCollection' | 'multiInstanceElementVariable' | 'multiInstanceCardinality'
  | 'serviceImplementation' | 'serviceTopic' | 'serviceClass' | 'serviceDelegateExpression' | 'serviceExpression' | 'serviceResultVariable'

/** Plain snapshots keep Vue reactivity away from bpmn-js model objects. */
export interface NodeProperties {
  kind: 'process' | 'node' | 'flow'
  id: string
  type: string
  name: string
  assignee: string
  candidateUsers: string
  candidateGroups: string
  formKey: string
  isUserTask: boolean
  supportsMultiInstance: boolean
  multiInstance: MultiInstanceSnapshot
  supportsServiceConfiguration: boolean
  serviceTask: ServiceTaskSnapshot
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
