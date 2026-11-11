import { IconRobot } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'
import { isValidPassRate, validateServiceUrl } from '../validation-rules'
import PropertyEditor from './PropertyEditor.vue'

const serviceNode = {
  type: 'service',
  title: '服务调用',
  description: '调用外部服务',
  icon: IconRobot,
  sort: 40,
  category: '人工与服务',
  defaultValue: { name: '服务调用' },
  propertyEditor: PropertyEditor,
  checkValid(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
    const issues: WorkflowValidationIssue[] = validateServiceUrl(node)
    const approveModes: readonly string[] = ['ALL', 'ANY', 'VOTE']
    const passRateApplies = node.countersign === true
    if (node.countersign !== undefined && typeof node.countersign !== 'boolean') {
      issues.push({ code: 'service-countersign-type', message: '服务会签开关必须是布尔值。', nodeId: node.id })
    }
    if (node.sequential !== undefined && typeof node.sequential !== 'boolean') {
      issues.push({ code: 'service-sequential-type', message: '服务执行顺序必须是布尔值。', nodeId: node.id })
    }
    if (passRateApplies && node.passRate !== undefined && node.passRate !== '' && !isValidPassRate(node.passRate)) {
      issues.push({ code: 'pass-rate-range', message: '通过比例必须是大于 0 且不超过 1 的数字。', nodeId: node.id })
    }
    if (passRateApplies) {
      const mode = typeof node.approveMode === 'string' ? node.approveMode : ''
      if (node.approveMode !== undefined && node.approveMode !== '' && !approveModes.includes(mode)) {
        issues.push({ code: 'service-approve-mode', message: '服务会签方式仅支持 ALL、ANY 或 VOTE。', nodeId: node.id })
      }
      if (mode === 'VOTE' && !(typeof node.passRate === 'string' && node.passRate.trim())) {
        issues.push({ code: 'service-pass-rate-required', message: '服务会签使用 VOTE 模式时需要填写通过比例。', nodeId: node.id })
      }
    }
    return issues
  },
} satisfies WorkflowNodeDefinition

export default serviceNode
