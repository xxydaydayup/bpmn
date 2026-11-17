import { IconClock } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'
import PropertyEditor from './PropertyEditor.vue'

const timerNode = {
  type: 'timer',
  title: '定时等待节点',
  description: '到期后由引擎自动继续',
  icon: IconClock,
  sort: 60,
  category: '流程事件',
  defaultValue: { name: '定时等待', timerType: 'duration', timerValue: 'PT30M' },
  propertyEditor: PropertyEditor,
} satisfies WorkflowNodeDefinition

export default timerNode
