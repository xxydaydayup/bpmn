import type { WorkflowModel, WorkflowNodeRecord, WorkflowNodeType, WorkflowValidationIssue } from './types'
import { workflowIssues } from './contract'
import { getWorkflowNodeDefinition } from './nodes'

export function validateWorkflowModel(model: WorkflowModel, custom: WorkflowValidationIssue[] = []): WorkflowValidationIssue[] {
  return workflowIssues(model, custom)
}

export function canConnectNodes(source: WorkflowNodeRecord, target: WorkflowNodeRecord, model: WorkflowModel) {
  if (source.id === target.id) return false
  if (model.flows.some(flow => flow.source === source.id && flow.target === target.id)) return false
  const sourceDefinition = getWorkflowNodeDefinition(source.type)
  const targetDefinition = getWorkflowNodeDefinition(target.type)
  if (sourceDefinition?.availableNextTypes && !sourceDefinition.availableNextTypes.includes(target.type as WorkflowNodeType)) return false
  if (targetDefinition?.availablePrevTypes && !targetDefinition.availablePrevTypes.includes(source.type as WorkflowNodeType)) return false
  return true
}
