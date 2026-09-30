// 仅用于开发/测试环境：写操作全部经后端 /engine-rest，官方地址只做观察。
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const trimBase = value => value.replace(/\/$/, '')

export function requireSmokeConfig(env = process.env) {
  if (!env.CAMUNDA_DIRECT_BASE_URL) throw new Error('请设置 CAMUNDA_DIRECT_BASE_URL（包含 /engine-rest）。')
  if (!env.CAMUNDA_PROXY_BASE_URL) throw new Error('请设置 CAMUNDA_PROXY_BASE_URL（包含 /engine-rest）。')
  if (!env.CAMUNDA_PROXY_AUTH) throw new Error('请设置 CAMUNDA_PROXY_AUTH，格式 username:password。')
  if (!env.CAMUNDA_TEST_TENANT) throw new Error('请设置 CAMUNDA_TEST_TENANT。')
  basicAuthorization(env.CAMUNDA_PROXY_AUTH)
  return {
    directBase: trimBase(env.CAMUNDA_DIRECT_BASE_URL),
    proxyBase: trimBase(env.CAMUNDA_PROXY_BASE_URL),
    proxyAuth: env.CAMUNDA_PROXY_AUTH,
    tenantId: env.CAMUNDA_TEST_TENANT,
  }
}

export function basicAuthorization(credentials) {
  if (!credentials || !credentials.includes(':')) throw new Error('Basic Auth 必须使用 username:password 格式。')
  return 'Basic ' + Buffer.from(credentials, 'utf8').toString('base64')
}

export function buildProxySmokeBpmn(processKey) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" targetNamespace="urn:proxy-smoke">
  <bpmn:process id="${processKey}" name="后端透传写操作验证" isExecutable="true" camunda:historyTimeToLive="1">
    <bpmn:startEvent id="${processKey}_start" />
    <bpmn:sequenceFlow id="${processKey}_flow_1" sourceRef="${processKey}_start" targetRef="${processKey}_review" />
    <bpmn:userTask id="${processKey}_review" name="透传验证人工任务" />
    <bpmn:sequenceFlow id="${processKey}_flow_2" sourceRef="${processKey}_review" targetRef="${processKey}_end" />
    <bpmn:endEvent id="${processKey}_end" />
  </bpmn:process>
</bpmn:definitions>`
}

async function call(base, path, { method = 'GET', body, authorization, allowError = false } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : undefined } catch { data = text }
  if (!allowError && !response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`)
  return { status: response.status, data }
}

function sortedById(rows) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

async function eventually(read, predicate, label) {
  let value
  for (let attempt = 0; attempt < 20; attempt += 1) {
    value = await read()
    if (predicate(value)) return value
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(label + ' 未在预期时间内出现')
}

export async function runProxySmoke(env = process.env) {
  const config = requireSmokeConfig(env)
  const authorization = basicAuthorization(config.proxyAuth)
  const runId = randomUUID().replaceAll('-', '')
  const deploymentName = 'proxy_write_smoke_' + runId
  const processKey = deploymentName + '_process'
  const businessKey = deploymentName + '_business'
  let deploymentId
  const checks = []

  const proxy = (path, options) => call(config.proxyBase, path, { ...options, authorization })
  const direct = (path, options) => call(config.directBase, path, options)

  try {
    const unauthenticated = await call(config.proxyBase, '/version', { allowError: true })
    assert.ok([401, 403].includes(unauthenticated.status), `未认证请求应返回 401/403，实际 ${unauthenticated.status}`)
    const missing = await proxy('/proxy-smoke-missing-' + runId, { allowError: true })
    assert.equal(missing.status, 404)
    checks.push('Basic Auth 拒绝未认证请求，未知路径保持 404')

    const proxyVersion = (await proxy('/version')).data
    const directVersion = (await direct('/version')).data
    assert.equal(proxyVersion.version, directVersion.version)
    checks.push('代理和官方 REST 引擎版本一致')

    const form = new FormData()
    form.set('deployment-name', deploymentName)
    form.set('deployment-source', 'backend-proxy-smoke')
    form.set('tenant-id', config.tenantId)
    form.set('enable-duplicate-filtering', 'false')
    form.set('data', new Blob([buildProxySmokeBpmn(processKey)], { type: 'application/xml' }), deploymentName + '.bpmn')
    const deployment = (await proxy('/deployment/create', { method: 'POST', body: form })).data
    deploymentId = deployment.id
    assert.ok(deploymentId)

    const proxyDeployment = (await proxy('/deployment/' + encodeURIComponent(deploymentId))).data
    const directDeployment = (await direct('/deployment/' + encodeURIComponent(deploymentId))).data
    assert.deepEqual(proxyDeployment, directDeployment)
    const definitionPath = '/process-definition?deploymentId=' + encodeURIComponent(deploymentId)
      + '&tenantIdIn=' + encodeURIComponent(config.tenantId)
    const proxyDefinitions = sortedById((await proxy(definitionPath)).data)
    const directDefinitions = sortedById((await direct(definitionPath)).data)
    assert.deepEqual(proxyDefinitions, directDefinitions)
    const definition = proxyDefinitions.find(item => item.key === processKey)
    assert.ok(definition)
    assert.equal(definition.tenantId, config.tenantId)
    checks.push('代理部署后，部署与租户流程定义和官方 REST 完全一致')

    const definitionId = encodeURIComponent(definition.id)
    await proxy('/process-definition/' + definitionId + '/suspended', { method: 'PUT', body: { suspended: true, includeProcessInstances: false } })
    assert.equal((await direct('/process-definition/' + definitionId)).data.suspended, true)
    await proxy('/process-definition/' + definitionId + '/suspended', { method: 'PUT', body: { suspended: false, includeProcessInstances: false } })
    assert.equal((await direct('/process-definition/' + definitionId)).data.suspended, false)
    checks.push('流程定义挂起和恢复写操作可由官方 REST 观察')

    const started = (await proxy('/process-definition/' + definitionId + '/start', {
      method: 'POST',
      body: { businessKey, variables: { smoke: { value: runId, type: 'String' } } },
    })).data
    assert.ok(started.id)
    const instanceId = encodeURIComponent(started.id)
    assert.deepEqual((await proxy('/process-instance/' + instanceId)).data, (await direct('/process-instance/' + instanceId)).data)
    assert.equal((await direct('/process-instance/' + instanceId + '/variables?deserializeValues=false')).data.smoke.value, runId)
    assert.ok((await direct('/process-instance/' + instanceId + '/activity-instances')).data.childActivityInstances.length > 0)
    checks.push('实例、变量和活动树可经官方 REST 观察')

    await proxy('/process-instance/' + instanceId + '/suspended', { method: 'PUT', body: { suspended: true } })
    assert.equal((await direct('/process-instance/' + instanceId)).data.suspended, true)
    await proxy('/process-instance/' + instanceId + '/suspended', { method: 'PUT', body: { suspended: false } })
    assert.equal((await direct('/process-instance/' + instanceId)).data.suspended, false)
    checks.push('流程实例挂起和恢复写操作可由官方 REST 观察')

    const taskPath = '/task?processInstanceId=' + instanceId + '&tenantIdIn=' + encodeURIComponent(config.tenantId)
    const proxyTasks = sortedById((await proxy(taskPath)).data)
    const directTasks = sortedById((await direct(taskPath)).data)
    assert.deepEqual(proxyTasks, directTasks)
    assert.equal(proxyTasks.length, 1)
    await proxy('/task/' + encodeURIComponent(proxyTasks[0].id) + '/complete', {
      method: 'POST', body: { variables: { approved: { value: true, type: 'Boolean' } } },
    })
    checks.push('人工任务查询一致，完成写操作成功')

    const historyPath = '/history/process-instance?processInstanceId=' + instanceId
    const directHistory = await eventually(
      async () => (await direct(historyPath)).data,
      rows => rows[0]?.endTime,
      '已完成实例历史',
    )
    const proxyHistory = (await proxy(historyPath)).data
    assert.deepEqual(proxyHistory, directHistory)
    assert.equal(directHistory[0].businessKey, businessKey)
    const historicTasksPath = '/history/task?processInstanceId=' + instanceId
    assert.deepEqual(sortedById((await proxy(historicTasksPath)).data), sortedById((await direct(historicTasksPath)).data))
    checks.push('完成后的实例和任务历史与官方 REST 一致')

    return { version: proxyVersion.version, tenantId: config.tenantId, deploymentId, processInstanceId: started.id, checks }
  } finally {
    if (deploymentId) {
      const owner = (await direct('/deployment/' + encodeURIComponent(deploymentId))).data
      assert.equal(owner.name, deploymentName, '清理前必须确认部署属于本次测试')
      await proxy('/deployment/' + encodeURIComponent(deploymentId) + '?cascade=true&skipCustomListeners=true&skipIoMappings=true', { method: 'DELETE' })
      const count = (await direct('/deployment/count?id=' + encodeURIComponent(deploymentId))).data.count
      assert.equal(count, 0)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProxySmoke().then(result => {
    console.log(JSON.stringify(result, null, 2))
    console.log('已清理本次代理写操作测试部署：' + result.deploymentId)
  }).catch(cause => {
    console.error(cause instanceof Error ? cause.stack : cause)
    process.exitCode = 1
  })
}
