import { describe, expect, it, vi } from 'vitest'
import { cloneWorkflowModelWithFreshNodeIds, collectWorkflowDefinitionIds, createWorkflowNodeId, ensureWorkflowFlowIds, normalizeLegacyUuidNodeIds } from '../src/definition-ids'
import { workflowDefinitionIdIssues } from '../src/definition-id-validation'
import type { WorkflowModel } from '../src/types'

const oldId = 'approval_937c1a82-933b-42b4-92a7-ed676c3de0fc'
const compactId = oldId.replaceAll('-', '')

describe('definition ID allocation', () => {
  it('uses the full namespace when retrying a generated collision', () => {
    const random = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    try {
      expect(createWorkflowNodeId('approval', ['approval_11111111111141118111111111111111']))
        .toBe('approval_22222222222242228222222222222222')
    } finally { random.mockRestore() }
  })

  it('preserves ambiguous same-layer IDs in a template instead of guessing their references', () => {
    const input = { processId: 'user_key', nodes: [{ id: 'a', type: 'approval' }, { id: 'a', type: 'approval' }], flows: [{ source: 'a', target: 'a' }] } as WorkflowModel
    const copied = cloneWorkflowModelWithFreshNodeIds(input)
    expect(copied.nodes.map(node => node.id)).toEqual(['a', 'a'])
    expect(copied.flows[0]).toMatchObject({ source: 'a', target: 'a' })
    expect(workflowDefinitionIdIssues(copied)).toContainEqual(expect.objectContaining({ code: 'duplicate-definition-id' }))
  })

  it('does not silently repair imported cross-layer legacy UUID conflicts', () => {
    const input = { processId: 'user_key', nodes: [
      { id: oldId, type: 'approval' },
      { id: 'container', type: 'subProcess', process: { nodes: [{ id: oldId, type: 'approval' }] } },
    ], flows: [] } as unknown as WorkflowModel
    const normalized = normalizeLegacyUuidNodeIds(input)
    expect(normalized.nodes[0]!.id).toBe(oldId)
    expect(normalized.nodes[1]!.process!.nodes[0]!.id).toBe(oldId)
    expect(workflowDefinitionIdIssues(normalized)).toContainEqual(expect.objectContaining({ code: 'duplicate-definition-id' }))
    const collision = { ...input, flows: [{ id: oldId, source: oldId, target: 'container' }] }
    expect(normalizeLegacyUuidNodeIds(collision).nodes[0]!.id).toBe(oldId)
  })

  it('normalizes a legacy UUID without colliding with a nested compact ID and updates local references', () => {
    const input = { processId: 'user_key', nodes: [
      { id: oldId, type: 'approval' },
      { id: 'container', type: 'subProcess', reminder: { action: 'return', target: oldId }, process: { nodes: [{ id: compactId, type: 'approval' }] } },
    ], flows: [{ source: oldId, target: 'container' }] } as unknown as WorkflowModel
    const normalized = normalizeLegacyUuidNodeIds(input)
    expect(normalized.nodes[0]!.id).toMatch(/^approval_[0-9a-f]{32}$/)
    expect(normalized.nodes[0]!.id).not.toBe(compactId)
    expect(normalized.nodes[1]!.process!.nodes[0]!.id).toBe(compactId)
    expect(normalized.nodes[1]!.reminder!.target).toBe(normalized.nodes[0]!.id)
    expect(normalized.flows[0]!.source).toBe(normalized.nodes[0]!.id)
    expect(workflowDefinitionIdIssues(normalized)).toEqual([])
  })

  it('copies reused process objects independently and keeps malformed cycles diagnosable', () => {
    const process = { nodes: [{ id: 'a', type: 'approval' }, { id: 'b', type: 'approval', reminder: { action: 'return', target: 'a' } }], flows: [{ source: 'a', target: 'b' }] }
    const input = { processId: 'a', nodes: [{ id: 'one', type: 'subProcess', process }, { id: 'two', type: 'subProcess', process }], flows: [] } as unknown as WorkflowModel
    const copied = cloneWorkflowModelWithFreshNodeIds(input)
    const first = copied.nodes[0]!.process!, second = copied.nodes[1]!.process!
    expect(first).not.toBe(second)
    expect(first.nodes[0]!.id).not.toBe(second.nodes[0]!.id)
    expect(first.nodes[1]!.reminder!.target).toBe(first.nodes[0]!.id)
    expect(second.flows![0]!.source).toBe(second.nodes[0]!.id)
    expect(workflowDefinitionIdIssues(copied)).toEqual([])
    expect(copied.processId).toBe('a')
    const cyclic = { processId: 'key', nodes: [] as unknown[] }
    cyclic.nodes.push({ id: 'loop', type: 'subProcess', process: cyclic })
    const normalized = ensureWorkflowFlowIds(cyclic)
    expect((normalized.nodes[0] as { process: unknown }).process).toBe(normalized)
    expect(collectWorkflowDefinitionIds(normalized)).toEqual(new Set(['loop']))
  })
})
