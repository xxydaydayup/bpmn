import { IconMessage } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import PropertyEditor from './PropertyEditor.vue'

const receiveNode = {
  type: 'receive',
  title: '消息等待',
  description: '收到业务消息后继续',
  icon: IconMessage,
  sort: 50,
  category: '流程事件',
  defaultValue: { name: '消息等待' },
  propertyEditor: PropertyEditor,
} satisfies WorkflowNodeDefinition

export default receiveNode
