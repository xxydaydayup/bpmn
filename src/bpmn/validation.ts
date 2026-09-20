import type { ValidationIssue } from './types'
import type { ApprovalSnapshot } from './approval'

export interface WorkflowNode {
  id: string
  type: string
  assignee?: string
  defaultFlowId?: string
  advanced?: boolean
  approval?: ApprovalSnapshot
}

export interface WorkflowFlow {
  id: string
  sourceId?: string
  targetId?: string
  condition?: string
}

export interface WorkflowProcess {
  id: string
  nodes: WorkflowNode[]
  flows: WorkflowFlow[]
}

export function isValidBpmnId(id: string): boolean {
  return /^[\p{L}_][\p{L}\p{N}\p{M}_.\-\u00B7]*$/u.test(id)
}

const supportedTypes = new Set(['bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:UserTask', 'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway'])

/** Structural checks only: condition bodies are opaque until an engine is selected. */
export function validateWorkflow(processes: WorkflowProcess[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (code: string, elementId: string, message: string, severity: ValidationIssue['severity'] = 'error') => {
    issues.push({ code, elementId, message, severity })
  }
  if (!processes.length) add('missing-process', '', '未找到可检查的流程')
  if (processes.length > 1) add('multiple-processes', processes[0]!.id, '多流程协作超出首批检查范围；以下只检查各流程的基础结构', 'warning')

  const ids = new Set<string>()
  for (const process of processes) {
    for (const item of [process, ...process.nodes, ...process.flows]) {
      if (!isValidBpmnId(item.id)) add('invalid-id', item.id, '标识不合法：以字母或下划线开头，使用字母、数字、下划线、点或短横线')
      if (ids.has(item.id)) add('duplicate-id', item.id, `标识重复：${item.id}`)
      ids.add(item.id)
    }
    for (const node of process.nodes) {
      if (node.type === 'bpmn:UserTask') {
        if ((!node.approval || node.approval.mode === 'single') && !node.assignee?.trim()) add('missing-assignee', node.id, '人工任务缺少办理人')
        for (const issue of node.approval?.issues ?? []) add(issue.code, node.id, issue.message, issue.severity)
      }
    }
    const advancedNodes = process.nodes.filter(node => !supportedTypes.has(node.type) || node.advanced)
    if (advancedNodes.length) {
      for (const node of advancedNodes) add('unsupported-node', node.id, '包含超出基础审批范围的节点或事件；该流程的路径语义未检查', 'warning')
      continue
    }
    const starts = process.nodes.filter(node => node.type === 'bpmn:StartEvent')
    const ends = process.nodes.filter(node => node.type === 'bpmn:EndEvent')
    if (!starts.length) add('missing-start', process.id, '流程缺少开始事件')
    if (!ends.length) add('missing-end', process.id, '流程缺少结束事件')
    const nodes = new Map(process.nodes.map(node => [node.id, node]))
    const incoming = new Map(process.nodes.map(node => [node.id, [] as WorkflowFlow[]]))
    const outgoing = new Map(process.nodes.map(node => [node.id, [] as WorkflowFlow[]]))
    for (const flow of process.flows) {
      if (!flow.sourceId || !nodes.has(flow.sourceId) || !flow.targetId || !nodes.has(flow.targetId)) {
        add('invalid-connection', flow.id, '连线缺少有效的来源或目标节点')
        continue
      }
      outgoing.get(flow.sourceId)!.push(flow)
      incoming.get(flow.targetId)!.push(flow)
    }
    for (const node of process.nodes) {
      const ins = incoming.get(node.id)!
      const outs = outgoing.get(node.id)!
      if (node.type !== 'bpmn:StartEvent' && !ins.length) add('missing-incoming', node.id, '节点没有入线')
      if (node.type !== 'bpmn:EndEvent' && !outs.length) add('missing-outgoing', node.id, '节点没有出线')
      if (node.type === 'bpmn:StartEvent' && ins.length) add('start-incoming', node.id, '开始事件不应有入线')
      if (node.type === 'bpmn:EndEvent' && outs.length) add('end-outgoing', node.id, '结束事件不应有出线')
      const defaultFlow = outs.find(flow => flow.id === node.defaultFlowId)
      if (node.defaultFlowId && !defaultFlow) add('invalid-default', node.id, '默认分支未指向本节点的有效出线')
      if (defaultFlow?.condition?.trim()) add('default-condition', defaultFlow.id, '默认分支不能同时配置条件')
      if (node.type === 'bpmn:ParallelGateway') {
        if (node.defaultFlowId) add('parallel-default', node.id, '并行网关不能设置默认分支')
        for (const flow of outs) if (flow.condition?.trim()) add('parallel-condition', flow.id, '并行出线不能配置条件；按结果选择路径请使用排他网关')
      }
      if (node.type === 'bpmn:ExclusiveGateway' && outs.length > 1) {
        for (const flow of outs) {
          if (flow.id !== node.defaultFlowId && !flow.condition?.trim()) add('missing-condition', flow.id, '排他网关的非默认分支缺少条件')
        }
        if (!node.defaultFlowId) add('missing-default', node.id, '未设置默认分支；条件全部不满足时可能无法继续', 'warning')
      } else if (node.type === 'bpmn:UserTask' && outs.length > 1) {
        add('implicit-branch', node.id, '人工任务有多条出线；建议使用排他网关明确分支规则', 'warning')
      }
    }
    const visit = (seed: WorkflowNode[], reverse: boolean) => {
      const visited = new Set<string>()
      const queue = seed.map(node => node.id)
      while (queue.length) {
        const id = queue.pop()!
        if (visited.has(id)) continue
        visited.add(id)
        for (const flow of (reverse ? incoming : outgoing).get(id) ?? []) {
          const next = reverse ? flow.sourceId : flow.targetId
          if (next) queue.push(next)
        }
      }
      return visited
    }
    const reachable = visit(starts, false)
    const canFinish = visit(ends, true)
    for (const node of process.nodes) {
      if (starts.length && !reachable.has(node.id)) add('unreachable', node.id, '从开始事件无法到达此节点')
      if (ends.length && !canFinish.has(node.id)) add('no-end-path', node.id, '此节点没有通向结束事件的路径')
    }
    checkParallelRegions(process.nodes, incoming, outgoing, add)
  }
  return issues
}

/** A branch must contribute exactly one token through one incoming edge of its join. */
function checkParallelRegions(
  allNodes: WorkflowNode[], incoming: Map<string, WorkflowFlow[]>, outgoing: Map<string, WorkflowFlow[]>,
  add: (code: string, id: string, message: string, severity?: 'error' | 'warning') => void,
) {
  const nodes = new Map(allNodes.map(node => [node.id, node]))
  const parallel = allNodes.filter(node => node.type === 'bpmn:ParallelGateway')
  const ins = (id: string) => incoming.get(id) ?? []
  const outs = (id: string) => outgoing.get(id) ?? []
  const splits = parallel.filter(node => ins(node.id).length === 1 && outs(node.id).length > 1)
  const joins = parallel.filter(node => ins(node.id).length > 1 && outs(node.id).length === 1)
  for (const gateway of parallel) {
    if (!splits.includes(gateway) && !joins.includes(gateway)) add('parallel-shape', gateway.id, '并行网关须为一入多出的分叉，或多入一出的汇合')
  }
  const regions = splits.map(split => ({ split, branches: outs(split.id).map(entry => {
    const visited = new Set<string>()
    const boundaries = new Map<string, Set<string>>()
    const pending = [entry]
    while (pending.length) {
      const flow = pending.pop()!
      const node = nodes.get(flow.targetId!)!
      if (node.type === 'bpmn:ParallelGateway') {
        if (!boundaries.has(node.id)) boundaries.set(node.id, new Set())
        boundaries.get(node.id)!.add(flow.id)
        continue
      }
      if (visited.has(node.id)) continue
      visited.add(node.id)
      pending.push(...outs(node.id))
    }
    return { entry, visited, boundaries }
  }) }))
  // Nested fork/join matching is intentionally outside this batch's safety claim.
  const nested = regions.filter(({ split, branches }) => branches.some(branch =>
    [...branch.boundaries.keys()].some(id => id !== split.id && splits.some(node => node.id === id))))
  if (nested.length) {
    for (const { split } of nested) add('nested-parallel', split.id, '包含嵌套并行；该流程仅检查基础连接，未验证并行配对与等待语义', 'warning')
    return
  }
  const owners = new Map<string, string>()
  for (const { split, branches } of regions) {
    const boundaryIds = new Set(branches.flatMap(branch => [...branch.boundaries.keys()]))
    const joinId = [...boundaryIds][0]
    const join = joins.find(node => node.id === joinId)
    if (boundaryIds.size !== 1 || !join || branches.some(branch => !branch.boundaries.has(join.id))) {
      add('parallel-unmatched', split.id, '各并行分支必须到达同一个并行汇合，不能跨分支或直接返回申请节点')
      continue
    }
    if (owners.has(join.id)) add('parallel-shared-join', join.id, '一个并行汇合不能接收不同并行分叉的分支')
    owners.set(join.id, split.id)
    const membership = new Map<string, number>()
    for (const [index, branch] of branches.entries()) {
      for (const id of branch.visited) {
        if (membership.has(id)) add('parallel-cross-branch', id, '并行分支在汇合之前发生交叉或提前合流')
        membership.set(id, index)
        if (!outs(id).length || nodes.get(id)?.type === 'bpmn:StartEvent') add('parallel-escape', id, '并行分支不能提前结束或退回开始；请先到达并行汇合')
        if (outs(id).length > 1 && nodes.get(id)?.type !== 'bpmn:ExclusiveGateway') add('parallel-implicit-split', id, '分支内多条出线须由排他网关选择，避免产生额外并行路径')
        for (const flow of ins(id)) {
          if (!branch.visited.has(flow.sourceId!) && flow.id !== branch.entry.id) add('parallel-foreign-entry', flow.id, '并行分支存在从外部或其他分支进入的连线')
        }
      }
      // Detect cycles without recursion; even a loop with an exit is unsupported inside a branch.
      const degrees = new Map([...branch.visited].map(id => [id, ins(id).filter(flow => branch.visited.has(flow.sourceId!)).length]))
      const queue = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id)
      let consumed = 0
      while (queue.length) {
        const id = queue.pop()!
        consumed++
        for (const flow of outs(id)) if (degrees.has(flow.targetId!)) {
          const degree = degrees.get(flow.targetId!)! - 1
          degrees.set(flow.targetId!, degree)
          if (!degree) queue.push(flow.targetId!)
        }
      }
      if (consumed !== branch.visited.size) add('parallel-branch-loop', branch.entry.targetId!, '并行分支内存在回路；退回重提应放在汇合之后')
      if (branch.boundaries.get(join.id)!.size !== 1) add('parallel-alternative-join', join.id, '每条并行分支须先独立合流，再以一条出线接入并行汇合，避免等待未选择的路径')
    }
    const expectedEdges = new Set(branches.flatMap(branch => [...branch.boundaries.get(join.id)!]))
    if (ins(join.id).length !== branches.length || ins(join.id).some(flow => !expectedEdges.has(flow.id))) {
      add('parallel-join-inputs', join.id, '并行汇合的入线与分支不一一对应，可能等待无法到达的路径')
    }
  }
  for (const join of joins) if (!owners.has(join.id)) add('parallel-orphan-join', join.id, '并行汇合缺少对应的并行分叉；排他选择不能直接接入并行汇合')
}
