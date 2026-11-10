const ISO_DURATION = /^P(?=\d|T\d)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/
const ISO_REPEAT = /^R\d*\/P(?=\d|T\d)(?:\d+(?:\.\d+)?Y)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?W)?(?:\d+(?:\.\d+)?D)?(?:T(?=\d)(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)?$/

export function isIsoDuration(value: string) {
  return ISO_DURATION.test(value)
}

export function isIsoRepeat(value: string) {
  return ISO_REPEAT.test(value)
}

export function isIsoDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))?$/.exec(value)
  if (!match) return false
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return false
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number(offsetHour ?? 0) > 23 || Number(offsetMinute ?? 0) > 59) return false
  return Number.isFinite(Date.parse(value))
}

export function isCronExpression(value: string) {
  const fields = value.trim().split(/\s+/)
  return (fields.length === 5 || fields.length === 6) && fields.every(field => /^[\w*/?,#LWa-zA-Z-]+$/.test(field))
}

export function isValidPassRate(value: unknown) {
  if (typeof value !== 'string') return false
  const rate = Number(value)
  return Number.isFinite(rate) && rate > 0 && rate <= 1
}

export function validateServiceUrl(node: import('../types').WorkflowNodeRecord) {
  if (!node.serviceUrl?.trim()) return []
  try {
    const url = new URL(node.serviceUrl)
    if (['http:', 'https:'].includes(url.protocol)) return []
  } catch {
    // Invalid URLs use the same issue as unsupported schemes.
  }
  return [{ code: 'service-url', message: '服务地址必须是有效的 HTTP 或 HTTPS URL。', nodeId: node.id }]
}

export function validateReminderProperties(node: import('../types').WorkflowNodeRecord) {
  const reminder = node.reminder
  if (!reminder) return []
  const issues: import('../types').WorkflowValidationIssue[] = []
  const value = reminder as Record<string, unknown>
  const action = value.action ?? 'notify'
  if (value.duration !== undefined && value.duration !== '') {
    const duration = typeof value.duration === 'string' ? value.duration.trim() : ''
    if (!isIsoDuration(duration)) issues.push({ code: 'reminder-duration', message: '超时时长必须使用 ISO-8601 格式，例如 PT30M、PT2H 或 P1D。', nodeId: node.id })
  }
  if (!['notify', 'return', 'end'].includes(String(action))) {
    issues.push({ code: 'reminder-action', message: '超时处理方式仅支持提醒、退回或结束。', nodeId: node.id })
  }
  return issues
}

