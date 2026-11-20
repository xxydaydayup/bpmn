import type { WorkflowValidationIssue } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Designer definitions share one namespace; references and process keys do not. */
export function workflowDefinitionIdIssues(input: unknown): WorkflowValidationIssue[] {
  type Work = { value: unknown; path: string; scope: string[]; leave?: boolean }
  const issues: WorkflowValidationIssue[] = []
  const ids = new Set<string>()
  const ancestors = new Set<object>()
  const pending: Work[] = [{ value: input, path: '', scope: [] }]
  const register = (id: string, path: string, context: Pick<WorkflowValidationIssue, 'scope' | 'nodeId' | 'edgeId'>) => {
    if (ids.has(id)) issues.push({
      code: 'duplicate-definition-id', severity: 'error',
      message: `节点和连线标识必须在整个流程中唯一：${id}。`, path, ...context,
    })
    ids.add(id)
  }
  while (pending.length) {
    const current = pending.pop()!
    const { value, path, scope } = current
    if (!isRecord(value)) continue
    if (current.leave) { ancestors.delete(value); continue }
    if (ancestors.has(value)) continue
    ancestors.add(value)
    pending.push({ ...current, leave: true })
    const children: Work[] = []
    if (Array.isArray(value.nodes)) value.nodes.forEach((node: unknown, index: number) => {
      if (!isRecord(node)) return
      const nodeId = typeof node.id === 'string' ? node.id : undefined
      const nodePath = `${path}/nodes/${index}`
      if (nodeId) register(nodeId, `${nodePath}/id`, { nodeId, scope })
      if (node.type === 'subProcess') children.push({
        value: node.process, path: `${nodePath}/process`,
        scope: nodeId === undefined ? scope : [...scope, nodeId],
      })
    })
    if (Array.isArray(value.flows)) value.flows.forEach((flow: unknown, index: number) => {
      if (!isRecord(flow)) return
      const flowPath = `${path}/flows/${index}/id`
      if (flow.id === undefined || (typeof flow.id === 'string' && !flow.id.trim())) {
        issues.push({ code: 'missing-flow-id', severity: 'error', message: '请为连线设置唯一标识。', path: flowPath, scope })
      } else if (typeof flow.id === 'string') register(flow.id, flowPath, { edgeId: flow.id, scope })
    })
    // Only ancestors stop traversal: the same fragment at another path defines more IDs.
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]!)
  }
  return issues
}
