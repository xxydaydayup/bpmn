import { toBpmnCompilerJson, WorkflowModelError } from '@workflow/sdk'
import type { WorkflowModel } from './types'
import { ensureWorkflowFlowIds } from './definition-ids'
import { workflowDefinitionIdIssues } from './definition-id-validation'

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Remove only editor-owned fields. Unknown business data must reach SDK validation. */
export function toWorkflowModelInput(input: unknown): unknown {
  if (!isRecord(input)) return input
  const root: Record<string, unknown> = {}
  const copies = new WeakMap<object, Record<string, unknown>>([[input, root]])
  const pending = [{ source: input, target: root, nested: false }]
  while (pending.length) {
    const { source, target, nested } = pending.pop()!
    for (const [key, value] of Object.entries(source)) {
      if (key !== 'width' && key !== 'height' && !(nested && ['processId', 'processName'].includes(key))) Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
    }
    if (!Array.isArray(source.nodes)) continue
    target.nodes = source.nodes.map((value: unknown) => {
      if (!isRecord(value)) return value
      const { subProcessKey: _key, subProcessName: _name, subProcessSourceJson: _source, ...node } = value
      if (node.type === 'subProcess' && isRecord(node.process)) {
        const original = node.process
        let child = copies.get(original)
        if (!child) {
          child = {}
          copies.set(original, child)
          pending.push({ source: original, target: child, nested: true })
        }
        node.process = child
      }
      return node
    })
  }
  return root
}

export function toWorkflowCompilerJson(model: WorkflowModel) {
  const candidate = ensureWorkflowFlowIds(toWorkflowModelInput(model))
  const result = toBpmnCompilerJson(candidate)
  const issues = workflowDefinitionIdIssues(result)
  if (issues.length) throw new WorkflowModelError(issues.map(issue => ({ ...issue, path: issue.path ?? '', severity: issue.severity ?? 'error' })))
  return result
}
