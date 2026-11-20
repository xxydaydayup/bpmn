import type { WorkflowModel, WorkflowSubProcessModel } from './types'
import { workflowDefinitionIdIssues } from './definition-id-validation'

type Data = Record<string, unknown>
const record = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value)

function createUuidV4() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (!cryptoApi?.getRandomValues) throw new Error('当前浏览器不支持安全随机数，无法生成流程元素标识。')
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createWorkflowNodeId(type: string, existingIds: Iterable<string> = []) {
  const prefix = /^[A-Za-z_][A-Za-z0-9_]*$/.test(type) ? type : 'node'
  const existing = new Set(existingIds)
  let id: string
  do { id = `${prefix}_${createUuidV4().replaceAll('-', '')}` } while (existing.has(id))
  return id
}

/** Collect definitions only; references and user-owned processId are excluded. */
export function collectWorkflowDefinitionIds(input: unknown): Set<string> {
  const ids = new Set<string>()
  const seen = new Set<object>()
  const pending = [input]
  while (pending.length) {
    const process = pending.pop()
    if (!record(process) || seen.has(process)) continue
    seen.add(process)
    if (Array.isArray(process.flows)) for (const flow of process.flows) {
      if (record(flow) && typeof flow.id === 'string') ids.add(flow.id)
    }
    if (Array.isArray(process.nodes)) for (const node of process.nodes) {
      if (!record(node)) continue
      if (typeof node.id === 'string') ids.add(node.id)
      if (node.type === 'subProcess') pending.push(node.process)
    }
  }
  return ids
}

type IdMode = 'flows' | 'legacy' | 'copy'

/** Copy process scopes independently, keeping references local and cycles diagnosable. */
function transformIds<T>(input: T, mode: IdMode, existingIds: Iterable<string> = []): T {
  if (!record(input)) return input
  const used = new Set([...collectWorkflowDefinitionIds(input), ...existingIds])
  const reserved = new Set(used)
  const conflictingIds = new Set(workflowDefinitionIdIssues(input)
    .filter(issue => issue.code === 'duplicate-definition-id')
    .map(issue => issue.edgeId ?? issue.nodeId))
  const allocate = (type: string) => {
    const id = createWorkflowNodeId(type, used)
    used.add(id)
    return id
  }
  const output: Data = { ...input }
  const ancestors = new Map<object, Data>()
  const pending: { source: Data; target: Data; leave?: boolean }[] = [{ source: input, target: output }]
  while (pending.length) {
    const { source, target, leave } = pending.pop()!
    if (leave) { ancestors.delete(source); continue }
    ancestors.set(source, target)
    pending.push({ source, target, leave: true })
    const idMap = new Map<string, string>()
    const duplicates = new Set<string>()
    const children: { source: Data; target: Data }[] = []
    if (Array.isArray(source.nodes)) {
      for (const node of source.nodes) if (record(node) && typeof node.id === 'string') {
        if (idMap.has(node.id)) duplicates.add(node.id)
        idMap.set(node.id, node.id)
      }
      // A repeated local ID has ambiguous references. Preserve it for validation.
      target.nodes = source.nodes.map(value => {
        if (!record(value)) return value
        const node = { ...value }
        if (typeof node.id === 'string' && !duplicates.has(node.id)) {
          let next = node.id
          if (mode === 'copy') next = allocate(String(node.type))
          else if (mode === 'legacy' && !conflictingIds.has(node.id)) {
            const prefix = `${node.type}_`
            const suffix = node.id.startsWith(prefix) ? node.id.slice(prefix.length) : ''
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suffix)) {
              const compact = prefix + suffix.replaceAll('-', '')
              next = reserved.has(compact) ? allocate(String(node.type)) : compact
              used.add(next)
            }
          }
          idMap.set(node.id, next)
          node.id = next
        }
        if (node.type === 'subProcess' && record(node.process)) {
          const child = ancestors.get(node.process) ?? { ...node.process }
          if (!ancestors.has(node.process)) children.push({ source: node.process, target: child })
          node.process = child
        }
        return node
      }).map(value => {
        if (!record(value) || !record(value.reminder) || typeof value.reminder.target !== 'string') return value
        return { ...value, reminder: { ...value.reminder, target: idMap.get(value.reminder.target) ?? value.reminder.target } }
      })
    }
    if (Array.isArray(source.flows)) target.flows = source.flows.map(value => {
      if (!record(value)) return value
      return {
        ...value,
        ...(mode === 'copy' || value.id === undefined ? { id: allocate('flow') } : {}),
        ...(typeof value.source === 'string' ? { source: idMap.get(value.source) ?? value.source } : {}),
        ...(typeof value.target === 'string' ? { target: idMap.get(value.target) ?? value.target } : {}),
      }
    })
    pending.push(...children.reverse())
  }
  return output as T
}

export function ensureWorkflowFlowIds<T>(input: T): T {
  return transformIds(input, 'flows')
}

export function cloneWorkflowModelWithFreshNodeIds<T extends WorkflowModel | WorkflowSubProcessModel>(model: T, existingIds: Iterable<string> = []): T {
  return transformIds(model, 'copy', existingIds)
}

export function normalizeLegacyUuidNodeIds<T extends WorkflowModel | WorkflowSubProcessModel>(model: T): T {
  return transformIds(model, 'legacy')
}
