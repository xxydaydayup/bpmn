import { defineWorkflow, sequence, approval } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** Explicit consumer call. Importing this module does not publish or start anything. */
export async function runSerialWorkflow({ request, key, businessKey, reviewer, archiver, signal }) {
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const definition = defineWorkflow({ key, name: '串行填写示例' }, sequence(approval('review'), approval('archive')))
  const template = await client.publish(definition, options)
  const instance = await client.start(key, { businessKey, nodes: { review: { assignee: reviewer } } }, options)
  async function waitFor(read, accept) {
    for (let attempt = 0; attempt < 40; attempt++) {
      signal?.throwIfAborted()
      const result = await read()
      if (accept(result)) return result
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('流程尚未达到预期状态，请按实例标识核对：' + instance.processInstanceId)
  }
  async function taskAt(node) {
    const page = await waitFor(() => client.listTasks({ processInstanceId: instance.processInstanceId }, options), page => page.items.some(task => task.taskDefinitionKey === node))
    return page.items.find(task => task.taskDefinitionKey === node)
  }
  const first = await taskAt('review')
  await client.getTaskForm(first, options)
  await client.complete(first, { fields: { comment: '核对完成', amount: 0, checked: false, labels: ['sdk'], metadata: { source: 'example' }, nullable: null }, nodes: { archive: { assignee: archiver } } }, { ...options, templateSnapshot: template })
  await client.complete(await taskAt('archive'), { fields: { archived: true } }, { ...options, templateSnapshot: template })
  const progress = await waitFor(() => client.getProgress(instance.processInstanceId, options), value => value.state === 'COMPLETED' || value.state.endsWith('TERMINATED'))
  const history = await client.listHistory(instance.processInstanceId, { limit: 100 }, options)
  return { template, instance, progress, history }
}
