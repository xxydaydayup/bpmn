import { RenderFunctionType } from './types'

export function isEmptyCellValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

export function displayCellValue(value: unknown, emptyValue = '\u2014'): string | number | boolean {
  if (isEmptyCellValue(value)) return emptyValue
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return emptyValue
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return
  if (value === '') return
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function formatTableValue(valueKind: RenderFunctionType, value: unknown): string | number | boolean | undefined {
  if (isEmptyCellValue(value)) return undefined

  if (valueKind === RenderFunctionType.Money) {
    return formatMoney(value)
  }

  if (valueKind === RenderFunctionType.DateTime || valueKind === RenderFunctionType.Date || valueKind === RenderFunctionType.Month || valueKind === RenderFunctionType.Time) {
    const date = validDate(value)
    if (!date) return String(value)
    const part = (part: number) => String(part).padStart(2, '0')
    const year = String(date.getFullYear())
    const month = part(date.getMonth() + 1)
    const day = part(date.getDate())
    const hours = part(date.getHours())
    const minutes = part(date.getMinutes())
    const seconds = part(date.getSeconds())
    if (valueKind === RenderFunctionType.Month) return `${year}-${month}`
    if (valueKind === RenderFunctionType.Date) return `${year}-${month}-${day}`
    if (valueKind === RenderFunctionType.Time) return `${hours}:${minutes}:${seconds}`
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  return undefined
}

function formatMoney(value: unknown): string {
  const text = String(value).trim()
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return text

  const sign = match[1] === '-' ? -1n : 1n
  let digits = `${match[2] ?? '0'}${match[3] ?? match[4] ?? ''}`.replace(/^0+(?=\d)/, '')
  let scale = (match[3] ?? match[4] ?? '').length - Number(match[5] ?? 0)
  if (scale < 0) {
    digits += '0'.repeat(-scale)
    scale = 0
  }

  let cents: bigint
  if (scale <= 2) {
    cents = BigInt(digits + '0'.repeat(2 - scale))
  } else {
    const cut = scale - 2
    const split = Math.max(0, digits.length - cut)
    const retained = digits.slice(0, split) || '0'
    const discarded = digits.slice(split)
    cents = BigInt(retained) + (/[1-9]/.test(discarded) ? 1n : 0n)
  }

  const major = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const minor = (cents % 100n).toString().padStart(2, '0')
  return `${sign < 0n && cents > 0n ? '-' : ''}${major}.${minor}`
}

export function resolveTableOption(
  options: unknown,
  value: unknown,
): string | number | boolean | undefined {
  if (Array.isArray(options)) {
    const option = options.find((item: { value?: unknown }) => item?.value === value || String(item?.value) === String(value))
    return option?.label
  }
  if (options && typeof options === 'object') {
    const option = (options as Record<string, unknown>)[String(value)]
    if (typeof option === 'string' || typeof option === 'number' || typeof option === 'boolean') return option
    if (option && typeof option === 'object' && 'label' in option) {
      const label = (option as { label?: unknown }).label
      if (typeof label === 'string' || typeof label === 'number') return label
    }
  }
  return undefined
}
