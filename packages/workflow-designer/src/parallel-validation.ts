import type { WorkflowModel, WorkflowNodeRecord, WorkflowValidationIssue } from './types'

/** Proves only acyclic, structured parallel regions; conditional/runtime paths stay warnings. */
export function parallelStructureIssues(model: WorkflowModel): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  const pending = [{ nodes: model.nodes, flows: model.flows, scope: [] as string[] }]
  const seen = new Set<object>()
  while (pending.length) {
    const current = pending.pop()!
    if (seen.has(current.nodes)) continue
    seen.add(current.nodes)
    const byId = new Map(current.nodes.filter(Boolean).map(node => [node.id, node]))
    const outgoing = new Map<string, string[]>()
    const incoming = new Map<string, string[]>()
    for (const flow of current.flows) {
      if (!flow || !byId.has(flow.source) || !byId.has(flow.target)) continue
      outgoing.set(flow.source, [...(outgoing.get(flow.source) ?? []), flow.target])
      incoming.set(flow.target, [...(incoming.get(flow.target) ?? []), flow.source])
    }
    const report = (node: WorkflowNodeRecord, code: string, message: string, warning = false) => issues.push({
      code, message, nodeId: current.scope[0] ?? node.id, scope: current.scope,
      locationLabel: [...current.scope, node.name || node.id].join(' › '),
      ...(warning ? { severity: 'warning' as const } : {}),
    })
    function distances(start: string) {
      const result = new Map<string, number>([[start, 0]])
      const queue = [start]
      for (let i = 0; i < queue.length; i++) for (const next of outgoing.get(queue[i]!) ?? []) {
        if (!result.has(next)) { result.set(next, result.get(queue[i]!)! + 1); queue.push(next) }
      }
      return result
    }
    for (const node of current.nodes) {
      if (!node || typeof node !== 'object') continue
      if (node.type === 'subProcess' && node.process && Array.isArray(node.process.nodes)) {
        pending.push({ nodes: node.process.nodes, flows: Array.isArray(node.process.flows) ? node.process.flows : [], scope: [...current.scope, node.id] })
      }
      const branches = outgoing.get(node.id) ?? []
      if (node.type !== 'parallel' || branches.length < 2) continue
      const paths = branches.map(distances)
      const candidates = current.nodes.filter(candidate => candidate?.type === 'parallel' && candidate.id !== node.id
        && (incoming.get(candidate.id)?.length ?? 0) > 1 && paths.every(path => path.has(candidate.id)))
        .sort((a, b) => Math.max(...paths.map(path => path.get(a.id)!)) - Math.max(...paths.map(path => path.get(b.id)!)))
      const join = candidates[0]
      let complex = false, cyclic = false, bypass = false
      const regions = branches.map(start => {
        const visited = new Set<string>(), visiting = new Set<string>()
        const walk = (id: string) => {
          if (id === join?.id) return
          if (visiting.has(id)) { cyclic = true; return }
          if (visited.has(id)) return
          const item = byId.get(id)
          if (!item) return
          visited.add(id); visiting.add(id)
          const next = outgoing.get(id) ?? []
          if (item.type === 'condition' || (next.length > 1 && item.type !== 'parallel')) complex = true
          if (!next.length) bypass = true
          for (const target of next) walk(target)
          visiting.delete(id)
        }
        walk(start)
        return visited
      })
      if (complex || cyclic) {
        report(node, 'parallel-check-scope', '并行区域包含条件选择、普通多出线或回流；当前只检查基础协议，不能静态证明全部路径到齐，请验证真实执行。', true)
        continue
      }
      if (!join) {
        report(node, 'parallel-unclosed', '并行分流没有公共并行汇合，部分路径可能提前结束；请让全部并行分支进入同一汇合。')
        continue
      }
      if (bypass) report(node, 'parallel-bypass', '存在提前结束或绕过公共并行汇合的路径。')
      const union = new Set(regions.flatMap(region => [...region]))
      const shared = regions.some((region, index) => regions.some((other, j) => index !== j && [...region].some(id => other.has(id))))
      const external = [...union, join.id].some(id => (incoming.get(id) ?? []).some(source => source !== node.id && !union.has(source)))
      if (shared || external) report(node, 'parallel-region-crossing', '并行分支在公共汇合前交叉，或汇合包含区域外入线；请检查嵌套并行的各自汇合点。')
    }
  }
  return issues
}
