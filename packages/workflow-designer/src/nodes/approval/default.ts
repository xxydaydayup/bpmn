import { IconUserCheck } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'
import { validateReminderProperties } from '../validation-rules'

const approvalNode = {
  type: 'approval',
  title: '审批',
  description: '单人办理步骤',
  icon: IconUserCheck,
  sort: 20,
  category: '人工与服务',
  supportsReminder: true,
  defaultValue: { name: '审批' },
  checkValid(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
    return validateReminderProperties(node)
  },
} satisfies WorkflowNodeDefinition

export default approvalNode
