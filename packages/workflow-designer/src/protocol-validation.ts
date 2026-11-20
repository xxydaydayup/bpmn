import { validateWorkflowModel } from '@workflow/sdk'
import { toWorkflowModelInput } from './compiler-model'
import { workflowDefinitionIdIssues } from './definition-id-validation'
import type { WorkflowModel, WorkflowValidationIssue } from './types'

/** Keep historical designer codes at the compatibility boundary. */
export function workflowProtocolIssues(model: WorkflowModel): WorkflowValidationIssue[] {
  const protocolIssues = validateWorkflowModel(toWorkflowModelInput(model)).issues
    .filter(issue => !['duplicate-node-id', 'duplicate-flow-id', 'duplicate-definition-id'].includes(issue.code))
  return [...protocolIssues, ...workflowDefinitionIdIssues(model)].map(issue => {
    const segments = (issue.path ?? '').split('/')
    const rootIndex = segments[1] === 'nodes' ? Number(segments[2]) : undefined
    const rootNode = rootIndex !== undefined ? model.nodes[rootIndex] : undefined
    const field = segments.at(-1)
    let code = issue.code
    if (code === 'unknown-node-type') code = 'unknown-node'
    if (code === 'duplicate-node-id') code = 'node-id'
    if (code === 'field-type' && field === 'timerValue') code = 'timer-value-type'
    if (code === 'field-type' && field === 'messageName') code = 'message-name-type'
    if (code === 'field-enum' && field === 'approveMode' && rootNode?.type === 'service') code = 'service-approve-mode'
    if (code === 'pass-rate-required' && rootNode?.type === 'service') code = 'service-pass-rate-required'
    const rootEdge = segments[1] === 'flows' ? `flow-${segments[2]}` : undefined
    return {
      ...issue, code,
      nodeId: issue.scope?.length ? issue.scope[0] : issue.nodeId,
      edgeId: issue.scope?.length ? undefined : rootEdge ?? issue.edgeId,
      locationLabel: [...(issue.scope ?? []), issue.nodeId, issue.path].filter(Boolean).join(' › '),
    }
  })
}
