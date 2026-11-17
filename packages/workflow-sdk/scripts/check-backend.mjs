import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { toBpmnCompilerJson } from '../dist/index.js'

// Explicit opt-in: compilation only, never deployment or task execution.
const endpoint = process.env.WORKFLOW_COMPILER_URL
if (!endpoint) throw new Error('请显式设置 WORKFLOW_COMPILER_URL 为完整 JSON 编译接口地址；参见 docs/integration.md。')
const report = []
for (const filename of (await readdir(new URL('../examples/', import.meta.url))).filter(name => name.endsWith('.json') && !name.startsWith('invalid-'))) {
  const model = JSON.parse(await readFile(new URL('../examples/' + filename, import.meta.url), 'utf8'))
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.WORKFLOW_AUTHORIZATION ? { Authorization: process.env.WORKFLOW_AUTHORIZATION } : {}) },
    body: JSON.stringify(toBpmnCompilerJson(model)), signal: AbortSignal.timeout(15000),
  })
  const content = await response.text()
  let body
  try { body = JSON.parse(content) } catch { body = {} }
  const xml = content.trimStart().startsWith('<') ? content : body?.data?.bpmnXml ?? body?.bpmnXml
  const success = response.ok && (!body.code || body.code === 'OK') && typeof xml === 'string' && xml.includes('definitions')
  report.push({ example: filename, status: response.status, success, ...(success ? { xmlLength: xml.length } : { code: body.code, message: body.message }) })
}
console.log(JSON.stringify({ endpoint: new URL(endpoint).origin + new URL(endpoint).pathname, scope: 'compile-only', results: report }, null, 2))
assert.ok(report.every(item => item.success), '部分示例未通过后端编译；见上述逐项结果。')
