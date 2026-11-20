import { defineWorkflow, sequence, approval } from '@workflow/sdk/definition'
import { createWorkflowClient, WorkflowClientError } from '@workflow/sdk/client'

/**
 * 生产级错误处理与恢复示例（适配参考；未记录真实验收，见验证文档约定）。
 *
 * 重试边界（与 SDK 契约一致，不得放宽）：
 * - 读操作：任何网络类失败（连接/超时/429/5xx）都可自动重试，读请求无副作用。
 * - 写操作：仅"连接未建立"（请求确定未到达网关）允许有限重试；其余绝不自动重试。
 * - 写操作 effect=unknown：用查询核对恢复（inspectWriteOutcome 模式），不重发写请求。
 * - BUSINESS_KEY_EXISTS：按业务键对账找回已创建实例，实现幂等启动语义。
 * 导入本模块不发任何请求；显式调用 runResilientWorkflow 才发布并启动。
 */

/** 连接未建立即抛出；请求确定未被网关处理，写操作重试同样安全。 */
export class GatewayConnectionError extends Error {
  constructor(cause) {
    super('网关连接失败：请求未到达服务端，可安全重试或走查询核对。')
    this.name = 'GatewayConnectionError'
    this.retrySafe = true
    this.cause = cause
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
})

/**
 * 生产请求适配器：保留 HTTP status；连接失败标记 retrySafe，并做有限次连接重试。
 * 鉴权、租户头和 baseUrl 由宿主提供；multipart 不手动设置 Content-Type。
 */
export function createResilientRequest(baseUrl, {
  headers: hostHeaders = {},
  fetch: send = globalThis.fetch,
  connectAttempts = 2,
  connectDelayMs = 200,
  onRetry,
} = {}) {
  return async function request({ method, path, query, headers, body, signal }) {
    const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const url = new URL(root + path, globalThis.location?.href)
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value))
    const multipart = body instanceof FormData
    const init = {
      method, signal,
      headers: { ...hostHeaders, ...headers, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    }
    let connectionError
    for (let attempt = 0; attempt <= connectAttempts; attempt++) {
      try {
        const response = await send(url, init)
        const text = await response.text()
        let result
        try { result = text ? JSON.parse(text) : null } catch { result = text }
        return { status: response.status, body: result }
      } catch (cause) {
        if (signal?.aborted || cause.name === 'AbortError') throw cause
        // TypeError = fetch 层失败（连接拒绝、DNS、断网）：请求确定未到达网关。
        if (!(cause instanceof TypeError)) throw cause
        connectionError = new GatewayConnectionError(cause)
        if (attempt < connectAttempts) {
          onRetry?.({ scope: 'connect', attempt: attempt + 1, error: connectionError })
          await sleep(connectDelayMs * 2 ** attempt, signal)
        }
      }
    }
    throw connectionError
  }
}

/** 只读重试：连接失败、超时、429/5xx 都可重试；指数退避加全抖动。 */
export async function executeRead(read, { retries = 3, baseDelayMs = 300, signal, onRetry } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await read()
    } catch (error) {
      lastError = error
      const retryable = error.retrySafe === true
        || (error instanceof WorkflowClientError && (error.httpStatus === 429 || (error.httpStatus >= 500 && error.httpStatus < 600)))
        || (error instanceof TypeError && !signal?.aborted)
      if (!retryable || attempt === retries || signal?.aborted) throw error
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs
      onRetry?.({ scope: 'read', attempt: attempt + 1, error })
      await sleep(delay, signal)
    }
  }
  throw lastError
}

/** 有限轮询读操作直到满足条件或次数耗尽；每次读取都套用只读重试。 */
export async function pollUntil(read, accept, { attempts = 40, intervalMs = 250, signal, ...readOptions } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal?.throwIfAborted()
    const value = await executeRead(read, { signal, ...readOptions })
    if (accept(value)) return value
    await sleep(intervalMs, signal)
  }
  throw new Error('轮询次数耗尽仍未达到预期状态，请按实例标识人工核对。')
}

/**
 * 幂等启动：BUSINESS_KEY_EXISTS 或 effect=unknown 时按业务键对账找回实例；
 * 候选任务页不含无任务实例，找不到时如实抛出，绝不重发启动请求。
 */
export async function startOrReconcile(client, templateKey, input, { signal, onRetry } = {}) {
  const options = { signal }
  try {
    return { outcome: 'started', instance: await client.start(templateKey, input, options) }
  } catch (error) {
    if (!(error instanceof WorkflowClientError) || error.operation !== 'start') throw error
    const duplicate = error.code === 'BUSINESS_KEY_EXISTS'
    const uncertain = error.effect === 'unknown'
    if (!duplicate && !uncertain) throw error
    onRetry?.({ scope: 'start-reconcile', reason: duplicate ? 'duplicate' : 'unknown', error })
    const template = await executeRead(() => client.getTemplate(templateKey, options), { signal, onRetry })
    const candidates = await executeRead(
      () => client.listTasks({
        processDefinitionKey: template.processDefinitionKey,
        processDefinitionId: template.processDefinitionKey ? undefined : template.processDefinitionId,
        limit: 100,
      }, options),
      { signal, onRetry },
    )
    // 候选任务页不保证回传 businessKey，也不覆盖无任务实例、旧定义和分页外实例；
    // 两项都匹配才认定恢复成功，匹配不到不代表启动失败。
    const task = candidates.items.find(row =>
      row.businessKey === input.businessKey
      && (typeof row.processDefinitionId !== 'string' || row.processDefinitionId === template.processDefinitionId))
    if (!task) {
      // 启动结果不确定：交由宿主按授权实例查询核对，绝不重发启动请求。
      throw new WorkflowStartUncertainError(templateKey, input.businessKey, error)
    }
    const progress = await executeRead(() => client.getProgress(task.processInstanceId, options), { signal, onRetry })
    return { outcome: duplicate ? 'recovered-duplicate' : 'recovered-unknown', instance: { ...task, state: progress.state }, progress }
  }
}

/** 启动结果不确定：实例可能已创建但候选页未覆盖，需要宿主按业务键授权查询核对。 */
export class WorkflowStartUncertainError extends Error {
  constructor(templateKey, businessKey, cause) {
    super(`启动结果不确定：模板 ${templateKey} 业务键 ${businessKey} 可能在服务端已生效但任务候选页未覆盖，请按授权实例查询核对后再决定。`)
    this.name = 'WorkflowStartUncertainError'
    this.templateKey = templateKey
    this.businessKey = businessKey
    this.cause = cause
  }
}

/**
 * 可恢复办理：effect=unknown 时核对原任务是否已结束；
 * 任务仍在时返回 unverified 交由调用方决策，本函数不重发完成请求。
 */
export async function completeOrVerify(client, task, input, { signal, onRetry } = {}) {
  const options = { signal }
  try {
    return { outcome: 'completed', result: await client.complete(task, input, options) }
  } catch (error) {
    if (!(error instanceof WorkflowClientError) || error.effect === 'none') throw error
    const instanceId = error.resources.processInstanceId ?? task.processInstanceId
    if (typeof instanceId !== 'string') throw error
    onRetry?.({ scope: 'complete-verify', error })
    const [progress, tasks] = await Promise.all([
      executeRead(() => client.getProgress(instanceId, options), { signal, onRetry }),
      executeRead(() => client.listTasks({ processInstanceId: instanceId, limit: 100 }, options), { signal, onRetry }),
    ])
    const stillActive = tasks.items.some(row => row.id === task.id)
    if (!stillActive) {
      // 原任务已从待办消失且实例推进：办理已生效（effect 可能仍是 unknown，以引擎历史为准）。
      return { outcome: 'verified-applied', progress, tasks }
    }
    // 任务仍待办：请求可能未生效（也可能被拒后留在待办）。返回现场，由调用方决定是否重提。
    return { outcome: 'unverified', error, progress, tasks }
  }
}

/** 错误分类：把 WorkflowClientError 转成用户可读信息和建议动作，供 toast/日志统一消费。 */
export function describeWorkflowError(error) {
  if (!(error instanceof WorkflowClientError)) {
    return { kind: 'unexpected', message: error?.message ?? String(error), action: '检查网络与代码后重试。' }
  }
  if (error.effect === 'unknown') {
    return { kind: 'write-uncertain', code: error.code, message: `${error.operation} 请求结果不确定，可能已生效。`, action: '按模板、业务键或任务标识查询核对，不要重复提交。', resources: error.resources }
  }
  if (error.phase === 'parameters') {
    return { kind: 'invalid-input', code: error.code, message: `本地参数校验失败：${error.issues?.[0]?.message ?? error.code}`, action: '修正参数后重试；请求未发出。', issues: error.issues }
  }
  if (error.httpStatus === 429) return { kind: 'throttled', code: error.code, message: '请求过于频繁。', action: '稍后自动或手动重试。' }
  if (error.httpStatus >= 500) return { kind: 'server', code: error.code, message: `服务端错误（HTTP ${error.httpStatus}）。`, action: error.operation ? `${error.operation} 未确认生效，先查询核对再重试。` : '稍后重试。' }
  if (error.httpStatus === 401 || error.httpStatus === 403) return { kind: 'auth', code: error.code, message: '未授权或权限不足。', action: '检查登录态与权限后重试。' }
  return { kind: 'business', code: error.code, message: error.message, action: '按错误码处理。', resources: error.resources }
}

/**
 * 完整弹性流程：发布 → 幂等启动 → 等待任务 → 可恢复办理 → 轮询终态 → 历史。
 * 调用方提供唯一 key/businessKey 并负责测试资源清理。
 */
export async function runResilientWorkflow({ request, key, businessKey, reviewer, archiver, signal, onRetry, log = () => {} }) {
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal, onRetry }
  const definition = defineWorkflow({ key, name: '串行填写示例' }, sequence(approval('review'), approval('archive')))

  log('发布流程定义')
  let template
  try {
    template = await client.publish(definition, options)
  } catch (error) {
    if (error instanceof WorkflowClientError && error.effect === 'unknown') {
      // 并发发布下当前模板不能代表丢失的发布，需要按返回的 templateKey 做版本对账。
      throw Object.assign(new Error(`发布结果不确定：请按 ${error.resources.templateKey} 的版本历史核对实际部署，不要用当前模板重发发布。`), { cause: error })
    }
    throw error
  }

  log('幂等启动实例')
  const start = await startOrReconcile(client, key, { businessKey, nodes: { review: { assignee: reviewer } } }, options)
  const instance = start.instance
  log(`实例 ${instance.processInstanceId}（${start.outcome}）`)

  async function taskAt(node) {
    const page = await pollUntil(
      () => client.listTasks({ processInstanceId: instance.processInstanceId }, options),
      current => current.items.some(row => row.taskDefinitionKey === node),
      { signal, onRetry },
    )
    return page.items.find(row => row.taskDefinitionKey === node)
  }

  const first = await taskAt('review')
  log(`办理 ${first.taskDefinitionKey}，结果不确定时自动核对`)
  const completed = await completeOrVerify(client, first, {
    fields: { comment: '核对完成', amount: 0, checked: false },
    nodes: { archive: { assignee: archiver } },
  }, { ...options, templateSnapshot: template })
  if (completed.outcome === 'unverified') {
    throw Object.assign(new Error(`任务 ${first.id} 办理结果未确认，任务仍在待办；请人工核对后决定是否重提。`), { cause: completed.error })
  }

  const second = await taskAt('archive')
  await completeOrVerify(client, second, { fields: { archived: true } }, { ...options, templateSnapshot: template })

  const progress = await pollUntil(
    () => client.getProgress(instance.processInstanceId, options),
    value => value.state === 'COMPLETED' || value.state.endsWith('TERMINATED'),
    { signal, onRetry },
  )
  const history = await executeRead(() => client.listHistory(instance.processInstanceId, { limit: 100 }, options), { signal, onRetry })
  return { template, start, progress, history }
}
