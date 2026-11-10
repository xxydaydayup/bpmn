import { IconMessage } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'

const receiveNode = {
  type: 'receive',
  title: '消息等待',
  description: '收到业务消息后继续',
  icon: IconMessage,
  sort: 50,
  category: '流程事件',
  defaultValue: { name: '消息等待' },
  checkValid(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
    if (node.messageName !== undefined && typeof node.messageName !== 'string') {
      return [{ code: 'message-name-type', message: '消息名必须是文本。', nodeId: node.id }]
    }
    return []
  },
} satisfies WorkflowNodeDefinition

export default receiveNode
