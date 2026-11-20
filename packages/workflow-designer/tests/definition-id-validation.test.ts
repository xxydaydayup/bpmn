import { describe, expect, it } from 'vitest'
import { workflowDefinitionIdIssues } from '../src/definition-id-validation'

describe('designer definition ID validation', () => {
  it('rejects duplicate IDs across nested processes with the complete path and scope', () => {
    const model = { nodes: [
      { id: 'review', type: 'approval' },
      { id: 'outer', type: 'subProcess', process: { nodes: [
        { id: 'inner', type: 'subProcess', process: { nodes: [{ id: 'review', type: 'approval' }] } },
      ] } },
    ] }
    const before = structuredClone(model)
    expect(workflowDefinitionIdIssues(model)).toEqual([{
      code: 'duplicate-definition-id', severity: 'error', message: expect.any(String),
      path: '/nodes/1/process/nodes/0/process/nodes/0/id', scope: ['outer', 'inner'], nodeId: 'review',
    }])
    expect(model).toEqual(before)
  })

  it('uses one namespace for nodes and flows across every process', () => {
    const model = { nodes: [
      { id: 'review', type: 'approval' },
      { id: 'container', type: 'subProcess', process: {
        nodes: [{ id: 'root-flow', type: 'approval' }],
        flows: [{ id: 'review', source: 'root-flow', target: 'root-flow' }],
      } },
    ], flows: [{ id: 'root-flow', source: 'review', target: 'container' }] }
    expect(workflowDefinitionIdIssues(model)).toEqual([
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/1/process/nodes/0/id', nodeId: 'root-flow', scope: ['container'] }),
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/1/process/flows/0/id', edgeId: 'review', scope: ['container'] }),
    ])
  })

  it('requires an ID on each flow without replacing malformed-input diagnostics', () => {
    const model = { flows: [
      { source: 'a', target: 'b' }, { id: undefined }, { id: '' }, { id: '   ' },
      { id: null }, { id: 7 }, null, false,
    ], nodes: [{ id: 'outer', type: 'subProcess', process: { flows: [{}] } }] }
    expect(workflowDefinitionIdIssues(model)).toEqual([
      ...[0, 1, 2, 3].map(index => expect.objectContaining({ code: 'missing-flow-id', severity: 'error', path: `/flows/${index}/id`, scope: [] })),
      expect.objectContaining({ code: 'missing-flow-id', path: '/nodes/0/process/flows/0/id', scope: ['outer'] }),
    ])
  })

  it('ignores processId and reference values while retaining definition IDs', () => {
    const model = { processId: 'review', nodes: [
      { id: 'review', type: 'approval', reminder: { action: 'return', target: 'container' }, bizJson: '{"id":"review"}' },
      { id: 'container', type: 'subProcess', process: { processId: 'review', nodes: [{ id: 'inner', type: 'approval' }] } },
    ], flows: [{ id: 'transition', source: 'review', target: 'container' }] }
    expect(workflowDefinitionIdIssues(model)).toEqual([])
  })

  it('checks each occurrence of a shared process object and shared definitions', () => {
    const process = { nodes: [{ id: 'review', type: 'approval' }], flows: [{ id: 'transition', source: 'review', target: 'review' }] }
    const node = { id: 'shared', type: 'approval' }
    const flow = { id: 'shared-flow', source: 'shared', target: 'shared' }
    const model = { nodes: [
      { id: 'left', type: 'subProcess', process }, { id: 'right', type: 'subProcess', process }, node, node,
    ], flows: [flow, flow] }
    expect(workflowDefinitionIdIssues(model)).toEqual([
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/3/id', nodeId: 'shared', scope: [] }),
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/flows/1/id', edgeId: 'shared-flow', scope: [] }),
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/1/process/nodes/0/id', nodeId: 'review', scope: ['right'] }),
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/1/process/flows/0/id', edgeId: 'transition', scope: ['right'] }),
    ])
  })

  it('stops ancestor cycles and continues checking independent branches', () => {
    const process: { nodes: unknown[]; flows: unknown[] } = { nodes: [], flows: [{}] }
    process.nodes.push({ id: 'loop', type: 'subProcess', process })
    const model = { nodes: [
      { id: 'left', type: 'subProcess', process }, { id: 'right', type: 'subProcess', process },
    ] }
    expect(workflowDefinitionIdIssues(model)).toEqual([
      expect.objectContaining({ code: 'missing-flow-id', path: '/nodes/0/process/flows/0/id', scope: ['left'] }),
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/nodes/1/process/nodes/0/id', nodeId: 'loop', scope: ['right'] }),
      expect.objectContaining({ code: 'missing-flow-id', path: '/nodes/1/process/flows/0/id', scope: ['right'] }),
    ])
  })

  it('skips non-object input and malformed collections without mutation', () => {
    for (const value of [undefined, null, 1, false, 'model', [], { nodes: 'bad', flows: {} }, { nodes: [null, 7, []], flows: [null, 7, []] }]) {
      expect(workflowDefinitionIdIssues(value)).toEqual([])
    }
    expect(workflowDefinitionIdIssues({ nodes: null, flows: [{ id: 'f' }, { id: 'f' }] })).toEqual([
      expect.objectContaining({ code: 'duplicate-definition-id', path: '/flows/1/id', edgeId: 'f', scope: [] }),
    ])
  })
})
