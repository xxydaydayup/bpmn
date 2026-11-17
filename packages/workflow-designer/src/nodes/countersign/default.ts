import { IconUsers } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import PropertyEditor from './PropertyEditor.vue'

const countersignNode = {
  type: 'countersign',
  title: '多人审批',
  description: '多人共同办理',
  icon: IconUsers,
  sort: 30,
  category: '人工与服务',
  supportsReminder: true,
  defaultValue: { name: '多人审批', approveMode: 'ALL', sequential: false },
  propertyEditor: PropertyEditor,
} satisfies WorkflowNodeDefinition

export default countersignNode
