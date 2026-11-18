import { IconArrowsSplit2 } from '@tabler/icons-vue'
import type { WorkflowNodeDefinition } from '../types'

const parallelNode = {
  type: 'parallel',
  title: '并行网关',
  description: '全部分支执行，汇合等待全部到齐',
  icon: IconArrowsSplit2,
  sort: 72,
  category: '流程控制',
  defaultValue: { name: '并行网关' },
} satisfies WorkflowNodeDefinition

export default parallelNode
