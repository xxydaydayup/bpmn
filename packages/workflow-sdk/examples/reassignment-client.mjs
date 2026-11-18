/** Use the exact task identity for each action; a failed write is left for query recovery. */
export async function returnAndReassign(client, task, userId, { signal } = {}) {
  const options = { signal }
  await client.returnForReassignment(task, options)
  const returned = await client.listTasks({ processInstanceId: task.processInstanceId, limit: 100 }, options)
  const current = returned.items.find(item => item.id === task.id)
  if (!current || current.assignee) throw new Error('退回结果需核对：' + task.id)
  await client.reassign(current, userId, options)
  const assigned = await client.listTasks({ processInstanceId: task.processInstanceId, assignee: userId, limit: 100 }, options)
  const sameTask = assigned.items.find(item => item.id === task.id)
  if (!sameTask) throw new Error('重派结果需核对：' + task.id)
  return sameTask
}
