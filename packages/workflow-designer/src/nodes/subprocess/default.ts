import { IconHierarchy } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import PropertyEditor from './PropertyEditor.vue'

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
} satisfies WorkflowNodeDefinition

export default subProcessNode
