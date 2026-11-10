import { IconUsers } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'
import { isValidPassRate, validateReminderProperties } from '../validation-rules'

const countersignNode = {
  type: 'countersign',
  title: '多人审批',
  description: '多人共同办理',
  icon: IconUsers,
  sort: 30,
  category: '人工与服务',
  supportsReminder: true,
  defaultValue: { name: '多人审批', approveMode: 'ALL', sequential: false },
  checkValid(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
    const issues: WorkflowValidationIssue[] = validateReminderProperties(node)
    if (node.approveMode === 'VOTE' && !(typeof node.passRate === 'string' && node.passRate.trim())) {
      issues.push({ code: 'pass-rate-required', message: '多人审批使用 VOTE 模式时需要填写通过比例。', nodeId: node.id })
    }
    if (node.passRate !== undefined && node.passRate !== '') {
      if (!isValidPassRate(node.passRate)) {
        issues.push({ code: 'pass-rate-range', message: '通过比例必须是大于 0 且不超过 1 的数字。', nodeId: node.id })
      }
    }
    return issues
  },
} satisfies WorkflowNodeDefinition

export default countersignNode
