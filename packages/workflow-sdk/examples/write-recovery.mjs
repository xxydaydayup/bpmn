import { WorkflowClientError } from '@workflow/sdk/client'

/** Read-only recovery: return candidates for the caller to identify, never repeat a write. */
export async function inspectWriteOutcome(client, error, { signal, limit = 100 } = {}) {
  if (!(error instanceof WorkflowClientError)) throw error
  const { resources, operation, effect } = error
  const options = { signal }
  if (effect === 'none') return { operation, effect, resources }
  if (operation === 'publish' && typeof resources.templateKey === 'string') {
    // The current template alone cannot identify a lost publication amid concurrent publishes.
    const current = await client.getTemplate(resources.templateKey, options)
    return { operation, effect, resources, current, requiresVersionReconciliation: true }
  }
  if (operation === 'start' && typeof resources.templateKey === 'string') {
    const current = await client.getTemplate(resources.templateKey, options)
    const candidates = await client.listTasks({ processDefinitionKey: current.processDefinitionKey, processDefinitionId: current.processDefinitionKey ? undefined : current.processDefinitionId, limit }, options)
    // Confirm businessKey and actual definition through the host's authorized instance lookup.
    // A taskless instance or older definition can be absent from this candidate page.
    return { operation, effect, resources, candidates, requiresBusinessKeyReconciliation: true }
  }
  if (typeof resources.processInstanceId === 'string') {
    const [progress, history, tasks] = await Promise.all([
      client.getProgress(resources.processInstanceId, options),
      client.listHistory(resources.processInstanceId, { limit }, options),
      client.listTasks({ processInstanceId: resources.processInstanceId, limit }, options),
    ])
    return { operation, effect, resources, progress, history, tasks }
  }
  return { operation, effect, resources, requiresHostReconciliation: true }
}
