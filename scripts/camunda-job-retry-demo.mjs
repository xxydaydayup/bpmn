import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const base = process.env.CAMUNDA_TEST_BASE_URL?.replace(/\/$/, '')
if (!base) throw new Error('请设置 CAMUNDA_TEST_BASE_URL，指向开发引擎的 /engine-rest。')

const require = createRequire(import.meta.url)
const bpmnRequire = createRequire(require.resolve('bpmn-js/package.json'))
const { BpmnModdle } = await import(pathToFileURL(bpmnRequire.resolve('bpmn-moddle')).href)
const descriptor = JSON.parse(readFileSync(bpmnRequire.resolve('camunda-bpmn-moddle/resources/camunda.json'), 'utf8'))
const moddle = new BpmnModdle({ camunda: descriptor })
const suffix = randomUUID().replaceAll('-', '')
const deploymentName = 'job_retry_demo_' + suffix
const processKey = 'Process_JobRetryDemo_' + suffix
const { rootElement, warnings } = await moddle.fromXML(readFileSync(new URL('./fixtures/camunda-job-retry-demo.bpmn', import.meta.url), 'utf8'))
assert.equal(warnings.length, 0)
const processDefinition = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
assert.ok(processDefinition)
processDefinition.id = processKey
rootElement.id = 'Definitions_JobRetryDemo_' + suffix
const { xml } = await moddle.toXML(rootElement, { format: true })
const roundTrip = await moddle.fromXML(xml)
assert.equal(roundTrip.warnings.length, 0)
const restoredProcess = roundTrip.rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
const task = restoredProcess.flowElements.find(item => item.id === 'Task_FailOnPurpose')
assert.equal(task.get('camunda:asyncBefore'), true)
assert.equal(task.extensionElements.values.find(item => item.$type === 'camunda:FailedJobRetryTimeCycle').body, 'R3/PT30S')
assert.deepEqual(restoredProcess.flowElements.filter(item => item.$type === 'bpmn:SequenceFlow').map(item => [item.sourceRef.id, item.targetRef.id]), [
  ['Start_JobRetry', 'Task_FailOnPurpose'],
  ['Task_FailOnPurpose', 'End_JobRetry'],
])
assert.equal(roundTrip.rootElement.diagrams[0].plane.planeElement.length, 5)

async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const content = await response.text()
  if (!response.ok) throw new Error(method + ' ' + path + ' -> HTTP ' + response.status + ': ' + content.slice(0, 300))
  return content ? JSON.parse(content) : undefined
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let deploymentId
try {
  const form = new FormData()
  form.set('deployment-name', deploymentName)
  form.set('deployment-source', 'job-retry-demo')
  form.set('data', new Blob([xml], { type: 'application/xml' }), deploymentName + '.bpmn')
  const deployment = await request('/deployment/create', 'POST', form)
  deploymentId = deployment.id
  const definition = Object.values(deployment.deployedProcessDefinitions ?? {}).find(item => item.key === processKey)
  assert.ok(deploymentId && definition)
  const instance = await request('/process-definition/' + encodeURIComponent(definition.id) + '/start', 'POST', {})
  assert.ok(instance.id)
  console.log('测试实例：' + instance.id)

  let jobId
  const seenRetries = new Set()
  let incidentCount = 0
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    const jobs = await request('/job?processInstanceId=' + encodeURIComponent(instance.id))
    assert.equal(jobs.length, 1, '预期只有一个异步 Job')
    const job = jobs[0]
    jobId ??= job.id
    assert.equal(job.id, jobId, '重试期间 Job ID 应保持不变')
    const incidents = await request('/incident?processInstanceId=' + encodeURIComponent(instance.id))
    incidentCount = incidents.length
    if (job.exceptionMessage && [2, 1, 0].includes(job.retries) && !seenRetries.has(job.retries)) {
      seenRetries.add(job.retries)
      console.log(JSON.stringify({ jobId, remainingRetries: job.retries, incidents: incidentCount }))
    }
    if (seenRetries.size === 3 && incidentCount > 0) break
    await pause(1000)
  }
  assert.deepEqual([...seenRetries].sort(), [0, 1, 2], '没有观察到三次失败后的剩余次数 2、1、0')
  assert.ok(incidentCount > 0, '重试次数用尽后应出现 Incident')
  console.log('验证通过：三次失败的 Job ID 相同，耗尽重试后出现 Incident。')
} finally {
  if (deploymentId) {
    const owner = await request('/deployment/' + deploymentId)
    assert.equal(owner.name, deploymentName, '清理前必须确认测试部署名称')
    await request('/deployment/' + deploymentId + '?cascade=true&skipCustomListeners=true&skipIoMappings=true', 'DELETE')
    assert.equal((await request('/deployment/count?id=' + deploymentId)).count, 0)
    console.log('已清理本次测试部署：' + deploymentId)
  }
}
