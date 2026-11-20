import { defineWorkflow, sequence, countersign, approval, choice, end } from '@workflow/sdk/definition'
import { createWorkflowClient } from '@workflow/sdk/client'

/** Explicit isolated demo. The host supplies transport, votes and resource cleanup. */
export async function runCountersignWorkflow({ request, key, businessKey, participants, decisions, mode = 'ALL', sequential = false, passRate, nextAssignee, signal }) {
  if (!participants?.length || participants.length !== decisions?.length || new Set(participants).size !== participants.length || decisions.some(v => !['agree', 'reject'].includes(v))) throw new Error('Provide distinct participants and one agree/reject opinion per participant')
  const client = createWorkflowClient({ request, timeoutMs: 15000 })
  const options = { signal }
  const template = await client.publish(defineWorkflow({ key }, sequence(
    countersign('sign', { mode, sequential, ...(passRate !== undefined ? { passRate } : {}) }),
    choice('result', { branches: [{ branch: 'pass', body: approval('accepted') }, { branch: 'reject', body: end('rejected') }] }),
    approval('archive', { assignee: nextAssignee }),
  )), options)
  const instance = await client.start(key, { businessKey, nodes: { sign: { approverList: participants } } }, options)
  const submitted = [], snapshots = []
  for (let attempt = 0; attempt < 100; attempt++) {
    signal?.throwIfAborted()
    const progress = await client.getProgress(instance.processInstanceId, options)
    if (progress.state === 'COMPLETED') return { template, instance, progress, submitted, snapshots, history: await client.listHistory(instance.processInstanceId, { limit: 300 }, options) }
    if (progress.state.endsWith('TERMINATED')) throw new Error('实例异常终止：' + instance.processInstanceId)
    const live = (await client.listTasks({ processInstanceId: instance.processInstanceId, limit: 100 }, options)).items
    snapshots.push(live)
    const signer = participants.map(user => live.find(t => t.taskDefinitionKey === 'sign' && t.assignee === user)).find(Boolean)
    if (signer) {
      const decision = decisions[participants.indexOf(signer.assignee)]
      await client.complete(signer, { decision, fields: { comment: '个人意见', checked: false }, nodes: { accepted: { assignee: nextAssignee } } }, { ...options, templateSnapshot: template })
      submitted.push({ taskId: signer.id, assignee: signer.assignee, decision })
    } else for (const task of live.filter(t => ['accepted', 'archive'].includes(t.taskDefinitionKey))) await client.complete(task, {}, { ...options, templateSnapshot: template })
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('等待结束超时：' + instance.processInstanceId)
}
