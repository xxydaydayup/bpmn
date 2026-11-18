import { describe, expect, it } from 'vitest'
import { validateWorkflowModel } from '../src/validation'
import { fromCanvas, toCanvas } from '../src/adapter'
import { layoutWorkflow } from '../src/layout'
import { workflowTemplates } from '../src/templates'
import type { WorkflowModel } from '../src/types'

const basic = workflowTemplates.find(template => template.id === 'parallel-approval')!.model
const nested = (): WorkflowModel => ({
  ...structuredClone(basic),
  nodes: [...structuredClone(basic.nodes),
    { id: 'innerSplit', type: 'parallel', name: '内层分流', x: 100, y: 300 },
    { id: 'innerJoin', type: 'parallel', name: '内层汇合', x: 100, y: 600 },
    { id: 'tax', type: 'approval', name: '税务', x: 50, y: 450 },
    { id: 'risk', type: 'approval', name: '风控', x: 250, y: 450 },
  ],
  flows: [...basic.flows.filter(flow => flow.source !== 'finance'),
    { source: 'finance', target: 'innerSplit' },
    { source: 'innerSplit', target: 'tax' }, { source: 'innerSplit', target: 'risk' },
    { source: 'tax', target: 'innerJoin' }, { source: 'risk', target: 'innerJoin' },
    { source: 'innerJoin', target: 'join' },
  ],
})

describe('parallel models through public validation and roundtrip boundaries', () => {
  it('accepts three branches, gateway-to-gateway nesting and roundtrip layout without changing business data', async () => {
    const model = nested()
    model.nodes.push({ id: 'audit', type: 'approval', name: '审计', x: 600, y: 450, bizJson: '原样' })
    model.flows.push({ source: 'split', target: 'audit' }, { source: 'audit', target: 'join' })
    expect(validateWorkflowModel(model)).toEqual([])
    const canvas = toCanvas(model)
    const arranged = await layoutWorkflow(canvas.nodes, canvas.edges)
    const result = fromCanvas(arranged.nodes, arranged.edges, model)
    expect(result.flows).toEqual(model.flows)
    expect(result.nodes.map(({ x: _x, y: _y, ...node }) => node)).toEqual(model.nodes.map(({ x: _x, y: _y, ...node }) => node))
    expect(validateWorkflowModel(JSON.parse(JSON.stringify(result)))).toEqual([])
    expect(new Set(result.nodes.filter(node => ['tax', 'risk'].includes(node.id)).map(node => node.x)).size).toBe(2)
  })

  it('locates unclosed branches, early endings and branch crossovers', () => {
    const unclosed = structuredClone(basic)
    unclosed.flows = unclosed.flows.map(flow => flow.source === 'legal' ? { ...flow, target: 'end' } : flow)
    expect(validateWorkflowModel(unclosed)).toContainEqual(expect.objectContaining({ code: 'parallel-unclosed', nodeId: 'split' }))
    const bypass = nested()
    bypass.flows.push({ source: 'innerJoin', target: 'end' })
    expect(validateWorkflowModel(bypass)).toContainEqual(expect.objectContaining({ code: 'parallel-bypass', nodeId: 'split' }))
    const crossing = structuredClone(basic)
    crossing.flows.push({ source: 'finance', target: 'legal' })
    expect(validateWorkflowModel(crossing).some(issue => issue.code === 'parallel-check-scope' && issue.severity === 'warning')).toBe(true)
  })

  it('limits static claims for legal choices inside a parallel and preserves ordinary cycle rules', () => {
    const model = structuredClone(basic)
    model.nodes.push({ id: 'choice', type: 'condition', name: '条件', x: 20, y: 20 })
    model.flows = model.flows.filter(flow => flow.source !== 'finance')
    model.flows.push({ source: 'finance', target: 'choice' }, { source: 'choice', target: 'join', conditionExpression: 'amount > 1' }, { source: 'choice', target: 'legal', branch: 'default' })
    const issues = validateWorkflowModel(model)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'parallel-check-scope', severity: 'warning' }))
    expect(issues.filter(issue => issue.code.startsWith('parallel-') && issue.severity !== 'warning')).toEqual([])
    model.flows.push({ source: 'archive', target: 'apply' })
    expect(validateWorkflowModel(model)).toContainEqual(expect.objectContaining({ code: 'cycle' }))
  })

  it('checks recursive regions in their own scope and locates errors on the outer container', () => {
    const child = nested()
    child.flows = child.flows.map(flow => flow.source === 'risk' ? { ...flow, target: 'end' } : flow)
    const model = structuredClone(basic)
    model.nodes[1] = { ...model.nodes[1]!, type: 'subProcess', process: { nodes: child.nodes, flows: child.flows } }
    expect(validateWorkflowModel(model)).toContainEqual(expect.objectContaining({ code: 'parallel-unclosed', nodeId: 'apply', scope: ['apply'] }))
  })
})
