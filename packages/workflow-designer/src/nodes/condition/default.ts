import { IconArrowsSplit } from '@tabler/icons-vue'
import type { WorkflowNodeType } from '../../types'
import type { WorkflowNodeDefinition } from '../types'

const conditionNode = {
  type: 'condition',
  title: '条件分支',
  description: '按条件选择路径',
  icon: IconArrowsSplit,
  sort: 70,
  category: '流程控制',
  availableNextTypes: ['approval', 'countersign', 'service', 'receive', 'timer', 'end'] satisfies WorkflowNodeType[],
  defaultValue: { name: '条件分支' },
} satisfies WorkflowNodeDefinition

export default conditionNode
