import type { WorkflowModel, WorkflowNodeRecord, WorkflowNodeType, WorkflowValidationIssue } from './types'
import { workflowIssues } from './contract'
import { getWorkflowNodeDefinition } from './nodes'

export function validateWorkflowModel(model: WorkflowModel, custom: WorkflowValidationIssue[] = []): WorkflowValidationIssue[] {
  return workflowIssues(model, custom)
}

export function canConnectNodes(source: WorkflowNodeRecord, target: WorkflowNodeRecord, model: WorkflowModel, editingFlowIndex?: number) {
  if (!model.nodes.some(node => node.id === source.id && node.type === source.type)
    || !model.nodes.some(node => node.id === target.id && node.type === target.type)) return false
  if (!getWorkflowNodeDefinition(source.type) || !getWorkflowNodeDefinition(target.type)) return false
  if (source.id === target.id) return false
  if (model.flows.some((flow, index) => index !== editingFlowIndex && flow.source === source.id && flow.target === target.id)) return false
  const sourceDefinition = getWorkflowNodeDefinition(source.type)
  const targetDefinition = getWorkflowNodeDefinition(target.type)
  if (sourceDefinition?.availableNextTypes && !sourceDefinition.availableNextTypes.includes(target.type as WorkflowNodeType)) return false
  if (targetDefinition?.availablePrevTypes && !targetDefinition.availablePrevTypes.includes(source.type as WorkflowNodeType)) return false
  return true
}
