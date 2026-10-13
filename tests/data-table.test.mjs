import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/components/common/DataTable/cellValue.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
const { displayCellValue, formatTableValue, isEmptyCellValue, resolveTableOption } = await import(moduleUrl)

test('missing cell values use the configured marker without hiding zero or false', () => {
  assert.equal(displayCellValue(null), '\u2014')
  assert.equal(displayCellValue(undefined, '--'), '--')
  assert.equal(displayCellValue(''), '\u2014')
  assert.equal(displayCellValue(0), 0)
  assert.equal(displayCellValue(false), false)
  assert.equal(isEmptyCellValue([]), false)
  assert.equal(displayCellValue([]), '\u2014')
})

test('money formatting keeps two decimals and rounds away from zero', () => {
  assert.equal(formatTableValue('money', 0), '0.00')
  assert.equal(formatTableValue('money', '1234.201'), '1,234.21')
  assert.equal(formatTableValue('money', '-1.231'), '-1.24')
  assert.equal(formatTableValue('money', '1.23e3'), '1,230.00')
  assert.equal(formatTableValue('money', 'not-money'), 'not-money')
})

test('date templates match the old fixed-width formats and preserve invalid input', () => {
  const value = new Date(2025, 0, 2, 3, 4, 5)
  assert.equal(formatTableValue('dateTime', value), '2025-01-02 03:04:05')
  assert.equal(formatTableValue('date', value), '2025-01-02')
  assert.equal(formatTableValue('month', value), '2025-01')
  assert.equal(formatTableValue('time', value), '03:04:05')
  assert.equal(formatTableValue('date', 'not-a-date'), 'not-a-date')
})

test('select and enum templates resolve array and keyed dictionary options', () => {
  assert.equal(resolveTableOption([{ value: 'draft', label: '草稿' }], 'draft'), '草稿')
  assert.equal(resolveTableOption([{ value: 1, label: '启用' }], '1'), '启用')
  assert.equal(resolveTableOption([{ value: 10, label: '待处理' }], 0), undefined)
  assert.equal(resolveTableOption({ active: { label: '运行中' } }, 'active'), '运行中')
  assert.equal(resolveTableOption({ inactive: '已停止' }, 'inactive'), '已停止')
  assert.equal(resolveTableOption({}, 'missing'), undefined)
})
