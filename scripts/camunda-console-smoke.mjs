// 显式指定开发引擎地址后运行；只操作本次创建的唯一测试部署。
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.env.CAMUNDA_TEST_BASE_URL?.replace(/\/$/, '')
if (!base) throw new Error('请先设置 CAMUNDA_TEST_BASE_URL（包含 /engine-rest），仅用于开发引擎。')
const name = 'console_smoke_' + randomUUID().replaceAll('-', '')
let deploymentId
const checks = []
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 300))
  return text ? JSON.parse(text) : undefined
}
const processXml = (key, middle) => ('<bpmn:process id="' + key + '" isExecutable="true" camunda:historyTimeToLive="1"><bpmn:startEvent id="start"/><bpmn:sequenceFlow id="flow1" sourceRef="start" targetRef="wait"/>' + middle + '<bpmn:sequenceFlow id="flow2" sourceRef="wait" targetRef="end"/><bpmn:endEvent id="end"/></bpmn:process>').replace(/"(start|wait|end|flow1|flow2)"/g, (_, id) => '"' + key + '_' + id + '"')
const key = name + '_user'
const timerKey = name + '_timer'
const xml = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" targetNamespace="urn:console-smoke">'
  + processXml(key, '<bpmn:userTask id="wait" name="测试等待任务"/>')
  + processXml(timerKey, '<bpmn:intermediateCatchEvent id="wait"><bpmn:timerEventDefinition><bpmn:timeDuration>P1D</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>')
  + '</bpmn:definitions>'
try {
  const version = await request('/version')
  const form = new FormData()
  form.set('deployment-name', name)
  form.set('deployment-source', 'console-smoke-test')
  form.set('data', new Blob([xml], { type: 'application/xml' }), name + '.bpmn')
  const deployment = await request('/deployment/create', 'POST', form)
  deploymentId = deployment.id
  assert.ok(deploymentId)
  const definitions = Object.values(deployment.deployedProcessDefinitions ?? {})
  const definition = definitions.find(item => item.key === key)
  const timer = definitions.find(item => item.key === timerKey)
  assert.ok(definition && timer)
  checks.push('部署 BPMN 和定义版本')
  assert.equal((await request('/deployment/' + deploymentId + '/resources')).length, 1)
  assert.ok((await request('/process-definition/' + definition.id + '/xml')).bpmn20Xml.includes(key))
  assert.equal((await request('/process-definition/count?processDefinitionId=' + encodeURIComponent(definition.id))).count, 1)
  assert.equal((await request('/process-definition/count?processDefinitionId=nonexistent-' + name)).count, 0)
  checks.push('部署资源、XML 和精确 ID 筛选')
  await request('/process-definition/' + definition.id + '/suspended', 'PUT', { suspended: true, includeProcessInstances: false })
  assert.equal((await request('/process-definition/' + definition.id)).suspended, true)
  await request('/process-definition/' + definition.id + '/suspended', 'PUT', { suspended: false, includeProcessInstances: false })
  assert.equal((await request('/process-definition/' + definition.id)).suspended, false)
  checks.push('定义挂起及恢复')
  const instance = await request('/process-definition/' + definition.id + '/start', 'POST', { businessKey: name, variables: { smoke: { value: true, type: 'Boolean' } } })
  assert.equal((await request('/process-instance/' + instance.id + '/variables?deserializeValues=false')).smoke.value, true)
  assert.ok((await request('/process-instance/' + instance.id + '/activity-instances')).childActivityInstances.some(item => item.activityId === key + '_wait'))
  assert.equal((await request('/task/count?processInstanceId=' + instance.id)).count, 1)
  assert.equal((await request('/history/process-instance/count?processInstanceId=' + instance.id)).count, 1)
  checks.push('实例、任务、变量、活动树及未结束历史')
  await request('/process-instance/' + instance.id + '/suspended', 'PUT', { suspended: true })
  assert.equal((await request('/process-instance/' + instance.id)).suspended, true)
  await request('/process-instance/' + instance.id + '/suspended', 'PUT', { suspended: false })
  assert.equal((await request('/process-instance/' + instance.id)).suspended, false)
  checks.push('实例挂起及恢复')
  const timerInstance = await request('/process-definition/' + timer.id + '/start', 'POST', { businessKey: name })
  const job = (await request('/job?processInstanceId=' + timerInstance.id))[0]
  assert.ok(job)
  await request('/job/' + job.id + '/retries', 'PUT', { retries: 2 })
  assert.equal((await request('/job/' + job.id)).retries, 2)
  checks.push('Job retries 修改及读回（仅测试定时任务）')
  await request('/process-instance/' + instance.id + '?skipCustomListeners=false&skipIoMappings=false&skipSubprocesses=false&failIfNotExists=true', 'DELETE')
  assert.equal((await request('/process-instance/count?processInstanceIds=' + instance.id)).count, 0)
  assert.ok((await request('/history/process-instance?processInstanceId=' + instance.id))[0].endTime)
  checks.push('实例终止及历史记录')
  console.log(JSON.stringify({ version: version.version, checks, deploymentId }, null, 2))
} finally {
  if (deploymentId) {
    const owner = await request('/deployment/' + deploymentId)
    assert.equal(owner.name, name, '清理前必须确认属于本次测试部署')
    await request('/deployment/' + deploymentId + '?cascade=true&skipCustomListeners=true&skipIoMappings=true', 'DELETE')
    assert.equal((await request('/deployment/count?id=' + deploymentId)).count, 0)
    console.log('已清理本次测试部署：' + deploymentId)
  }
}
