import type { MultiInstanceSnapshot } from './multiInstance'
import type { ServiceTaskSnapshot } from './serviceTask'
import type { CamundaListenerSnapshot } from './camundaListeners'
import type { RuntimeAttributesSnapshot } from './camundaRuntime'
import type { CamundaFormSnapshot } from './camundaForms'

export type NodePropertyField = 'id' | 'name' | 'assignee' | 'candidateUsers' | 'candidateGroups' | 'formKey'
  | 'conditionExpression' | 'defaultFlow' | 'multiInstanceEnabled' | 'multiInstanceMode'
  | 'multiInstanceOrder' | 'multiInstanceCollection' | 'multiInstanceElementVariable' | 'multiInstanceCardinality'
  | 'multiInstanceCompletionCondition'
  | 'asyncBefore' | 'asyncAfter' | 'exclusive' | 'jobPriority' | 'failedJobRetryTimeCycle' | 'processIsExecutable'
  | 'multiInstanceAsyncBefore' | 'multiInstanceAsyncAfter' | 'multiInstanceExclusive' | 'multiInstanceJobPriority' | 'multiInstanceFailedJobRetryTimeCycle'
  | 'taskOwner' | 'taskDueDate' | 'taskFollowUpDate' | 'taskPriority' | 'taskDescription'
  | 'taskCandidateUsers' | 'taskCandidateGroups' | 'processHistoryTimeToLive' | 'processVersionTag'
  | 'formRef' | 'formRefBinding' | 'formRefVersion' | 'updateFormBusinessKey'
  | 'formBusinessKey' | 'formFieldAdd' | `formFieldRemove:${number}` | `formFieldMoveUp:${number}` | `formFieldMoveDown:${number}`
  | `formFieldSet:${number}:${string}` | `formOptionAdd:${number}` | `formOptionRemove:${number}:${number}`
  | `formOptionMoveUp:${number}:${number}` | `formOptionMoveDown:${number}:${number}`
  | `formOptionSet:${number}:${number}:${string}` | `formConstraintAdd:${number}` | `formConstraintRemove:${number}:${number}`
  | `formConstraintSet:${number}:${number}:${string}` | `formPropertyAdd:${number}` | `formPropertyRemove:${number}:${number}`
  | `formPropertySet:${number}:${number}:${string}`
  | 'formFieldMoveUp' | 'formFieldMoveDown' | 'addFormField' | 'removeFormField'
  | 'formFieldId' | 'formFieldLabel' | 'formFieldType' | 'formFieldDefault' | 'formFieldDatePattern'
  | 'serviceImplementation' | 'serviceTopic' | 'serviceClass' | 'serviceDelegateExpression' | 'serviceExpression' | 'serviceResultVariable'
  | 'addExecutionListener' | 'addTaskListener' | 'removeExecutionListener' | 'removeTaskListener'
  | 'updateExecutionListener' | 'updateTaskListener' | 'addExecutionListenerField' | 'addTaskListenerField'
  | 'removeExecutionListenerField' | 'removeTaskListenerField' | 'updateExecutionListenerField'
  | 'updateTaskListenerField' | `executionListener${string}` | `taskListener${string}`
  | `executionListenerMoveUp:${number}` | `executionListenerMoveDown:${number}`
  | `taskListenerMoveUp:${number}` | `taskListenerMoveDown:${number}`

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
  camundaForm: CamundaFormSnapshot
  supportsCamundaForm: boolean
  isUserTask: boolean
  supportsMultiInstance: boolean
  multiInstance: MultiInstanceSnapshot
  asyncBefore: boolean
  asyncAfter: boolean
  exclusive: boolean
  jobPriority: string
  failedJobRetryTimeCycle: string
  multiInstanceRuntime: RuntimeAttributesSnapshot
  processHistoryTimeToLive: string
  processVersionTag: string
  isExecutable: boolean
  userTaskRuntime: { owner: string; candidateUsers: string; candidateGroups: string; dueDate: string; followUpDate: string; priority: string; description: string }
  supportsServiceConfiguration: boolean
  serviceTask: ServiceTaskSnapshot
  supportsConditions: boolean
  conditionExpression: string
  conditionLanguage: string
  isDefault: boolean
  defaultFlowId: string
  outgoingFlows: Array<{ id: string; label: string }>
  unsupportedConfiguration: string[]
  executionListeners: CamundaListenerSnapshot[]
  taskListeners: CamundaListenerSnapshot[]
}

export interface ValidationIssue {
  code: string
  severity: 'error' | 'warning'
  elementId: string
  message: string
}
