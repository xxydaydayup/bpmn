import { defineWorkflow, sequence, parallel, approval } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** Explicit nested-join consumer. Caller owns unique keys and deployment cleanup. */
export async function runParallelWorkflow({ request, key, businessKey, assignee, signal }) {
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const definition = defineWorkflow({ key }, sequence(parallel('outer', [
    sequence(parallel('inner', [approval('finance'), approval('legal')]), approval('manager')),
    approval('audit'),
  ]), approval('archive')))
  const template = await client.publish(definition, options)
  const names = ['finance', 'legal', 'manager', 'audit', 'archive']
  const instance = await client.start(key, { businessKey, nodes: Object.fromEntries(names.map(name => [name, { assignee }])) }, options)
  const observations = []
  async function tasks() {
    const page = await client.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 }, options)
    observations.push(page.items)
    return page.items
  }
  for (const name of names) {
    const live = await tasks()
    const task = live.find(task => task.taskDefinitionKey === name)
    if (!task) throw new Error('未找到预期任务 ' + name + '；按实例核对 ' + instance.processInstanceId)
    if (name === 'legal' && live.some(task => ['manager', 'archive'].includes(task.taskDefinitionKey))) throw new Error('内层并行提前汇合')
    if (name === 'audit' && live.some(task => task.taskDefinitionKey === 'archive')) throw new Error('外层并行提前汇合')
    await client.complete(task, { fields: { comment: name } }, { ...options, templateSnapshot: template })
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    signal?.throwIfAborted()
    const progress = await client.getProgress(instance.processInstanceId, options)
    if (progress.state === 'COMPLETED') return { template, instance, observations, progress, history: await client.listHistory(instance.processInstanceId, { limit: 100 }, options) }
    if (progress.state.endsWith('TERMINATED')) throw new Error('实例异常终止：' + instance.processInstanceId)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('等待结束超时：' + instance.processInstanceId)
}
