import { defineWorkflow, sequence, receive, timer, approval } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** Explicit message/timer consumer. A taskless ACTIVE process is still running. */
export async function runWaitWorkflow({ request, key, businessKey, assignee, signal }) {
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const messageName = key + '_receipt'
  const template = await client.publish(defineWorkflow({ key }, sequence(
    receive('receipt', { messageName }),
    timer('cooldown', { timerType: 'duration', timerValue: 'PT5S' }),
    approval('archive', { assignee }),
  )), options)
  const instance = await client.start(key, { businessKey }, options)
  const waiting = await client.getProgress(instance.processInstanceId, options)
  if (waiting.state !== 'ACTIVE') throw new Error('请核对消息等待状态：' + instance.processInstanceId)
  // Use exactly one authorized target; a failure is returned without switching targets.
  await client.sendMessage({ businessKey, messageName, variables: { received: true, checked: false, amount: 0 } }, options)
  let completedTask
  for (let attempt = 0; attempt < 80; attempt++) {
    signal?.throwIfAborted()
    const progress = await client.getProgress(instance.processInstanceId, options)
    if (progress.state === 'COMPLETED') return { template, instance, waiting, progress, history: await client.listHistory(instance.processInstanceId, { limit: 100 }, options) }
    if (progress.state.endsWith('TERMINATED')) throw new Error('实例异常终止：' + instance.processInstanceId)
    if (!completedTask) {
      const page = await client.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 }, options)
      const task = page.items.find(task => task.taskDefinitionKey === 'archive')
      if (task) {
        await client.complete(task, {}, { ...options, templateSnapshot: template })
        completedTask = task.id
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('等待推进超时，请按实例查询：' + instance.processInstanceId)
}
