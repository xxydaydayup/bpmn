import { IconRobot } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import { validateServiceUrl } from '../validation-rules'
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
  checkValid: validateServiceUrl,
} satisfies WorkflowNodeDefinition

export default serviceNode
