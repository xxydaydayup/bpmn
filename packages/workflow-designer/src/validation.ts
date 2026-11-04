import type { WorkflowModel, WorkflowNodeRecord, WorkflowValidationIssue } from './types'
import { workflowIssues } from './contract'

export function validateWorkflowModel(model: WorkflowModel, custom: WorkflowValidationIssue[] = []): WorkflowValidationIssue[] {
  const nodeNames = new Map(model.nodes.map(node => [node.id, node.name || node.id]))
  const base = workflowIssues(model, custom)
  const serviceApproveModes = new Set(['ALL', 'ANY', 'VOTE'])
  for (const node of model.nodes) {
    if (node.reminder) {
      const reminder = node.reminder as Record<string, unknown>
      const action = reminder.action ?? 'notify'
      if (node.type !== 'approval' && node.type !== 'countersign') {
        base.push({ code: 'reminder-node-type', message: '超时提醒只能配置在审批或多人审批节点上。', nodeId: node.id })
      }
      if (!['notify', 'return', 'end'].includes(String(action))) {
        base.push({ code: 'reminder-action', message: '超时处理方式仅支持提醒、退回或结束。', nodeId: node.id })
      }
      if (reminder.duration !== undefined && reminder.duration !== '') {
        const duration = typeof reminder.duration === 'string' ? reminder.duration.trim() : ''
        const isoDuration = /^P(?=\d|T\d)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/
        if (!isoDuration.test(duration)) base.push({ code: 'reminder-duration', message: '超时时长必须使用 ISO-8601 格式，例如 PT30M、PT2H 或 P1D。', nodeId: node.id })
      }
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
    if (node.type === 'countersign' && node.approveMode === 'VOTE' && !(typeof node.passRate === 'string' && node.passRate.trim())) {
      base.push({ code: 'pass-rate-required', message: '多人审批使用 VOTE 模式时需要填写通过比例。', nodeId: node.id })
    }
    const passRateApplies = node.type === 'countersign' || (node.type === 'service' && node.countersign === true)
    if (passRateApplies && node.passRate !== undefined && node.passRate !== '') {
      const rate = Number(node.passRate)
      if (typeof node.passRate !== 'string' || !Number.isFinite(rate) || rate <= 0 || rate > 1) {
        base.push({ code: 'pass-rate-range', message: '通过比例必须是大于 0 且不超过 1 的数字。', nodeId: node.id })
      }
    }
    if (node.type === 'service') {
      if (node.countersign !== undefined && typeof node.countersign !== 'boolean') {
        base.push({ code: 'service-countersign-type', message: '服务会签开关必须是布尔值。', nodeId: node.id })
      }
      if (node.sequential !== undefined && typeof node.sequential !== 'boolean') {
        base.push({ code: 'service-sequential-type', message: '服务执行顺序必须是布尔值。', nodeId: node.id })
      }
      if (node.countersign === true) {
        const mode = typeof node.approveMode === 'string' ? node.approveMode : ''
        if (node.approveMode !== undefined && node.approveMode !== '' && !serviceApproveModes.has(mode)) {
          base.push({ code: 'service-approve-mode', message: '服务会签方式仅支持 ALL、ANY 或 VOTE。', nodeId: node.id })
        }
        if (mode === 'VOTE' && !(typeof node.passRate === 'string' && node.passRate.trim())) {
          base.push({ code: 'service-pass-rate-required', message: '服务会签使用 VOTE 模式时需要填写通过比例。', nodeId: node.id })
        }
      }
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
  if (source.id === target.id || source.type === 'end' || target.type === 'start') return false
  if (source.type === 'condition' && target.type === 'condition') return false
  if (model.flows.some(flow => flow.source === source.id && flow.target === target.id)) return false
  return true
}
