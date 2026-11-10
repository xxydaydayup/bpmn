import type { WorkflowModel, WorkflowNodeRecord, WorkflowNodeType, WorkflowValidationIssue } from './types'
import { workflowIssues } from './contract'
import { getWorkflowNodeDefinition } from './nodes'

export function validateWorkflowModel(model: WorkflowModel, custom: WorkflowValidationIssue[] = []): WorkflowValidationIssue[] {
  const nodeNames = new Map(model.nodes.map(node => [node.id, node.name || node.id]))
  const base = workflowIssues(model, custom)
  for (const node of model.nodes) {
    if (node.reminder) {
      const reminder = node.reminder as Record<string, unknown>
      const action = reminder.action ?? 'notify'
      const target = typeof reminder.target === 'string' ? reminder.target.trim() : ''
      if (action === 'return') {
        const targetNode = model.nodes.find(candidate => candidate.id === target)
        if (!target) {
          base.push({ code: 'reminder-target-required', message: '超时处理选择“中断并退回”时，需要选择退回目标。', nodeId: node.id })
        } else if (!targetNode || !['approval', 'countersign', 'service'].includes(targetNode.type) || target === node.id) {
          base.push({ code: 'reminder-target-invalid', message: '退回目标必须是当前流程中除本节点外的审批、多人审批或服务节点。', nodeId: node.id })
        }
      } else if (target) {
        base.push({ code: 'reminder-target-unexpected', message: '只有超时处理选择“中断并退回”时才能配置退回目标。', nodeId: node.id })
      }
    }
    const definition = getWorkflowNodeDefinition(node.type)
    if (node.reminder && !definition?.supportsReminder) {
      base.push({ code: 'reminder-node-type', message: '超时提醒只能配置在审批或多人审批节点上。', nodeId: node.id })
    }
  }
  for (const node of model.nodes.filter(item => item.type === 'condition')) {
    const next = model.flows.filter(flow => flow.source === node.id)
    if (next.length < 2) base.push({ code: 'condition-branches', message: '“' + node.name + '”至少需要两条候选路径。', nodeId: node.id })
    for (const flow of next) {
      if (!flow.branch && !flow.conditionExpression?.trim()) {
        base.push({ code: 'condition-expression', message: '条件分支的路径需要选择通过/驳回，或填写条件表达式。', edgeId: 'flow-' + model.flows.indexOf(flow), locationLabel: node.name + ' → ' + (nodeNames.get(flow.target) ?? flow.target) })
      }
    }
  }
  return base.map(issue => ({ ...issue, ...(issue.nodeId ? { locationLabel: nodeNames.get(issue.nodeId) ?? issue.locationLabel } : {}) }))
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
