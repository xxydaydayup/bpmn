import { defineWorkflow, sequence, approval, choice, end } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** Submit only the chosen branch's configuration, together with original form fields. */
export async function runApprovalWorkflow({ request, key, businessKey, reviewer, nextAssignee, decision, signal }) {
  if (!['agree', 'reject'].includes(decision)) throw new Error('decision must be agree or reject')
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const template = await client.publish(defineWorkflow({ key }, sequence(
    approval('review'),
    choice('result', { branches: [
      { branch: 'pass', body: approval('accepted') },
      { branch: 'reject', body: end('rejected') },
    ] }),
    approval('archive', { assignee: nextAssignee }),
  )), options)
  const instance = await client.start(key, { businessKey, nodes: { review: { assignee: reviewer } } }, options)
  let reviewSubmitted = false
  for (let attempt = 0; attempt < 80; attempt++) {
    signal?.throwIfAborted()
    const progress = await client.getProgress(instance.processInstanceId, options)
    if (progress.state === 'COMPLETED') return { template, instance, progress, history: await client.listHistory(instance.processInstanceId, { limit: 100 }, options) }
    if (progress.state.endsWith('TERMINATED')) throw new Error('实例异常终止：' + instance.processInstanceId)
    const page = await client.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 }, options)
    for (const task of page.items) {
      if (task.taskDefinitionKey === 'review' && !reviewSubmitted) {
        await client.complete(task, { decision, fields: { comment: '审批意见', checked: false }, ...(decision === 'agree' ? { nodes: { accepted: { assignee: nextAssignee } } } : {}) }, { ...options, templateSnapshot: template })
        reviewSubmitted = true
      } else if (['accepted', 'archive'].includes(task.taskDefinitionKey)) {
        await client.complete(task, {}, { ...options, templateSnapshot: template })
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('等待结束超时：' + instance.processInstanceId)
}
