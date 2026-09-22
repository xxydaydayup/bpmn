export const DEFAULT_HISTORY_TIME_TO_LIVE = '30'

export interface BpmnProcessLike {
  get(property: string): unknown
  set(property: string, value: unknown): void
}

/** Add the Camunda history cleanup declaration when an imported process omits it. */
export function ensureHistoryTimeToLive(
  process: BpmnProcessLike,
  value = DEFAULT_HISTORY_TIME_TO_LIVE,
): boolean {
  const current = process.get('camunda:historyTimeToLive')
  if (current !== undefined && current !== null && String(current).trim()) return false
  process.set('camunda:historyTimeToLive', value)
  return true
}
