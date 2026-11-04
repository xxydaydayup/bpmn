import { describe, expect, it } from 'vitest'
import fixture from '../src/fixtures/project-approval.json'
import { createDesignDocument, parseWorkflowInput } from '../src/contract'
import { fromCanvas, toCanvas } from '../src/adapter'
import { validateWorkflowModel } from '../src/validation'
import type { WorkflowModel } from '../src/types'

const model = fixture as WorkflowModel

describe('WorkflowModel v1 public contract', () => {
  it('round-trips the real project approval fixture without changing business fields, topology or coordinates', () => {
    const mapped = toCanvas(model)
    expect(fromCanvas(mapped.nodes, mapped.edges, model)).toEqual(model)
  })

  it('wraps a legacy raw model and keeps editor presentation outside the compiler payload', () => {
    const parsed = parseWorkflowInput(model)
    expect(parsed.document).toMatchObject({ format: 'workflow-designer', version: 1 })
    expect(parsed.model).toEqual(model)
    expect(parsed.editor).toEqual({})
  })

  it('round-trips complete design documents and isolates theme, viewport and routes from the model', () => {
    const document = createDesignDocument(model, { viewport: { x: 12, y: 28, zoom: 0.82 }, theme: { accent: '#246957' }, routes: { 'flow-0': [{ x: 10, y: 20 }] }, extensions: { badge: 'demo' } })
    const parsed = parseWorkflowInput(document)
    expect(parsed.document).toEqual(document)
    expect(parsed.unknownPaths).toEqual([])
    const mapped = toCanvas(parsed.model, parsed.editor)
    expect(fromCanvas(mapped.nodes, mapped.edges, parsed.model)).toEqual(model)
  })

  it('recognizes and round-trips service countersign properties as business fields', () => {
    const serviceModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'apply'
        ? { ...node, type: 'service', serviceName: 'stock-check', serviceUrl: 'https://example.com/stock', countersign: true, approveMode: 'VOTE', sequential: true, passRate: '0.7' }
        : node),
    } as WorkflowModel
    const parsed = parseWorkflowInput(serviceModel)
    const mapped = toCanvas(parsed.model)

    expect(parsed.unknownPaths).toEqual([])
    expect(fromCanvas(mapped.nodes, mapped.edges, parsed.model)).toEqual(serviceModel)
    expect(validateWorkflowModel(serviceModel)).toEqual([])
  })

  it('validates the service mode and VOTE rate only when service countersign is enabled', () => {
    const serviceModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'apply'
        ? { ...node, type: 'service', serviceName: 'stock-check', approveMode: 'VOTE' }
        : node),
    } as WorkflowModel
    expect(validateWorkflowModel(serviceModel)).toEqual([])

    const enabled = { ...serviceModel, nodes: serviceModel.nodes.map(node => node.id === 'apply' ? { ...node, countersign: true } : node) }
    expect(validateWorkflowModel(enabled)).toContainEqual(expect.objectContaining({ code: 'service-pass-rate-required', nodeId: 'apply' }))

    const invalidMode = { ...enabled, nodes: enabled.nodes.map(node => node.id === 'apply' ? { ...node, approveMode: 'FIRST' } : node) }
    expect(validateWorkflowModel(invalidMode)).toContainEqual(expect.objectContaining({ code: 'service-approve-mode', nodeId: 'apply' }))

    const invalidRate = { ...enabled, nodes: enabled.nodes.map(node => node.id === 'apply' ? { ...node, approveMode: 'VOTE', passRate: '1.1' } : node) }
    expect(validateWorkflowModel(invalidRate)).toContainEqual(expect.objectContaining({ code: 'pass-rate-range', nodeId: 'apply' }))
  })

  it('round-trips and validates timeout actions and return targets', () => {
    const reminderModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, reminder: { duration: 'PT10M', action: 'return', target: 'apply', name: '超时退回' } }
        : node),
    } as WorkflowModel
    const parsed = parseWorkflowInput(reminderModel)
    const canvas = toCanvas(parsed.model)
    expect(parsed.unknownPaths).toEqual([])
    expect(fromCanvas(canvas.nodes, canvas.edges, parsed.model)).toEqual(reminderModel)
    expect(validateWorkflowModel(reminderModel)).toEqual([])

    const missingTarget = { ...reminderModel, nodes: reminderModel.nodes.map(node => node.id === 'minister' ? { ...node, reminder: { duration: 'PT10M', action: 'return' } } : node) }
    expect(validateWorkflowModel(missingTarget)).toContainEqual(expect.objectContaining({ code: 'reminder-target-required', nodeId: 'minister' }))

    const badDuration = { ...reminderModel, nodes: reminderModel.nodes.map(node => node.id === 'minister' ? { ...node, reminder: { duration: 'ten minutes', action: 'notify' } } : node) }
    expect(validateWorkflowModel(badDuration)).toContainEqual(expect.objectContaining({ code: 'reminder-duration', nodeId: 'minister' }))
  })

  it('retains unknown business fields and node types while preventing compilation through compatibility issues', () => {
    const unknown = { ...model, futureModelField: { mode: 'future' }, nodes: model.nodes.map((node, index) => index === 1 ? { ...node, type: 'futureTask', futureRule: { key: 1 } } : node) } as WorkflowModel
    const parsed = parseWorkflowInput(unknown)
    expect((parsed.document as { model: WorkflowModel }).model).toEqual(unknown)
    expect(parsed.unknownPaths).toContain('model.futureModelField')
    expect(parsed.unknownPaths).toContain('model.nodes[1].futureRule')
    expect(fromCanvas(toCanvas(parsed.model).nodes, toCanvas(parsed.model).edges, parsed.model).nodes[1]).toMatchObject({ futureRule: { key: 1 } })
    expect(validateWorkflowModel(parsed.model)).toContainEqual(expect.objectContaining({ code: 'unknown-node' }))
  })

  it('opens future envelopes read-only and preserves their source object exactly', () => {
    const future = { format: 'workflow-designer', version: 4, model, editor: { viewport: { x: 0, y: 0, zoom: 1 }, futureState: [1, 2, 3] } }
    const parsed = parseWorkflowInput(future)
    expect(parsed.readonly).toBe(true)
    expect(parsed.unsupportedEnvelope).toBe(true)
    expect(parsed.document).toBe(future)
  })

  it('marks invalid structure and links with model-level locations', () => {
    const invalid = { ...model, flows: [{ source: 'absent', target: 'end' }, ...model.flows] }
    expect(validateWorkflowModel(invalid).some(issue => issue.code === 'flow-reference' && issue.edgeId === 'flow-0')).toBe(true)
  })
})
