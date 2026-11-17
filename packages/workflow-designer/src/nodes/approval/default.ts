import { IconUserCheck } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import PropertyEditor from './PropertyEditor.vue'

const approvalNode = {
  type: 'approval',
  title: '审批',
  description: '单人办理步骤',
  icon: IconUserCheck,
  sort: 20,
  category: '人工与服务',
  supportsReminder: true,
  defaultValue: { name: '审批' },
  propertyEditor: PropertyEditor,
} satisfies WorkflowNodeDefinition

export default approvalNode
