import { describe, expect, it } from 'vitest'
import fixture from '../src/fixtures/project-approval.json'
import { createDesignDocument, parseWorkflowInput, workflowIssues } from '../src/contract'
import { cloneWorkflowModelWithFreshNodeIds, createNodeRecord, fromCanvas, toCanvas } from '../src/adapter'
import { defineWorkflow, approval, subProcess } from '@workflow/sdk/definition'
import { validateWorkflowModel } from '../src/validation'
import type { WorkflowModel } from '../src/types'
import { WORKFLOW_NODE_TYPES } from '../src/contract'
import { toWorkflowModelInput, toWorkflowCompilerJson } from '../src/compiler-model'

const model = fixture as WorkflowModel

describe('WorkflowModel v1 public contract', () => {
  it('round-trips raw, function-built and design models while copying IDs without interpreting bizJson', () => {
    const bizJson = "  中文 \"review\" <&>\nreview_bizJson = 原样  "
    const functionModel = defineWorkflow({ key: 'nested_data' }, subProcess('outer', subProcess('inner', approval('review', { bizJson }), { bizJson: '内层容器' }), { bizJson: '外层容器' })).toJSON()
    const rawModel = { ...model, nodes: model.nodes.map(node => node.id === 'apply' ? { ...node, bizJson } : node.id === 'minister' ? { ...node, bizJson: '' } : node) }
    for (const input of [rawModel, functionModel]) {
      const parsed = parseWorkflowInput(input)
      expect(parsed.unknownPaths).toEqual([])
      const canvas = toCanvas(parsed.model)
      const roundtrip = fromCanvas(canvas.nodes, canvas.edges, parsed.model)
      const reimported = parseWorkflowInput(JSON.parse(JSON.stringify(createDesignDocument(roundtrip)))).model
      expect(toWorkflowCompilerJson(reimported)).toEqual(toWorkflowCompilerJson(parsed.model))
      const copy = cloneWorkflowModelWithFreshNodeIds(reimported)
      const compare = (before: WorkflowModel['nodes'], after: WorkflowModel['nodes'], root = true) => {
        before.forEach((node, index) => {
          if (root) expect(after[index]!.id).not.toBe(node.id)
          else expect(after[index]!.id).toBe(node.id)
          expect(after[index]!.bizJson).toBe(node.bizJson)
          if (node.process) compare(node.process.nodes, after[index]!.process!.nodes, false)
        })
      }
      compare(reimported.nodes, copy.nodes)
    }
  })

  it('keeps explicit empty and whitespace values and reports invalid nested types without dropping input', () => {
    for (const bizJson of ['', '   ', {}, [], null, 1, true]) {
      const input = { ...model, nodes: model.nodes.map(node => node.id === 'apply' ? { ...node, type: 'subProcess', bizJson: '外层', process: { nodes: [{ id: 'inner', type: 'subProcess', bizJson: '内层', process: { nodes: [{ id: 'review', type: 'approval', bizJson }], flows: [] } }], flows: [] } } : node) } as unknown as WorkflowModel
      const parsed = parseWorkflowInput(createDesignDocument(input))
      const canvas = toCanvas(parsed.model)
      const roundtrip = fromCanvas(canvas.nodes, canvas.edges, parsed.model)
      expect(roundtrip.nodes[1]!.process!.nodes[0]!.process!.nodes[0]!.bizJson).toEqual(bizJson)
      if (typeof bizJson === 'string') expect(() => toWorkflowCompilerJson(roundtrip)).not.toThrow()
      else {
        expect(workflowIssues(roundtrip)).toContainEqual(expect.objectContaining({ code: 'field-type', nodeId: 'apply', scope: ['apply', 'inner'], path: '/nodes/1/process/nodes/0/process/nodes/0/bizJson' }))
        expect(() => toWorkflowCompilerJson(roundtrip)).toThrow()
      }
      roundtrip.nodes[1]!.process!.nodes[0]!.process!.nodes[0]!.futureBusinessData = { keep: true }
      expect(workflowIssues(roundtrip)).toContainEqual(expect.objectContaining({ code: 'unknown-field', nodeId: 'apply', scope: ['apply', 'inner'], path: '/nodes/1/process/nodes/0/process/nodes/0/futureBusinessData' }))
      expect(() => toWorkflowCompilerJson(roundtrip)).toThrow()
      expect(roundtrip.nodes[1]!.process!.nodes[0]!.process!.nodes[0]!.futureBusinessData).toEqual({ keep: true })
    }
  })
  it('recognizes parallel while retaining protocol errors on its outgoing conditions', () => {
    const input = { ...model, nodes: model.nodes.map(node => node.id === 'gwMinister' ? { ...node, type: 'parallel' } : node) } as WorkflowModel
    const before = structuredClone(input)
    const parsed = parseWorkflowInput(input)
    expect(parsed.model).toEqual(before)
    expect(parsed.unknownPaths).toEqual([])
    expect(workflowIssues(parsed.model)).toContainEqual(expect.objectContaining({ code: 'parallel-outgoing-condition' }))
    expect(input).toEqual(before)
  })

  it('strips only editor metadata recursively and keeps nested diagnostics on the outer container', () => {
    const input = { ...model, width: 900, nodes: model.nodes.map(node => node.id === 'apply' ? { ...node, type: 'subProcess', subProcessKey: 'library', process: { width: 400, nodes: [{ id: 'review', type: 'approval', width: 120, allowTransfer: false }], flows: [] } } : node) } as WorkflowModel
    const exported = toWorkflowCompilerJson(input)
    expect(exported).not.toHaveProperty('width')
    expect(exported.nodes[1]).not.toHaveProperty('subProcessKey')
    expect(exported.nodes[1]!.process).toEqual({ nodes: [{ id: 'review', type: 'approval', width: 120, allowTransfer: false }], flows: [] })
    input.nodes[1]!.process!.nodes[0]!.futurePolicy = { retain: true }
    expect(() => toWorkflowCompilerJson(input)).toThrow()
    expect(workflowIssues(input)).toContainEqual(expect.objectContaining({ code: 'unknown-field', nodeId: 'apply', scope: ['apply'], path: '/nodes/1/process/nodes/0/futurePolicy' }))
    expect(input.nodes[1]!.process!.nodes[0]!.futurePolicy).toEqual({ retain: true })
  })

  it('handles cyclic and malformed nested input without hanging or dropping it', () => {
    const cyclic = structuredClone(model)
    cyclic.nodes[1] = { ...cyclic.nodes[1]!, type: 'subProcess', process: cyclic }
    expect(() => toWorkflowCompilerJson(cyclic)).toThrow()
    const input = { ...model, nodes: model.nodes.map(node => node.id === 'apply' ? { ...node, type: 'subProcess', process: { nodes: [null], flows: [null] } } : node) } as unknown as WorkflowModel
    expect(parseWorkflowInput(input).model.nodes[1]!.process!.nodes).toEqual([null])
    expect(workflowIssues(input)).toContainEqual(expect.objectContaining({ code: 'field-type', path: '/nodes/1/process/nodes/0' }))
    expect(toWorkflowModelInput(input)).toMatchObject({ nodes: expect.any(Array) })
  })

  it('derives known runtime node types from the exhaustive built-in definitions', () => {
    expect(WORKFLOW_NODE_TYPES).toEqual(['start', 'approval', 'countersign', 'service', 'receive', 'timer', 'condition', 'parallel', 'subProcess', 'end'])
  })

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

  it('recognizes bizType as optional node metadata and preserves it through model and design document round-trips', () => {
    const businessModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'apply' ? { ...node, bizType: '  procurement.request  ' } : node),
    } as WorkflowModel
    const parsed = parseWorkflowInput(businessModel)
    const canvas = toCanvas(parsed.model)
    const exported = fromCanvas(canvas.nodes, canvas.edges, parsed.model)
    const designDocument = createDesignDocument(exported, { viewport: { x: 12, y: 28, zoom: 0.82 } })
    const reparsed = parseWorkflowInput(designDocument)

    expect(parsed.unknownPaths).toEqual([])
    expect(reparsed.unknownPaths).toEqual([])
    expect(reparsed.model.nodes.find(node => node.id === 'apply')?.bizType).toBe('  procurement.request  ')
    expect(fromCanvas(toCanvas(reparsed.model).nodes, toCanvas(reparsed.model).edges, reparsed.model)).toEqual(businessModel)
    expect(parseWorkflowInput(model).unknownPaths).toEqual([])
  })

  it('accepts recursive subProcess snapshots and reports unknown data at the nested path', () => {
    const nested = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, type: 'subProcess', process: { nodes: [{ id: 'inner', type: 'approval', name: '内层审批', x: 20, y: 30, futureInner: true }], flows: [{ id: 'inner-flow', source: 'inner', target: 'inner' }] } }
        : node),
    } as WorkflowModel
    const parsed = parseWorkflowInput(nested)
    expect(parsed.unknownPaths).toContain('model.nodes[2].process.nodes[0].futureInner')
    expect(parsed.unknownPaths).not.toContain('model.nodes[2].process.flows[0].id')
    const canvas = toCanvas(parsed.model)
    expect(fromCanvas(canvas.nodes, canvas.edges, parsed.model).nodes.find(node => node.id === 'minister')?.process).toEqual(nested.nodes[2]?.process)
    expect(validateWorkflowModel(parsed.model)).toContainEqual(expect.objectContaining({ code: 'subprocess-flow-self-link', nodeId: 'minister' }))
  })

  it('accepts backend business JSON with omitted processName/flows and fills designer-only defaults', () => {
    const backendInput = { processId: 'compact', nodes: [{ id: 'approve', type: 'approval' }] }
    const parsed = parseWorkflowInput(backendInput)
    expect(parsed.model).toMatchObject({ processId: 'compact', processName: 'compact', nodes: [{ id: 'approve', name: '', x: 300, y: 80 }], flows: [] })
    expect(parsed.unknownPaths).toEqual([])
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

  it('round-trips message and timer wait nodes with backend field names and timer defaults', () => {
    const eventModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, type: 'receive', messageName: 'approval.finished' }
        : node.id === 'gwMinister'
          ? { ...node, type: 'timer', timerType: 'duration', timerValue: 'PT30M' }
          : node),
      flows: model.flows.map(flow => flow.source === 'gwMinister' ? { ...flow, conditionExpression: flow.branch === 'reject' ? 'false' : 'true' } : flow),
    } as WorkflowModel
    const parsed = parseWorkflowInput(eventModel)
    const canvas = toCanvas(parsed.model)
    expect(parsed.unknownPaths).toEqual([])
    expect(fromCanvas(canvas.nodes, canvas.edges, parsed.model)).toEqual(eventModel)
    expect(validateWorkflowModel(eventModel)).toEqual([])
    expect(createNodeRecord('timer', 'timer_1', 20, 30)).toMatchObject({ timerType: 'duration', timerValue: 'PT30M' })
  })

  it('validates timer values by the selected condition and allows runtime values to stay empty', () => {
    const timer = { ...model, nodes: model.nodes.map(node => node.id === 'minister'
      ? { ...node, type: 'timer', timerType: 'duration', timerValue: '' }
      : node), flows: model.flows.map(flow => flow.source === 'gwMinister' ? { ...flow, conditionExpression: flow.branch === 'reject' ? 'false' : 'true' } : flow) } as WorkflowModel
    expect(validateWorkflowModel(timer)).toEqual([])
    const date = { ...timer, nodes: timer.nodes.map(node => node.id === 'minister' ? { ...node, timerType: 'date', timerValue: '2026-12-31T23:59:59' } : node) }
    expect(validateWorkflowModel(date)).toEqual([])
    const cycle = { ...timer, nodes: timer.nodes.map(node => node.id === 'minister' ? { ...node, timerType: 'cycle', timerValue: 'R3/PT10H' } : node) }
    expect(validateWorkflowModel(cycle)).toEqual([])
    const invalid = { ...timer, nodes: timer.nodes.map(node => node.id === 'minister' ? { ...node, timerType: 'duration', timerValue: 'tomorrow' } : node) }
    expect(validateWorkflowModel(invalid)).toContainEqual(expect.objectContaining({ code: 'timer-value-format', nodeId: 'minister' }))
  })

  it('keeps node property issues in their node definitions and reports one issue per invalid property', () => {
    const invalid = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, type: 'timer', timerType: 'duration', timerValue: 20 }
        : node.id === 'apply'
          ? { ...node, type: 'service', serviceUrl: 'ftp://invalid.example' }
          : node.id === 'gwMinister'
            ? { ...node, type: 'receive', messageName: 42 }
            : node),
    } as unknown as WorkflowModel

    const issues = validateWorkflowModel(invalid)
    expect(issues.filter(issue => issue.code === 'timer-value-type')).toHaveLength(1)
    expect(issues.filter(issue => issue.code === 'service-url')).toHaveLength(1)
    expect(issues.filter(issue => issue.code === 'message-name-type')).toHaveLength(1)
    expect(workflowIssues(invalid).filter(issue => issue.code === 'timer-value-type')).toHaveLength(1)
  })

  it('validates reminder targets with full workflow context exactly once', () => {
    const reminderModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, reminder: { action: 'return', target: 'missing' } }
        : node),
    } as WorkflowModel
    expect(validateWorkflowModel(reminderModel).filter(issue => issue.code === 'reminder-target-invalid')).toHaveLength(1)

    const unsupportedReminder = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, type: 'receive', reminder: { action: 'return', target: 'missing' } }
        : node),
    } as WorkflowModel
    const issues = validateWorkflowModel(unsupportedReminder)
    expect(issues.filter(issue => issue.code === 'reminder-node-type')).toHaveLength(1)
    expect(issues.filter(issue => issue.code === 'reminder-target-invalid')).toHaveLength(1)
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

  it('keeps reminder duration optional and permits a service node as a return target', () => {
    const reminderModel = {
      ...model,
      nodes: model.nodes.map(node => node.id === 'minister'
        ? { ...node, reminder: { action: 'return', target: 'apply' } }
        : node.id === 'apply'
          ? { ...node, type: 'service' }
          : node),
    } as WorkflowModel
    expect(validateWorkflowModel(reminderModel).some(issue => issue.code.startsWith('reminder-'))).toBe(false)
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
