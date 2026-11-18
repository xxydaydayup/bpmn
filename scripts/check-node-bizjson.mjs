import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import { toBpmnCompilerJson } from '../packages/workflow-sdk/dist/index.js'
import { defineWorkflow, approval, subProcess } from '../packages/workflow-sdk/dist/definition.js'

// Explicit compilation only. No publication, instances or variable writes.
const endpoint = process.env.WORKFLOW_COMPILER_URL
if (!endpoint) throw new Error('请设置 WORKFLOW_COMPILER_URL 为完整编译接口地址。')
const nested = process.argv.includes('--nested')
const padded = process.argv.includes('--padded')
const newline = String.fromCharCode(10)
const value = (padded ? '  ' : '') + ['中文 "review" <tag>&', 'review_bizJson = 非 JSON 原文'].join(newline) + (padded ? '  ' : '')
const model = toBpmnCompilerJson(nested
  ? defineWorkflow({ key: 'bizjson_nested_check' }, subProcess('outer', subProcess('inner', approval('review', { bizJson: value }), { bizJson: ['内层 <&>', '默认值'].join(newline) }), { bizJson: '外层 "模板"' })).toJSON()
  : defineWorkflow({ key: 'bizjson_node_check' }, approval('review', { bizJson: value })).toJSON())
const response = await fetch(endpoint, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.WORKFLOW_AUTHORIZATION ? { Authorization: process.env.WORKFLOW_AUTHORIZATION } : {}) },
  body: JSON.stringify(model), signal: AbortSignal.timeout(20000),
})
const content = await response.text()
let body
try { body = JSON.parse(content) } catch { body = {} }
assert.equal(response.ok, true, '编译 HTTP ' + response.status)
const xml = content.trimStart().startsWith('<') ? content : body?.data?.bpmnXml ?? body?.bpmnXml
assert.equal(typeof xml, 'string', '编译未返回 bpmnXml：' + JSON.stringify(body))
const dom = new JSDOM(xml, { contentType: 'application/xml' })
const document = dom.window.document
const bpmn = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const camunda = 'http://camunda.org/schema/1.0/bpmn'
const checks = []
function check(nodes, parent) {
  for (const node of nodes) {
    const tag = node.type === 'subProcess' ? 'subProcess' : node.type === 'approval' ? 'userTask' : undefined
    if (!tag) continue
    // Resolve each level against the returned tree; activity IDs are backend-owned.
    const candidates = Array.from(parent.children).filter(element => element.namespaceURI === bpmn && element.localName === tag)
    const activity = candidates.find(element => element.id === node.id || element.id.endsWith('_' + node.id))
    assert.ok(activity, '未找到后端展开节点 ' + node.id)
    if (node.bizJson !== undefined) {
      const extension = Array.from(activity.children).find(element => element.namespaceURI === bpmn && element.localName === 'extensionElements')
      const property = Array.from(extension?.getElementsByTagNameNS(camunda, 'property') ?? []).find(element => element.getAttribute('name') === 'bizJson')
      assert.ok(property, activity.id + ' 缺少 camunda:property(name=bizJson)')
      const actual = property.getAttribute('value')
      checks.push({ localId: node.id, activityId: activity.id, expected: node.bizJson, actual, matches: actual === node.bizJson })
    }
    if (node.process) check(node.process.nodes, activity)
  }
}
check(model.nodes, document.getElementsByTagNameNS(bpmn, 'process')[0])
assert.equal(checks.length, nested ? 3 : 1)
dom.window.close()
const folder = new URL('../.scratch/node-bizjson/validation/', import.meta.url)
await mkdir(folder, { recursive: true })
const name = (nested ? 'nested' : 'ordinary') + (padded ? '-padded' : '')
const report = { checkedAt: new Date().toISOString(), endpoint, scope: 'compile-only', status: response.status, checks }
await writeFile(new URL(name + '-model.json', folder), JSON.stringify(model, null, 2) + newline)
await writeFile(new URL(name + '.bpmn', folder), xml)
await writeFile(new URL(name + '-result.json', folder), JSON.stringify(report, null, 2) + newline)
console.log(JSON.stringify(report, null, 2))
assert.ok(checks.every(item => item.matches), '后端 XML 默认值发生变化；详见保存的请求、XML 与逐值比较结果。')
