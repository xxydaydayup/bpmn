<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { VueFlow, useVueFlow, type Connection, type NodeMouseEvent, type EdgeMouseEvent } from '@vue-flow/core'
import { IconArrowBackUp, IconArrowForwardUp, IconArrowsSplit, IconChecklist, IconClock, IconCloudUpload, IconCode, IconDownload, IconFileImport, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconMessage, IconPlayerPlay, IconPlus, IconRobot, IconSquare, IconTemplate, IconUserCheck, IconUsers, IconWand } from '@tabler/icons-vue'
import { createDesignDocument, isWorkflowModel, parseWorkflowInput } from './contract'
import { templateIcons } from './icons'
import { cloneWorkflowModelWithFreshNodeIds, createNodeRecord, createWorkflowNodeId, fromCanvas, normalizeLegacyUuidNodeIds, toCanvas, type DesignerEdge, type DesignerNode } from './adapter'
import { canConnectNodes, validateWorkflowModel } from './validation'
import { layoutWorkflow, refreshFeedbackRoutes } from './layout'
import WorkflowNode from './nodes/WorkflowNode.vue'
import WorkflowEdge from './edges/WorkflowEdge.vue'
import { workflowTemplates } from './templates'
import type { WorkflowCompile, WorkflowDeploy, WorkflowDesignDocument, WorkflowDesignerExtensions, WorkflowInput, WorkflowModel, WorkflowNodeRecord, WorkflowNodeType, WorkflowValidationIssue, WorkflowVerifyDeployment, WorkflowViewport } from './types'
import './style.css'

const props = withDefaults(defineProps<{ modelValue?: WorkflowInput; compile?: WorkflowCompile; deploy?: WorkflowDeploy; verifyDeployment?: WorkflowVerifyDeployment; readonly?: boolean; autoLayoutOnInit?: boolean; extensions?: WorkflowDesignerExtensions }>(), { readonly: false, autoLayoutOnInit: false })
const emit = defineEmits<{ 'update:modelValue': [value: WorkflowDesignDocument | Record<string, unknown>]; 'compile-start': []; 'compile-success': [result: unknown]; 'compile-error': [error: unknown] }>()
const nodeTypes: { type: WorkflowNodeType; title: string; description: string }[] = [
  { type: 'start', title: '开始', description: '流程触发入口' }, { type: 'approval', title: '审批', description: '单人办理步骤' },
  { type: 'countersign', title: '多人审批', description: '多人共同办理' }, { type: 'service', title: '服务调用', description: '调用外部服务' },
  { type: 'receive', title: '消息等待', description: '收到业务消息后继续' }, { type: 'timer', title: '定时等待', description: '到期后由引擎自动继续' },
  { type: 'condition', title: '条件分支', description: '按条件选择路径' }, { type: 'end', title: '结束', description: '流程完成' },
]
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
const issues = ref<WorkflowValidationIssue[]>(validateWorkflowModel(initial.model, props.extensions?.validate?.(initial.model) ?? []))
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
const history = ref<string[]>([])
const historyIndex = ref(-1)
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
const reminderTargetNodes = computed(() => model.value.nodes.filter(node => node.id !== selectedNode.value?.id && ['approval', 'countersign', 'service'].includes(node.type)))
const readonlyMode = computed(() => props.readonly || originalReadonly.value)
const model = computed(() => fromCanvas(nodes.value, edges.value, baseModel()))
const allIssues = computed<WorkflowValidationIssue[]>(() => [...issues.value, ...unknownPaths.value.map(path => ({ code: 'unknown-business-data', message: '发现未识别的业务数据（' + path + '），保留原文但禁止编译。' }))])
const canCompile = computed(() => Boolean(props.compile) && !readonlyMode.value && allIssues.value.length === 0 && compileState.value !== 'loading')
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
const nodeOptions = computed(() => nodeTypes.filter(item => (props.extensions?.nodeTypes ?? nodeTypes.map(node => node.type)).includes(item.type)))
const nodeGroups = computed(() => [
  { title: '人工与服务', items: nodeOptions.value.filter(item => ['start', 'approval', 'countersign', 'service'].includes(item.type)) },
  { title: '流程事件', items: nodeOptions.value.filter(item => ['receive', 'timer'].includes(item.type)) },
  { title: '流程控制', items: nodeOptions.value.filter(item => ['condition', 'end'].includes(item.type)) },
].filter(group => group.items.length))

function baseModel(): WorkflowModel { const value = documentState.value as Partial<WorkflowDesignDocument>; return value.model && Array.isArray(value.model.nodes) ? value.model as WorkflowModel : initial.model }
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
function snapshot() { return JSON.stringify(currentDocument()) }
function togglePanel(panel: 'library' | 'properties') {
  if (panel === 'library') nodeLibraryCollapsed.value = !nodeLibraryCollapsed.value
  else propertiesPanelCollapsed.value = !propertiesPanelCollapsed.value
}
function applyDocument(input: WorkflowInput) {
  const parsed = parseWorkflowInput(input); parsed.model = normalizeLegacyUuidNodeIds(parsed.model); const canvas = toCanvas(parsed.model, parsed.editor)
  documentState.value = parsed.document; editorState.value = parsed.editor; nodes.value = canvas.nodes; edges.value = canvas.edges
  unknownPaths.value = parsed.unknownPaths; unsupportedEnvelope.value = parsed.unsupportedEnvelope; originalReadonly.value = parsed.readonly
  activeNodeId.value = undefined; activeEdgeId.value = undefined
  issues.value = validateWorkflowModel(parsed.model, props.extensions?.validate?.(parsed.model) ?? [])
  compileState.value = 'idle'; compileResult.value = undefined; compileError.value = ''
  nextTick(() => { if (parsed.editor.viewport) void setViewport(parsed.editor.viewport) })
}
watch(() => props.modelValue, value => { if (!loadingInput.value && value !== undefined && JSON.stringify(value) !== snapshot()) applyDocument(value) }, { deep: true })
function updateDocument() {
  if (loadingInput.value || unsupportedEnvelope.value) return
  documentState.value = { ...(documentState.value as Record<string, unknown>), format: 'workflow-designer', version: 1, model: model.value, editor: currentEditor() }
  issues.value = validateWorkflowModel(model.value, props.extensions?.validate?.(model.value) ?? [])
  unknownPaths.value = parseWorkflowInput(currentDocument()).unknownPaths
  compileState.value = 'idle'; compileError.value = ''; emit('update:modelValue', currentDocument())
  if (!draggingNodes.value) pushHistory()
}
watch(() => props.extensions?.validate, () => { issues.value = validateWorkflowModel(model.value, props.extensions?.validate?.(model.value) ?? []) })
function pushHistory() {
  if (readonlyMode.value || unsupportedEnvelope.value) return
  const current = snapshot(); if (historyIndex.value < 0) { history.value = [current]; historyIndex.value = 0; return }
  history.value = history.value.slice(0, historyIndex.value + 1); if (history.value.at(-1) !== current) history.value.push(current); historyIndex.value = history.value.length - 1
}
function restoreHistory(direction: -1 | 1) {
  if (readonlyMode.value) return
  if (historyIndex.value < 0) pushHistory()
  const next = historyIndex.value + direction; if (next < 0 || next >= history.value.length) return
  historyIndex.value = next; loadingInput.value = true; applyDocument(JSON.parse(history.value[next]) as WorkflowInput)
  nextTick(() => { loadingInput.value = false; emit('update:modelValue', currentDocument()) })
}
const canUndo = computed(() => historyIndex.value > 0); const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1)
function undo() { restoreHistory(-1) } function redo() { restoreHistory(1) }
function getRecord(id: string) { return model.value.nodes.find(item => item.id === id) }
function updateNode(id: string, key: string, value: unknown) {
  if (readonlyMode.value) return
  const node = nodes.value.find(item => item.id === id); if (!node) return
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
    } else if (key === 'reminder' && value && typeof value === 'object') {
      const reminder = Object.fromEntries(Object.entries(value).filter(([, entry]) => String(entry ?? '').trim()))
      custom.reminder = reminder; original.reminder = reminder
    } else if (key === 'reminder') {
      delete custom.reminder; delete original.reminder
    } else if (value === '' || value === undefined || value === null) { delete custom[key]; delete original[key] }
    else {
      const nextValue = key === 'passRate' && typeof value === 'string' ? value.trim() : value
      if (nextValue === '') { delete custom[key]; delete original[key] }
      else { custom[key] = nextValue; original[key] = nextValue as never }
    }
    if (key === 'approveMode' && value !== 'VOTE') { delete custom.passRate; delete original.passRate }
    return { ...item, data: { ...item.data, custom, original } }
  })
  updateDocument()
}
function updateReminder(id: string, key: 'action' | 'target', value: string) {
  const reminder = getRecord(id)?.reminder
  if (!reminder) return
  updateNode(id, 'reminder', { ...reminder, [key]: value, ...(key === 'action' && value !== 'return' ? { target: '' } : {}) })
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
  edges.value = edges.value.map(item => item.id !== id ? item : key === 'source' || key === 'target'
    ? { ...item, [key]: value }
    : { ...item, data: { ...item.data, [key]: value || undefined } })
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
  const source = model.value.nodes.find(node => node.id === connection.source); const target = model.value.nodes.find(node => node.id === connection.target)
  if (!source || !target || !(props.extensions?.canConnect?.(source, target, model.value) ?? canConnectNodes(source, target, model.value))) return
  pushHistory()
  const id = 'flow-' + Date.now().toString(36)
  edges.value = [...edges.value, { id, source: source.id, target: target.id, type: 'workflowRoute', data: { original: { source: source.id, target: target.id } }, markerEnd: 'arrowclosed' } as DesignerEdge]
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
  loadingInput.value = true
  applyDocument(cloneWorkflowModelWithFreshNodeIds(template.model))
  history.value = []
  historyIndex.value = -1
  templateOpen.value = false
  nextTick(() => {
    loadingInput.value = false
    updateDocument()
    history.value = [snapshot()]
    historyIndex.value = 0
    void fitView({ padding: 0.15, duration: 220 })
  })
}
watch([nodes, edges, zoom], () => {
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
  if (!shouldAutoLayoutOnInit || readonlyMode.value || !nodes.value.length) { initialLayoutApplied = true; return }
  const measuredNodes = flow.getNodes.value
  if (!measuredNodes.length || measuredNodes.some(node => !node.dimensions.width || !node.dimensions.height || !node.handleBounds)) return
  initialLayoutApplied = true
  await autoLayout(false)
}
async function autoLayout(recordHistory = true) { if (readonlyMode.value || !nodes.value.length) return; viewError.value = ''; if (recordHistory) pushHistory(); try { const dimensions = new Map(flow.getNodes.value.map(node => [node.id, { width: node.dimensions.width, height: node.dimensions.height }])); const result = await layoutWorkflow(nodes.value, edges.value, dimensions); nodes.value = result.nodes; edges.value = result.edges; updateDocument(); await nextTick(); await waitForFlowRender(); await fitView({ padding: 0.12, duration: 260 }) } catch (error) { viewError.value = '自动布局失败：' + String(error) } }
function waitForFlowRender() {
  return new Promise<void>(resolve => {
    if (typeof window.requestAnimationFrame !== 'function') { window.setTimeout(resolve, 0); return }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  })
}
function onViewportChange(event: { flowTransform: WorkflowViewport }) { zoom.value = event.flowTransform.zoom; editorState.value = { ...editorState.value, viewport: event.flowTransform }; updateDocument() }
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
    loadingInput.value = true; applyDocument(parsed.document as WorkflowInput); jsonImportOpen.value = false; jsonError.value = ''
    if (!parsed.readonly) { updateDocument(); pushHistory() }
    nextTick(() => { loadingInput.value = false; if (parsed.editor.viewport) void setViewport(parsed.editor.viewport); else void fitView({ padding: 0.15, duration: 220 }) })
  } catch (error) { jsonError.value = error instanceof Error ? error.message : String(error) }
}
async function compileModel(candidate: WorkflowModel = model.value, openXml = true) {
  const isCurrent = JSON.stringify(candidate) === JSON.stringify(model.value)
  const candidateIssues = validateWorkflowModel(candidate, props.extensions?.validate?.(candidate) ?? [])
  if (!props.compile || (isCurrent && !canCompile.value) || candidateIssues.length || parseWorkflowInput(candidate).unknownPaths.length) {
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
  issues.value = validateWorkflowModel(model.value, props.extensions?.validate?.(model.value) ?? [])
  checkOpen.value = true
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
onMounted(() => { document.addEventListener('keydown', onKeydown); issues.value = validateWorkflowModel(model.value, props.extensions?.validate?.(model.value) ?? []); if (historyIndex.value < 0) pushHistory() })
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
defineExpose({ compile: compileModel, exportDesign: currentDocument })
</script>

<template>
  <section class="wfd" :class="{ 'wfd-readonly': readonlyMode }" :style="themeVariables" aria-label="业务工作流设计器">
    <header class="wfd-toolbar">
      <div class="wfd-brand">
        <span class="wfd-brand-mark" aria-hidden="true">WF</span>
        <div class="wfd-brand-copy"><strong>业务流程设计</strong><small :title="model.processId">{{ model.processName || '未命名流程' }} · {{ model.nodes.length }} 个节点</small></div>
      </div>
      <div class="wfd-toolbar-actions">
        <slot name="toolbar-start" :document="currentDocument()" />
        <div class="wfd-tool-group" aria-label="编辑历史">
          <button class="wfd-button wfd-icon-button" type="button" :disabled="!canUndo || readonlyMode" aria-label="撤销" title="撤销 (Ctrl+Z)" @click="undo"><IconArrowBackUp :size=17 /></button>
          <button class="wfd-button wfd-icon-button" type="button" :disabled="!canRedo || readonlyMode" aria-label="重做" title="重做 (Ctrl+Y)" @click="redo"><IconArrowForwardUp :size=17 /></button>
        </div>
        <span class="wfd-toolbar-divider" />
        <div class="wfd-tool-group" aria-label="编排工具">
          <button class="wfd-button" type="button" :disabled="readonlyMode" @click="autoLayout()"><IconWand :size=16 /><span>自动布局</span></button>
          <button class="wfd-button" type="button" :disabled="readonlyMode" @click="templateOpen = true"><IconTemplate :size=16 /><span>流程模板</span></button>
        </div>
        <span class="wfd-toolbar-divider" />
        <div class="wfd-tool-group" aria-label="流程数据">
          <button class="wfd-button" type="button" @click="jsonViewOpen = true"><IconCode :size=16 /><span>查看业务 JSON</span></button>
          <button class="wfd-button" type="button" :disabled="readonlyMode" @click="openImportJson"><IconFileImport :size=16 /><span>导入 / 转换 JSON</span></button>
          <button class="wfd-button" type="button" :disabled="!canCompile" @click="compileModel()"><IconCode :size=16 /><span>{{ compileState === 'loading' ? '编译中…' : '生成 BPMN XML' }}</span></button>
          <button class="wfd-button" type="button" @click="runCheck"><IconChecklist :size=16 /><span>检查流程</span></button>
          <button class="wfd-button" type="button" @click="exportToFile"><IconDownload :size=16 /><span>导出设计稿</span></button>
        </div>
        <div class="wfd-tool-group wfd-publish-action">
          <button v-if="props.deploy" class="wfd-button wfd-button-primary" type="button" :disabled="!canDeploy" @click="openDeploy"><IconCloudUpload :size=16 /><span>发布任务模板</span></button>
        </div>
        <slot name="toolbar-end" :document="currentDocument()" /><input ref="fileInput" class="wfd-visually-hidden" type="file" accept="application/json,.json" @change="onFileSelected">
      </div>
    </header>
    <div v-if="templateOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="templateOpen = false"><section class="wfd-dialog wfd-dialog-template" role="dialog" aria-modal="true" aria-labelledby="wfd-template-title"><header><div><h2 id="wfd-template-title">流程模板</h2><p>使用模板会替换当前业务流程与撤销历史；模型由 WorkflowModel JSON 描述。</p></div><button type="button" aria-label="关闭" @click="templateOpen = false">×</button></header><div class="wfd-template-options" role="radiogroup" aria-label="选择流程模板"><label v-for="item in workflowTemplates" :key="item.id" class="wfd-template-option" :class="{ 'is-selected': selectedTemplateId === item.id }"><input v-model="selectedTemplateId" type="radio" name="workflow-template" :value="item.id"><span class="wfd-template-icon" :class="'wfd-tone-' + item.model.nodes[1]?.type" aria-hidden="true" v-html="templateIcons[item.model.nodes[1]?.type === 'countersign' ? 'plus' : item.model.nodes[1]?.type === 'service' ? 'service' : item.model.nodes.some(node => node.type === 'condition') ? 'branch' : 'user']"></span><span class="wfd-template-copy"><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span><span class="wfd-template-mark" aria-hidden="true">{{ selectedTemplateId === item.id ? '✓' : '' }}</span></label></div><div class="wfd-template-preview"><div><span>流程标识</span><code>{{ selectedTemplate.model.processId }}</code></div><div><span>节点 / 连线</span><code>{{ selectedTemplate.model.nodes.length }} / {{ selectedTemplate.model.flows.length }}</code></div><div><span>多人审批</span><code>{{ selectedTemplate.model.nodes.find(node => node.type === 'countersign')?.approveMode ?? '—' }}</code></div><div v-if="selectedTemplate.sourceProcessDefinitionId"><span>来源流程定义</span><code>{{ selectedTemplate.sourceProcessDefinitionId }}</code></div></div><footer><button class="wfd-button" type="button" @click="templateOpen = false">取消</button><button class="wfd-button" type="button" @click="jsonDraft = safeJson(selectedTemplate.model); jsonImportOpen = true; templateOpen = false">查看 JSON</button><button class="wfd-button wfd-button-primary" type="button" :disabled="readonlyMode" @click="applyTemplate">使用模板</button></footer></section></div>
    <div v-if="jsonViewOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="jsonViewOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-json-title"><header><div><h2 id="wfd-json-title">业务模型 JSON</h2><p>当前业务模型；设计稿视口与主题保存在独立信封中。</p></div><button type="button" aria-label="关闭" @click="jsonViewOpen = false">×</button></header><textarea :value="safeJson(model)" readonly aria-label="业务模型 JSON" spellcheck="false"></textarea><footer><button class="wfd-button" type="button" @click="copyText(safeJson(model), 'JSON ')">复制 JSON</button><button class="wfd-button" type="button" @click="downloadJson">下载 JSON</button><button class="wfd-button wfd-button-primary" type="button" @click="jsonViewOpen = false">完成</button></footer></section></div>
    <div v-if="jsonImportOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="jsonImportOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-import-title"><header><div><h2 id="wfd-import-title">导入 / 转换业务 JSON</h2><p>粘贴 WorkflowModel v1 或版本化设计稿。导入后可继续编辑，或请求后端转换成 BPMN XML。</p></div><button type="button" aria-label="关闭" @click="jsonImportOpen = false">×</button></header><div class="wfd-dialog-file-row"><span>也可以从文件导入</span><button class="wfd-button" type="button" :disabled="compileState === 'loading'" @click="importFile">选择 JSON 文件</button></div><textarea v-model="jsonDraft" aria-label="业务 JSON" spellcheck="false" :disabled="compileState === 'loading'"></textarea><p v-if="jsonError" class="wfd-dialog-error" role="alert">{{ jsonError }}</p><footer><button class="wfd-button" type="button" @click="jsonImportOpen = false">取消</button><button class="wfd-button" type="button" :disabled="readonlyMode || compileState === 'loading'" @click="importJsonToCanvas">导入到画布</button><button class="wfd-button wfd-button-primary" type="button" :disabled="compileState === 'loading' || !props.compile" @click="convertJsonToXml">{{ compileState === 'loading' ? '转换中…' : '转换为 BPMN XML' }}</button></footer></section></div>
    <div v-if="xmlOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="xmlOpen = false"><section class="wfd-dialog" role="dialog" aria-modal="true" aria-labelledby="wfd-xml-title"><header><div><h2 id="wfd-xml-title">BPMN XML</h2><p>由后端根据当前业务模型生成。</p></div><button type="button" aria-label="关闭" @click="xmlOpen = false">×</button></header><textarea v-model="xmlText" readonly aria-label="BPMN XML" spellcheck="false"></textarea><footer><button class="wfd-button" type="button" @click="copyText(xmlText, 'BPMN XML ')">复制 XML</button><button class="wfd-button" type="button" @click="downloadXml">下载 XML</button><button class="wfd-button wfd-button-primary" type="button" @click="xmlOpen = false">完成</button></footer></section></div>
    <div v-if="checkOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="checkOpen = false"><section class="wfd-dialog wfd-dialog-check" role="dialog" aria-modal="true" aria-labelledby="wfd-check-title"><header><div><h2 id="wfd-check-title">检查流程</h2><p>{{ allIssues.length ? '发现 ' + allIssues.length + ' 项问题。修复后再生成 BPMN XML 或部署。' : '检查通过，当前流程模型满足设计器基础规则。' }}</p></div><button type="button" aria-label="关闭" @click="checkOpen = false">×</button></header><div v-if="allIssues.length" class="wfd-dialog-issues"><button v-for="(issue, index) in allIssues" :key="issue.code + index" type="button" @click="activeNodeId = issue.nodeId; activeEdgeId = issue.edgeId; checkOpen = false"><span>!</span><span>{{ issue.message }}<small v-if="issue.locationLabel">位置：{{ issue.locationLabel }}</small></span></button></div><div v-else class="wfd-check-success"><span aria-hidden="true">✓</span><strong>没有发现结构问题</strong></div><footer><button class="wfd-button wfd-button-primary" type="button" @click="checkOpen = false">完成</button></footer></section></div>
    <div v-if="deployOpen" class="wfd-dialog-backdrop" role="presentation" @click.self="deployState !== 'loading' && (deployOpen = false)"><section class="wfd-dialog wfd-dialog-check" role="dialog" aria-modal="true" aria-labelledby="wfd-deploy-title"><header><div><h2 id="wfd-deploy-title">{{ deployState === 'success' ? '任务模板发布完成' : '发布任务模板' }}</h2><p>{{ deployState === 'success' ? '后端已完成任务模板发布，可到业务流程页发起。' : '确认后会调用宿主提供的发布接口，将当前流程发布为可发起的业务任务模板。' }}</p></div><button v-if="deployState !== 'loading'" type="button" aria-label="关闭" @click="deployOpen = false">×</button></header><div v-if="deployState === 'success'" class="wfd-deploy-result"><p v-for="item in deploySummary" :key="item.label"><span>{{ item.label }}</span><code>{{ item.value }}</code></p></div><div v-else-if="deployState === 'error'" class="wfd-dialog-error" role="alert">{{ deployError }}</div><div v-else class="wfd-deploy-summary"><p><span>流程标识</span><code>{{ model.processId }}</code></p><p><span>流程名称</span><code>{{ model.processName }}</code></p><p><span>发布前检查</span><code>{{ allIssues.length ? '发现 ' + allIssues.length + ' 项问题' : '通过' }}</code></p></div><footer><button v-if="deployUncertain && deployState === 'error' && props.verifyDeployment" class="wfd-button" type="button" :disabled="verifyingDeployment" @click="verifyDeployment">{{ verifyingDeployment ? '正在查询…' : '查询发布状态' }}</button><button v-if="deployState !== 'loading'" class="wfd-button" type="button" @click="deployOpen = false">{{ deployState === 'success' ? '完成' : '取消' }}</button><button v-if="deployState !== 'success'" class="wfd-button wfd-button-primary" type="button" :disabled="!canDeploy || (deployUncertain && !deployVerified)" @click="deployWorkflow">{{ deployState === 'loading' ? '正在发布…' : deployState === 'error' ? '确认后重试' : '确认发布' }}</button></footer></section></div>
    <div v-if="readonlyMode" class="wfd-banner" role="status">{{ unsupportedEnvelope ? '此设计稿来自更新版本，当前以只读方式展示并保留原始数据。' : '当前设计稿处于只读模式。' }}</div>
    <div v-if="importError || viewError" class="wfd-alert" role="alert">{{ importError || viewError }}</div>
    <div v-if="allIssues.length" class="wfd-validation-summary" role="status"><strong>{{ unknownPaths.length ? '包含未识别数据，编译已禁用' : '流程检查' }}</strong><span>{{ allIssues.length }} 项待处理</span><button v-if="allIssues[0]?.nodeId" type="button" @click="activeNodeId = allIssues[0].nodeId; activeEdgeId = undefined">定位第一项</button></div>
    <div class="wfd-workspace" :class="workspaceClasses">
      <aside class="wfd-library" aria-label="节点库"><div class="wfd-section-heading"><span class="wfd-panel-title">节点库</span><small>点击添加步骤</small><button class="wfd-panel-toggle" type="button" :aria-expanded="!nodeLibraryCollapsed" :aria-label="nodeLibraryCollapsed ? '展开节点库' : '折叠节点库'" :title="nodeLibraryCollapsed ? '展开节点库' : '折叠节点库'" @click="togglePanel('library')"><IconLayoutSidebarLeftCollapse v-if="!nodeLibraryCollapsed" :size="20" aria-hidden="true" /><IconLayoutSidebarLeftExpand v-else :size="20" aria-hidden="true" /></button></div>
        <section v-for="group in nodeGroups" :key="group.title" class="wfd-library-group"><h3>{{ group.title }}</h3><button v-for="item in group.items" :key="item.type" class="wfd-library-item" type="button" :disabled="readonlyMode" :draggable="!readonlyMode" @dragstart="onLibraryDragStart($event, item.type)" @click="addNode(item.type)"><span class="wfd-library-icon" :class="'wfd-tone-' + item.type" aria-hidden="true"><IconPlayerPlay v-if="item.type === 'start'" :size="17" /><IconUserCheck v-else-if="item.type === 'approval'" :size="17" /><IconUsers v-else-if="item.type === 'countersign'" :size="17" /><IconRobot v-else-if="item.type === 'service'" :size="17" /><IconMessage v-else-if="item.type === 'receive'" :size="17" /><IconClock v-else-if="item.type === 'timer'" :size="17" /><IconArrowsSplit v-else-if="item.type === 'condition'" :size="17" /><IconSquare v-else :size="17" /></span><span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><IconPlus class="wfd-plus" :size="16" aria-hidden="true" /></button></section>
        <slot name="node-library-footer" />
      </aside>
      <main class="wfd-canvas-wrap" aria-label="流程画布" @dragover.prevent @drop.prevent="onCanvasDrop">
      <VueFlow :id="flowId" v-model:nodes="nodes" v-model:edges="edges" class="wfd-flow" :node-types="nodeTypesMap" :edge-types="edgeTypesMap" :nodes-draggable="!readonlyMode" :nodes-connectable="!readonlyMode" :edges-updatable="!readonlyMode" :elements-selectable="true" :fit-view-on-init="!shouldAutoLayoutOnInit && !editorState.viewport" :min-zoom="0.2" :max-zoom="2.2" @init="handleFlowInit" @nodes-initialized="handleNodesInitialized" @connect="handleConnect" @node-click="onNodeClick" @edge-click="onEdgeClick" @pane-click="onPaneClick" @node-drag-start="onDragStart" @node-drag-stop="onDragStop" @move-end="onViewportChange">
        </VueFlow>
        <div class="wfd-canvas-caption" aria-hidden="true"><span class="wfd-canvas-caption-mark" /><strong>流程画布</strong><small>选择节点编辑属性，拖动连接点建立流转</small></div>
        <div v-if="!nodes.length" class="wfd-empty-canvas"><strong>从一个节点开始</strong><span>使用左侧节点库添加步骤，再拖动节点间的连接点。</span></div>
        <div class="wfd-canvas-legend" aria-hidden="true"><span class="wfd-dot" />通过路径<span class="wfd-dot wfd-dot-reject" />驳回回流</div>
        <div class="wfd-canvas-actions"><button type="button" aria-label="缩小" title="缩小" @click="zoomOut()">−</button><span>{{ Math.round(zoom * 100) }}%</span><button type="button" aria-label="放大" title="放大" @click="zoomIn()">+</button><i /><button type="button" aria-label="适应画布" title="适应画布" @click="fitView({ padding: 0.18 })">适应</button></div><slot name="canvas-overlay" :issues="allIssues" />
      </main>
      <aside class="wfd-inspector" aria-label="属性面板"><div class="wfd-section-heading"><button class="wfd-panel-toggle" type="button" :aria-expanded="!propertiesPanelCollapsed" :aria-label="propertiesPanelCollapsed ? '展开属性面板' : '折叠属性面板'" :title="propertiesPanelCollapsed ? '展开属性面板' : '折叠属性面板'" @click="togglePanel('properties')"><IconLayoutSidebarRightCollapse v-if="!propertiesPanelCollapsed" :size="20" aria-hidden="true" /><IconLayoutSidebarRightExpand v-else :size="20" aria-hidden="true" /></button><span class="wfd-panel-title">{{ selectedNode ? '节点属性' : selectedEdge ? '连线属性' : '流程属性' }}</span><button v-if="(selectedNode || selectedEdge) && !readonlyMode" class="wfd-text-danger" type="button" @click="removeSelection">删除</button></div>
        <template v-if="selectedNode"><div class="wfd-selected-kind"><span class="wfd-library-icon" :class="'wfd-tone-' + selectedNode.data.kind" aria-hidden="true"><IconPlayerPlay v-if="selectedNode.data.kind === 'start'" :size="17" /><IconUserCheck v-else-if="selectedNode.data.kind === 'approval'" :size="17" /><IconUsers v-else-if="selectedNode.data.kind === 'countersign'" :size="17" /><IconRobot v-else-if="selectedNode.data.kind === 'service'" :size="17" /><IconMessage v-else-if="selectedNode.data.kind === 'receive'" :size="17" /><IconClock v-else-if="selectedNode.data.kind === 'timer'" :size="17" /><IconArrowsSplit v-else-if="selectedNode.data.kind === 'condition'" :size="17" /><IconSquare v-else :size="17" /></span><span><strong>{{ nodeTypes.find(item => item.type === selectedNode?.data.kind)?.title ?? '未知节点' }}</strong><small>{{ selectedNode.id }}</small></span></div>
          <component v-if="props.extensions?.nodePropertyEditors?.[selectedNode.data.kind as WorkflowNodeType]" :is="props.extensions.nodePropertyEditors[selectedNode.data.kind as WorkflowNodeType]" :model="getRecord(selectedNode.id)" :readonly="readonlyMode" :update="(key: string, value: unknown) => updateNode(selectedNode!.id, key, value)" />
          <template v-else-if="nodeTypes.some(item => item.type === selectedNode?.data.kind)">
            <label class="wfd-field"><span>节点名称</span><input :value="selectedNode.data.name" :disabled="readonlyMode" @focus="pushHistory" @change="commitTextInput($event, value => updateNode(selectedNode!.id, 'name', value))"></label>
            <label class="wfd-field"><span>节点标识</span><input :value="selectedNode.id" disabled></label>
            <template v-if="selectedNode.data.kind === 'receive'"><label class="wfd-field"><span>消息名</span><input :value="String(getRecord(selectedNode.id)?.messageName ?? '')" :disabled="readonlyMode" placeholder="留空时使用节点标识" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'messageName', ($event.target as HTMLInputElement).value)"></label><p class="wfd-field-note wfd-event-note">填写后固定为此消息名；留空时启动变量为 <code>{{ selectedNode.id }}_messageName</code>，未提供则使用节点标识。业务方发送匹配消息后流程继续，并可携带流程变量。本节点不产生人工待办。</p></template>
            <template v-if="selectedNode.data.kind === 'timer'"><label class="wfd-field"><span>等待条件</span><select :value="String(getRecord(selectedNode.id)?.timerType ?? 'duration')" :disabled="readonlyMode" aria-label="等待条件" @focus="pushHistory" @change="updateTimerType(selectedNode!.id, ($event.target as HTMLSelectElement).value as 'duration' | 'date' | 'cycle')"><option value="duration">等待时长</option><option value="date">指定时刻</option><option value="cycle">重复周期</option></select></label><label class="wfd-field"><span>定时时间</span><input :value="String(getRecord(selectedNode.id)?.timerValue ?? '')" :disabled="readonlyMode" :placeholder="getRecord(selectedNode.id)?.timerType === 'date' ? '例如 2026-12-31T23:59:59' : getRecord(selectedNode.id)?.timerType === 'cycle' ? '例如 R3/PT10H 或 cron 表达式' : '例如 PT30M、PT2H 或 P1D'" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'timerValue', ($event.target as HTMLInputElement).value)"></label><p class="wfd-field-note wfd-event-note">{{ getRecord(selectedNode.id)?.timerType === 'date' ? '使用 ISO-8601 日期时间，例如 2026-12-31T23:59:59。' : getRecord(selectedNode.id)?.timerType === 'cycle' ? '使用 ISO-8601 重复间隔（如 R3/PT10H）或后端支持的 cron 表达式。' : '使用 ISO-8601 时长，例如 PT30M、PT2H 或 P1D。' }} 填写后固定在流程模板；留空时启动时必传 <code>{{ selectedNode.id }}_timerValue</code>，否则流程运行到此处会报错。到期后引擎自动继续，不产生待办。</p></template>
            <template v-if="['approval', 'countersign'].includes(selectedNode.data.kind)">
              <label class="wfd-field"><span>表单引用</span><input :value="String(getRecord(selectedNode.id)?.form ?? '')" :disabled="readonlyMode" placeholder="例如：project-form" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'form', ($event.target as HTMLInputElement).value)"></label>
              <label v-if="selectedNode.data.kind === 'countersign'" class="wfd-field"><span>办理顺序</span><select :value="String(getRecord(selectedNode.id)?.sequential ?? false)" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'sequential', ($event.target as HTMLSelectElement).value === 'true')"><option value="false">并行办理</option><option value="true">顺序办理</option></select></label>
              <label v-if="selectedNode.data.kind === 'countersign'" class="wfd-field"><span>审批方式</span><select :value="String(getRecord(selectedNode.id)?.approveMode ?? '')" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'approveMode', ($event.target as HTMLSelectElement).value)"><option value="">发起时选择（默认会签 ALL）</option><option value="ALL">会签 · 所有人通过（ALL）</option><option value="ANY">或签 · 任一人通过（ANY）</option><option value="VOTE">按比例通过（VOTE）</option></select></label>
              <label v-if="selectedNode.data.kind === 'countersign' && getRecord(selectedNode.id)?.approveMode === 'VOTE'" class="wfd-field"><span>通过比例（passRate）</span><input inputmode="decimal" :value="String(getRecord(selectedNode.id)?.passRate ?? '')" :disabled="readonlyMode" placeholder="范围 (0, 1]；也可在发起时提供" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'passRate', ($event.target as HTMLInputElement).value)"></label>
              <p v-if="selectedNode.data.kind === 'countersign'" class="wfd-field-note">多人审批字段属于节点配置；审批方式留空时，发起人可传 {{ selectedNode.id }}_approveMode，默认 ALL。比例仅用于 VOTE 模式，留空时可按节点 ID 在发起时提供。</p>
              <details class="wfd-advanced" open><summary>超时提醒</summary><label class="wfd-field"><span>提醒状态</span><select :value="getRecord(selectedNode.id)?.reminder ? 'enabled' : 'disabled'" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'reminder', ($event.target as HTMLSelectElement).value === 'enabled' ? { duration: getRecord(selectedNode!.id)?.reminder?.duration ?? '', action: getRecord(selectedNode!.id)?.reminder?.action ?? 'notify', name: getRecord(selectedNode!.id)?.reminder?.name ?? '' } : undefined)"><option value="disabled">关闭提醒</option><option value="enabled">启用提醒</option></select></label><template v-if="getRecord(selectedNode.id)?.reminder"><label class="wfd-field"><span>超时处理方式</span><select aria-label="超时处理方式" :value="String(getRecord(selectedNode.id)?.reminder?.action ?? 'notify')" :disabled="readonlyMode" @focus="pushHistory" @change="updateReminder(selectedNode!.id, 'action', ($event.target as HTMLSelectElement).value)"><option value="notify">提醒并继续（notify）</option><option value="return">中断并退回（return）</option><option value="end">中断并结束（end）</option></select></label><label v-if="getRecord(selectedNode.id)?.reminder?.action === 'return'" class="wfd-field"><span>退回目标</span><select aria-label="超时退回目标" :value="String(getRecord(selectedNode.id)?.reminder?.target ?? '')" :disabled="readonlyMode" @focus="pushHistory" @change="updateReminder(selectedNode!.id, 'target', ($event.target as HTMLSelectElement).value)"><option value="">请选择审批或服务节点</option><option v-for="target in reminderTargetNodes" :key="target.id" :value="target.id">{{ target.name }}（{{ target.id }}）</option></select></label><label class="wfd-field"><span>提醒时长</span><input :value="String(getRecord(selectedNode.id)?.reminder?.duration ?? '')" :disabled="readonlyMode" placeholder="ISO-8601，例如 PT30M；默认 P1D" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'reminder', { ...getRecord(selectedNode!.id)?.reminder, duration: ($event.target as HTMLInputElement).value })"></label><label class="wfd-field"><span>提醒名称</span><input :value="String(getRecord(selectedNode.id)?.reminder?.name ?? '')" :disabled="readonlyMode" :placeholder="selectedNode.data.name + (getRecord(selectedNode.id)?.reminder?.action === 'return' ? '超时退回' : getRecord(selectedNode.id)?.reminder?.action === 'end' ? '超时结束' : '超时提醒')" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'reminder', { ...getRecord(selectedNode!.id)?.reminder, name: ($event.target as HTMLInputElement).value })"></label><p class="wfd-field-note">{{ getRecord(selectedNode.id)?.reminder?.action === 'return' ? '到期后取消当前审批并流转到指定节点。' : getRecord(selectedNode.id)?.reminder?.action === 'end' ? '到期后取消当前审批并结束流程。' : '到期后发送提醒消息，当前审批继续等待。' }} 留空时长可在启动实例时传 {{ selectedNode.id }}_reminderDuration，默认 P1D。</p></template></details>
            </template>
            <template v-if="selectedNode.data.kind === 'service'">
              <label class="wfd-field"><span>服务名称</span><input :value="String(getRecord(selectedNode.id)?.serviceName ?? '')" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'serviceName', ($event.target as HTMLInputElement).value)"></label>
              <label class="wfd-field"><span>服务地址</span><input :value="String(getRecord(selectedNode.id)?.serviceUrl ?? '')" :disabled="readonlyMode" placeholder="https://example.com/api" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'serviceUrl', ($event.target as HTMLInputElement).value)"></label>
              <label class="wfd-field"><span>服务会签</span><select aria-label="服务会签" :value="getRecord(selectedNode.id)?.countersign === true ? 'enabled' : 'disabled'" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'countersign', ($event.target as HTMLSelectElement).value === 'enabled')"><option value="disabled">关闭 · 单次调用</option><option value="enabled">开启 · 多服务调用</option></select></label>
              <template v-if="getRecord(selectedNode.id)?.countersign === true">
                <label class="wfd-field"><span>执行顺序</span><select aria-label="服务执行顺序" :value="String(getRecord(selectedNode.id)?.sequential ?? false)" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'sequential', ($event.target as HTMLSelectElement).value === 'true')"><option value="false">并行执行</option><option value="true">顺序执行</option></select></label>
                <label class="wfd-field"><span>会签方式</span><select aria-label="服务会签方式" :value="String(getRecord(selectedNode.id)?.approveMode ?? '')" :disabled="readonlyMode" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'approveMode', ($event.target as HTMLSelectElement).value)"><option value="">发起时选择（默认 ALL）</option><option value="ALL">会签 · 所有服务通过（ALL）</option><option value="ANY">或签 · 任一服务通过（ANY）</option><option value="VOTE">按比例通过（VOTE）</option></select></label>
                <label v-if="getRecord(selectedNode.id)?.approveMode === 'VOTE'" class="wfd-field"><span>通过比例（passRate）</span><input inputmode="decimal" :value="String(getRecord(selectedNode.id)?.passRate ?? '')" :disabled="readonlyMode" placeholder="固定 VOTE 时必填，范围 (0, 1]" @focus="pushHistory" @change="updateNode(selectedNode!.id, 'passRate', ($event.target as HTMLInputElement).value)"></label>
                <p class="wfd-field-note">服务会签属性写入当前服务节点的业务 JSON。审批方式留空时按后端默认 ALL，也可在启动时提供动态值；固定为 VOTE 时必须配置通过比例。</p>
              </template>
            </template>
          </template><p v-else class="wfd-readonly-note">此版本无法编辑该节点。原始节点数据将在导出中保留，且不能编译。</p>
          <p class="wfd-coordinate">画布位置 <code>{{ Math.round(selectedNode.position.x) }}, {{ Math.round(selectedNode.position.y) }}</code></p>
        </template>
        <template v-else-if="selectedEdge"><div class="wfd-selected-kind"><span class="wfd-edge-symbol" aria-hidden="true">↗</span><span><strong>顺序流</strong><small>{{ getRecord(selectedEdge.source)?.name ?? selectedEdge.source }} → {{ getRecord(selectedEdge.target)?.name ?? selectedEdge.target }}</small></span></div>
          <label class="wfd-field"><span>分支语义</span><select :value="String(selectedEdge.data?.branch ?? '')" :disabled="readonlyMode" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'branch', ($event.target as HTMLSelectElement).value)"><option value="">普通流转</option><option value="pass">通过</option><option value="reject">驳回</option></select></label>
          <label class="wfd-field"><span>条件表达式</span><textarea :value="String(selectedEdge.data?.conditionExpression ?? '')" :disabled="readonlyMode" rows="3" placeholder="例如：amount > 5000" @focus="pushHistory" @change="updateEdge(selectedEdge!.id, 'conditionExpression', ($event.target as HTMLTextAreaElement).value)" /></label>
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
