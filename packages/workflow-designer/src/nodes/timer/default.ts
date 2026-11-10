import { IconClock } from '@tabler/icons-vue'
import type { WorkflowNodeRecord, WorkflowValidationIssue } from '../../types'
import type { WorkflowNodeDefinition } from '../types'
import { isCronExpression, isIsoDateTime, isIsoDuration, isIsoRepeat } from '../validation-rules'

const timerNode = {
  type: 'timer',
  title: '定时等待节点',
  description: '到期后由引擎自动继续',
  icon: IconClock,
  sort: 60,
  category: '流程事件',
  defaultValue: { name: '定时等待', timerType: 'duration', timerValue: 'PT30M' },
  checkValid(node: WorkflowNodeRecord): WorkflowValidationIssue[] {
    if (node.timerType !== undefined && !['duration', 'date', 'cycle'].includes(String(node.timerType))) {
      return [{ code: 'timer-type', message: '等待条件仅支持时长、指定时刻或周期。', nodeId: node.id }]
    }
    if (node.timerValue !== undefined && typeof node.timerValue !== 'string') {
      return [{ code: 'timer-value-type', message: '定时时间必须是文本。', nodeId: node.id }]
    }
    if (typeof node.timerValue !== 'string' || !node.timerValue.trim()) return []
    const timerType = node.timerType ?? 'duration'
    const value = node.timerValue.trim()
    const valid = timerType === 'duration' ? isIsoDuration(value)
      : timerType === 'date' ? isIsoDateTime(value)
        : timerType === 'cycle' ? isIsoRepeat(value) || isCronExpression(value)
          : false
    if (valid) return []
    const formats = { duration: 'ISO-8601 时长，例如 PT30M 或 P1D', date: 'ISO-8601 日期时间，例如 2026-12-31T23:59:59', cycle: 'ISO-8601 重复间隔（如 R3/PT10H）或 5/6 段 cron 表达式' }
    return [{ code: 'timer-value-format', message: `定时时间格式不符合${formats[timerType as keyof typeof formats] ?? '当前等待条件'}。`, nodeId: node.id }]
  },
} satisfies WorkflowNodeDefinition

export default timerNode
