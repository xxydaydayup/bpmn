<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { isAxiosError } from 'axios'
import { ElAlert, ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { CircleCheckFilled, Clock, Connection, Document, Download, Files, Monitor, Refresh, Search, Setting, Tickets, Upload, WarningFilled } from '@element-plus/icons-vue'
import initialDiagram from '@/bpmn/requirement-process.bpmn?raw'
import { camundaGateway } from '@/api/camunda/gateway'
import { createLatestQueryScope } from '@/utils/latestQuery'
import { collectActiveActivityIds } from '@/utils/activityMarkers'
import ReadOnlyProcessDiagram from '@/components/camunda/ReadOnlyProcessDiagram.vue'
import type { CamundaActivityInstance, CamundaDeployment, CamundaExternalTask, CamundaHistoricActivity, CamundaHistoricOperationLog, CamundaHistoricProcessInstance, CamundaHistoricTask, CamundaHistoricVariableInstance, CamundaIncident, CamundaJob, CamundaProcessDefinition, CamundaProcessInstance, CamundaTask, CamundaVersion, CamundaVariables } from '@/api/camunda/types'

type ConsoleTab = 'overview' | 'definitions' | 'instances' | 'tasks' | 'operations' | 'history' | 'audit'
type TaskTab = 'user' | 'external'
type HistoryTab = 'instances' | 'tasks' | 'activities' | 'variables'
const tabs: Array<{ key: ConsoleTab; label: string; icon: typeof Monitor }> = [
  { key: 'overview', label: '运行总览', icon: Monitor },
  { key: 'definitions', label: '流程定义', icon: Document },
  { key: 'instances', label: '运行实例', icon: Connection },
  { key: 'tasks', label: '任务查询', icon: Tickets },
  { key: 'operations', label: 'Job / Incident', icon: WarningFilled },
  { key: 'history', label: '历史查询', icon: Clock },
  { key: 'audit', label: '操作日志', icon: Setting },
]
const activeTab = ref<ConsoleTab>('overview')
const taskTab = ref<TaskTab>('user')
const historyTab = ref<HistoryTab>('instances')
const errors = reactive<Record<string, string>>({})
const busy = reactive<Record<string, boolean>>({})
const pending = reactive<Record<string, boolean>>({})
const queries = createLatestQueryScope()
let disposed = false
const lastUpdated = ref<Date>()
const version = ref<CamundaVersion>()
const engineState = ref<'unchecked' | 'checking' | 'connected' | 'partial' | 'failed'>('unchecked')
const deployments = ref<CamundaDeployment[]>([])
const definitions = ref<CamundaProcessDefinition[]>([])
const filteredDefinitions = definitions
const instances = ref<CamundaProcessInstance[]>([])
const tasks = ref<CamundaTask[]>([])
const externalTasks = ref<CamundaExternalTask[]>([])
const jobs = ref<CamundaJob[]>([])
const incidents = ref<CamundaIncident[]>([])
const historicInstances = ref<CamundaHistoricProcessInstance[]>([])
const historicTasks = ref<CamundaHistoricTask[]>([])
const historicActivities = ref<CamundaHistoricActivity[]>([])
const historicVariables = ref<CamundaHistoricVariableInstance[]>([])
const operationLogs = ref<CamundaHistoricOperationLog[]>([])
const counts = reactive<Record<'definitions' | 'instances' | 'tasks' | 'jobs' | 'incidents' | 'externalTasks', number | null>>({ definitions: null, instances: null, tasks: null, jobs: null, incidents: null, externalTasks: null })
const pageSize = 20
const pages = reactive(Object.fromEntries(['definitions', 'instances', 'tasks', 'externalTasks', 'incidents', 'jobs', 'history-instances', 'history-tasks', 'history-activities', 'history-variables', 'audit'].map(key => [key, { page: 1, total: null as number | null }])) as Record<string, { page: number; total: number | null }>)
const definitionSearch = ref('')
const definitionSearchBy = ref<'nameLike' | 'keyLike' | 'processDefinitionId'>('nameLike')
const instanceBusinessKey = ref('')
const instanceDefinitionKey = ref('')
const taskAssignee = ref('')
const taskProcessInstanceId = ref('')
const externalTopic = ref('')
const historyProcessInstanceId = ref('')
const applied = reactive({ definition: {}, instance: {}, task: {}, external: {}, history: {} })
const selectedDefinition = ref<CamundaProcessDefinition>()
const selectedDefinitionXml = ref('')
const selectedInstance = ref<CamundaProcessInstance>()
const selectedActivity = ref<CamundaActivityInstance>()
const selectedInstanceXml = ref('')
const activeActivityIds = computed(() => collectActiveActivityIds(selectedActivity.value))
const selectedVariables = ref<CamundaVariables>()
const selectedJob = ref<CamundaJob>()
const selectedJobStacktrace = ref('')
const showDefinitionXml = ref(false)
const showDeploymentDialog = ref(false)
const deploymentName = ref('流程工作台部署')
const deploymentXml = ref(initialDiagram)
const deploymentResult = ref<CamundaDeployment>()
const activeResource = computed(() => activeTab.value === 'tasks' ? (taskTab.value === 'user' ? 'tasks' : 'externalTasks') : activeTab.value === 'history' ? 'history-' + historyTab.value : activeTab.value)
const activePage = computed(() => pages[activeResource.value])
const loading = computed<Record<string, boolean | undefined>>(() => ({ ...busy, tasks: busy.tasks || busy.externalTasks, operations: busy.incidents || busy.jobs, history: Object.keys(busy).some(key => key.startsWith('history-') && busy[key]), deploy: pending.deploy }))
const error = computed(() => {
  const keys = activeTab.value === 'operations' ? ['incidents', 'jobs', 'job-detail'] : [activeResource.value, activeResource.value + '-detail']
  return [...keys.map(key => errors[key]), errors['command-' + activeTab.value]].filter(Boolean).join('；')
})
const statusText = computed(() => ({ unchecked: '未检查', checking: '连接检查中', connected: '连接正常', partial: '部分查询失败', failed: '连接检查失败' })[engineState.value])
const statusClass = computed(() => engineState.value === 'connected' ? 'success' : engineState.value === 'failed' || engineState.value === 'partial' ? 'danger' : 'muted')

function messageFor(cause: unknown, fallback: string) {
  if (isAxiosError(cause)) {
    const body: unknown = cause.response?.data
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message
  }
  return cause instanceof Error ? cause.message : fallback
}

async function run<T>(key: string, action: (signal: AbortSignal) => Promise<T>, fallback: string): Promise<T | undefined> {
  const query = queries.begin(key)
  if (query.signal.aborted) return
  busy[key] = true
  errors[key] = ''
  try {
    const result = await action(query.signal)
    if (query.isCurrent()) return result
  } catch (cause) {
    if (query.isCurrent()) errors[key] = messageFor(cause, fallback)
  } finally {
    if (query.isCurrent()) busy[key] = false
    query.finish()
  }
}

async function refreshOverview() {
  engineState.value = 'checking'
  Object.keys(counts).forEach(key => { counts[key as keyof typeof counts] = null })
  deployments.value = []
  version.value = undefined
  const results = await run('overview', signal => Promise.allSettled([
    camundaGateway.getVersion(signal),
    camundaGateway.countDefinitions({}, signal),
    camundaGateway.countProcessInstances({ active: true }, signal),
    camundaGateway.countTasks({ active: true }, signal),
    camundaGateway.countJobs({ withException: true }, signal),
    camundaGateway.countIncidents({}, signal),
    camundaGateway.countExternalTasks({}, signal),
    camundaGateway.listDeployments({ maxResults: 5, sortBy: 'deploymentTime', sortOrder: 'desc' }, signal),
  ]), '总览查询失败')
  if (!results) return
  const [v, d, i, t, j, inc, e, dep] = results
  if (v.status === 'fulfilled') version.value = v.value
  if (d.status === 'fulfilled') counts.definitions = d.value
  if (i.status === 'fulfilled') counts.instances = i.value
  if (t.status === 'fulfilled') counts.tasks = t.value
  if (j.status === 'fulfilled') counts.jobs = j.value
  if (inc.status === 'fulfilled') counts.incidents = inc.value
  if (e.status === 'fulfilled') counts.externalTasks = e.value
  if (dep.status === 'fulfilled') deployments.value = dep.value
  const labels = ['引擎版本', '流程定义', '运行实例', '人工任务', '失败 Job', 'Incident', 'External Task', '最近部署']
  const failures = results.flatMap((result, index) => result.status === 'rejected' ? [labels[index] + '：' + messageFor(result.reason, '查询失败')] : [])
  errors.overview = failures.join('；')
  engineState.value = v.status === 'rejected' ? 'failed' : failures.length ? 'partial' : 'connected'
  lastUpdated.value = new Date()
}

type Paging = { firstResult: number; maxResults: number; sortBy: string; sortOrder: 'asc' | 'desc' }
async function loadPage<T, Q extends object>(key: string, filter: Q, list: (query: Q & Paging, signal?: AbortSignal) => Promise<T[]>, count: (query: Q, signal?: AbortSignal) => Promise<number>, target: Ref<T[]>, sortBy = 'id', sortOrder: 'asc' | 'desc' = 'asc'): Promise<void> {
  const page = pages[key]!
  const snapshot = { ...filter }
  target.value = []
  page.total = null
  const result = await run(key, signal => Promise.all([
    list({ ...snapshot, firstResult: (page.page - 1) * pageSize, maxResults: pageSize, sortBy, sortOrder }, signal),
    count(snapshot, signal),
  ]), '列表查询失败')
  if (!result) return
  const lastPage = Math.max(1, Math.ceil(result[1] / pageSize))
  if (page.page > lastPage) {
    page.page = lastPage
    return loadPage(key, snapshot, list, count, target, sortBy, sortOrder)
  }
  target.value = result[0]
  page.total = result[1]
}

function clearDefinition() {
  queries.cancel('definitions-detail')
  selectedDefinition.value = undefined
  selectedDefinitionXml.value = ''
  showDefinitionXml.value = false
  errors['definitions-detail'] = ''
}
function clearInstance() {
  queries.cancel('instances-detail')
  selectedInstance.value = undefined
  selectedActivity.value = undefined
  selectedInstanceXml.value = ''
  selectedVariables.value = undefined
  errors['instances-detail'] = ''
}
function loadDefinitions() {
  clearDefinition()
  return loadPage('definitions', applied.definition, camundaGateway.listDefinitions, camundaGateway.countDefinitions, definitions)
}
function loadInstances() {
  clearInstance()
  return loadPage('instances', applied.instance, camundaGateway.listProcessInstances, camundaGateway.countProcessInstances, instances, 'instanceId')
}
function loadTasks() {
  return taskTab.value === 'user'
    ? loadPage('tasks', applied.task, camundaGateway.listTasks, camundaGateway.countTasks, tasks, 'created', 'desc')
    : loadPage('externalTasks', applied.external, camundaGateway.listExternalTasks, camundaGateway.countExternalTasks, externalTasks, 'id')
}
async function loadOperations() {
  queries.cancel('job-detail')
  selectedJob.value = undefined
  selectedJobStacktrace.value = ''
  errors['job-detail'] = ''
  await Promise.all([
    loadPage('incidents', {}, camundaGateway.listIncidents, camundaGateway.countIncidents, incidents, 'incidentTimestamp', 'desc'),
    loadPage('jobs', { withException: true }, camundaGateway.listJobs, camundaGateway.countJobs, jobs, 'jobId'),
  ])
}
function loadHistory() {
  const key = 'history-' + historyTab.value
  if (historyTab.value === 'instances') return loadPage(key, applied.history, camundaGateway.listHistoricProcessInstances, camundaGateway.countHistoricProcessInstances, historicInstances, 'startTime', 'desc')
  if (historyTab.value === 'tasks') return loadPage(key, applied.history, camundaGateway.listHistoricTasks, camundaGateway.countHistoricTasks, historicTasks, 'startTime', 'desc')
  if (historyTab.value === 'activities') return loadPage(key, applied.history, camundaGateway.listHistoricActivities, camundaGateway.countHistoricActivities, historicActivities, 'startTime', 'desc')
  return loadPage(key, { ...applied.history, deserializeValues: false }, camundaGateway.listHistoricVariables, camundaGateway.countHistoricVariables, historicVariables, 'variableName')
}
function loadAudit() {
  return loadPage('audit', {}, camundaGateway.listHistoricOperationLogs, camundaGateway.countHistoricOperationLogs, operationLogs, 'timestamp', 'desc')
}

async function selectDefinition(row: unknown) {
  const selected = rowWithId<CamundaProcessDefinition>(row)
  if (!selected) return
  selectedDefinition.value = selected
  selectedDefinitionXml.value = ''
  const result = await run('definitions-detail', signal => camundaGateway.getDefinitionXml(selected.id, signal), '流程定义 XML 查询失败')
  if (result && selectedDefinition.value?.id === selected.id) selectedDefinitionXml.value = result.bpmn20Xml
}
async function selectInstance(row: unknown) {
  const selected = rowWithId<CamundaProcessInstance>(row)
  if (!selected) return
  selectedInstance.value = selected
  selectedActivity.value = undefined
  selectedInstanceXml.value = ''
  selectedVariables.value = undefined
  const results = await run('instances-detail', signal => Promise.allSettled([
    camundaGateway.getActivityInstance(selected.id, signal),
    camundaGateway.getProcessInstanceVariables(selected.id, false, signal),
    selected.definitionId ? camundaGateway.getDefinitionXml(selected.definitionId, signal) : Promise.reject(new Error('实例未返回流程定义 ID')),
  ]), '实例详情查询失败')
  if (!results || selectedInstance.value?.id !== selected.id) return
  if (results[0].status === 'fulfilled') selectedActivity.value = results[0].value
  if (results[1].status === 'fulfilled') selectedVariables.value = results[1].value
  if (results[2].status === 'fulfilled') selectedInstanceXml.value = results[2].value.bpmn20Xml
  errors['instances-detail'] = results.flatMap((r, i) => r.status === 'rejected' ? [(['活动树：', '变量：', '流程图：'][i]) + messageFor(r.reason, '查询失败')] : []).join('；')
}
async function showJob(row: unknown) {
  const selected = rowWithId<CamundaJob>(row)
  if (!selected) return
  selectedJob.value = selected
  selectedJobStacktrace.value = ''
  const result = await run('job-detail', signal => camundaGateway.getJobExceptionStacktrace(selected.id, signal), '异常堆栈查询失败')
  if (result !== undefined && selectedJob.value?.id === selected.id) selectedJobStacktrace.value = result
}
function rowWithId<T extends { id: string }>(row: unknown): T | undefined {
  return row && typeof row === 'object' && 'id' in row && typeof row.id === 'string' ? row as T : undefined
}
async function command(key: string, action: () => Promise<void>, fallback: string) {
  if (pending[key] || disposed) return
  const owner = activeTab.value
  pending[key] = true
  errors['command-' + owner] = ''
  try { await action() }
  catch (cause) {
    if (!disposed && cause !== 'cancel' && cause !== 'close') errors['command-' + owner] = messageFor(cause, fallback)
  } finally { pending[key] = false }
}
function toggleDefinition(row: unknown) {
  const selected = rowWithId<CamundaProcessDefinition>(row)
  if (!selected) return
  return command(selected.id, async () => {
    const suspended = !selected.suspended
    await ElMessageBox.confirm('确认' + (suspended ? '挂起' : '恢复') + '流程定义「' + (selected.name || selected.key) + '」？只影响该定义的新实例启动，不改变已有实例状态。', '流程定义状态', { type: 'warning' })
    if (disposed) return
    await camundaGateway.setDefinitionSuspended(selected.id, { suspended, includeProcessInstances: false })
    ElMessage.success('流程定义状态已更新')
    if (!disposed) await Promise.all([loadDefinitions(), refreshOverview()])
  }, '流程定义状态更新失败')
}
function toggleInstance(row: unknown) {
  const selected = rowWithId<CamundaProcessInstance>(row)
  if (!selected) return
  return command(selected.id, async () => {
    await ElMessageBox.confirm('确认' + (selected.suspended ? '恢复' : '挂起') + '实例「' + (selected.businessKey || selected.id) + '」？', '实例状态', { type: 'warning' })
    if (disposed) return
    await camundaGateway.setProcessInstanceSuspended(selected.id, !selected.suspended)
    ElMessage.success('流程实例状态已更新')
    if (!disposed) await Promise.all([loadInstances(), refreshOverview()])
  }, '流程实例状态更新失败')
}
function terminateInstance(row: unknown) {
  const selected = rowWithId<CamundaProcessInstance>(row)
  if (!selected) return
  return command(selected.id, async () => {
    await ElMessageBox.confirm('确认终止实例「' + (selected.businessKey || selected.id) + '」？这会取消实例及子实例的后续执行，无法通过恢复按钮撤销。', '终止流程实例', { type: 'warning', confirmButtonText: '确认终止', cancelButtonText: '取消' })
    if (disposed) return
    await camundaGateway.deleteProcessInstance(selected.id)
    ElMessage.success('流程实例已终止')
    if (!disposed) await Promise.all([loadInstances(), refreshOverview()])
  }, '流程实例终止失败')
}
function retryJob(row: unknown) {
  const selected = rowWithId<CamundaJob>(row)
  if (!selected) return
  return command(selected.id, async () => {
    const result = await ElMessageBox.prompt('设置大于 0 的整数（最大 2147483647），更新后 Job 执行器可能自动再次执行。', '调整 Job 重试次数', {
      inputValue: String(Math.max(selected.retries ?? 1, 1)),
      inputValidator: value => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 || '请输入 1 至 2147483647 的整数',
      confirmButtonText: '提交重试次数', cancelButtonText: '取消',
    })
    if (disposed) return
    await camundaGateway.setJobRetries(selected.id, Number(result.value))
    ElMessage.success('Job 重试次数已更新')
    if (!disposed) await Promise.all([loadOperations(), refreshOverview()])
  }, 'Job 重试更新失败')
}
async function importDeploymentFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || pending.deploy) return
  const xml = await run('deployment-file', () => file.text(), 'BPMN 文件读取失败')
  if (xml !== undefined) { deploymentXml.value = xml; deploymentName.value = file.name.replace(/\.(bpmn|xml)$/i, '') }
  input.value = ''
}
async function deploy() {
  if (!deploymentXml.value.trim() || busy['deployment-file']) return
  await command('deploy', async () => {
    deploymentResult.value = await camundaGateway.deploy(deploymentXml.value, deploymentName.value.trim() || undefined, { source: 'workflow-console' })
    if (disposed) return
    showDeploymentDialog.value = false
    ElMessage.success('部署请求已完成，请核对返回的定义与版本')
    await Promise.all([loadDefinitions(), refreshOverview()])
  }, '流程部署失败')
}
function searchActiveTab(reset = false) {
  if (activeTab.value === 'definitions') {
    if (reset) { definitionSearch.value = ''; definitionSearchBy.value = 'nameLike' }
    const value = definitionSearch.value.trim()
    applied.definition = value ? { [definitionSearchBy.value]: definitionSearchBy.value === 'processDefinitionId' ? value : '%' + value + '%' } : {}
  } else if (activeTab.value === 'instances') {
    if (reset) { instanceBusinessKey.value = ''; instanceDefinitionKey.value = '' }
    applied.instance = { businessKey: instanceBusinessKey.value.trim() || undefined, processDefinitionKey: instanceDefinitionKey.value.trim() || undefined }
  } else if (activeTab.value === 'tasks') {
    if (reset) { taskAssignee.value = ''; taskProcessInstanceId.value = ''; externalTopic.value = '' }
    applied.task = { assignee: taskAssignee.value.trim() || undefined, processInstanceId: taskProcessInstanceId.value.trim() || undefined }
    applied.external = { processInstanceId: taskProcessInstanceId.value.trim() || undefined, topicName: externalTopic.value.trim() || undefined }
    pages.tasks!.page = 1
    pages.externalTasks!.page = 1
  } else if (activeTab.value === 'history') {
    if (reset) historyProcessInstanceId.value = ''
    applied.history = { processInstanceId: historyProcessInstanceId.value.trim() || undefined }
    Object.keys(pages).filter(key => key.startsWith('history-')).forEach(key => { pages[key]!.page = 1 })
  }
  if (activePage.value) activePage.value.page = 1
  return refreshActiveTab()
}
function changeActivePage(page: number) {
  if (activePage.value) activePage.value.page = page
  return refreshActiveTab()
}
function changeOperationPage(key: 'jobs' | 'incidents', page: number) {
  pages[key]!.page = page
  return loadOperations()
}
function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
function formatVariables(value?: CamundaVariables) { return value ? JSON.stringify(value, null, 2) : '未加载或查询失败' }
function operationObject(value: unknown) {
  const row = rowWithId<CamundaHistoricOperationLog>(value)
  if (!row) return '—'
  const ids: Record<string, string | undefined> = { Deployment: row.deploymentId, ProcessDefinition: row.processDefinitionId, ProcessInstance: row.processInstanceId, Task: row.taskId, Job: row.jobId, JobDefinition: row.jobDefinitionId, ExternalTask: row.externalTaskId, Batch: row.batchId }
  return ids[row.entityType ?? ''] || row.operationId || '—'
}
function downloadText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function exportHistory() {
  const rows = historyTab.value === 'instances' ? historicInstances.value : historyTab.value === 'tasks' ? historicTasks.value : historyTab.value === 'activities' ? historicActivities.value : historicVariables.value
  downloadText(JSON.stringify(rows, null, 2), 'camunda-' + historyTab.value + '-page-' + activePage.value?.page + '.json', 'application/json;charset=utf-8')
}
function exportDefinition() {
  if (selectedDefinitionXml.value && selectedDefinition.value) downloadText(selectedDefinitionXml.value, selectedDefinition.value.key + '-v' + selectedDefinition.value.version + '.bpmn', 'application/xml;charset=utf-8')
}
function refreshActiveTab() {
  if (activeTab.value === 'overview') return refreshOverview()
  if (activeTab.value === 'definitions') return loadDefinitions()
  if (activeTab.value === 'instances') return loadInstances()
  if (activeTab.value === 'tasks') return loadTasks()
  if (activeTab.value === 'operations') return loadOperations()
  if (activeTab.value === 'history') return loadHistory()
  return loadAudit()
}
watch(taskTab, () => { if (activeTab.value === 'tasks') void loadTasks() })
watch(historyTab, () => { if (activeTab.value === 'history') void loadHistory() })
onMounted(() => { void refreshOverview() })
onBeforeUnmount(() => { disposed = true; queries.dispose() })
</script>

<template>
  <section class="console-page">
    <div class="console-heading">
      <div><div class="console-eyebrow">Camunda Platform REST · 开发联调</div><h1>Camunda 管理台</h1><p>官方 REST 能力的真实查询与受控运维入口。生产环境应由 Go 服务承接认证和审计。</p></div>
      <div class="console-heading-actions"><span class="connection-state" :class="statusClass"><i />{{ statusText }}<b v-if="version">v{{ version.version }}</b></span><ElButton :icon="Refresh" :loading="loading[activeTab]" @click="refreshActiveTab">刷新</ElButton><ElButton type="primary" :icon="Upload" @click="showDeploymentDialog = true">部署 BPMN</ElButton></div>
    </div>
    <ElAlert v-if="error" type="error" :closable="false" show-icon class="console-alert" :title="error" />
    <ElAlert v-if="deploymentResult" type="success" :closable="false" class="console-alert" :title="'部署返回 ID：' + deploymentResult.id" :description="Object.values(deploymentResult.deployedProcessDefinitions ?? {}).map(item => item.key + ' · v' + item.version).join('、') || '未返回新流程定义；请核对重复过滤结果及部署资源。'" />
    <nav class="console-tabs" aria-label="Camunda 管理台模块"><button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key; void refreshActiveTab()"><component :is="tab.icon" :size="16" />{{ tab.label }}<span v-if="tab.key === 'operations' && counts.incidents" class="tab-count">{{ counts.incidents ?? '—' }}</span></button></nav>

    <div v-if="activeTab === 'overview'" class="console-view">
      <div class="engine-banner" :class="statusClass"><div><span class="engine-dot" /><b>Camunda · {{ statusText }}</b><span>REST base path · /engine-rest</span></div><small>最近刷新：{{ lastUpdated ? lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) : '—' }}</small></div>
      <div class="console-metrics"><article><span>运行中实例</span><strong>{{ counts.instances ?? '—' }}</strong><small>GET /process-instance/count</small></article><article><span>人工任务</span><strong>{{ counts.tasks ?? '—' }}</strong><small>GET /task/count</small></article><article class="warning"><span>Incident</span><strong>{{ counts.incidents ?? '—' }}</strong><small>GET /incident/count</small></article><article class="warning"><span>失败 Job</span><strong>{{ counts.jobs ?? '—' }}</strong><small>GET /job/count</small></article><article><span>流程定义</span><strong>{{ counts.definitions ?? '—' }}</strong><small>GET /process-definition/count</small></article><article><span>External Task</span><strong>{{ counts.externalTasks ?? '—' }}</strong><small>GET /external-task/count</small></article></div>
      <div class="console-columns"><div class="console-panel"><div class="panel-heading"><div><h2>最近部署</h2><p>来自 Camunda deployment 资源</p></div><ElButton text :icon="Document" @click="activeTab = 'definitions'; void refreshActiveTab()">查看定义</ElButton></div><ElTable :data="deployments" size="small" empty-text="暂无部署记录" table-layout="fixed"><ElTableColumn prop="name" label="部署名称" min-width="180" /><ElTableColumn prop="source" label="来源" min-width="150"><template #default="{ row }">{{ row.source || '—' }}</template></ElTableColumn><ElTableColumn prop="deploymentTime" label="部署时间" min-width="170"><template #default="{ row }">{{ formatDate(row.deploymentTime) }}</template></ElTableColumn></ElTable></div><div class="console-panel"><div class="panel-heading"><div><h2>当前能力</h2><p>已接入官方 REST 资源</p></div><Files :size="18" class="panel-icon" /></div><div class="capability-list"><div><CircleCheckFilled :size="15" />定义、部署与 XML</div><div><CircleCheckFilled :size="15" />实例、活动树与变量</div><div><CircleCheckFilled :size="15" />任务、Job、Incident</div><div><CircleCheckFilled :size="15" />External Task 与历史</div><div><CircleCheckFilled :size="15" />用户操作日志</div></div></div></div>
    </div>

    <div v-else-if="activeTab === 'definitions'" class="console-view"><div class="view-toolbar"><div><h2>流程定义</h2><p>Camunda 返回的流程定义版本，不包含服务端设计稿管理。</p></div><ElForm inline @submit.prevent="searchActiveTab()"><ElFormItem><ElSelect v-model="definitionSearchBy" aria-label="定义筛选字段" style="width: 130px"><ElOption label="名称" value="nameLike" /><ElOption label="流程 key" value="keyLike" /><ElOption label="definitionId" value="processDefinitionId" /></ElSelect></ElFormItem><ElFormItem><ElInput v-model="definitionSearch" placeholder="输入查询值" clearable /></ElFormItem><ElFormItem><ElButton type="primary" native-type="submit">查询</ElButton><ElButton @click="searchActiveTab(true)">重置</ElButton></ElFormItem></ElForm></div><div class="console-panel"><ElTable v-loading="loading.definitions" :data="filteredDefinitions" row-key="id" empty-text="暂无流程定义" @row-click="selectDefinition"><ElTableColumn prop="name" label="名称" min-width="170"><template #default="{ row }"><b>{{ row.name || '未命名流程' }}</b><small class="table-sub">{{ row.key }}</small></template></ElTableColumn><ElTableColumn prop="version" label="版本" width="90"><template #default="{ row }">v{{ row.version ?? '—' }}</template></ElTableColumn><ElTableColumn prop="id" label="definitionId" min-width="220"><template #default="{ row }"><code>{{ row.id }}</code></template></ElTableColumn><ElTableColumn prop="deploymentId" label="deploymentId" min-width="170"><template #default="{ row }"><code>{{ row.deploymentId || '—' }}</code></template></ElTableColumn><ElTableColumn label="状态" width="100"><template #default="{ row }"><ElTag :type="row.suspended ? 'warning' : 'success'" effect="light">{{ row.suspended ? '已挂起' : '可启动' }}</ElTag></template></ElTableColumn><ElTableColumn label="操作" width="160" fixed="right"><template #default="{ row }"><ElButton text size="small" :disabled="pending[row.id]" @click.stop="toggleDefinition(row)">{{ row.suspended ? '恢复' : '挂起' }}</ElButton><ElButton text size="small" @click.stop="selectDefinition(row); showDefinitionXml = true">XML</ElButton></template></ElTableColumn></ElTable></div><div v-if="selectedDefinition" class="console-detail"><div><h3>{{ selectedDefinition.name || selectedDefinition.key }} · v{{ selectedDefinition.version }}</h3><code>{{ selectedDefinition.id }}</code></div><ElButton :icon="Download" @click="showDefinitionXml = true">查看 XML</ElButton></div><ReadOnlyProcessDiagram v-if="selectedDefinition" :key="selectedDefinition.id" :xml="selectedDefinitionXml" /></div>

    <div v-else-if="activeTab === 'instances'" class="console-view"><div class="view-toolbar"><div><h2>运行实例</h2><p>当前接口只返回运行中的实例；已结束实例请到历史查询。</p></div><ElButton :icon="Refresh" :loading="loading.instances" @click="loadInstances">刷新实例</ElButton></div><ElForm inline class="console-filter" @submit.prevent="searchActiveTab()"><ElFormItem label="业务键"><ElInput v-model="instanceBusinessKey" placeholder="businessKey" clearable /></ElFormItem><ElFormItem label="流程 key"><ElInput v-model="instanceDefinitionKey" placeholder="processDefinitionKey" clearable /></ElFormItem><ElFormItem><ElButton type="primary" :icon="Search" native-type="submit">查询</ElButton><ElButton @click="searchActiveTab(true)">重置</ElButton></ElFormItem></ElForm><div class="instance-console-grid"><div class="console-panel"><ElTable v-loading="loading.instances" :data="instances" row-key="id" empty-text="暂无运行实例" @row-click="selectInstance"><ElTableColumn label="业务键" min-width="180"><template #default="{ row }"><b>{{ row.businessKey || '—' }}</b><small class="table-sub">{{ row.id }}</small></template></ElTableColumn><ElTableColumn label="流程定义" min-width="190"><template #default="{ row }"><span>流程定义 ID</span><small class="table-sub">{{ row.definitionId || '—' }}</small></template></ElTableColumn><ElTableColumn label="状态" width="100"><template #default="{ row }"><ElTag :type="row.suspended ? 'warning' : 'success'" effect="light">{{ row.suspended ? '已挂起' : '运行中' }}</ElTag></template></ElTableColumn><ElTableColumn label="操作" width="160"><template #default="{ row }"><ElButton text size="small" :disabled="pending[row.id]" @click.stop="toggleInstance(row)">{{ row.suspended ? '恢复' : '挂起' }}</ElButton><ElButton text type="danger" size="small" :disabled="pending[row.id]" @click.stop="terminateInstance(row)">终止</ElButton></template></ElTableColumn></ElTable></div><div class="console-panel instance-detail"><div class="panel-heading"><div><h2>实例详情</h2><p>{{ selectedInstance?.businessKey || selectedInstance?.id || '请选择实例' }}</p></div><Connection v-if="selectedInstance" :size="18" class="panel-icon" /></div><template v-if="selectedInstance"><div class="detail-grid"><div><span>definitionId</span><code>{{ selectedInstance.definitionId || '—' }}</code></div><div><span>processInstanceId</span><code>{{ selectedInstance.id }}</code></div><div><span>业务键</span><b>{{ selectedInstance.businessKey || '—' }}</b></div><div><span>tenantId</span><b>{{ selectedInstance.tenantId || '—' }}</b></div></div><div class="detail-section"><h3>当前活动树</h3><pre class="json-output">{{ selectedActivity ? JSON.stringify(selectedActivity, null, 2) : '未查询到活动树' }}</pre></div><div class="detail-section"><h3>流程变量</h3><pre class="json-output">{{ formatVariables(selectedVariables) }}</pre></div></template><div v-else class="empty-detail">选择一条实例记录查看活动树和变量。</div></div></div><ReadOnlyProcessDiagram v-if="selectedInstance" :key="selectedInstance.id" :xml="selectedInstanceXml" :active-ids="activeActivityIds" /></div>

    <div v-else-if="activeTab === 'tasks'" class="console-view"><div class="view-toolbar"><div><h2>任务查询</h2><p>用于查看引擎任务状态；业务审批动作仍应由业务系统承接。</p></div><ElButton :icon="Refresh" :loading="loading.tasks" @click="loadTasks">刷新任务</ElButton></div><div class="sub-tabs"><button type="button" :class="{ active: taskTab === 'user' }" @click="taskTab = 'user'">人工任务</button><button type="button" :class="{ active: taskTab === 'external' }" @click="taskTab = 'external'">External Task</button></div><ElForm inline class="console-filter" @submit.prevent="searchActiveTab()"><ElFormItem v-if="taskTab === 'user'" label="办理人"><ElInput v-model="taskAssignee" placeholder="assignee" clearable /></ElFormItem><ElFormItem v-else label="Topic"><ElInput v-model="externalTopic" placeholder="topicName" clearable /></ElFormItem><ElFormItem label="流程实例"><ElInput v-model="taskProcessInstanceId" placeholder="processInstanceId" clearable /></ElFormItem><ElFormItem><ElButton type="primary" :icon="Search" native-type="submit">查询</ElButton><ElButton @click="searchActiveTab(true)">重置</ElButton></ElFormItem></ElForm><div class="console-panel"><ElTable v-if="taskTab === 'user'" v-loading="loading.tasks" :data="tasks" empty-text="暂无人工任务"><ElTableColumn prop="name" label="任务" min-width="180"><template #default="{ row }"><b>{{ row.name || '未命名任务' }}</b><small class="table-sub">{{ row.taskDefinitionKey || '—' }}</small></template></ElTableColumn><ElTableColumn prop="processInstanceId" label="流程实例" min-width="190"><template #default="{ row }"><code>{{ row.processInstanceId || '—' }}</code></template></ElTableColumn><ElTableColumn prop="assignee" label="办理人" width="130"><template #default="{ row }">{{ row.assignee || '未领取' }}</template></ElTableColumn><ElTableColumn prop="created" label="创建时间" min-width="170"><template #default="{ row }">{{ formatDate(row.created) }}</template></ElTableColumn><ElTableColumn prop="due" label="到期时间" min-width="170"><template #default="{ row }">{{ formatDate(row.due) }}</template></ElTableColumn></ElTable><ElTable v-else v-loading="loading.tasks" :data="externalTasks" empty-text="暂无 External Task"><ElTableColumn prop="topicName" label="Topic" min-width="180" /><ElTableColumn prop="id" label="External Task ID" min-width="220"><template #default="{ row }"><code>{{ row.id }}</code></template></ElTableColumn><ElTableColumn prop="workerId" label="Worker" min-width="150"><template #default="{ row }">{{ row.workerId || '未锁定' }}</template></ElTableColumn><ElTableColumn prop="lockExpirationTime" label="锁到期" min-width="170"><template #default="{ row }">{{ formatDate(row.lockExpirationTime) }}</template></ElTableColumn><ElTableColumn prop="retries" label="Retries" width="90" /></ElTable></div></div>

    <div v-else-if="activeTab === 'operations'" class="console-view"><div class="view-toolbar"><div><h2>Job / Incident</h2><p>Job 与 Incident 是不同的引擎对象，分别查询和处理。</p></div><ElButton :icon="Refresh" :loading="loading.operations" @click="loadOperations">刷新异常</ElButton></div><div class="console-metrics compact"><article class="warning"><span>Incident</span><strong>{{ pages.incidents?.total ?? '—' }}</strong></article><article class="warning"><span>异常 Job</span><strong>{{ pages.jobs?.total ?? '—' }}</strong></article></div><div class="operations-grid"><div class="console-panel"><div class="panel-heading"><div><h2>Incident</h2><p>引擎记录的开放异常</p></div></div><ElTable v-loading="loading.operations" :data="incidents" empty-text="暂无 Incident"><ElTableColumn prop="incidentType" label="类型" width="130" /><ElTableColumn prop="incidentMessage" label="错误消息" min-width="250"><template #default="{ row }">{{ row.incidentMessage || '—' }}</template></ElTableColumn><ElTableColumn prop="processInstanceId" label="流程实例" min-width="190"><template #default="{ row }"><code>{{ row.processInstanceId || '—' }}</code></template></ElTableColumn><ElTableColumn prop="activityId" label="节点" min-width="150" /><ElTableColumn prop="incidentTimestamp" label="出现时间" min-width="170"><template #default="{ row }">{{ formatDate(row.incidentTimestamp) }}</template></ElTableColumn></ElTable><ElPagination class="console-pagination" :current-page="pages.incidents?.page" :total="pages.incidents?.total ?? 0" :page-size="pageSize" :disabled="busy.incidents" layout="total, prev, pager, next" @current-change="changeOperationPage('incidents', $event)" /></div><div class="console-panel"><div class="panel-heading"><div><h2>Job</h2><p>异常 Job 可调整 retries</p></div></div><ElTable v-loading="loading.operations" :data="jobs" empty-text="暂无异常 Job" @row-click="showJob"><ElTableColumn prop="id" label="Job ID" min-width="180"><template #default="{ row }"><code>{{ row.id }}</code></template></ElTableColumn><ElTableColumn prop="jobDefinitionId" label="Job 定义" min-width="180" /><ElTableColumn prop="exceptionMessage" label="异常" min-width="220"><template #default="{ row }">{{ row.exceptionMessage || '—' }}</template></ElTableColumn><ElTableColumn prop="retries" label="Retries" width="90" /><ElTableColumn label="操作" width="110"><template #default="{ row }"><ElButton text size="small" :disabled="pending[row.id]" @click.stop="retryJob(row)">调整重试</ElButton></template></ElTableColumn></ElTable><ElPagination class="console-pagination" :current-page="pages.jobs?.page" :total="pages.jobs?.total ?? 0" :page-size="pageSize" :disabled="busy.jobs" layout="total, prev, pager, next" @current-change="changeOperationPage('jobs', $event)" /></div></div><div v-if="selectedJob" class="console-panel stacktrace-panel"><div class="panel-heading"><div><h2>Job 异常详情</h2><p>{{ selectedJob.id }}</p></div></div><pre class="json-output">{{ busy['job-detail'] ? '加载中…' : selectedJobStacktrace || selectedJob.exceptionMessage || '未返回异常堆栈' }}</pre></div></div>

    <div v-else-if="activeTab === 'history'" class="console-view"><div class="view-toolbar"><div><h2>历史查询</h2><p>包含未结束和已结束记录；数据受引擎历史级别和历史清理影响。</p></div><div><ElButton :icon="Download" :disabled="loading.history || activePage?.total == null" @click="exportHistory">导出当前页 JSON</ElButton><ElButton :icon="Refresh" :loading="loading.history" @click="loadHistory">刷新历史</ElButton></div></div><ElForm inline class="console-filter" @submit.prevent="searchActiveTab()"><ElFormItem label="流程实例"><ElInput v-model="historyProcessInstanceId" placeholder="可选 processInstanceId" clearable /></ElFormItem><ElFormItem><ElButton type="primary" :icon="Search" native-type="submit">查询</ElButton><ElButton @click="searchActiveTab(true)">重置</ElButton></ElFormItem></ElForm><div class="sub-tabs"><button v-for="item in [{ key: 'instances', label: '历史实例' }, { key: 'tasks', label: '历史任务' }, { key: 'activities', label: '历史活动' }, { key: 'variables', label: '历史变量' }]" :key="item.key" type="button" :class="{ active: historyTab === item.key }" @click="historyTab = item.key as HistoryTab">{{ item.label }}</button></div><div class="console-panel"><ElTable v-if="historyTab === 'instances'" v-loading="loading.history" :data="historicInstances" empty-text="暂无历史实例"><ElTableColumn prop="businessKey" label="业务键" min-width="180" /><ElTableColumn prop="processDefinitionKey" label="流程 key" min-width="170" /><ElTableColumn prop="processDefinitionId" label="definitionId" min-width="230"><template #default="{ row }"><code>{{ row.processDefinitionId || '—' }}</code></template></ElTableColumn><ElTableColumn prop="startTime" label="开始时间" min-width="170"><template #default="{ row }">{{ formatDate(row.startTime) }}</template></ElTableColumn><ElTableColumn prop="endTime" label="结束时间" min-width="170"><template #default="{ row }">{{ formatDate(row.endTime) }}</template></ElTableColumn></ElTable><ElTable v-else-if="historyTab === 'tasks'" v-loading="loading.history" :data="historicTasks" empty-text="暂无历史任务"><ElTableColumn prop="name" label="任务" min-width="180" /><ElTableColumn prop="processInstanceId" label="流程实例" min-width="200" /><ElTableColumn prop="assignee" label="办理人" width="130" /><ElTableColumn prop="startTime" label="开始时间" min-width="170"><template #default="{ row }">{{ formatDate(row.startTime) }}</template></ElTableColumn><ElTableColumn prop="endTime" label="结束时间" min-width="170"><template #default="{ row }">{{ formatDate(row.endTime) }}</template></ElTableColumn></ElTable><ElTable v-else-if="historyTab === 'activities'" v-loading="loading.history" :data="historicActivities" empty-text="暂无历史活动"><ElTableColumn prop="activityName" label="活动" min-width="180" /><ElTableColumn prop="activityType" label="类型" min-width="150" /><ElTableColumn prop="processInstanceId" label="流程实例" min-width="200" /><ElTableColumn prop="startTime" label="开始时间" min-width="170"><template #default="{ row }">{{ formatDate(row.startTime) }}</template></ElTableColumn><ElTableColumn prop="endTime" label="结束时间" min-width="170"><template #default="{ row }">{{ formatDate(row.endTime) }}</template></ElTableColumn></ElTable><ElTable v-else v-loading="loading.history" :data="historicVariables" empty-text="暂无历史变量"><ElTableColumn prop="name" label="变量名" min-width="180" /><ElTableColumn prop="type" label="类型" width="120" /><ElTableColumn prop="processInstanceId" label="流程实例" min-width="200" /><ElTableColumn prop="createTime" label="记录时间" min-width="170"><template #default="{ row }">{{ formatDate(row.createTime) }}</template></ElTableColumn><ElTableColumn label="值" min-width="220"><template #default="{ row }"><code class="variable-value">{{ JSON.stringify(row.value) }}</code></template></ElTableColumn></ElTable></div></div>

    <div v-else class="console-view"><div class="view-toolbar"><div><h2>操作日志</h2><p>Camunda 用户操作历史，不能替代 Go 层的平台审计。</p></div><ElButton :icon="Refresh" :loading="loading.audit" @click="loadAudit">刷新日志</ElButton></div><div class="console-panel"><ElTable v-loading="loading.audit" :data="operationLogs" empty-text="暂无用户操作日志"><ElTableColumn prop="timestamp" label="时间" min-width="175"><template #default="{ row }">{{ formatDate(row.timestamp) }}</template></ElTableColumn><ElTableColumn prop="userId" label="用户" width="140"><template #default="{ row }">{{ row.userId || '引擎上下文' }}</template></ElTableColumn><ElTableColumn prop="operationType" label="操作" min-width="160" /><ElTableColumn prop="entityType" label="对象类型" width="140" /><ElTableColumn label="对象 / 操作 ID" min-width="230"><template #default="{ row }"><code>{{ operationObject(row) }}</code></template></ElTableColumn><ElTableColumn prop="property" label="属性" min-width="140" /><ElTableColumn prop="newValue" label="新值" min-width="160" /></ElTable></div></div>

    <div v-if="activePage" class="console-pagination"><span v-if="activePage.total === null">{{ busy[activeResource] ? '正在查询…' : '尚未加载成功' }}</span><ElPagination v-else :current-page="activePage.page" :page-size="pageSize" :total="activePage.total" :disabled="busy[activeResource]" layout="total, prev, pager, next" @current-change="changeActivePage" /></div>

    <ElDialog v-model="showDeploymentDialog" :close-on-click-modal="!pending.deploy" :close-on-press-escape="!pending.deploy" :show-close="!pending.deploy" title="部署 BPMN 到 Camunda" width="min(860px, calc(100vw - 32px))"><ElAlert v-if="errors['command-' + activeTab]" type="error" :closable="false" :title="errors['command-' + activeTab]" /><ElAlert v-if="errors['deployment-file']" type="error" :title="errors['deployment-file']" :closable="false" /><ElForm label-position="top" :disabled="pending.deploy"><ElFormItem label="BPMN 文件"><input type="file" accept=".bpmn,.xml" :disabled="pending.deploy" aria-label="选择 BPMN 文件" @change="importDeploymentFile" /></ElFormItem><ElFormItem label="部署名称"><ElInput v-model="deploymentName" maxlength="120" /></ElFormItem><ElFormItem label="BPMN XML"><ElInput v-model="deploymentXml" type="textarea" :rows="16" spellcheck="false" class="xml-input" /></ElFormItem></ElForm><ElAlert type="info" :closable="false" title="开发联调：部署请求会通过 Vite 代理发送到 Camunda 7。正式环境应改由 Go 服务接收并执行权限、租户和幂等校验。" /><template #footer><ElButton :disabled="pending.deploy" @click="showDeploymentDialog = false">取消</ElButton><ElButton type="primary" :loading="loading.deploy" :disabled="!deploymentXml.trim() || busy['deployment-file']" :icon="Upload" @click="deploy">确认部署</ElButton></template></ElDialog>
    <ElDialog v-model="showDefinitionXml" title="流程定义 XML" width="min(900px, calc(100vw - 32px))"><pre class="xml-output">{{ busy['definitions-detail'] ? '正在加载 XML…' : selectedDefinitionXml || '未加载 XML，请查看错误提示后重试' }}</pre><ElAlert v-if="errors['definitions-detail']" type="error" :closable="false" :title="errors['definitions-detail']" /><template #footer><ElButton :icon="Download" :disabled="!selectedDefinitionXml || busy['definitions-detail']" @click="exportDefinition">下载 BPMN</ElButton><ElButton @click="showDefinitionXml = false">关闭</ElButton></template></ElDialog>
  </section>
</template>

<style scoped>
.console-page { --ink: #17382f; --muted: #72857c; --line: #e1e9e4; --accent: #24745e; color: var(--ink); }
.console-tabs button svg { flex: none; width: 16px; height: 16px; }
.panel-heading .panel-icon { flex: none; width: 18px; height: 18px; }
.capability-list svg { flex: none; width: 15px; height: 15px; }
.console-heading, .view-toolbar, .panel-heading, .console-detail, .engine-banner, .console-filter { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.console-heading { align-items: flex-start; margin-bottom: 24px; }
.console-eyebrow { color: #71867b; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
.console-heading h1 { margin: 8px 0 7px; font-size: 28px; letter-spacing: -.02em; }
.console-heading p, .view-toolbar p, .panel-heading p { margin: 0; color: var(--muted); font-size: 12px; }
.console-heading-actions { display: flex; align-items: center; gap: 8px; }
.connection-state { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; color: #72857c; background: #fff; font-size: 11px; }
.connection-state i { width: 7px; height: 7px; border-radius: 50%; background: #a2b0a9; }
.connection-state.success { border-color: #cfe4d6; color: #3a805f; background: #f5fbf7; }.connection-state.success i { background: #3c9c74; }.connection-state.danger { border-color: #f0d1cd; color: #b04f4a; background: #fff8f7; }.connection-state.danger i { background: #c85b55; }.connection-state b { margin-left: 4px; font-family: monospace; font-size: 10px; font-weight: 500; }
.console-alert { margin-bottom: 16px; }
.console-pagination { display: flex; justify-content: flex-end; padding: 14px; overflow-x: auto; }
.engine-banner.danger { border-color: #f0d1cd; background: #fff8f7; color: #b04f4a; }
.engine-banner.danger .engine-dot { background: #c85b55; box-shadow: none; }
.engine-banner.muted .engine-dot { background: #a2b0a9; box-shadow: none; }
.console-tabs { display: flex; gap: 3px; overflow-x: auto; margin-bottom: 18px; padding: 5px; border: 1px solid var(--line); border-radius: 8px; background: #fbfdfc; }
.console-tabs button { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; border: 0; border-radius: 5px; color: #6d8278; background: transparent; cursor: pointer; font-size: 12px; white-space: nowrap; }.console-tabs button:hover { color: var(--accent); background: #f0f7f3; }.console-tabs button.active { color: #236b52; background: #e4f1e9; font-weight: 600; }.tab-count { min-width: 18px; padding: 2px 5px; border-radius: 9px; color: #b04f4a; background: #fdebea; font-size: 10px; text-align: center; }
.console-view { min-width: 0; }.engine-banner { margin-bottom: 14px; padding: 13px 16px; border: 1px solid #dbe9e1; border-radius: 7px; color: #4e7162; background: #f4faf6; font-size: 11px; }.engine-banner > div { display: flex; align-items: center; gap: 8px; }.engine-banner span { color: #8da097; }.engine-banner small { color: #91a198; font-size: 10px; }.engine-dot { width: 7px; height: 7px; border-radius: 50%; background: #3d9f76; box-shadow: 0 0 0 4px #d7eee0; }
.console-metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }.console-metrics.compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }.console-metrics article { display: grid; gap: 7px; min-height: 106px; padding: 15px; border: 1px solid var(--line); border-radius: 7px; background: #fff; }.console-metrics article.warning { border-color: #f0ded2; background: #fffaf7; }.console-metrics span { color: #789087; font-size: 11px; }.console-metrics strong { color: #2d604e; font-size: 25px; font-weight: 600; }.console-metrics .warning strong { color: #b55c45; }.console-metrics small { color: #a2aea8; font-size: 9px; font-family: monospace; }
.console-columns, .operations-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); gap: 14px; }.console-panel { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: #fff; }.panel-heading { align-items: flex-start; padding: 17px 18px 14px; border-bottom: 1px solid #edf2ee; }.panel-heading h2, .view-toolbar h2 { margin: 0 0 6px; color: #294d3e; font-size: 16px; font-weight: 600; }.panel-icon { color: #7da694; }.capability-list { display: grid; gap: 1px; padding: 9px 18px 12px; }.capability-list div { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid #f0f3f1; color: #5b7769; font-size: 11px; }.capability-list div:last-child { border-bottom: 0; }.capability-list svg { color: #4a9e76; }
.view-toolbar { align-items: flex-start; margin-bottom: 17px; }.view-toolbar > div:first-child { min-width: 0; }.console-search { display: flex; align-items: center; gap: 8px; width: 290px; min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; color: #9aa9a2; background: #fff; }.console-search input { width: 100%; border: 0; outline: none; color: #405f51; font-size: 12px; }
.console-filter { justify-content: flex-start; flex-wrap: wrap; margin-bottom: 14px; padding: 13px 16px 0; border: 1px solid var(--line); border-radius: 7px; background: #fbfdfc; }.console-filter .el-form-item { margin-bottom: 13px; }.instance-console-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, .75fr); gap: 14px; }.instance-detail { min-height: 340px; }.detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; padding: 15px 18px; border-bottom: 1px solid #edf2ee; }.detail-grid div { display: grid; gap: 5px; min-width: 0; }.detail-grid span { color: #94a39c; font-size: 10px; }.detail-grid b, .detail-grid code { overflow: hidden; color: #557568; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.detail-section { padding: 14px 18px 0; }.detail-section h3 { margin: 0 0 8px; color: #557568; font-size: 11px; }.empty-detail { padding: 60px 18px; color: #9aa9a2; text-align: center; font-size: 11px; }
.sub-tabs { display: flex; gap: 16px; margin-bottom: 14px; border-bottom: 1px solid var(--line); }.sub-tabs button { padding: 9px 0; border: 0; border-bottom: 2px solid transparent; color: #91a198; background: transparent; cursor: pointer; font-size: 11px; }.sub-tabs button.active { border-color: var(--accent); color: #2d765a; font-weight: 600; }.table-sub { display: block; margin-top: 4px; color: #99a8a0; font-size: 10px; }.console-detail { margin-top: 14px; padding: 14px 16px; border: 1px solid #dbe9e1; border-radius: 7px; background: #f5faf7; }.console-detail h3 { margin: 0 0 5px; color: #426656; font-size: 13px; }.console-detail code { color: #8a9d93; font-size: 10px; }
.stacktrace-panel { margin-top: 14px; }.json-output, .xml-output { max-height: 300px; margin: 0; overflow: auto; padding: 14px 18px; color: #5f776d; background: #fbfdfc; font-family: Consolas, 'SFMono-Regular', monospace; font-size: 10px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }.xml-output { min-height: 500px; max-height: 65vh; color: #547165; }.variable-value { overflow: hidden; display: block; max-width: 260px; text-overflow: ellipsis; white-space: nowrap; }
.xml-input :deep(textarea) { font-family: Consolas, 'SFMono-Regular', monospace; font-size: 11px; line-height: 1.55; }
@media (max-width: 1200px) { .console-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }.console-columns, .operations-grid, .instance-console-grid { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .console-heading, .view-toolbar { flex-direction: column; }.console-heading-actions { flex-wrap: wrap; width: 100%; }.console-search { width: 100%; }.console-metrics, .console-metrics.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }.engine-banner { align-items: flex-start; flex-direction: column; }.detail-grid { grid-template-columns: 1fr; } }
</style>
