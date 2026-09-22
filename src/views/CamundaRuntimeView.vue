<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ElAlert, ElButton, ElDescriptions, ElDescriptionsItem, ElDialog, ElForm, ElFormItem,
  ElInput, ElMessage, ElOption, ElSelect, ElTable, ElTableColumn, ElTree,
} from 'element-plus'
import { Refresh, Search, Upload, VideoPlay } from '@element-plus/icons-vue'
import initialDiagram from '@/bpmn/requirement-process.bpmn?raw'
import { camundaGateway } from '@/api/camunda/gateway'
import type {
  CamundaActivityInstance,
  CamundaProcessDefinition,
  CamundaProcessInstance,
  CamundaTask,
  CamundaVariables,
} from '@/api/camunda/types'

type RuntimeTab = 'deploy' | 'instances' | 'tasks'
interface ActivityTreeNode { id: string; label: string; children?: ActivityTreeNode[] }

const activeTab = ref<RuntimeTab>('deploy')
const xml = ref(initialDiagram)
const deploymentName = ref('需求提交与确认')
const definitions = ref<CamundaProcessDefinition[]>([])
const selectedDefinitionId = ref('')
const businessKey = ref('')
const startVariablesText = ref('{}')
const processInstanceId = ref('')
const tasks = ref<CamundaTask[]>([])
const currentInstance = ref<CamundaProcessInstance>()
const activityRoot = ref<ActivityTreeNode>()
const taskFilter = ref({ assignee: '', candidateUser: '' })
const selectedTask = ref<CamundaTask>()
const completeDialogVisible = ref(false)
const claimUserId = ref('')
const completionVariablesText = ref('{}')
const dialogError = ref('')
const busy = ref({ deploy: false, definitions: false, start: false, tasks: false, claim: false, complete: false, activity: false })
const error = ref('')
const deployment = ref<{ id: string; name?: string; deploymentTime?: string; deployedProcessDefinitions?: Record<string, CamundaProcessDefinition> }>()

const selectedDefinition = computed(() => definitions.value.find(item => item.id === selectedDefinitionId.value))
const busyAny = computed(() => Object.values(busy.value).some(Boolean))

function parseVariables(text: string): CamundaVariables {
  const parsed: unknown = JSON.parse(text || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('流程变量必须是 JSON 对象')
  const variables: CamundaVariables = {}
  const supportedTypes = new Set<NonNullable<CamundaVariables[string]['type']>>(['String', 'Boolean', 'Integer', 'Long', 'Double', 'Date', 'Json', 'Object', 'Bytes'])
  for (const [name, raw] of Object.entries(parsed)) {
    if (!name.trim()) throw new Error('流程变量名称不能为空')
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
      const candidate = raw as Record<string, unknown>
      if (candidate.type !== undefined && (typeof candidate.type !== 'string' || !supportedTypes.has(candidate.type as NonNullable<CamundaVariables[string]['type']>))) {
        throw new Error(`变量「${name}」的 type 不是支持的 Camunda 类型`)
      }
      if (candidate.valueInfo !== undefined && (!candidate.valueInfo || typeof candidate.valueInfo !== 'object' || Array.isArray(candidate.valueInfo))) {
        throw new Error(`变量「${name}」的 valueInfo 必须是对象`)
      }
      variables[name] = {
        value: candidate.value,
        ...(candidate.type ? { type: candidate.type as NonNullable<CamundaVariables[string]['type']> } : {}),
        ...(candidate.valueInfo ? { valueInfo: candidate.valueInfo as Record<string, unknown> } : {}),
      }
    } else if (typeof raw === 'string') variables[name] = { value: raw, type: 'String' }
    else if (typeof raw === 'boolean') variables[name] = { value: raw, type: 'Boolean' }
    else if (typeof raw === 'number' && Number.isInteger(raw)) variables[name] = { value: raw, type: raw >= -2147483648 && raw <= 2147483647 ? 'Integer' : 'Long' }
    else if (typeof raw === 'number') variables[name] = { value: raw, type: 'Double' }
    else if (raw === null) variables[name] = { value: null }
    else variables[name] = { value: raw, type: 'Json' }
  }
  return variables
}

function validateExecutableBpmn(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  if (parsed.querySelector('parsererror')) return 'BPMN XML 格式错误，请先修复解析问题'
  const processes = [...parsed.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'process')]
  if (processes.length !== 1) return '首阶段仅允许部署一个流程的 BPMN 文件'
  if (processes[0]?.getAttribute('isExecutable') !== 'true') return '流程必须设置 isExecutable="true" 才能启动实例'
  return ''
}

function toActivityNode(activity: CamundaActivityInstance): ActivityTreeNode {
  const children = [
    ...(activity.childActivityInstances ?? []).map(toActivityNode),
    ...(activity.childTransitionInstances ?? []).map(item => ({ id: item.id, label: `转换 · ${item.activityId || item.id}` })),
  ]
  const kind = activity.activityType ? ` · ${activity.activityType}` : ''
  return { id: activity.id, label: `${activity.activityName || activity.activityId || activity.id}${kind}`, ...(children.length ? { children } : {}) }
}

async function loadDefinitions() {
  busy.value.definitions = true
  error.value = ''
  try {
    definitions.value = await camundaGateway.listDefinitions({ latestVersion: true, maxResults: 100 })
    if (!definitions.value.some(item => item.id === selectedDefinitionId.value)) selectedDefinitionId.value = definitions.value[0]?.id ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '流程定义查询失败'
  } finally { busy.value.definitions = false }
}

async function deploy() {
  if (!xml.value.trim() || busyAny.value) return
  const validationError = validateExecutableBpmn(xml.value)
  if (validationError) { error.value = validationError; return }
  busy.value.deploy = true
  error.value = ''
  try {
    deployment.value = await camundaGateway.deploy(xml.value, deploymentName.value.trim() || undefined)
    await loadDefinitions()
    const deployed = Object.values(deployment.value.deployedProcessDefinitions ?? {})[0]
    if (deployed?.id) selectedDefinitionId.value = deployed.id
    activeTab.value = 'instances'
    ElMessage.success('流程已部署到 Camunda 7')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '流程部署失败'
  } finally { busy.value.deploy = false }
}

async function startInstance() {
  const definition = selectedDefinition.value
  if (!definition || busyAny.value) return
  let variables: CamundaVariables
  try { variables = parseVariables(startVariablesText.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '流程变量格式错误'; return }
  busy.value.start = true
  error.value = ''
  try {
    currentInstance.value = await camundaGateway.startByKey(definition.key, variables, businessKey.value.trim() || undefined)
    processInstanceId.value = currentInstance.value.id
    activeTab.value = 'tasks'
    await Promise.all([loadTasks(), loadActivity()])
    ElMessage.success('流程实例已启动')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '流程启动失败'
  } finally { busy.value.start = false }
}

async function loadTasks() {
  const id = processInstanceId.value.trim()
  if (!id) { error.value = '请先填写流程实例 ID'; return }
  busy.value.tasks = true
  error.value = ''
  try {
    tasks.value = await camundaGateway.listTasks({
      processInstanceId: id,
      ...(taskFilter.value.assignee.trim() ? { assignee: taskFilter.value.assignee.trim() } : {}),
      ...(taskFilter.value.candidateUser.trim() ? { candidateUser: taskFilter.value.candidateUser.trim() } : {}),
      maxResults: 100,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '人工任务查询失败'
  } finally { busy.value.tasks = false }
}

async function loadActivity() {
  const id = processInstanceId.value.trim()
  if (!id) return
  busy.value.activity = true
  try {
    activityRoot.value = toActivityNode(await camundaGateway.getActivityInstance(id))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '活动树查询失败'
  } finally { busy.value.activity = false }
}

function openComplete(task: unknown) {
  if (!task || typeof task !== 'object' || !('id' in task) || typeof task.id !== 'string') return
  const selected = task as CamundaTask
  selectedTask.value = selected
  completeDialogVisible.value = true
  completionVariablesText.value = '{}'
  claimUserId.value = ''
  dialogError.value = ''
}

async function claimSelectedTask() {
  const task = selectedTask.value
  const userId = claimUserId.value.trim()
  if (!task || !userId) { dialogError.value = '请输入领取任务的用户标识'; return }
  busy.value.claim = true
  dialogError.value = ''
  try {
    await camundaGateway.claimTask(task.id, userId)
    ElMessage.success('任务已领取')
    selectedTask.value = undefined
    completeDialogVisible.value = false
    await loadTasks()
  } catch (cause) {
    dialogError.value = cause instanceof Error ? cause.message : '任务领取失败'
  } finally { busy.value.claim = false }
}

async function completeSelectedTask() {
  const task = selectedTask.value
  if (!task) return
  let variables: CamundaVariables
  try { variables = parseVariables(completionVariablesText.value) }
  catch (cause) { dialogError.value = cause instanceof Error ? cause.message : '流程变量格式错误'; return }
  busy.value.complete = true
  dialogError.value = ''
  try {
    await camundaGateway.completeTask(task.id, variables)
    selectedTask.value = undefined
    completeDialogVisible.value = false
    await Promise.all([loadTasks(), loadActivity()])
    ElMessage.success('人工任务已完成')
  } catch (cause) {
    dialogError.value = cause instanceof Error ? cause.message : '任务完成失败'
  } finally { busy.value.complete = false }
}

onMounted(loadDefinitions)
</script>

<template>
  <section class="runtime-page">
    <div class="page-heading">
      <div><h1>Camunda 7 引擎联调</h1><p>Camunda 原生 REST · 开发代理</p></div>
      <ElButton :icon="Refresh" :loading="busy.definitions" :disabled="busyAny" @click="loadDefinitions">刷新流程定义</ElButton>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="runtime-alert" />

    <nav class="runtime-tabs" aria-label="引擎联调阶段">
      <button :class="{ active: activeTab === 'deploy' }" :aria-current="activeTab === 'deploy' ? 'step' : undefined" @click="activeTab = 'deploy'"><span>1</span>部署流程</button>
      <button :class="{ active: activeTab === 'instances' }" :aria-current="activeTab === 'instances' ? 'step' : undefined" @click="activeTab = 'instances'"><span>2</span>启动实例</button>
      <button :class="{ active: activeTab === 'tasks' }" :aria-current="activeTab === 'tasks' ? 'step' : undefined" @click="activeTab = 'tasks'"><span>3</span>办理任务</button>
    </nav>

    <section v-show="activeTab === 'deploy'" class="runtime-section">
      <div class="runtime-section-heading"><div><h2>部署 BPMN 流程</h2><p>部署内容按 BPMN XML 原文提交。</p></div></div>
      <ElForm label-position="top" class="deploy-form" @submit.prevent="deploy">
        <div class="deploy-meta">
          <ElFormItem label="部署名称"><ElInput v-model="deploymentName" maxlength="120" /></ElFormItem>
          <ElButton type="primary" :icon="Upload" :loading="busy.deploy" :disabled="busyAny || !xml.trim()" native-type="submit">部署</ElButton>
        </div>
        <ElFormItem label="BPMN XML" required>
          <ElInput v-model="xml" type="textarea" :rows="14" resize="vertical" spellcheck="false" class="xml-editor" />
        </ElFormItem>
      </ElForm>
      <ElDescriptions v-if="deployment" :column="2" border size="small" class="deployment-result">
        <ElDescriptionsItem label="部署 ID">{{ deployment.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="部署时间">{{ deployment.deploymentTime || '—' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="部署名称">{{ deployment.name || '—' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="流程定义">{{ Object.values(deployment.deployedProcessDefinitions ?? {}).map(item => `${item.key} v${item.version}`).join('、') || '无流程定义返回' }}</ElDescriptionsItem>
      </ElDescriptions>
    </section>

    <section v-show="activeTab === 'instances'" class="runtime-section">
      <div class="runtime-section-heading"><div><h2>启动流程实例</h2><p>选择已部署流程定义；新版本仍由 Camunda 按流程 key 管理。</p></div></div>
      <ElForm label-position="top" class="instance-form" @submit.prevent="startInstance">
        <ElFormItem label="流程定义">
          <ElSelect v-model="selectedDefinitionId" filterable placeholder="選擇流程定义" :loading="busy.definitions" class="wide-input">
            <ElOption v-for="definition in definitions" :key="definition.id" :label="`${definition.name || definition.key} · ${definition.key} · v${definition.version}`" :value="definition.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="业务标识"><ElInput v-model="businessKey" placeholder="可选，用于关联业务单据" /></ElFormItem>
        <ElFormItem label="流程变量"><ElInput v-model="startVariablesText" type="textarea" :rows="6" spellcheck="false" class="xml-editor" /></ElFormItem>
        <div class="runtime-actions"><ElButton type="primary" :icon="VideoPlay" :loading="busy.start" :disabled="busyAny || !selectedDefinition" @click="startInstance">启动流程</ElButton></div>
      </ElForm>
      <ElDescriptions v-if="currentInstance" :column="2" border size="small" class="deployment-result">
        <ElDescriptionsItem label="流程实例 ID">{{ currentInstance.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="流程定义">{{ currentInstance.definitionId || selectedDefinition?.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="流程 key">{{ currentInstance.definitionKey || selectedDefinition?.key }}</ElDescriptionsItem>
        <ElDescriptionsItem label="业务标识">{{ currentInstance.businessKey || businessKey || '—' }}</ElDescriptionsItem>
      </ElDescriptions>
    </section>

    <section v-show="activeTab === 'tasks'" class="runtime-section">
      <div class="runtime-section-heading"><div><h2>人工任务与活动</h2><p>任务列表显示指定流程实例的待办；完成后刷新任务和活动树。</p></div></div>
      <ElForm :inline="true" class="task-filters" @submit.prevent="loadTasks">
        <ElFormItem label="流程实例 ID"><ElInput v-model="processInstanceId" placeholder="Camunda process instance ID" /></ElFormItem>
        <ElFormItem label="办理人"><ElInput v-model="taskFilter.assignee" placeholder="可选" /></ElFormItem>
        <ElFormItem label="候选用户"><ElInput v-model="taskFilter.candidateUser" placeholder="可选" /></ElFormItem>
        <ElFormItem><ElButton type="primary" :icon="Search" :loading="busy.tasks" :disabled="busyAny" native-type="submit">查询人工任务</ElButton></ElFormItem>
      </ElForm>
      <ElTable :data="tasks" row-key="id" empty-text="暂无人工任务" :aria-busy="busy.tasks">
        <ElTableColumn prop="name" label="任务" min-width="150" />
        <ElTableColumn prop="taskDefinitionKey" label="节点 ID" min-width="150" />
        <ElTableColumn prop="assignee" label="办理人" min-width="120">
          <template #default="{ row }">{{ row.assignee || '未领取' }}</template>
        </ElTableColumn>
        <ElTableColumn prop="created" label="创建时间" min-width="175" />
        <ElTableColumn label="操作" width="130" fixed="right">
          <template #default="{ row }"><ElButton size="small" type="primary" :disabled="busyAny" @click="openComplete(row)">办理</ElButton></template>
        </ElTableColumn>
      </ElTable>
      <div class="activity-heading"><h3>当前活动树</h3><ElButton text :icon="Refresh" :loading="busy.activity" :disabled="busyAny || !processInstanceId" @click="loadActivity">刷新</ElButton></div>
      <div v-if="activityRoot" class="activity-tree-wrap"><ElTree :data="[activityRoot]" node-key="id" default-expand-all :expand-on-click-node="false" /></div>
      <p v-else class="empty-activity">输入流程实例 ID 查询活动树。</p>
    </section>

    <ElDialog v-model="completeDialogVisible" title="办理人工任务" width="min(620px, calc(100vw - 32px))" :close-on-click-modal="false" :close-on-press-escape="!busy.claim && !busy.complete" :show-close="!busy.claim && !busy.complete" @closed="selectedTask = undefined">
      <template v-if="selectedTask">
        <ElDescriptions :column="1" border size="small" class="task-description">
          <ElDescriptionsItem label="任务">{{ selectedTask.name || selectedTask.id }}</ElDescriptionsItem>
          <ElDescriptionsItem label="办理人">{{ selectedTask.assignee || '未领取' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="流程实例">{{ selectedTask.processInstanceId }}</ElDescriptionsItem>
        </ElDescriptions>
        <ElAlert v-if="dialogError" :title="dialogError" type="error" :closable="false" show-icon class="dialog-error" />
        <ElForm label-position="top" @submit.prevent="completeSelectedTask">
          <ElFormItem v-if="!selectedTask.assignee" label="领取用户">
            <div class="claim-row"><ElInput v-model="claimUserId" placeholder="用户标识" /><ElButton :loading="busy.claim" :disabled="busy.complete" @click="claimSelectedTask">领取任务</ElButton></div>
          </ElFormItem>
          <ElFormItem label="完成任务时提交的变量"><ElInput v-model="completionVariablesText" type="textarea" :rows="6" spellcheck="false" class="xml-editor" /></ElFormItem>
        </ElForm>
      </template>
      <template #footer><ElButton :disabled="busy.claim || busy.complete" @click="completeDialogVisible = false">取消</ElButton><ElButton type="primary" :loading="busy.complete" :disabled="busy.claim" @click="completeSelectedTask">完成任务</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.runtime-page { display: flex; flex-direction: column; min-height: 100%; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.page-heading h1 { margin: 0; color: #243d35; font-size: 22px; font-weight: 620; }
.page-heading p { margin: 7px 0 0; color: #798a81; font-size: 12px; }
.runtime-alert { margin-bottom: 16px; }
.runtime-tabs { display: flex; border-bottom: 1px solid #dce5df; margin-bottom: 18px; }
.runtime-tabs button { display: inline-flex; align-items: center; gap: 9px; min-height: 44px; padding: 0 18px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #728278; font: inherit; font-size: 13px; cursor: pointer; }
.runtime-tabs button.active { border-color: #24745e; color: #205f4d; font-weight: 600; }
.runtime-tabs button span { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid currentColor; border-radius: 50%; font-size: 11px; }
.runtime-section { min-width: 0; padding: 4px 0 28px; }
.runtime-section-heading { display: flex; align-items: center; justify-content: space-between; margin: 0 0 18px; }
.runtime-section-heading h2 { margin: 0; color: #2b4037; font-size: 16px; font-weight: 600; }
.runtime-section-heading p { margin: 6px 0 0; color: #7d8c84; font-size: 12px; line-height: 1.7; }
.deploy-meta { display: grid; grid-template-columns: minmax(240px, 520px) auto; align-items: end; gap: 12px; }
.deploy-meta .el-button { margin-bottom: 18px; }
.deploy-form :deep(.el-form-item), .instance-form :deep(.el-form-item) { margin-bottom: 18px; }
.xml-editor :deep(textarea) { font-family: Consolas, 'SFMono-Regular', monospace; font-size: 12px; line-height: 1.6; }
.deployment-result { margin-top: 18px; }
.instance-form { max-width: 720px; }
.wide-input { width: 100%; }
.runtime-actions { display: flex; justify-content: flex-start; margin-bottom: 20px; }
.task-filters { margin-bottom: 4px; }
.task-filters :deep(.el-form-item) { margin-right: 14px; margin-bottom: 14px; }
.activity-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 28px; border-bottom: 1px solid #e5ebe7; }
.activity-heading h3 { margin: 0; padding: 0 0 12px; color: #394d43; font-size: 13px; font-weight: 600; }
.activity-tree-wrap { max-width: 760px; padding: 12px 0; }
.empty-activity { margin: 14px 0; color: #87958d; font-size: 12px; }
.task-description { margin-bottom: 16px; }
.dialog-error { margin-bottom: 14px; }
.claim-row { display: flex; width: 100%; gap: 8px; }
.claim-row .el-input { flex: 1; }
@media (max-width: 720px) {
  .page-heading { align-items: flex-start; }
  .page-heading h1 { font-size: 18px; }
  .runtime-tabs { overflow-x: auto; }
  .runtime-tabs button { flex: 1; min-width: max-content; padding: 0 12px; }
  .deploy-meta { grid-template-columns: 1fr; gap: 0; }
  .deploy-meta .el-button { justify-self: start; margin-bottom: 18px; }
  .task-filters { display: grid; grid-template-columns: 1fr; }
  .task-filters :deep(.el-form-item) { margin-right: 0; }
}
</style>
