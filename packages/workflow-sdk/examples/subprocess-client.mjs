import { defineWorkflow, sequence, approval, subProcess, choice, parallel, end } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** A body factory assigns explicit unique IDs at each nesting depth. */
export function reusableSubprocessDefinition(key) {
  const shared = scope => sequence(approval(scope + '_review', { x: 120, y: 80 }), choice(scope + '_route', { branches: [
    { branch: 'pass', body: parallel(scope + '_teams', [approval(scope + '_finance'), approval(scope + '_legal')]) },
    { branch: 'reject', body: end(scope + '_local_end') },
  ] }), approval(scope + '_settled'))
  return defineWorkflow({ key }, sequence(
    subProcess('outer_box', sequence(subProcess('inner_zone', shared('outer_box_inner_zone')), approval('outer_box_resume'))),
    subProcess('second_box', shared('second_box')), approval('archive'),
  ))
}

/** resolveAssignee and decide receive backend activity IDs verbatim, including underscores. */
export async function runSubprocessWorkflow({ request, key, businessKey, resolveAssignee, decide, signal }) {
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const template = await client.publish(reusableSubprocessDefinition(key), options)
  const nodes = Object.fromEntries(template.globalVariables
    .filter(r => r.source === 'start' && r.nodeType === 'approval' && (r.fieldKey === 'assignee' || r.name === r.nodeId + '_assignee'))
    .map(r => [r.nodeId, { assignee: resolveAssignee(r.nodeId) }]))
  const instance = await client.start(key, { businessKey, nodes }, options)
  const completed = []
  for (let attempt = 0; attempt < 100; attempt++) {
    signal?.throwIfAborted()
    const progress = await client.getProgress(instance.processInstanceId, options)
    if (progress.state === 'COMPLETED') return { template, instance, progress, completed, history: await client.listHistory(instance.processInstanceId, { limit: 300 }, options) }
    if (progress.state.endsWith('TERMINATED')) throw new Error('实例异常终止：' + instance.processInstanceId)
    const live = (await client.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 }, options)).items
    for (const task of live) {
      if (task.assignee !== nodes[task.taskDefinitionKey]?.assignee) throw new Error('办理人不匹配：' + task.taskDefinitionKey)
      const requirements = await client.getTaskRequirements(task, options)
      const decision = requirements.currentComplete.some(r => r.source === 'complete' && r.required && r.type === 'Boolean') ? decide(task.taskDefinitionKey) : undefined
      await client.complete(task, { ...(decision === undefined ? {} : { decision }), fields: { comment: task.taskDefinitionKey, checked: false }, nodes }, { ...options, templateSnapshot: template })
      completed.push(task)
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('等待结束超时：' + instance.processInstanceId)
}
