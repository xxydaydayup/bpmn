<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { VueFlow, useVueFlow, type Connection, type NodeMouseEvent, type EdgeMouseEvent } from '@vue-flow/core'
import { IconArrowBackUp, IconArrowForwardUp, IconChecklist, IconCloudUpload, IconCode, IconDownload, IconFileImport, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconPlus, IconTemplate, IconWand } from '@tabler/icons-vue'
import { createDesignDocument, isWorkflowModel, parseWorkflowInput, workflowEditorNodeIssues } from './contract'
import { templateIcons } from './icons'
import { cloneWorkflowModelWithFreshNodeIds, createNodeRecord, createWorkflowNodeId, fromCanvas, normalizeLegacyUuidNodeIds, toCanvas, type DesignerEdge, type DesignerNode } from './adapter'
import { canConnectNodes, validateWorkflowModel } from './validation'
import { workflowProtocolIssues } from './protocol-validation'
import { layoutWorkflow, refreshFeedbackRoutes } from './layout'
import WorkflowNode from './nodes/WorkflowNode.vue'
import WorkflowEdge from './edges/WorkflowEdge.vue'
import { getWorkflowNodeDefinition, workflowNodeCatalog } from './nodes'
import { workflowTemplates } from './templates'
import { createWorkflowEditSession, type WorkflowEditSnapshot } from './edit-session'
import type { WorkflowCompile, WorkflowDeploy, WorkflowDesignDocument, WorkflowDesignerExtensions, WorkflowDesignerMode, WorkflowInput, WorkflowModel, WorkflowNodeRecord, WorkflowNodeType, WorkflowSubProcessModel, WorkflowValidationIssue, WorkflowVerifyDeployment, WorkflowViewport } from './types'
import './style.css'

const props = withDefaults(defineProps<{ modelValue?: WorkflowInput; compile?: WorkflowCompile; deploy?: WorkflowDeploy; verifyDeployment?: WorkflowVerifyDeployment; readonly?: boolean; autoLayoutOnInit?: boolean; mode?: WorkflowDesignerMode; extensions?: WorkflowDesignerExtensions }>(), { readonly: false, autoLayoutOnInit: false, mode: 'workflow' })
const emit = defineEmits<{ 'update:modelValue': [value: WorkflowDesignDocument | Record<string, unknown>]; 'compile-start': []; 'compile-success': [result: unknown]; 'compile-error': [error: unknown] }>()
const nodeTypes = workflowNodeCatalog
const sample: WorkflowModel = {
  processId: 'project-approval', processName: '立项审批',
  nodes: [
    { id: 'start', type: 'start', name: '发起', x: 320, y: 60 }, { id: 'apply', type: 'approval', name: '立项审批单', x: 320, y: 200 },
    { id: 'minister', type: 'approval', name: '部长审批', x: 320, y: 340 }, { id: 'gwMinister', type: 'condition', name: '部长审批结果', x: 320, y: 480 },
    { id: 'managers', type: 'countersign', name: '各部门经理会签', approveMode: 'ALL', x: 320, y: 620 },
    { id: 'gwManagers', type: 'condition', name: '会签结果', x: 320, y: 760 }, { id: 'end', type: 'end', name: '结束', x: 320, y: 900 },
  ],
  flows: [
    { source: 'start', target: 'apply' }, { source: 'apply', target: 'minister' }, { source: 'minister', target: 'gwMinister' },
    { source: 'gwMinister', target: 'managers', branch: 'pass' }, { source: 'gwMinister', target: 'apply', branch: 'reject' },
    { source: 'managers', target: 'gwManagers' }, { source: 'gwManagers', target: 'end', branch: 'pass' }, { source: 'gwManagers', target: 'apply', branch: 'reject' },
  ],
}
const initial = parseWorkflowInput(props.modelValue ?? createDesignDocument(sample, { theme: { accent: '#276958' } }))
initial.model = normalizeLegacyUuidNodeIds(initial.model)
const shouldAutoLayoutOnInit = props.autoLayoutOnInit && !initial.editor.viewport
const documentState = ref<WorkflowDesignDocument | Record<string, unknown>>(initial.document)
const editorState = ref(initial.editor)
const initialCanvas = toCanvas(initial.model, initial.editor)
const nodes = shallowRef<DesignerNode[]>(initialCanvas.nodes)
const edges = shallowRef<DesignerEdge[]>(initialCanvas.edges)
const zoom = ref(initial.editor.viewport?.zoom ?? 1)
const activeNodeId = ref<string>()
const activeEdgeId = ref<string>()
const issues = ref<WorkflowValidationIssue[]>(validateForMode(initial.model))
const compileState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const compileResult = ref<unknown>()
const compileError = ref('')
const importError = ref('')
const viewError = ref('')
const loadingInput = ref(false)
const unknownPaths = ref(initial.unknownPaths)
const unsupportedEnvelope = ref(initial.unsupportedEnvelope)
const originalReadonly = ref(initial.readonly)
const jsonViewOpen = ref(false)
const jsonImportOpen = ref(false)
const jsonDraft = ref('')
const jsonError = ref('')
const xmlOpen = ref(false)
const xmlText = ref('')
const checkOpen = ref(false)
const deployOpen = ref(false)
const deployState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const deployResult = ref<unknown>()
const deployError = ref('')
const deployUncertain = ref(false)
const deployVerified = ref(false)
const verifyingDeployment = ref(false)
const nodeLibraryCollapsed = ref(false)
const propertiesPanelCollapsed = ref(false)
const templateOpen = ref(false)
const selectedTemplateId = ref(workflowTemplates[0].id)
const editSession = createWorkflowEditSession()
const historyRevision = ref(0)
const emittedDocuments = new Set<string>()
const draggingNodes = ref(false)
const fileInput = ref<HTMLInputElement>()
const flowId = 'workflow-designer-' + useId()
const flow = useVueFlow(flowId)
const nodeTypesMap = computed(() => ({ workflowNode: markRaw(props.extensions?.nodeComponent ?? WorkflowNode) }))
const edgeTypesMap = { workflowRoute: markRaw(WorkflowEdge) }
const fitView = flow.fitView
const zoomIn = flow.zoomIn
const zoomOut = flow.zoomOut
const setViewport = flow.setViewport
const screenToFlowCoordinate = flow.screenToFlowCoordinate
const selectedNode = computed(() => nodes.value.find((node: DesignerNode) => node.id === activeNodeId.value))
const selectedEdge = computed(() => edges.value.find((edge: DesignerEdge) => edge.id === activeEdgeId.value))
const parallelOutgoing = computed(() => model.value.nodes.find(node => node.id === selectedEdge.value?.source)?.type === 'parallel')
const hasParallelConditions = computed(() => parallelOutgoing.value && selectedEdge.value
  && ('branch' in selectedEdge.value.data.original || 'conditionExpression' in selectedEdge.value.data.original))
const parallelExplanation = computed(() => {
  const id = selectedNode.value?.id
  const incoming = model.value.flows.filter(flow => flow.target === id).length
  const outgoing = model.value.flows.filter(flow => flow.source === id).length
  const role = incoming > 1 && outgoing > 1 ? '先等待全部入线到齐，再激活全部出线。'
    : incoming > 1 ? '汇合：等待全部入线到齐后继续。'
    : outgoing > 1 ? '分流：同时激活全部出线。' : '连接多个入线或出线后产生汇合或分流效果。'
  return `${incoming} 条入线 · ${outgoing} 条出线。${role}网关不创建待办，汇合表示分支完成，不代表全部审批通过。`
})
const reminderTargetNodes = computed(() => model.value.nodes.filter(node => {
  const type = getWorkflowNodeDefinition(node.type)?.type
  return node.id !== selectedNode.value?.id && type && ['approval', 'countersign', 'service', 'subProcess'].includes(type)
}))
const readonlyMode = computed(() => props.readonly || originalReadonly.value)
const model = computed(() => fromCanvas(nodes.value, edges.value, baseModel()))
const allIssues = computed<WorkflowValidationIssue[]>(() => [...issues.value.map(issue => {
  const index = issue.edgeId?.startsWith('flow-') ? Number(issue.edgeId.slice(5)) : NaN
  return !Number.isInteger(index) ? issue : { ...issue, edgeId: edges.value[index]?.id ?? issue.edgeId }
}), ...unknownPaths.value.map(path => ({ code: 'unknown-business-data', message: '发现未识别的业务数据（' + path + '），保留原文但禁止编译。' }))])
const canCompile = computed(() => Boolean(props.compile) && !readonlyMode.value && !allIssues.value.some(issue => issue.severity !== 'warning') && compileState.value !== 'loading')
const canDeploy = computed(() => Boolean(props.deploy) && canCompile.value && deployState.value !== 'loading')
const deploySummary = computed(() => {
  const value = deployResult.value && typeof deployResult.value === 'object' ? deployResult.value as Record<string, unknown> : {}
  return [
    { label: '流程模板', value: String(value.taskKey ?? value.templateKey ?? model.value.processId) },
    { label: '模板版本', value: String(value.version ?? '未返回') },
    { label: '部署 ID', value: String(value.deploymentId ?? '未返回') },
    { label: '流程定义', value: String(value.processDefinitionId ?? '未返回') },
  ]
})
const themeVariables = computed(() => Object.fromEntries(Object.entries({ ...(editorState.value.theme ?? {}), ...(props.extensions?.theme ?? {}) }).map(([key, value]) => [key.startsWith('--') ? key : '--wfd-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value])))
const nodeOptions = computed(() => {
  const allowed = props.extensions?.nodeTypes ?? nodeTypes.map(node => node.type)
  return nodeTypes.filter(item => allowed.includes(item.type))
})
const nodeGroups = computed(() => {
  const groups = new Map<string, Array<(typeof nodeOptions.value)[number]>>()
  for (const node of nodeOptions.value) {
    const category = node.category ?? '其他'
    groups.set(category, [...(groups.get(category) ?? []), node])
  }
  return [...groups].map(([title, items]) => ({ title, items }))
})

function baseModel(): WorkflowModel { const value = documentState.value as Partial<WorkflowDesignDocument>; return value.model && Array.isArray(value.model.nodes) ? value.model as WorkflowModel : initial.model }
function validateForMode(value: WorkflowModel): WorkflowValidationIssue[] {
  return props.mode === 'subprocess-fragment' ? validateFragmentModel(value) : validateWorkflowModel(value, props.extensions?.validate?.(value) ?? [])
}
function currentEditor() {
  const routes = Object.fromEntries(edges.value.flatMap((edge, index) => {
    const points = (edge.data as typeof edge.data & { routePoints?: { x: number; y: number }[] } | undefined)?.routePoints
    return points?.length ? [['flow-' + index, points]] : []
  }))
  const { routes: _oldRoutes, ...editor } = editorState.value
  return { ...editor, ...(Object.keys(routes).length ? { routes } : {}), viewport: { ...(editorState.value.viewport ?? { x: 0, y: 0, zoom: zoom.value }), zoom: zoom.value || 1 } }
}
function currentDocument(): WorkflowDesignDocument | Record<string, unknown> {
  if (unsupportedEnvelope.value) return documentState.value
  return { ...(documentState.value as Record<string, unknown>), format: 'workflow-designer', version: 1, model: model.value, editor: currentEditor() }
}
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function editSnapshot(): WorkflowEditSnapshot {
  return {
    model: model.value,
    routes: model.value.flows.map((_, index) => {
      const points = (edges.value[index]?.data as (typeof edges.value[number]['data'] & { routePoints?: { x: number; y: number }[] }) | undefined)?.routePoints
      return points?.length ? points : undefined
    }),
  }
}
function resetHistory() {
  if (readonlyMode.value || unsupportedEnvelope.value) editSession.reset()
  else editSession.reset(editSnapshot())
  historyRevision.value += 1
}
function mergeHistoryEnvelope(input: WorkflowInput, snapshot: WorkflowEditSnapshot) {
  const envelope = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const { editor: rawEditor, ...envelopeFields } = envelope
  const editor = rawEditor && typeof rawEditor === 'object' && !Array.isArray(rawEditor)
    ? rawEditor as Record<string, unknown>
    : {}
  const { routes: _routes, ...editorFields } = editor
  return {
    ...envelopeFields,
    format: 'workflow-designer',
    version: 1,
    model: cloneJson(snapshot.model),
    editor: { ...editorFields, ...editorForHistory(snapshot) },
  } as WorkflowInput
}
function editorForHistory(snapshot: WorkflowEditSnapshot) {
  const editor = currentEditor()
  delete editor.routes
  const routes = Object.fromEntries(snapshot.routes.flatMap((points, index) => points?.length ? [['flow-' + index, cloneJson(points)]] : []))
  if (Object.keys(routes).length) editor.routes = routes
  return editor
}
function togglePanel(panel: 'library' | 'properties') {
  if (panel === 'library') nodeLibraryCollapsed.value = !nodeLibraryCollapsed.value
  else propertiesPanelCollapsed.value = !propertiesPanelCollapsed.value
}
function applyDocument(input: WorkflowInput) {
  const parsed = parseWorkflowInput(input); parsed.model = normalizeLegacyUuidNodeIds(parsed.model); const canvas = toCanvas(parsed.model, parsed.editor)
  documentState.value = parsed.document; editorState.value = parsed.editor; nodes.value = canvas.nodes; edges.value = canvas.edges
  zoom.value = parsed.editor.viewport?.zoom ?? 1
  unknownPaths.value = parsed.unknownPaths; unsupportedEnvelope.value = parsed.unsupportedEnvelope; originalReadonly.value = parsed.readonly
  activeNodeId.value = undefined; activeEdgeId.value = undefined
  issues.value = validateForMode(parsed.model)
  compileState.value = 'idle'; compileResult.value = undefined; compileError.value = ''
  nextTick(() => { if (parsed.editor.viewport) void setViewport(parsed.editor.viewport) })
}
watch(() => [props.mode, props.extensions?.nodeTypes], () => {
  nodeLibraryCollapsed.value = false
  propertiesPanelCollapsed.value = false
})
watch(() => props.modelValue, value => {
  if (loadingInput.value || value === undefined) return
  const serialized = JSON.stringify(value)
  if (emittedDocuments.has(serialized)) { emittedDocuments.delete(serialized); return }
  if (serialized === JSON.stringify(currentDocument())) return
  const parsed = parseWorkflowInput(value)
  parsed.model = normalizeLegacyUuidNodeIds(parsed.model)
  const replacesModel = JSON.stringify(parsed.model) !== JSON.stringify(model.value)
  applyDocument(value)
  if (replacesModel) resetHistory()
}, { deep: true })
function updateDocument(recordHistory = true) {
  if (loadingInput.value || unsupportedEnvelope.value) return
  documentState.value = { ...(documentState.value as Record<string, unknown>), format: 'workflow-designer', version: 1, model: model.value, editor: currentEditor() }
  issues.value = validateForMode(model.value)
  unknownPaths.value = parseWorkflowInput(currentDocument()).unknownPaths
  compileState.value = 'idle'; compileError.value = ''; publishDocument()
  if (recordHistory && !draggingNodes.value) commitHistory()
}
function publishDocument() {
  const value = currentDocument()
  emittedDocuments.add(JSON.stringify(value))
  if (emittedDocuments.size > 32) emittedDocuments.delete(emittedDocuments.values().next().value!)
  emit('update:modelValue', value)
}
watch(() => [props.extensions?.validate, props.mode], () => { issues.value = validateForMode(model.value) })
function pushHistory() {
  if (!editSession.hasBaseline) {
    editSession.ensureBaseline(editSnapshot())
    historyRevision.value += 1
  }
}
function commitHistory() {
  if (readonlyMode.value || unsupportedEnvelope.value) return
  editSession.commit(editSnapshot())
  historyRevision.value += 1
}
function restoreHistory(direction: -1 | 1) {
  if (readonlyMode.value) return
  if (!editSession.hasBaseline) editSession.ensureBaseline(editSnapshot())
  const target = direction < 0 ? editSession.undo() : editSession.redo()
  if (!target) return
  historyRevision.value += 1
  const restored = mergeHistoryEnvelope(documentState.value as WorkflowInput, target)
  loadingInput.value = true; applyDocument(restored)
  const missingRoutes = new Set(edges.value.filter(edge => !(edge.data as typeof edge.data & { routePoints?: { x: number; y: number }[] } | undefined)?.routePoints?.length).map(edge => edge.id))
  if (missingRoutes.size) {
    const dimensions = new Map(flow.getNodes.value.map(node => [node.id, { width: node.dimensions.width, height: node.dimensions.height }]))
    edges.value = refreshFeedbackRoutes(nodes.value, edges.value, dimensions, missingRoutes)
  }
  nextTick(() => { loadingInput.value = false; publishDocument() })
}
const canUndo = computed(() => { historyRevision.value; return editSession.canUndo })
const canRedo = computed(() => { historyRevision.value; return editSession.canRedo })
function undo() { restoreHistory(-1) } function redo() { restoreHistory(1) }
function getRecord(id: string) { return model.value.nodes.find(item => item.id === id) }
function updateNode(id: string, key: string, value: unknown) {
  if (readonlyMode.value) return
  const node = nodes.value.find(item => item.id === id); if (!node) return
  if (key === 'timerType' && node.data.kind === 'timer') {
    updateTimerType(id, value as 'duration' | 'date' | 'cycle')
    return
  }
  nodes.value = nodes.value.map(item => {
    if (item.id !== id) return item
    if (key === 'name') return { ...item, data: { ...item.data, name: String(value) } }
    if (key === 'x' || key === 'y') return { ...item, position: { ...item.position, [key]: Number(value) } }
    const custom = { ...item.data.custom }
    const original = { ...item.data.original } as WorkflowNodeRecord
    if (key === 'countersign' && value === true) {
      custom.countersign = true; original.countersign = true
      if (!original.approveMode) { custom.approveMode = 'ALL'; original.approveMode = 'ALL' }
      if (original.sequential === undefined) { custom.sequential = false; original.sequential = false }
    } else if (key === 'countersign' && value === false) {
      custom.countersign = false; original.countersign = false
      delete custom.approveMode; delete original.approveMode
      delete custom.sequential; delete original.sequential
      delete custom.passRate; delete original.passRate
    } else if (key === 'subProcessSelection') {
      const selection = value && typeof value === 'object' ? value as { key?: unknown; name?: unknown; process?: unknown } : undefined
      if (!selection) {
        delete custom.subProcessKey; delete custom.subProcessName; delete custom.process
        delete original.subProcessKey; delete original.subProcessName; delete original.process
      } else {
        custom.subProcessKey = selection.key; custom.subProcessName = selection.name; custom.process = selection.process
        original.subProcessKey = selection.key as string; original.subProcessName = selection.name as string; original.process = selection.process as WorkflowSubProcessModel
      }
    } else if (key === 'reminder' && value && typeof value === 'object') {
      const reminder = Object.fromEntries(Object.entries(value).filter(([, entry]) => String(entry ?? '').trim()))
      custom.reminder = reminder; original.reminder = reminder
    } else if (key === 'reminder') {
      delete custom.reminder; delete original.reminder
    } else if (key === 'reminderAction' || key === 'reminderTarget') {
      const reminder = { ...(original.reminder ?? {}) }
      if (key === 'reminderAction') {
        reminder.action = value as 'notify' | 'return' | 'end'
        if (value !== 'return') delete reminder.target
      } else {
        reminder.target = String(value ?? '')
      }
      const nextReminder = Object.fromEntries(Object.entries(reminder).filter(([, entry]) => String(entry ?? '').trim()))
      if (Object.keys(nextReminder).length) { custom.reminder = nextReminder; original.reminder = nextReminder }
      else { delete custom.reminder; delete original.reminder }
    } else if (value === '' || value === undefined || value === null) { delete custom[key]; delete original[key] }
    else {
      const nextValue = key === 'passRate' && typeof value === 'string' ? value.trim() : value
      if (nextValue === '') { delete custom[key]; delete original[key] }
      else { custom[key] = nextValue; original[key] = nextValue as never }
    }
    if (key === 'approveMode' && value !== 'VOTE') { delete custom.passRate; delete original.passRate }
    return key === 'subProcessSelection' && value && typeof value === 'object'
      ? { ...item, data: { ...item.data, name: String((value as { name?: unknown }).name ?? item.data.name), custom, original } }
      : { ...item, data: { ...item.data, custom, original } }
  })
  updateDocument()
}
function updateTimerType(id: string, timerType: 'duration' | 'date' | 'cycle') {
  if (readonlyMode.value) return
  const example = { duration: 'PT30M', date: '2026-12-31T23:59:59', cycle: 'R3/PT10H' }[timerType]
  nodes.value = nodes.value.map(item => {
    if (item.id !== id) return item
    const custom = { ...item.data.custom, timerType, timerValue: example }
    const original = { ...item.data.original, timerType, timerValue: example }
    return { ...item, data: { ...item.data, custom, original } }
  })
  updateDocument()
}
function updateProcess(key: 'processName' | 'processId', value: string) { if (readonlyMode.value) return; documentState.value = { ...(documentState.value as Record<string, unknown>), model: { ...baseModel(), [key]: value } }; updateDocument() }
function commitTextInput(event: Event, commit: (value: string) => void) {
  const input = event.target as HTMLInputElement
  const previous = input.dataset.previousValue ?? input.defaultValue
  if (input.value !== previous) {
    commit(input.value)
    input.dataset.previousValue = input.value
    input.defaultValue = input.value
  }
}
function updateEdge(id: string, key: 'branch' | 'conditionExpression' | 'source' | 'target', value: string) {
  if (readonlyMode.value) return; const edge = edges.value.find(item => item.id === id); if (!edge) return
  if (key === 'branch' || key === 'conditionExpression') {
    if (model.value.nodes.find(node => node.id === edge.source)?.type === 'parallel') return
  } else {
    const sourceId = key === 'source' ? value : edge.source
    const targetId = key === 'target' ? value : edge.target
    if (!connectionAllowed(sourceId, targetId, edges.value.indexOf(edge))) {
      viewError.value = '无法连接这些节点：请检查重复连线、起止方向及节点连接限制。'
      return
    }
  }
  viewError.value = ''
  edges.value = edges.value.map(item => {
    if (item.id !== id) return item
    if (key === 'source' || key === 'target') return { ...item, [key]: value, data: { ...item.data, routePoints: undefined, feedback: undefined } }
    const original = { ...item.data.original }
    if (value === '') delete original[key]
    else original[key] = value
    return { ...item, data: { ...item.data, [key]: value || undefined, original } }
  })
  updateDocument()
}
function connectionAllowed(sourceId: string, targetId: string, editingFlowIndex?: number) {
  const value = model.value
  const source = value.nodes.find(node => node.id === sourceId)
  const target = value.nodes.find(node => node.id === targetId)
  return Boolean(source && target && canConnectNodes(source, target, value, editingFlowIndex)
    && (props.extensions?.canConnect?.(source, target, { ...value, flows: value.flows.filter((_, index) => index !== editingFlowIndex) }) ?? true))
}
function clearParallelConditions() {
  const edge = selectedEdge.value
  if (readonlyMode.value || !edge || !hasParallelConditions.value) return
  const { branch: _branch, conditionExpression: _expression, ...original } = edge.data.original
  edges.value = edges.value.map(item => item.id === edge.id
    ? { ...item, label: undefined, class: undefined, data: { ...item.data, branch: undefined, conditionExpression: undefined, original } }
    : item)
  updateDocument()
}
function onEdgeUpdate(event: { edge: { id: string }; connection: Connection }) {
  if (readonlyMode.value) return
  const index = edges.value.findIndex(edge => edge.id === event.edge.id)
  const { source, target } = event.connection
  if (index < 0 || !source || !target || !connectionAllowed(source, target, index)) return
  edges.value = edges.value.map((edge, i) => i === index
    ? { ...edge, source, target, data: { ...edge.data, routePoints: undefined, feedback: undefined } } : edge)
  updateDocument()
}
function addNode(type: WorkflowNodeType, position?: { x: number; y: number }) {
  if (readonlyMode.value) return
  const point = position ?? screenToFlowCoordinate({ x: Math.max(160, window.innerWidth / 2), y: Math.max(130, window.innerHeight / 2) })
  const id = createWorkflowNodeId(type, nodes.value.map(node => node.id))
  const record = createNodeRecord(type, id, Math.round(point.x), Math.round(point.y), props.extensions?.nodeDefaults?.[type])
  const custom = Object.fromEntries(Object.entries(record).filter(([key]) => !['id', 'type', 'name', 'x', 'y'].includes(key)))
  nodes.value = [...nodes.value, { id: record.id, type: 'workflowNode', position: { x: record.x, y: record.y }, data: { kind: type, name: record.name, original: record, custom } } as DesignerNode]
  activeNodeId.value = record.id; activeEdgeId.value = undefined; updateDocument()
}
function onLibraryDragStart(event: DragEvent, type: WorkflowNodeType) { event.dataTransfer?.setData('application/x-workflow-node', type); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy' }
function onCanvasDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/x-workflow-node') as WorkflowNodeType | undefined
  if (!type || !nodeOptions.value.some(item => item.type === type)) return
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  addNode(type, point)
}
function removeSelection() {
  if (readonlyMode.value) return
  pushHistory()
  if (activeNodeId.value) { const id = activeNodeId.value; nodes.value = nodes.value.filter(node => node.id !== id); edges.value = edges.value.filter(edge => edge.source !== id && edge.target !== id) }
  else if (activeEdgeId.value) edges.value = edges.value.filter(edge => edge.id !== activeEdgeId.value)
  activeNodeId.value = undefined; activeEdgeId.value = undefined; updateDocument()
}
function handleConnect(connection: Connection) {
  if (readonlyMode.value || !connection.source || !connection.target) return
  if (!connectionAllowed(connection.source, connection.target)) return
  pushHistory()
  const id = createWorkflowNodeId('flow', edges.value.map(edge => edge.id))
  edges.value = [...edges.value, { id, source: connection.source, target: connection.target, type: 'workflowRoute', data: { original: { source: connection.source, target: connection.target } }, markerEnd: 'arrowclosed' } as DesignerEdge]
  activeNodeId.value = undefined; activeEdgeId.value = id; updateDocument()
}
function onNodeClick(event: NodeMouseEvent) { activeNodeId.value = event.node.id; activeEdgeId.value = undefined }
function onEdgeClick(event: EdgeMouseEvent) { activeEdgeId.value = event.edge.id; activeNodeId.value = undefined }
function onDragStart() {
  draggingNodes.value = true
  pushHistory()
}
function onDragStop() {
  nextTick(() => {
    if (loadingInput.value) return
    const dimensions = new Map(flow.getNodes.value.map(node => [node.id, { width: node.dimensions.width, height: node.dimensions.height }]))
    edges.value = refreshFeedbackRoutes(nodes.value, edges.value, dimensions)
    draggingNodes.value = false
    updateDocument()
  })
}
function onPaneClick() { activeNodeId.value = undefined; activeEdgeId.value = undefined }
function applyTemplate() {
  const template = workflowTemplates.find(item => item.id === selectedTemplateId.value)
  if (!template || readonlyMode.value) return
  pushHistory()
  loadingInput.value = true
  const nextModel = cloneWorkflowModelWithFreshNodeIds(template.model)
  const current = currentDocument() as Record<string, unknown>
  const editor = currentEditor()
  delete editor.routes
  applyDocument({ ...current, format: 'workflow-designer', version: 1, model: nextModel, editor } as WorkflowInput)
  templateOpen.value = false
  nextTick(() => {
    loadingInput.value = false
    updateDocument()
    void fitView({ padding: 0.15, duration: 220 })
  })
}
watch([nodes, edges], () => {
  if (!draggingNodes.value) updateDocument()
})
const selectedTemplate = computed(() => workflowTemplates.find(item => item.id === selectedTemplateId.value) ?? workflowTemplates[0])
const workspaceClasses = computed(() => ({
  'wfd-library-collapsed': nodeLibraryCollapsed.value,
  'wfd-properties-collapsed': propertiesPanelCollapsed.value,
  'wfd-inspector-hidden': propertiesPanelCollapsed.value,
}))
let initialLayoutApplied = false
async function handleFlowInit() {
  await handleNodesInitialized()
}
async function handleNodesInitialized() {
  if (initialLayoutApplied) return
  if (!shouldAutoLayoutOnInit || readonlyMode.value || !nodes.value.length) { initialLayoutApplied = true; if (!editSession.hasBaseline) resetHistory(); return }
  const measuredNodes = flow.getNodes.value
  if (!measuredNodes.length || measuredNodes.some(node => !node.dimensions.width || !node.dimensions.height || !node.handleBounds)) return
  initialLayoutApplied = true
  await autoLayout(false)
  resetHistory()
}
async function autoLayout(recordHistory = true) { if (readonlyMode.value || !nodes.value.length) return; viewError.value = ''; if (recordHistory) pushHistory(); try { const dimensions = new Map(flow.getNodes.value.map(node => [node.id, { width: node.dimensions.width, height: node.dimensions.height }])); const result = await layoutWorkflow(nodes.value, edges.value, dimensions); nodes.value = result.nodes; edges.value = result.edges; updateDocument(recordHistory); await nextTick(); await waitForFlowRender(); await fitView({ padding: 0.12, duration: 260 }) } catch (error) { viewError.value = '自动布局失败：' + String(error) } }
function waitForFlowRender() {
  return new Promise<void>(resolve => {
    if (typeof window.requestAnimationFrame !== 'function') { window.setTimeout(resolve, 0); return }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  })
}
function onViewportChange(event: { flowTransform: WorkflowViewport }) { zoom.value = event.flowTransform.zoom; editorState.value = { ...editorState.value, viewport: event.flowTransform }; updateDocument(false) }
function readBpmnXml(result: unknown) {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return ''
  const value = result as Record<string, unknown>
  if (typeof value.bpmnXml === 'string') return value.bpmnXml
  if (value.data && typeof value.data === 'object' && typeof (value.data as Record<string, unknown>).bpmnXml === 'string') return (value.data as Record<string, unknown>).bpmnXml as string
  return ''
}
function openImportJson() { jsonDraft.value = JSON.stringify(model.value, null, 2); jsonError.value = ''; jsonImportOpen.value = true }
function parseJsonDraft() {
  let value: unknown
  try { value = JSON.parse(jsonDraft.value) }
  catch (error) { throw new Error('业务 JSON 无法解析：' + (error instanceof Error ? error.message : String(error))) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请提供业务模型对象或版本化设计稿。')
  const parsed = parseWorkflowInput(value as WorkflowInput)
  if (parsed.unknownPaths.includes('无法识别设计稿格式')) throw new Error('JSON 格式不正确：需要 processId、processName、nodes 和 flows。')
  if (!isWorkflowModel(parsed.model) && !parsed.unsupportedEnvelope) throw new Error('业务 JSON 缺少有效的流程模型。')
  return parsed
}
function importJsonToCanvas() {
  try {
    const parsed = parseJsonDraft()
    if (parsed.unsupportedEnvelope && !parsed.model.nodes.length) throw new Error('无法识别该设计稿中的业务模型。')
    if (!parsed.readonly) pushHistory()
    loadingInput.value = true; applyDocument(parsed.document as WorkflowInput); jsonImportOpen.value = false; jsonError.value = ''
    nextTick(() => {
      loadingInput.value = false
      if (!parsed.readonly) updateDocument()
      if (parsed.editor.viewport) void setViewport(parsed.editor.viewport)
      else void fitView({ padding: 0.15, duration: 220 })
    })
  } catch (error) { jsonError.value = error instanceof Error ? error.message : String(error) }
}
async function compileModel(candidate: WorkflowModel = model.value, openXml = true) {
  const isCurrent = JSON.stringify(candidate) === JSON.stringify(model.value)
  const candidateIssues = validateForMode(candidate)
  if (props.mode === 'subprocess-fragment' || !props.compile || (isCurrent && !canCompile.value) || candidateIssues.some(issue => issue.severity !== 'warning') || parseWorkflowInput(candidate).unknownPaths.length) {
    issues.value = candidateIssues
    checkOpen.value = true
    return undefined
  }
  compileState.value = 'loading'; compileResult.value = undefined; compileError.value = ''; emit('compile-start')
  try {
    const result = await props.compile(JSON.parse(JSON.stringify(candidate)) as WorkflowModel)
    compileResult.value = result; compileState.value = 'success'; emit('compile-success', result)
    const xml = readBpmnXml(result)
    if (xml && openXml) { xmlText.value = xml; xmlOpen.value = true }
    return result
  } catch (error) { compileError.value = error instanceof Error ? error.message : String(error); compileState.value = 'error'; emit('compile-error', error); return undefined }
}
async function convertJsonToXml() {
  try {
    const parsed = parseJsonDraft()
    if (parsed.readonly || parsed.unknownPaths.length) throw new Error('此 JSON 包含当前版本无法安全编译的未知数据。')
    const canvas = toCanvas(parsed.model, parsed.editor)
    const candidate = fromCanvas(canvas.nodes, canvas.edges, parsed.model)
    const result = await compileModel(candidate)
    if (result) { jsonImportOpen.value = false; jsonError.value = '' }
  } catch (error) { jsonError.value = error instanceof Error ? error.message : String(error) }
}
async function copyText(value: string, label: string) {
  try { await navigator.clipboard.writeText(value); viewError.value = label + '已复制。'; window.setTimeout(() => { if (viewError.value === label + '已复制。') viewError.value = '' }, 1800) }
  catch { viewError.value = '复制失败，请在文本框中手动选择并复制。' }
}
function downloadJson() {
  const blob = new Blob([JSON.stringify(model.value, null, 2)], { type: 'application/json' }); const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = (model.value.processId || 'workflow') + '.json'; link.click(); URL.revokeObjectURL(link.href)
}
function downloadXml() {
  const blob = new Blob([xmlText.value], { type: 'application/xml' }); const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = (model.value.processId || 'workflow') + '.bpmn'; link.click(); URL.revokeObjectURL(link.href)
}
function runCheck() {
  issues.value = validateForMode(model.value)
  checkOpen.value = true
}
function validateFragmentModel(value: WorkflowModel): WorkflowValidationIssue[] {
  const result: WorkflowValidationIssue[] = [...workflowProtocolIssues(value), ...workflowEditorNodeIssues(value)]
  if (value.nodes.length === 0) result.push({ code: 'fragment-empty', message: '片段至少需要一个节点。' })
  for (const node of value.nodes) {
    if (!node.name.trim()) result.push({ code: 'fragment-node-name', message: '请填写节点名称。', nodeId: node.id })
    if (!getWorkflowNodeDefinition(node.type)) result.push({ code: 'fragment-node-type', message: `子流程片段不支持“${node.type}”节点。`, nodeId: node.id })
  }
  for (const [index, flow] of value.flows.entries()) {
    if (flow.source === flow.target) result.push({ code: 'fragment-self-link', message: '节点不能连接到自身。', edgeId: `flow-${index}` })
  }
  for (const node of value.nodes) {
    if (node.type === 'start' && value.flows.some(flow => flow.target === node.id)) result.push({ code: 'fragment-start-incoming', message: '片段开始节点不能有上游连线。', nodeId: node.id })
    if (node.type === 'end' && value.flows.some(flow => flow.source === node.id)) result.push({ code: 'fragment-end-outgoing', message: '片段结束节点不能有后续连线。', nodeId: node.id })
  }
  return result.map(issue => ({ ...issue, ...(issue.locationLabel ? {} : issue.nodeId ? { locationLabel: value.nodes.find(node => node.id === issue.nodeId)?.name ?? issue.nodeId } : {}) }))
}
function openDeploy() { deployState.value = 'idle'; deployResult.value = undefined; deployError.value = ''; deployOpen.value = true }
async function deployWorkflow() {
  if (!props.deploy || !canDeploy.value || (deployUncertain.value && !deployVerified.value)) return
  deployState.value = 'loading'; deployError.value = ''; deployResult.value = undefined
  try { deployResult.value = await props.deploy(JSON.parse(JSON.stringify(model.value)) as WorkflowModel); deployState.value = 'success'; deployUncertain.value = false; deployVerified.value = false }
  catch (error) { deployError.value = error instanceof Error ? error.message : String(error); deployUncertain.value = Boolean(error && typeof error === 'object' && (error as { uncertain?: unknown }).uncertain); deployVerified.value = false; deployState.value = 'error' }
}
async function verifyDeployment() {
  if (!props.verifyDeployment || verifyingDeployment.value) return
  verifyingDeployment.value = true; deployError.value = ''
  try {
    const result = await props.verifyDeployment(JSON.parse(JSON.stringify(model.value)) as WorkflowModel)
    deployVerified.value = true
    if (result) { deployResult.value = result; deployState.value = 'success'; deployUncertain.value = false }
    else deployError.value = '未查询到当前流程模板，可以在确认后重试部署。'
  } catch (error) { deployError.value = (error instanceof Error ? error.message : String(error)) + '；查询未完成，请稍后再查。' }
  finally { verifyingDeployment.value = false }
}
function exportDesign() {
  return currentDocument()
}
function exportToFile() {
  const blob = new Blob([JSON.stringify(exportDesign(), null, 2)], { type: 'application/json' }); const link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = (baseModel().processId || 'workflow') + '.workflow.json'; link.click(); URL.revokeObjectURL(link.href)
}
function importFile() { fileInput.value?.click() }
async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  try { jsonDraft.value = await file.text(); jsonError.value = ''; jsonImportOpen.value = true }
  catch (error) { jsonError.value = 'JSON 文件读取失败：' + (error instanceof Error ? error.message : String(error)) }
  input.value = ''
}
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null; const editing = target?.matches('input, textarea, select, [contenteditable="true"]')
  if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
  else if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
  else if (!editing && (event.key === 'Delete' || event.key === 'Backspace') && (activeNodeId.value || activeEdgeId.value)) { event.preventDefault(); removeSelection() }
}
function safeJson(value: unknown) { return JSON.stringify(value, null, 2) }
onMounted(() => { document.addEventListener('keydown', onKeydown); issues.value = validateForMode(model.value); if (!editSession.hasBaseline && !shouldAutoLayoutOnInit) resetHistory() })
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
defineExpose({ compile: compileModel, exportDesign: currentDocument, validate: () => validateForMode(model.value), check: runCheck })
</script>

<template>
  <section class="wfd" :class="{ 'wfd-readonly': readonlyMode }" :style="themeVariables" aria-label="业务工作流设计器">
    <header class="wfd-toolbar">
      <div class="wfd-brand">
        <span class="wfd-brand-mark" aria-hidden="true">WF</span>
        <div class="wfd-brand-copy"><strong>业务流程设计</strong><small :title="model.processId">{{ model.processName || '未命名流程' }} · {{ model.nodes.length }} 个节点</small></div>
      </div>
      <div class="wfd-toolbar-actions">
        <span v-if="props.mode !== 'subprocess-fragment'" class="wfd-toolbar-spacer" aria-hidden="true" />
        <span v-if="props.mode !== 'subprocess-fragment'" class="wfd-toolbar-divider" />
        <div v-if="props.mode !== 'subprocess-fragment'" class="wfd-tool-group" aria-label="编排工具">
          <button class="wfd-button" type="button" :disabled="readonlyMode" @click="templateOpen = true"><IconTemplate :size=16 /><span>流程模板</span></button>
        </div>
        <span v-if="props.mode !== 'subprocess-fragment'" class="wfd-toolbar-divider" />
        <div v-if="props.mode !== 'subprocess-fragment'" class="wfd-tool-group" aria-label="流程数据">
          <button class="wfd-button" type="button" @click="jsonViewOpen = true"><IconCode :size=16 /><span>查看业务 JSON</span></button>
          <button class="wfd-button" type="button" :disabled="readonlyMode" @click="openImportJson"><IconFileImport :size=16 /><span>导入 / 转换 JSON</span></button>
          <button class="wfd-button" type="button" :disabled="!canCompile" @click="compileModel()"><IconCode :size=16 /><span>{{ compileState === 'loading' ? '编译中…' : '生成 BPMN XML' }}</span></button>
          <button class="wfd-button" type="button" @click="exportToFile"><IconDownload :size=16 /><span>导出设计稿</span></button>
        </div>
        <div class="wfd-tool-group wfd-publish-action">
          <button v-if="props.deploy" class="wfd-button wfd-button-primary" type="button" :disabled="!canDeploy" @click="openDeploy"><IconCloudUpload :size=16 /><span>发布任务模板</span></button>
        </div>
        <span v-if="props.mode !== 'subprocess-fragment'" class="wfd-toolbar-spacer" aria-hidden="true" />
        <slot name="toolbar-end" :document="currentDocument()" />
        <input ref="fileInput" class="wfd-visually-hidden" type="file" accept="application/json,.json" @change="onFileSelected">
      </div>
    </header>
    <div v-if="templateOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="templateOpen = false"><section class="wfd-dialog wfd-dialog-template" role="dialog" aria-modal="true" aria-labelledby="wfd-template-title"><header><div><h2 id="wfd-template-title">流程模板</h2><p>使用模板会替换当前业务流程，可通过撤销恢复；模型由 WorkflowModel JSON 描述。</p></div><button type="button" aria-label="关闭" @click="templateOpen = false">×</button></header><div class="wfd-template-options" role="radiogroup" aria-label="选择流程模板"><label v-for="item in workflowTemplates" :key="item.id" class="wfd-template-option" :class="{ 'is-selected': selectedTemplateId === item.id }"><input v-model="selectedTemplateId" type="radio" name="workflow-template" :value="item.id"><span class="wfd-template-icon" :class="'wfd-tone-' + item.model.nodes[1]?.type" aria-hidden="true" v-html="templateIcons[item.model.nodes[1]?.type === 'countersign' ? 'plus' : item.model.nodes[1]?.type === 'service' ? 'service' : item.model.nodes.some(node => node.type === 'parallel') ? 'plus' : item.model.nodes.some(node => node.type === 'condition') ? 'branch' : 'user']"></span><span class="wfd-template-copy"><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span><span class="wfd-template-mark" aria-hidden="true">{{ selectedTemplateId === item.id ? '✓' : '' }}</span></label></div><div class="wfd-template-preview"><div><span>流程标识</span><code>{{ selectedTemplate.model.processId }}</code></div><div><span>节点 / 连线</span><code>{{ selectedTemplate.model.nodes.length }} / {{ selectedTemplate.model.flows.length }}</code></div><div><span>多人审批</span><code>{{ selectedTemplate.model.nodes.find(node => node.type === 'countersign')?.approveMode ?? '—' }}</code></div><div v-if="selectedTemplate.sourceProcessDefinitionId"><span>来源流程定义</span><code>{{ selectedTemplate.sourceProcessDefinitionId }}</code></div></div><footer><button class="wfd-button" type="button" @click="templateOpen = false">取消</button><button class="wfd-button" type="button" @click="jsonDraft = safeJson(selectedTemplate.model); jsonImportOpen = true; templateOpen = false">查看 JSON</button><button class="wfd-button wfd-button-primary" type="button" :disabled="readonlyMode" @click="applyTemplate">使用模板</button></footer></section></div>
    <div v-if="jsonViewOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="jsonViewOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-json-title"><header><div><h2 id="wfd-json-title">业务模型 JSON</h2><p>当前业务模型；设计稿视口与主题保存在独立信封中。</p></div><button type="button" aria-label="关闭" @click="jsonViewOpen = false">×</button></header><textarea :value="safeJson(model)" readonly aria-label="业务模型 JSON" spellcheck="false"></textarea><footer><button class="wfd-button" type="button" @click="copyText(safeJson(model), 'JSON ')">复制 JSON</button><button class="wfd-button" type="button" @click="downloadJson">下载 JSON</button><button class="wfd-button wfd-button-primary" type="button" @click="jsonViewOpen = false">完成</button></footer></section></div>
    <div v-if="jsonImportOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="jsonImportOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-import-title"><header><div><h2 id="wfd-import-title">导入 / 转换业务 JSON</h2><p>粘贴 WorkflowModel v1 或版本化设计稿。导入后可继续编辑，或请求后端转换成 BPMN XML。</p></div><button type="button" aria-label="关闭" @click="jsonImportOpen = false">×</button></header><div class="wfd-dialog-file-row"><span>也可以从文件导入</span><button class="wfd-button" type="button" :disabled="compileState === 'loading'" @click="importFile">选择 JSON 文件</button></div><textarea v-model="jsonDraft" aria-label="业务 JSON" spellcheck="false" :disabled="compileState === 'loading'"></textarea><p v-if="jsonError" class="wfd-dialog-error" role="alert">{{ jsonError }}</p><footer><button class="wfd-button" type="button" @click="jsonImportOpen = false">取消</button><button class="wfd-button" type="button" :disabled="readonlyMode || compileState === 'loading'" @click="importJsonToCanvas">导入到画布</button><button class="wfd-button wfd-button-primary" type="button" :disabled="compileState === 'loading' || !props.compile" @click="convertJsonToXml">{{ compileState === 'loading' ? '转换中…' : '转换为 BPMN XML' }}</button></footer></section></div>
    <div v-if="xmlOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="xmlOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-xml-title"><header><div><h2 id="wfd-xml-title">BPMN XML</h2><p>由后端根据当前业务模型生成。</p></div><button type="button" aria-label="关闭" @click="xmlOpen = false">×</button></header><textarea v-model="xmlText" readonly aria-label="BPMN XML" spellcheck="false"></textarea><footer><button class="wfd-button" type="button" @click="copyText(xmlText, 'BPMN XML ')">复制 XML</button><button class="wfd-button" type="button" @click="downloadXml">下载 XML</button><button class="wfd-button wfd-button-primary" type="button" @click="xmlOpen = false">完成</button></footer></section></div>
    <div v-if="checkOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="checkOpen = false"><section class="wfd-dialog wfd-dialog-check" role="dialog" aria-modal="true" aria-labelledby="wfd-check-title"><header><div><h2 id="wfd-check-title">检查流程</h2><p>{{ allIssues.length ? '发现 ' + allIssues.length + ' 项问题。修复后再生成 BPMN XML 或部署。' : '检查通过，当前流程模型满足设计器基础规则。' }}</p></div><button type="button" aria-label="关闭" @click="checkOpen = false">×</button></header><div v-if="allIssues.length" class="wfd-dialog-issues"><button v-for="(issue, index) in allIssues" :key="issue.code + index" type="button" @click="activeNodeId = issue.nodeId; activeEdgeId = issue.edgeId; checkOpen = false"><span>!</span><span>{{ issue.message }}<small v-if="issue.locationLabel">位置：{{ issue.locationLabel }}</small></span></button></div><div v-else class="wfd-check-success"><span aria-hidden="true">✓</span><strong>没有发现结构问题</strong></div><footer><button class="wfd-button wfd-button-primary" type="button" @click="checkOpen = false">完成</button></footer></section></div>
    <div v-if="deployOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="deployState !== 'loading' && (deployOpen = false)"><section class="wfd-dialog wfd-dialog-check" role="dialog" aria-modal="true" aria-labelledby="wfd-deploy-title"><header><div><h2 id="wfd-deploy-title">{{ deployState === 'success' ? '任务模板发布完成' : '发布任务模板' }}</h2><p>{{ deployState === 'success' ? '后端已完成任务模板发布，可到业务流程页发起。' : '确认后会调用宿主提供的发布接口，将当前流程发布为可发起的业务任务模板。' }}</p></div><button v-if="deployState !== 'loading'" type="button" aria-label="关闭" @click="deployOpen = false">×</button></header><div v-if="deployState === 'success'" class="wfd-deploy-result"><p v-for="item in deploySummary" :key="item.label"><span>{{ item.label }}</span><code>{{ item.value }}</code></p></div><div v-else-if="deployState === 'error'" class="wfd-dialog-error" role="alert">{{ deployError }}</div><div v-else class="wfd-deploy-summary"><p><span>流程标识</span><code>{{ model.processId }}</code></p><p><span>流程名称</span><code>{{ model.processName }}</code></p><p><span>发布前检查</span><code>{{ allIssues.length ? '发现 ' + allIssues.length + ' 项问题' : '通过' }}</code></p></div><footer><button v-if="deployUncertain && deployState === 'error' && props.verifyDeployment" class="wfd-button" type="button" :disabled="verifyingDeployment" @click="verifyDeployment">{{ verifyingDeployment ? '正在查询…' : '查询发布状态' }}</button><button v-if="deployState !== 'loading'" class="wfd-button" type="button" @click="deployOpen = false">{{ deployState === 'success' ? '完成' : '取消' }}</button><button v-if="deployState !== 'success'" class="wfd-button wfd-button-primary" type="button" :disabled="!canDeploy || (deployUncertain && !deployVerified)" @click="deployWorkflow">{{ deployState === 'loading' ? '正在发布…' : deployState === 'error' ? '确认后重试' : '确认发布' }}</button></footer></section></div>
    <div v-if="readonlyMode" class="wfd-banner" role="status">{{ unsupportedEnvelope ? '此设计稿来自更新版本，当前以只读方式展示并保留原始数据。' : '当前设计稿处于只读模式。' }}</div>
    <div v-if="importError || viewError" class="wfd-alert" role="alert">{{ importError || viewError }}</div>
    <div class="wfd-workspace" :class="workspaceClasses">
      <aside class="wfd-library" aria-label="节点库"><div class="wfd-section-heading"><span class="wfd-panel-title">节点库</span><button class="wfd-panel-toggle" type="button" :aria-expanded="!nodeLibraryCollapsed" :aria-label="nodeLibraryCollapsed ? '展开节点库' : '折叠节点库'" :title="nodeLibraryCollapsed ? '展开节点库' : '折叠节点库'" @click="togglePanel('library')"><IconLayoutSidebarLeftCollapse v-if="!nodeLibraryCollapsed" :size="17" aria-hidden="true" /><IconLayoutSidebarLeftExpand v-else :size="17" aria-hidden="true" /></button></div>
        <section v-for="group in nodeGroups" :key="group.title" class="wfd-library-group"><h3>{{ group.title }}</h3><button v-for="item in group.items" :key="item.type" class="wfd-library-item" type="button" :disabled="readonlyMode" :draggable="!readonlyMode" @dragstart="onLibraryDragStart($event, item.type)" @click="addNode(item.type)"><span class="wfd-library-icon" :class="'wfd-tone-' + item.type" aria-hidden="true"><component :is="item.icon" :size="17" /></span><span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><IconPlus class="wfd-plus" :size="16" aria-hidden="true" /></button></section>
        <slot name="node-library-footer" />
      </aside>
      <main class="wfd-canvas-wrap" aria-label="流程画布" @dragover.prevent @drop.prevent="onCanvasDrop">
        <div class="wfd-canvas-toolbar">
          <div class="wfd-canvas-tool-group" aria-label="编辑历史">
            <button class="wfd-canvas-tool-button" type="button" :disabled="!canUndo || readonlyMode" aria-label="撤销" title="撤销 (Ctrl+Z)" @click="undo"><IconArrowBackUp :size="17" aria-hidden="true" /></button>
            <button class="wfd-canvas-tool-button" type="button" :disabled="!canRedo || readonlyMode" aria-label="重做" title="重做 (Ctrl+Y)" @click="redo"><IconArrowForwardUp :size="17" aria-hidden="true" /></button>
          </div>
          <div v-if="props.mode !== 'subprocess-fragment'" class="wfd-canvas-tool-group" aria-label="画布操作">
            <button class="wfd-canvas-tool-button wfd-canvas-tool-labelled" type="button" :disabled="readonlyMode || !nodes.length" title="自动排列当前流程" @click="autoLayout()"><IconWand :size="16" aria-hidden="true" /><span>自动布局</span></button>
            <button class="wfd-canvas-check" :class="allIssues.length ? 'is-warning' : 'is-valid'" type="button" :aria-label="allIssues.length ? '检查流程，发现 ' + allIssues.length + ' 项待处理' : '检查流程，通过'" :title="allIssues.length ? '查看并定位流程问题' : '流程检查通过，点击查看详情'" @click="runCheck"><IconChecklist :size="13" aria-hidden="true" /><span>{{ allIssues.length ? allIssues.length + ' 项待处理' : '检查通过' }}</span></button>
          </div>
        </div>
        <div class="wfd-canvas-stage">
          <VueFlow :id="flowId" v-model:nodes="nodes" v-model:edges="edges" class="wfd-flow" :node-types="nodeTypesMap" :edge-types="edgeTypesMap" :nodes-draggable="!readonlyMode" :nodes-connectable="!readonlyMode" :edges-updatable="!readonlyMode" :elements-selectable="true" :fit-view-on-init="!shouldAutoLayoutOnInit && !editorState.viewport" :min-zoom="0.2" :max-zoom="2.2" @init="handleFlowInit" @nodes-initialized="handleNodesInitialized" @connect="handleConnect" @edge-update="onEdgeUpdate" @node-click="onNodeClick" @edge-click="onEdgeClick" @pane-click="onPaneClick" @node-drag-start="onDragStart" @node-drag-stop="onDragStop" @move-end="onViewportChange">
          </VueFlow>
          <div class="wfd-canvas-caption" aria-hidden="true"><span class="wfd-canvas-caption-mark" /><strong>流程画布</strong><small>选择节点编辑属性，拖动连接点建立流转</small></div>
          <div v-if="!nodes.length" class="wfd-empty-canvas"><strong>从一个节点开始</strong><span>使用左侧节点库添加步骤，再拖动节点间的连接点。</span></div>
          <div class="wfd-canvas-legend" aria-hidden="true"><span class="wfd-dot" />通过路径<span class="wfd-dot wfd-dot-reject" />驳回回流</div>
          <div class="wfd-canvas-actions"><button type="button" aria-label="缩小画布" title="缩小画布" @click="zoomOut()">−</button><span>{{ Math.round(zoom * 100) }}%</span><button type="button" aria-label="放大画布" title="放大画布" @click="zoomIn()">+</button><i /><button type="button" aria-label="适应画布" title="适应画布" @click="fitView({ padding: 0.18 })">适应</button></div><slot name="canvas-overlay" :issues="allIssues" />
        </div>
      </main>
      <aside class="wfd-inspector" aria-label="属性面板"><div class="wfd-section-heading"><button class="wfd-panel-toggle" type="button" :aria-expanded="!propertiesPanelCollapsed" :aria-label="propertiesPanelCollapsed ? '展开属性面板' : '折叠属性面板'" :title="propertiesPanelCollapsed ? '展开属性面板' : '折叠属性面板'" @click="togglePanel('properties')"><IconLayoutSidebarRightCollapse v-if="!propertiesPanelCollapsed" :size="17" aria-hidden="true" /><IconLayoutSidebarRightExpand v-else :size="17" aria-hidden="true" /></button><span class="wfd-panel-title">{{ selectedNode ? '节点属性' : selectedEdge ? '连线属性' : '流程属性' }}</span><button v-if="(selectedNode || selectedEdge) && !readonlyMode" class="wfd-text-danger" type="button" @click="removeSelection">删除</button></div>
          <template v-if="selectedNode"><div class="wfd-selected-kind"><span class="wfd-library-icon" :class="'wfd-tone-' + selectedNode.data.kind" aria-hidden="true"><component :is="props.extensions?.nodeComponent ? undefined : nodeTypes.find(item => item.type === selectedNode?.data.kind)?.icon" :size="17" /></span><span><strong>{{ nodeTypes.find(item => item.type === selectedNode?.data.kind)?.title ?? '未知节点' }}</strong><small>{{ selectedNode.id }}</small></span></div>
          <component v-if="props.extensions?.nodePropertyEditors?.[selectedNode.data.kind as WorkflowNodeType]" :is="props.extensions.nodePropertyEditors[selectedNode.data.kind as WorkflowNodeType]" :model="getRecord(selectedNode.id)" :readonly="readonlyMode" :update="(key: string, value: unknown) => updateNode(selectedNode!.id, key, value)" />
          <template v-else-if="nodeTypes.some(item => item.type === selectedNode?.data.kind)">
            <label class="wfd-field"><span>节点名称</span><input :value="selectedNode.data.name" :disabled="readonlyMode" @focus="pushHistory" @change="commitTextInput($event, value => updateNode(selectedNode!.id, 'name', value))"></label>
            <label class="wfd-field"><span>节点标识</span><input :value="selectedNode.id" disabled></label>
            <p v-if="selectedNode.data.kind === 'parallel'" class="wfd-field-note" role="status">{{ parallelExplanation }}</p>
            <label v-if="props.mode !== 'subprocess-fragment'" class="wfd-field"><span>业务标识（bizType）</span><input :value="String(getRecord(selectedNode.id)?.bizType ?? '')" :disabled="readonlyMode" placeholder="可选，供宿主业务系统识别" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'bizType', ($event.target as HTMLInputElement).value)"></label>
            <label class="wfd-field"><span>业务数据（bizJson）</span><textarea :value="getRecord(selectedNode.id)?.bizJson ?? ''" :disabled="readonlyMode" :aria-describedby="flowId + '-bizjson-hint'" rows="4" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'bizJson', ($event.target as HTMLTextAreaElement).value)" /></label>
            <p :id="flowId + '-bizjson-hint'" class="wfd-field-note">可选，业务自定义数据字符串；作为模板默认值，可由实例变量覆盖。</p>
          <component v-if="getWorkflowNodeDefinition(selectedNode.data.kind)?.propertyEditor" :is="getWorkflowNodeDefinition(selectedNode.data.kind)?.propertyEditor" :model="getRecord(selectedNode.id)" :readonly="readonlyMode" :reminder-targets="reminderTargetNodes" :subprocess-fragments="props.extensions?.subprocessFragments" :business-forms="props.extensions?.businessForms" :begin-edit="pushHistory" :update="(key: string, value: unknown) => updateNode(selectedNode!.id, key, value)" />
          </template><p v-else class="wfd-readonly-note">此版本无法编辑该节点。原始节点数据将在导出中保留，且不能编译。</p>
          <p class="wfd-coordinate">画布位置 <code>{{ Math.round(selectedNode.position.x) }}, {{ Math.round(selectedNode.position.y) }}</code></p>
        </template>
        <template v-else-if="selectedEdge"><div class="wfd-selected-kind"><span class="wfd-edge-symbol" aria-hidden="true">↗</span><span><strong>顺序流</strong><small>{{ getRecord(selectedEdge.source)?.name ?? selectedEdge.source }} → {{ getRecord(selectedEdge.target)?.name ?? selectedEdge.target }}</small></span></div>
          <p v-if="parallelOutgoing" class="wfd-field-note">全部分支执行：并行网关的出线不能设置分支语义或条件表达式。</p>
          <div v-if="hasParallelConditions" class="wfd-field-note" role="alert"><p>这条并行出线包含已有条件。请显式清除后再编译；原值保留在下方。</p><button class="wfd-button" type="button" :disabled="readonlyMode" @click="clearParallelConditions">清除并行出线条件</button><pre>{{ JSON.stringify({ branch: selectedEdge.data.original.branch, conditionExpression: selectedEdge.data.original.conditionExpression }, null, 2) }}</pre></div>
          <label class="wfd-field"><span>分支语义</span><select :value="String(selectedEdge.data?.branch ?? '')" :disabled="readonlyMode || parallelOutgoing" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'branch', ($event.target as HTMLSelectElement).value)"><option value="">普通流转</option><option value="pass">通过</option><option value="reject">驳回</option></select></label>
          <label class="wfd-field"><span>条件表达式</span><textarea :value="String(selectedEdge.data?.conditionExpression ?? '')" :disabled="readonlyMode || parallelOutgoing" rows="3" placeholder="例如：amount > 5000" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'conditionExpression', ($event.target as HTMLTextAreaElement).value)" /></label>
          <label class="wfd-field"><span>起点</span><select :value="selectedEdge.source" :disabled="readonlyMode" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'source', ($event.target as HTMLSelectElement).value)"><option v-for="node in model.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
          <label class="wfd-field"><span>终点</span><select :value="selectedEdge.target" :disabled="readonlyMode" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'target', ($event.target as HTMLSelectElement).value)"><option v-for="node in model.nodes" :key="node.id" :value="node.id">{{ node.name }}</option></select></label>
        </template>
        <template v-else><label class="wfd-field"><span>流程名称</span><input :value="model.processName" :disabled="readonlyMode" @focus="pushHistory" @change="commitTextInput($event, value => updateProcess('processName', value))"></label><label class="wfd-field"><span>流程标识</span><input :value="model.processId" :disabled="readonlyMode" @focus="pushHistory" @change="commitTextInput($event, value => updateProcess('processId', value))"></label><div class="wfd-inspector-empty"><span class="wfd-inspector-glyph" aria-hidden="true">⌖</span><strong>选择一个步骤或连线</strong><small>在画布中选择对象以查看和编辑其属性。</small></div></template>
        <div v-if="allIssues.length" class="wfd-issue-list" aria-label="流程问题"><div class="wfd-issue-heading">检查结果</div><button v-for="(issue, index) in allIssues.slice(0, 5)" :key="issue.code + index" type="button" class="wfd-issue" @click="issue.nodeId ? (activeNodeId = issue.nodeId, activeEdgeId = undefined) : issue.edgeId ? (activeEdgeId = issue.edgeId, activeNodeId = undefined) : undefined"><span class="wfd-issue-mark" aria-hidden="true">!</span>{{ issue.message }}</button></div>
        <div v-if="compileState !== 'idle'" class="wfd-compile-panel" :class="'is-' + compileState" aria-live="polite"><strong>{{ compileState === 'loading' ? '正在请求宿主编译' : compileState === 'success' ? '编译完成' : '编译失败' }}</strong><pre v-if="compileState === 'success'">{{ safeJson(compileResult) }}</pre><p v-if="compileState === 'error'">{{ compileError }}</p></div><slot name="inspector-footer" :model="model" :issues="allIssues" />
      </aside>
    </div>
    <footer class="wfd-footer">
      <span class="wfd-footer-mode"><i :class="{ 'is-readonly': readonlyMode }" />{{ readonlyMode ? '只读模式' : '编辑模式' }}</span>
      <span>{{ model.nodes.length }} 个节点 · {{ model.flows.length }} 条连线</span>
      <span class="wfd-footer-shortcuts">Delete 删除所选 · Ctrl Z 撤销</span>
    </footer>
  </section>
</template>
