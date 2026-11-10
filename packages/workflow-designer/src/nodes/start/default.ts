import { IconPlayerPlay } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'

const startNode = {
  type: 'start',
  title: '开始',
  description: '流程触发入口',
  icon: IconPlayerPlay,
  sort: 10,
  category: '人工与服务',
  availablePrevTypes: [],
  defaultValue: { name: '开始' },
} satisfies WorkflowNodeDefinition

export default startNode
