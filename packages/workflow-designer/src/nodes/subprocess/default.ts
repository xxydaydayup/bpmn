import { IconHierarchy } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'
import { getWorkflowNodeDefinition } from '../index'
import { validateReminderProperties } from '../validation-rules'
import PropertyEditor from './PropertyEditor.vue'

const allowedReminderTargets = ['approval', 'countersign', 'service', 'subProcess']
const processKeys = new Set(['processId', 'processName', 'nodes', 'flows'])

function validateProcess(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  const pending: Array<{ owner: WorkflowNodeRecord; path: string[]; depth: number }> = [{ owner: node, path: [], depth: 0 }]

  const addIssue = (path: string[], message: string, code: string, locationId = node.id) => {
    const location = path.filter(Boolean).join(' › ')
    issues.push({ code, message: location ? `子流程“${location}”：${message}` : message, nodeId: node.id, locationLabel: location || locationId })
  }

  while (pending.length) {
    const current = pending.pop()!
    const process = current.owner.process
    if (!process || !Array.isArray(process.nodes) || process.nodes.length === 0) {
      addIssue(current.path, '片段至少需要一个节点。', 'subprocess-content-required', current.owner.id)
      continue
    }
    if (current.depth > 100) {
      addIssue(current.path, '子流程嵌套超过最大检查深度（100 层）。', 'subprocess-depth-limit', current.owner.id)
      continue
    }

    const ids = new Set<string>()
    const children = process.nodes as WorkflowNodeRecord[]
    for (const child of children) {
      const childPath = [...current.path, String(child.name || child.id || '未命名节点')]
      if (typeof child.id !== 'string' || !child.id.trim() || ids.has(child.id)) {
        addIssue(childPath, `节点标识为空或重复：${String(child.id ?? '')}`, 'subprocess-child-id', child.id)
      }
      if (typeof child.id === 'string') ids.add(child.id)
      const definition = getWorkflowNodeDefinition(child.type)
      if (!definition) {
        addIssue(childPath, `片段包含不支持的“${String(child.type)}”节点。`, 'subprocess-child-type', child.id)
        continue
      }

      if (child.type === 'subProcess') {
        issues.push(...validateReminderProperties(child).map(issue => ({
          ...issue, nodeId: node.id, locationLabel: [...childPath, issue.locationLabel].filter(Boolean).join(' › '),
        })))
        pending.push({ owner: child, path: childPath, depth: current.depth + 1 })
      } else {
        issues.push(...(definition.checkValid?.(child) ?? []).map(issue => ({
          ...issue, nodeId: node.id, locationLabel: childPath.join(' › '),
        })))
      }

      if (child.reminder) {
        const reminder = child.reminder as Record<string, unknown>
        const action = reminder.action ?? 'notify'
        const target = typeof reminder.target === 'string' ? reminder.target.trim() : ''
        if (action === 'return') {
          const targetNode = children.find(candidate => candidate.id === target)
          if (!target) addIssue(childPath, '超时处理选择退回时，需要选择同一层的退回目标。', 'subprocess-reminder-target-required', child.id)
          else if (!targetNode || !allowedReminderTargets.includes(targetNode.type) || target === child.id) {
            addIssue(childPath, '超时退回目标必须是同一层的审批、多人审批、服务或子流程节点。', 'subprocess-reminder-target-invalid', child.id)
          }
        } else if (target) {
          addIssue(childPath, '只有超时处理选择退回时才能配置退回目标。', 'subprocess-reminder-target-unexpected', child.id)
        }
        if (!definition.supportsReminder) {
          addIssue(childPath, '超时提醒只能配置在审批、多人审批或子流程节点上。', 'subprocess-reminder-node-type', child.id)
        }
      }
    }

    const flows = Array.isArray(process.flows) ? process.flows : []
    const flowIds = new Set<string>()
    for (const [index, flow] of flows.entries()) {
      if (flow.id && flowIds.has(flow.id)) addIssue(current.path, `连线标识重复：${flow.id}`, 'subprocess-flow-id')
      if (flow.id) flowIds.add(flow.id)
      if (!ids.has(flow.source) || !ids.has(flow.target)) {
        addIssue(current.path, `第 ${index + 1} 条连线引用了片段内不存在的节点。`, 'subprocess-flow-reference')
      }
      if (flow.source === flow.target) addIssue(current.path, `第 ${index + 1} 条连线不能连接节点自身。`, 'subprocess-flow-self-link')
    }

    for (const key of Object.keys(process)) {
      if (!processKeys.has(key)) addIssue(current.path, `片段包含不支持的流程字段“${key}”。`, 'subprocess-process-field')
    }
  }
  return issues
}

const subProcessNode = {
  type: 'subProcess',
  title: '嵌入式子流程',
  description: '将保存的片段嵌入当前流程',
  icon: IconHierarchy,
  sort: 75,
  category: '流程控制',
  defaultValue: { name: '嵌入式子流程' },
  propertyEditor: PropertyEditor,
  supportsReminder: true,
  checkValid(node: WorkflowNodeRecord) {
    return [...validateReminderProperties(node), ...validateProcess(node)]
  },
} satisfies WorkflowNodeDefinition

export default subProcessNode
