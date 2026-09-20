export type NodePropertyField = 'name' | 'assignee' | 'formKey'

/** Plain snapshots keep Vue reactivity away from bpmn-js model objects. */
export interface NodeProperties {
  id: string
  type: string
  name: string
  assignee: string
  formKey: string
  isUserTask: boolean
}

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  elementId: string
  message: string
}
