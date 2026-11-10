import { IconSquare } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'

const endNode = {
  type: 'end',
  title: '结束',
  description: '流程完成',
  icon: IconSquare,
  sort: 80,
  category: '流程控制',
  availableNextTypes: [],
  defaultValue: { name: '结束' },
} satisfies WorkflowNodeDefinition

export default endNode
