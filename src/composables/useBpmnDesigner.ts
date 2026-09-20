import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'
import Modeler from 'bpmn-js/lib/Modeler'
import type { Element, Label, Shape, Connection, ModdleElement } from 'bpmn-js/lib/model/Types'
import type CommandStack from 'diagram-js/lib/command/CommandStack'
import type ElementFactory from 'bpmn-js/lib/features/modeling/ElementFactory'
import { is } from 'bpmn-js/lib/util/ModelUtil'
import workflowDescriptor from '@/bpmn/workflow-moddle.json'
import initialDiagram from '@/bpmn/requirement-process.bpmn?raw'
import { createDiagramThemeOptions } from '@/bpmn/modules'
import { diagramTheme } from '@/bpmn/theme'
import { presentNode } from '@/bpmn/icons'
import { assessLayout, createLayoutGraph, readLayoutPlan, supportedLayoutTypes, type LayoutSnapshot } from '@/bpmn/layout'
import LayoutRunner from '@/bpmn/LayoutRunner'
import LayoutCommand from '@/bpmn/LayoutCommand'
import type { NodeProperties, NodePropertyField, ValidationIssue } from '@/bpmn/types'
import { isValidBpmnId, validateWorkflow, type WorkflowProcess } from '@/bpmn/validation'
import { approvalPatch, readApproval } from '@/bpmn/approval'

interface ElementRegistry {
  get(id: string): Element | undefined
  getAll(): Element[]
}

interface DiagramBounds { x: number; y: number; width: number; height: number }
interface Canvas {
  getRootElement(): Element
  scrollToElement(element: Element): void
  zoom(): number
  zoom(scale: number, center?: 'auto'): number
  resized(): void
  viewbox(force?: false): DiagramBounds & { inner: DiagramBounds; outer: { width: number; height: number } }
  viewbox(bounds: DiagramBounds): void
}

const propertyNames: Partial<Record<NodePropertyField, string>> = {
  name: 'name', assignee: 'wf:assignee', formKey: 'wf:formKey',
}

export function useBpmnDesigner(container: Ref<HTMLDivElement | undefined>) {
  const ready = ref(false)
  const initialized = ref(false)
  const busy = ref(false)
  const error = ref('')
  const warning = ref('')
  const canUndo = ref(false)
  const canRedo = ref(false)
  const selectedNode = shallowRef<NodeProperties | null>(null)
  const propertyError = ref('')
  const validationIssues = shallowRef<ValidationIssue[]>([])
  const hasValidated = ref(false)
  const processName = ref('流程设计')
  const diagramCounts = ref({ nodes: 0, flows: 0 })
  const zoomPercent = ref(100)
  const canArrange = ref(false)
  const layoutReason = ref('')
  const layoutStatus = ref('')
  let modeler: Modeler | undefined
  let activeElement: Element | undefined
  let disposed = false
  let successfulParses = 0
  const layoutRunner = new LayoutRunner()
  let resizeObserver: ResizeObserver | undefined
  const layoutSettings = { ...diagramTheme.layout, width: diagramTheme.card.width, height: diagramTheme.card.height }

  function snapshotLayout(): LayoutSnapshot {
    if (!modeler) return { id: 'empty', nodes: [], edges: [], unsupported: [] }
    const root = modeler.get<Canvas>('canvas').getRootElement()
    const definitions = modeler.getDefinitions()
    if (!root?.businessObject || !definitions) return { id: 'empty', nodes: [], edges: [], unsupported: [] }
    const unsupported = new Set<string>()
    if (!is(root, 'bpmn:Process')) unsupported.add('泳池或协作图')
    if (definitions.rootElements.filter((item: ModdleElement) => is(item, 'bpmn:Process')).length !== 1 || definitions.diagrams.length !== 1) unsupported.add('多流程或多图平面')
    if (root.businessObject.laneSets?.length) unsupported.add('泳道')
    const elements = modeler.get<ElementRegistry>('elementRegistry').getAll().filter(item => item !== root && !item.labelTarget && item.type !== 'label')
    const nodes: LayoutSnapshot['nodes'] = []
    const edges: LayoutSnapshot['edges'] = []
    const readLabel = (item: Element) => {
      const label = item.label as Label | undefined
      return label && !label.hidden && item.businessObject.name ? { id: label.id, text: item.businessObject.name as string, width: Math.max(label.width, 30), height: Math.max(label.height, 16) } : undefined
    }
    for (const item of elements) {
      if (item.parent !== root) unsupported.add('嵌套图形')
      if (is(item, 'bpmn:SequenceFlow')) {
        const edge = item as Connection
        edges.push({ id: edge.id, source: edge.source?.id ?? '', target: edge.target?.id ?? '', label: readLabel(edge) })
      } else if (supportedLayoutTypes.has(item.type)) {
        const node = item as Shape
        if (node.businessObject.eventDefinitions?.length) unsupported.add('带事件定义的事件')
        nodes.push({ id: node.id, type: node.type, x: node.x, y: node.y, width: node.width, height: node.height, label: readLabel(node) })
      } else unsupported.add(({ 'bpmn:SubProcess': '子流程', 'bpmn:Lane': '泳道', 'bpmn:BoundaryEvent': '边界事件', 'bpmn:TextAnnotation': '注释', 'bpmn:Group': '分组' } as Record<string, string>)[item.type] ?? item.type.replace('bpmn:', ''))
    }
    return { id: root.id, nodes, edges, unsupported: [...unsupported] }
  }

  function syncDiagram() {
    if (!modeler?.getDefinitions()) return
    const snapshot = snapshotLayout()
    const capability = assessLayout(snapshot, layoutSettings)
    canArrange.value = capability.supported
    layoutReason.value = capability.reason
    const elements = modeler.get<ElementRegistry>('elementRegistry').getAll().filter(item => !item.labelTarget)
    diagramCounts.value = { nodes: elements.filter(item => is(item, 'bpmn:FlowNode')).length, flows: elements.filter(item => is(item, 'bpmn:SequenceFlow')).length }
    processName.value = modeler.get<Canvas>('canvas').getRootElement()?.businessObject?.name || '未命名流程'
  }

  async function applyLayout(force: boolean): Promise<string> {
    if (!modeler) return ''
    const snapshot = snapshotLayout()
    const capability = assessLayout(snapshot, layoutSettings)
    if (!capability.supported) return capability.reason
    if (!force && !capability.needsResize) return ''
    const result = await layoutRunner.run(createLayoutGraph(snapshot, layoutSettings))
    if (disposed || !modeler) return ''
    const plan = readLayoutPlan(result, snapshot)
    modeler.get<CommandStack>('commandStack').execute('diagram.applyLayout', { plan })
    layoutStatus.value = '布局已整理'
    return ''
  }

  async function arrangeLayout() {
    if (!modeler || !ready.value || busy.value || !canArrange.value) return false
    busy.value = true
    try {
      const notice = await applyLayout(true)
      if (disposed) return false
      if (notice) { warning.value = notice; return false }
      fitViewport()
      return true
    } catch (cause) {
      if (!disposed) warning.value = `整理失败，已保留原布局：${cause instanceof Error ? cause.message : '布局不可用'}`
      return false
    } finally { if (!disposed) { busy.value = false; syncHistory(); syncDiagram() } }
  }

  function zoomBy(step: number) {
    if (!modeler || busy.value || !ready.value) return
    const canvas = modeler.get<Canvas>('canvas')
    canvas.zoom(Math.min(3, Math.max(.2, canvas.zoom() + step)), 'auto')
  }

  function activateHand(event: MouseEvent) {
    if (!busy.value && ready.value) modeler?.get<{ activateHand(event: Event): void }>('handTool').activateHand(event)
  }

  function createNode(type: string, event?: MouseEvent | TouchEvent) {
    if (!modeler || busy.value || !ready.value || !supportedLayoutTypes.has(type)) return
    try {
      const shape = modeler.get<ElementFactory>('elementFactory').createShape({ type })
      shape.businessObject.name = presentNode(type).label
      if (event) modeler.get<{ start(event: Event, shape: Shape): void }>('create').start(event, shape)
      else {
        const canvas = modeler.get<Canvas>('canvas'), view = canvas.viewbox(false), root = canvas.getRootElement()
        const position = { x: view.x + view.width / 2, y: view.y + view.height / 2 }
        const allowed = modeler.get<{ allowed(action: string, context: unknown): boolean }>('rules').allowed('shape.create', { shape, target: root, position })
        if (!allowed) { warning.value = '请将节点拖入目标泳池或子流程。'; return }
        modeler.get<{ createShape(shape: Shape, position: { x: number; y: number }, parent: Element): void }>('modeling').createShape(shape, position, root)
        modeler.get<{ select(element: Element): void }>('selection').select(shape)
      }
    } catch (cause) { propertyError.value = cause instanceof Error ? cause.message : '节点创建失败' }
  }

  function processElement() {
    const root = modeler?.get<Canvas>('canvas').getRootElement()
    return root && is(root, 'bpmn:Process') ? root : undefined
  }

  function checkWorkflow(): ValidationIssue[] {
    const definitions = modeler?.getDefinitions()
    const processes: WorkflowProcess[] = (definitions?.rootElements ?? [])
      .filter((item: ModdleElement) => is(item, 'bpmn:Process'))
      .map((process: ModdleElement) => ({
        id: process.id ?? '',
        nodes: (process.flowElements ?? []).filter((item: ModdleElement) => is(item, 'bpmn:FlowNode'))
          .map((item: ModdleElement) => ({
            id: item.id ?? '', type: item.$type, assignee: item.get('wf:assignee'), defaultFlowId: item.default?.id,
            approval: is(item, 'bpmn:UserTask') ? readApproval(item) : undefined,
            advanced: !!(item.eventDefinitions?.length || item.isForCompensation
              || (item.loopCharacteristics && item.loopCharacteristics.$type !== 'bpmn:MultiInstanceLoopCharacteristics')),
          })),
        flows: (process.flowElements ?? []).filter((item: ModdleElement) => is(item, 'bpmn:SequenceFlow'))
          .map((item: ModdleElement) => ({
            id: item.id ?? '', sourceId: item.sourceRef?.id, targetId: item.targetRef?.id,
            condition: item.conditionExpression?.body,
          })),
      }))
    validationIssues.value = validateWorkflow(processes)
    hasValidated.value = true
    return validationIssues.value
  }

  function showProcessProperties() {
    if (!modeler || busy.value) return
    modeler.get<{ select(elements: Element[]): void }>('selection').select([])
    activeElement = processElement()
    propertyError.value = ''
    syncSelection()
  }

  function locateElement(id: string) {
    if (!modeler || busy.value) return
    const element = modeler.get<ElementRegistry>('elementRegistry').get(id)
    if (!element) return
    if (is(element, 'bpmn:Process')) showProcessProperties()
    else {
      modeler.get<{ select(element: Element): void }>('selection').select(element)
      modeler.get<Canvas>('canvas').scrollToElement(element)
    }
  }

  function syncSelection() {
    if (!activeElement) activeElement = processElement()
    if (!activeElement) {
      selectedNode.value = null
      return
    }
    const businessObject = activeElement.businessObject
    const flow = is(activeElement, 'bpmn:SequenceFlow')
    const gateway = flow ? businessObject.sourceRef : businessObject
    const readString = (key: string): string => {
      const value: unknown = businessObject.get(key)
      return typeof value === 'string' ? value : ''
    }
    selectedNode.value = {
      kind: is(activeElement, 'bpmn:Process') ? 'process' : flow ? 'flow' : 'node',
      id: activeElement.id,
      type: activeElement.type,
      name: readString('name'),
      assignee: readString('wf:assignee'),
      formKey: readString('wf:formKey'),
      isUserTask: is(activeElement, 'bpmn:UserTask'),
      approval: readApproval(businessObject),
      supportsConditions: !!gateway && is(gateway, 'bpmn:ExclusiveGateway'),
      conditionExpression: businessObject.conditionExpression?.body ?? '',
      conditionLanguage: businessObject.conditionExpression?.language ?? '',
      isDefault: flow && gateway?.default === businessObject,
      defaultFlowId: gateway?.default?.id ?? '',
      outgoingFlows: !flow && is(businessObject, 'bpmn:ExclusiveGateway')
        ? (businessObject.outgoing ?? []).map((item: ModdleElement) => ({ id: item.id, label: item.name || item.targetRef?.name || item.id }))
        : [],
    }
  }

  function syncHistory() {
    const stack = modeler?.get<CommandStack>('commandStack')
    canUndo.value = stack?.canUndo() ?? false
    canRedo.value = stack?.canRedo() ?? false
  }

  function fitViewport() {
    if (!modeler || !container.value) return
    const canvas = modeler.get<Canvas>('canvas')
    const { inner, outer } = canvas.viewbox(false)
    if (!inner.width || !inner.height || !outer.width || !outer.height) return
    const left = 40
    const availableWidth = Math.max(1, outer.width - left - 40)
    const scale = Math.min(1, availableWidth / inner.width, Math.max(1, outer.height - 144) / inner.height)
    // The library lives outside the canvas; leave space above for context actions.
    canvas.viewbox({
      x: inner.x - (left + (availableWidth - inner.width * scale) / 2) / scale,
      y: inner.y - (outer.height - inner.height * scale) / 2 / scale,
      width: outer.width / scale,
      height: outer.height / scale,
    })
  }

  function selectNode(preferredId?: string) {
    if (!modeler) return
    const registry = modeler.get<ElementRegistry>('elementRegistry')
    const preferred = preferredId ? registry.get(preferredId) : undefined
    const element = preferred ?? registry.getAll().find((item) => is(item, 'bpmn:UserTask'))
    if (element) {
      modeler.get<{ select(element: Element): void }>('selection').select(element)
    }
  }

  async function importXML(xml: string): Promise<boolean> {
    if (!modeler || busy.value || disposed) return false
    busy.value = true
    let previousXML: string | undefined
    const wasReady = ready.value
    const parseRevision = successfulParses
    const previousId = activeElement?.id
    const previousWarning = warning.value
    try {
      if (ready.value) previousXML = (await modeler.saveXML({ format: true })).xml
      if (disposed) return false
      const result = await modeler.importXML(xml)
      if (disposed) return false
      activeElement = undefined
      layoutStatus.value = ''
      let layoutWarning = ''
      try { layoutWarning = await applyLayout(false) }
      catch (cause) { layoutWarning = `自动整理未完成，已保留导入布局：${cause instanceof Error ? cause.message : '布局不可用'}` }
      if (disposed) return false
      modeler.get<CommandStack>('commandStack').clear()
      ready.value = true
      error.value = ''
      warning.value = [result.warnings.length ? `文件有 ${result.warnings.length} 项内容未被完整识别，请确认后再导出。` : '', layoutWarning].filter(Boolean).join(' ')
      fitViewport()
      selectNode()
      syncHistory()
      syncDiagram()
      return true
    } catch (cause) {
      if (disposed) return false
      ready.value = false
      if (wasReady && successfulParses === parseRevision) {
        // Parsing failed before definitions changed: preserve the existing undo stack too.
        ready.value = true
        warning.value = previousWarning
        syncSelection()
      } else if (previousXML) {
        try {
          await modeler.importXML(previousXML)
          if (disposed) return false
          ready.value = true
          warning.value = previousWarning
          fitViewport()
          selectNode(previousId)
        } catch {
          // Keep the original error and leave re-import available.
        }
      }
      const reason = cause instanceof Error ? cause.message : '文件不是有效的 BPMN 流程'
      error.value = `${ready.value ? '导入失败，已保留原流程' : '流程加载失败'}：${reason}`
      syncHistory()
      return false
    } finally {
      if (!disposed) {
        busy.value = false
        propertyError.value = ''
        if (ready.value) syncDiagram()
        if (hasValidated.value && ready.value) checkWorkflow()
      }
    }
  }

  function updateProperty(field: NodePropertyField, value: string) {
    if (!modeler || !activeElement || busy.value || !ready.value) return
    propertyError.value = ''
    const modeling = modeler.get<{ updateProperties(element: Element, properties: Record<string, unknown>): void }>('modeling')
    const bo = activeElement.businessObject
    if (['approvalMode', 'approvalOrder', 'participants', 'repairApproval'].includes(field)) {
      if (!is(activeElement, 'bpmn:UserTask')) return
      try {
        modeling.updateProperties(activeElement, approvalPatch(modeler.get('moddle'), bo, field, value))
      } catch (cause) {
        propertyError.value = cause instanceof Error ? cause.message : '审批配置修改失败'
      }
      syncSelection()
      return
    }
    if (field === 'id') {
      if (!is(activeElement, 'bpmn:Process')) return
      const nextId = value.trim()
      const moddle = modeler.get<{ ids: { assigned(id: string): unknown } }>('moddle')
      if (!isValidBpmnId(nextId)) {
        propertyError.value = '流程标识须以字母或下划线开头，后续可包含数字、点和短横线'
      } else if (nextId !== bo.id && moddle.ids.assigned(nextId)) {
        propertyError.value = '该标识已被文档中的其他元素使用'
      } else if (nextId !== bo.id) modeling.updateProperties(activeElement, { id: nextId })
      syncSelection()
      return
    }
    if (field === 'defaultFlow') {
      const gateway = is(activeElement, 'bpmn:SequenceFlow') ? activeElement.source : activeElement
      if (!gateway || !is(gateway, 'bpmn:ExclusiveGateway')) return
      const flow = value ? modeler.get<ElementRegistry>('elementRegistry').get(value) : undefined
      if (value && (!flow || flow.source !== gateway || !is(flow, 'bpmn:SequenceFlow'))) return
      if (gateway.businessObject.default !== flow?.businessObject) modeling.updateProperties(gateway, { default: flow?.businessObject })
      syncSelection()
      return
    }
    if (field === 'conditionExpression') {
      if (!is(activeElement, 'bpmn:SequenceFlow') || !is(bo.sourceRef, 'bpmn:ExclusiveGateway')) return
      if ((bo.conditionExpression?.body ?? '') !== value) {
        const moddle = modeler.get<{ create(type: string, properties: Record<string, unknown>): ModdleElement }>('moddle')
        const expression = value.trim() ? moddle.create('bpmn:FormalExpression', {
          ...(bo.conditionExpression?.$attrs ?? {}), body: value,
          language: bo.conditionExpression?.language,
          evaluatesToTypeRef: bo.conditionExpression?.evaluatesToTypeRef,
        }) : undefined
        modeling.updateProperties(activeElement, { conditionExpression: expression })
      }
      syncSelection()
      return
    }
    if (field !== 'name' && !is(activeElement, 'bpmn:UserTask')) return
    if (field === 'assignee' && readApproval(bo).mode !== 'single') return
    const property = propertyNames[field]
    if (!property) return
    const nextValue = value.trim() || undefined
    if (activeElement.businessObject.get(property) !== nextValue) {
      modeling.updateProperties(activeElement, { [property]: nextValue })
    }
    syncSelection()
  }

  async function exportXML() {
    if (!modeler || !ready.value || busy.value) return undefined
    const result = await modeler.saveXML({ format: true })
    return disposed ? undefined : result.xml
  }

  function undo() {
    if (!busy.value && canUndo.value) modeler?.get<CommandStack>('commandStack').undo()
  }

  function redo() {
    if (!busy.value && canRedo.value) modeler?.get<CommandStack>('commandStack').redo()
  }

  onMounted(async () => {
    if (!container.value) return
    try {
      modeler = new Modeler({
        container: container.value,
        moddleExtensions: { wf: workflowDescriptor },
        ...createDiagramThemeOptions(),
      })
      modeler.get<CommandStack>('commandStack').registerHandler('diagram.applyLayout', LayoutCommand)
      initialized.value = true
      modeler.on('import.parse.complete', (event: { error?: unknown }) => {
        if (!event.error) successfulParses += 1
      })
      modeler.on('selection.changed', (event: { newSelection: Element[] }) => {
        const element = event.newSelection.length === 1 ? event.newSelection[0] : undefined
        const labelTarget = (element as Label | undefined)?.labelTarget
        const node = (labelTarget ?? element) as Element | undefined
        activeElement = node && (is(node, 'bpmn:FlowNode') || is(node, 'bpmn:SequenceFlow') || is(node, 'bpmn:Process')) ? node : undefined
        propertyError.value = ''
        syncSelection()
      })
      modeler.on('element.changed', (event: { element: Element }) => {
        if (event.element === activeElement) syncSelection()
      })
      modeler.on('commandStack.changed', () => {
        syncHistory()
        syncSelection()
        syncDiagram()
        if (hasValidated.value && ready.value && !busy.value) checkWorkflow()
      })
      modeler.on('canvas.viewbox.changed', (event: { viewbox: { scale: number } }) => { zoomPercent.value = Math.round(event.viewbox.scale * 100) })
      resizeObserver = new ResizeObserver(() => { if (!disposed) modeler?.get<Canvas>('canvas').resized() })
      resizeObserver.observe(container.value)
      await importXML(initialDiagram)
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : '画布初始化失败'
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    resizeObserver?.disconnect()
    layoutRunner.destroy()
    modeler?.destroy()
    modeler = undefined
    activeElement = undefined
  })

  return {
    ready, initialized, busy, error, warning, selectedNode, canUndo, canRedo,
    fitViewport, importXML, exportXML, updateProperty, undo, redo,
    propertyError, validationIssues, hasValidated, checkWorkflow, locateElement, showProcessProperties,
    processName, diagramCounts, zoomPercent, zoomBy, activateHand, createNode, arrangeLayout, canArrange, layoutReason, layoutStatus,
  }
}
