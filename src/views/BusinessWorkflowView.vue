<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElDialog, ElForm, ElFormItem, ElMessageBox,
  ElInput, ElTable, ElTableColumn, ElTag,
} from 'element-plus'
import { Check, Close, Delete, Edit, Refresh, Switch, VideoPlay } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useBusinessWorkflow } from '@/composables/useBusinessWorkflow'
import { resolveWorkflowRuntime } from '@/config/workflowRuntime'
import { businessWorkflowGateway, verifyBusinessEngineConsistency } from '@/api/workflow'
import type { BusinessUserTask, WorkflowConsistencyReport } from '@/api/workflow'
import { camundaGateway } from '@/api/camunda/gateway'
import ReadOnlyProcessDiagram from '@/components/camunda/ReadOnlyProcessDiagram.vue'
import type { TaskTemplate } from '@/api/workflow'

const runtime = resolveWorkflowRuntime(import.meta.env)
const workflow = useBusinessWorkflow()
const router = useRouter()
const templateDetailVisible = ref(false)
const consistencyLoading = ref(false)
const consistencyError = ref('')
const consistencyReport = ref<WorkflowConsistencyReport>()
onMounted(() => { void Promise.all([workflow.loadTemplates(), workflow.loadTasks()]) })
onBeforeUnmount(workflow.dispose)

function refreshAll() {
  void Promise.all([workflow.loadTemplates(), workflow.loadTasks()])
}

function openTask(row: unknown) {
  workflow.openComplete(row as BusinessUserTask)
}

function openReassign(row: unknown) {
  workflow.openReassign(row as BusinessUserTask)
}

function openTemplateDetail(row: unknown) {
  const template = row as TaskTemplate
  templateDetailVisible.value = true
  void workflow.loadTemplateDetail(template.taskKey)
}

function closeTemplateDetail() {
  templateDetailVisible.value = false
  workflow.clearTemplateDetail()
}

function editTemplate() {
  const taskKey = workflow.templateDetail.value?.taskKey
  if (!taskKey) return
  closeTemplateDetail()
  void router.push({ name: 'designer', query: { taskKey } })
}

async function confirmDeleteTemplate(value: unknown) {
  const row = value as TaskTemplate
  try {
    await ElMessageBox.confirm(
      `删除任务模板“${row.taskName}”（${row.taskKey}）会同时清除当前租户下该 key 的全部流程定义版本。存在运行中任务实例时后端会拒绝删除。此操作无法撤销，确认继续吗？`,
      '删除任务模板',
      { type: 'warning', confirmButtonText: '删除模板及全部版本', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const deleted = await workflow.deleteTemplate(row.taskKey)
  if (deleted && templateDetailVisible.value && !workflow.templateDetailKey.value) closeTemplateDetail()
}

async function confirmRefuse(row: unknown) {
  const task = row as BusinessUserTask
  if (workflow.taskBusy(task.id)) return
  try {
    await ElMessageBox.confirm(
      `确定将任务“${task.name || task.id}”退回待重派吗？此操作会清空当前办理人和候选用户/组，任务不会办结；后续需要重派给具体办理人。`,
      '退回待重派',
      { type: 'warning', confirmButtonText: '确认退回', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  await workflow.refuseTask(task)
}

async function runConsistencyCheck() {
  const instance = workflow.lastInstance.value
  const template = workflow.templates.value.find(item => item.taskKey === instance?.taskKey)
  if (!instance || !template) { consistencyError.value = '请先通过业务接口启动一个任务实例'; return }
  consistencyLoading.value = true
  consistencyError.value = ''
  try {
    consistencyReport.value = await verifyBusinessEngineConsistency(instance, template, runtime.tenantId, {
      business: businessWorkflowGateway,
      engine: camundaGateway,
    })
  } catch (cause) {
    consistencyError.value = cause instanceof Error ? cause.message : '一致性核对失败'
  } finally {
    consistencyLoading.value = false
  }
}

function consistencyTag(status: 'passed' | 'failed' | 'observed') {
  return status === 'passed' ? 'success' : status === 'failed' ? 'danger' : 'info'
}
</script>

<template>
  <section class="business-page">
    <div class="page-heading"><div><h1>业务流程</h1><p>通过后端任务模板和任务实例接口发起、查询并办理流程</p></div><div class="heading-actions"><ElButton :icon="Refresh" :loading="workflow.templateLoading.value || workflow.taskLoading.value" @click="refreshAll">刷新</ElButton></div></div>
    <ElAlert v-if="!runtime.businessEnabled" type="warning" :closable="false" show-icon title="业务流程接口当前未启用" description="在开发环境设置 VITE_BUSINESS_WORKFLOW_ENABLED=true，并由服务端代理配置后端认证。" />
    <ElAlert v-else-if="runtime.tenantId" type="info" :closable="false" show-icon :title="'当前租户：' + runtime.tenantId" description="模板、业务实例和人工任务均由后端按认证身份隔离。" />
    <ElAlert v-if="workflow.notice.value" type="success" :closable="false" show-icon :title="workflow.notice.value" />
    <ElAlert v-if="workflow.error.value" type="error" :closable="false" show-icon :title="workflow.error.value" />

    <div class="business-grid">
      <ElCard shadow="never" class="business-card template-card">
      <template #header><div class="card-heading"><div><div class="section-kicker">流程资产</div><h2>任务模板</h2><p>业务发布生成的可发起模板，选择一行查看详情或继续编辑</p></div><div class="template-count"><strong>{{ workflow.templates.value.length }}</strong><span>个模板</span></div></div></template>
      <div class="template-table-wrap">
        <ElTable v-loading="workflow.templateLoading.value" :data="workflow.templates.value" class="template-table" highlight-current-row empty-text="暂无任务模板" @current-change="row => row && workflow.selectTemplate(row.taskKey)">
          <ElTableColumn label="模板" min-width="260"><template #default="{ row }"><div class="template-primary"><strong>{{ row.taskName }}</strong><code>{{ row.taskKey }}</code></div></template></ElTableColumn>
          <ElTableColumn label="流程定义" min-width="210"><template #default="{ row }"><code class="template-definition">{{ row.processDefinitionKey || row.processDefinitionId || '—' }}</code></template></ElTableColumn>
          <ElTableColumn prop="version" label="版本" width="92"><template #default="{ row }"><span class="version-value">v{{ row.version }}</span></template></ElTableColumn>
          <ElTableColumn label="状态" width="112"><template #default="{ row }"><ElTag class="template-status" :type="row.startable && !row.suspended ? 'success' : 'warning'">{{ row.startable && !row.suspended ? '可发起' : '不可发起' }}</ElTag></template></ElTableColumn>
          <ElTableColumn label="操作" width="190" fixed="right"><template #default="{ row }"><div class="template-actions"><ElButton text :icon="Edit" @click.stop="openTemplateDetail(row)">详情</ElButton><ElButton text type="danger" :icon="Delete" :loading="workflow.deletingTemplateKey.value === row.taskKey" :disabled="!!workflow.deletingTemplateKey.value" @click.stop="confirmDeleteTemplate(row)">删除</ElButton></div></template></ElTableColumn>
        </ElTable>
      </div>
      </ElCard>

      <ElCard shadow="never" class="business-card start-card">
        <template #header><div class="card-heading"><div><h2>启动业务任务实例</h2><p>{{ workflow.selectedTemplate.value?.taskName || '请先选择模板' }}</p></div><ElTag v-if="workflow.selectedTemplate.value">v{{ workflow.selectedTemplate.value.version }}</ElTag></div></template>
        <template v-if="workflow.selectedTemplate.value">
          <ElDescriptions :column="1" border size="small"><ElDescriptionsItem label="taskKey">{{ workflow.selectedTemplate.value.taskKey }}</ElDescriptionsItem><ElDescriptionsItem label="租户">{{ workflow.selectedTemplate.value.tenantId || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="流程定义">{{ workflow.selectedTemplate.value.processDefinitionId }}</ElDescriptionsItem></ElDescriptions>
          <div v-if="workflow.selectedTemplate.value.globalVariables?.length" class="variable-requirements"><strong>变量要求</strong><span v-for="item in workflow.selectedTemplate.value.globalVariables" :key="item.name"><code>{{ item.name }}</code> · {{ item.type }}{{ item.required ? ' · 必填' : '' }}<small v-if="item.description">{{ item.description }}</small></span></div>
          <ElForm label-position="top" class="start-form" @submit.prevent="workflow.startSelectedTemplate"><ElFormItem label="业务键"><ElInput v-model="workflow.businessKey.value" placeholder="必须唯一，例如 order-20260929-001" /></ElFormItem><ElFormItem label="发起人"><ElInput v-model="workflow.startedBy.value" placeholder="可选用户标识" /></ElFormItem><ElFormItem label="启动变量 JSON"><ElInput v-model="workflow.startVariablesText.value" type="textarea" :rows="7" spellcheck="false" /></ElFormItem><ElButton type="primary" :icon="VideoPlay" :loading="workflow.starting.value" :disabled="!workflow.canStart.value" native-type="submit">启动实例</ElButton></ElForm>
          <ElDescriptions v-if="workflow.lastInstance.value" :column="1" border class="instance-result"><ElDescriptionsItem label="业务实例 ID">{{ workflow.lastInstance.value.id }}</ElDescriptionsItem><ElDescriptionsItem label="businessKey">{{ workflow.lastInstance.value.businessKey }}</ElDescriptionsItem><ElDescriptionsItem label="processInstanceId">{{ workflow.lastInstance.value.processInstanceId }}</ElDescriptionsItem><ElDescriptionsItem label="状态">{{ workflow.lastInstance.value.status }}</ElDescriptionsItem></ElDescriptions>
          <div v-if="runtime.developerToolsEnabled && workflow.lastInstance.value" class="consistency-action"><ElButton :loading="consistencyLoading" @click="runConsistencyCheck">用引擎状态核对</ElButton><span>业务接口写入，{{ runtime.engineLabel }} 只读观察</span></div>
        </template>
      </ElCard>
    </div>

    <ElCard v-if="runtime.developerToolsEnabled && (consistencyReport || consistencyError)" shadow="never" class="business-card consistency-card">
      <template #header><div class="card-heading"><div><h2>业务接口 / Camunda 一致性</h2><p>只比较稳定标识和业务语义，不比较时间戳或响应顺序</p></div><ElTag v-if="consistencyReport" :type="consistencyReport.ok ? 'success' : 'danger'">{{ consistencyReport.ok ? '一致' : '需核查' }}</ElTag></div></template>
      <ElAlert v-if="consistencyError" type="error" :closable="false" show-icon :title="consistencyError" />
      <div v-if="consistencyReport" class="consistency-list"><div v-for="item in consistencyReport.checks" :key="item.key" class="consistency-row"><ElTag :type="consistencyTag(item.status)">{{ item.status === 'passed' ? '通过' : item.status === 'failed' ? '失败' : '已观察' }}</ElTag><div><strong>{{ item.label }}</strong><p>{{ item.detail }}</p></div></div></div>
      <ElAlert type="info" :closable="false" show-icon title="清理边界" description="业务接口支持按 taskKey 删除当前模板及该租户下全部流程定义版本；运行中的任务实例需先完成，业务任务实例记录暂不提供删除操作。" />
    </ElCard>

    <ElCard shadow="never" class="business-card task-card">
      <template #header><div class="card-heading"><div><h2>业务人工任务</h2><p>未分配任务需重派给具体办理人后才能办理</p></div><ElButton :icon="Refresh" :loading="workflow.taskLoading.value" @click="workflow.loadTasks">刷新任务</ElButton></div></template>
      <ElForm inline class="task-filter" @submit.prevent="workflow.loadTasks"><ElFormItem label="办理人"><ElInput v-model="workflow.taskFilter.assignee" clearable /></ElFormItem><ElFormItem label="候选用户"><ElInput v-model="workflow.taskFilter.candidateUser" clearable /></ElFormItem><ElFormItem label="候选组"><ElInput v-model="workflow.taskFilter.candidateGroup" clearable /></ElFormItem><ElFormItem label="流程实例"><ElInput v-model="workflow.taskFilter.processInstanceId" clearable /></ElFormItem><ElFormItem><ElButton type="primary" native-type="submit">查询</ElButton><ElButton @click="workflow.resetTaskFilters">重置</ElButton></ElFormItem></ElForm>
      <ElTable v-loading="workflow.taskLoading.value" :data="workflow.tasks.value" empty-text="暂无业务人工任务"><ElTableColumn prop="name" label="任务" min-width="150" /><ElTableColumn prop="assignee" label="办理人" min-width="110"><template #default="{ row }">{{ row.assignee || '未分配' }}</template></ElTableColumn><ElTableColumn prop="taskDefinitionKey" label="节点" min-width="160" /><ElTableColumn prop="processInstanceId" label="流程实例" min-width="210" /><ElTableColumn prop="created" label="创建时间" min-width="175" /><ElTableColumn label="操作" width="290" fixed="right"><template #default="{ row }"><div class="task-actions"><ElButton v-if="row.assignee" type="primary" text :icon="Check" :loading="workflow.taskActionLoading(row.id, 'complete')" :disabled="workflow.taskBusy(row.id)" @click="openTask(row)">办理</ElButton><ElTag v-else type="warning">待重派</ElTag><ElButton text :icon="Switch" :loading="workflow.taskActionLoading(row.id, 'reassign')" :disabled="workflow.taskBusy(row.id)" @click="openReassign(row)">重派</ElButton><ElButton type="danger" text :icon="Close" :loading="workflow.taskActionLoading(row.id, 'refuse')" :disabled="workflow.taskBusy(row.id)" @click="confirmRefuse(row)">退回待重派</ElButton></div></template></ElTableColumn></ElTable>
    </ElCard>

    <ElDialog :model-value="!!workflow.selectedTask.value" title="完成业务人工任务" width="min(620px, calc(100vw - 32px))" :close-on-click-modal="!workflow.completing.value" @close="workflow.selectedTask.value = undefined"><template v-if="workflow.selectedTask.value"><ElDescriptions :column="1" border><ElDescriptionsItem label="任务">{{ workflow.selectedTask.value.name || workflow.selectedTask.value.id }}</ElDescriptionsItem><ElDescriptionsItem label="办理人">{{ workflow.selectedTask.value.assignee || '未分配' }}</ElDescriptionsItem><ElDescriptionsItem label="流程实例">{{ workflow.selectedTask.value.processInstanceId }}</ElDescriptionsItem></ElDescriptions><ElForm label-position="top" class="complete-form"><ElFormItem label="完成变量 JSON"><ElInput v-model="workflow.completeVariablesText.value" type="textarea" :rows="8" spellcheck="false" /></ElFormItem></ElForm></template><template #footer><ElButton :disabled="workflow.completing.value" @click="workflow.selectedTask.value = undefined">取消</ElButton><ElButton type="primary" :icon="Check" :loading="workflow.completing.value" @click="workflow.completeSelectedTask">完成任务</ElButton></template></ElDialog>

    <ElDialog :model-value="!!workflow.reassignTargetTask.value" title="重派人工任务" width="min(520px, calc(100vw - 32px))" :close-on-click-modal="!workflow.reassigning.value" @close="workflow.closeReassign"><template v-if="workflow.reassignTargetTask.value"><ElDescriptions :column="1" border size="small"><ElDescriptionsItem label="任务">{{ workflow.reassignTargetTask.value.name || workflow.reassignTargetTask.value.id }}</ElDescriptionsItem><ElDescriptionsItem label="当前办理人">{{ workflow.reassignTargetTask.value.assignee || '未分配' }}</ElDescriptionsItem><ElDescriptionsItem label="流程实例">{{ workflow.reassignTargetTask.value.processInstanceId }}</ElDescriptionsItem></ElDescriptions><ElForm label-position="top" class="reassign-form" @submit.prevent="workflow.reassignSelectedTask"><ElFormItem label="新的办理人 userId" required><ElInput v-model="workflow.reassignUserId.value" clearable autocomplete="off" placeholder="请输入用户标识" /></ElFormItem><ElButton type="primary" :icon="Switch" :loading="workflow.reassigning.value" native-type="submit">确认重派</ElButton></ElForm></template><template #footer><ElButton :disabled="workflow.reassigning.value" @click="workflow.closeReassign">取消</ElButton></template></ElDialog>

    <ElDialog :model-value="templateDetailVisible" title="当前任务模板详情" width="min(820px, calc(100vw - 32px))" @close="closeTemplateDetail">
      <div v-loading="workflow.templateDetailLoading.value" class="template-detail-body">
        <ElAlert v-if="workflow.templateDetailError.value" type="error" :closable="false" show-icon :title="workflow.templateDetailError.value" />
        <template v-if="workflow.templateDetail.value">
          <ElDescriptions :column="2" border size="small" class="template-detail-meta">
            <ElDescriptionsItem label="模板名称">{{ workflow.templateDetail.value.taskName }}</ElDescriptionsItem><ElDescriptionsItem label="taskKey"><code>{{ workflow.templateDetail.value.taskKey }}</code></ElDescriptionsItem>
            <ElDescriptionsItem label="租户">{{ workflow.templateDetail.value.tenantId || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="版本">{{ workflow.templateDetail.value.version }}{{ workflow.templateDetail.value.versionTag ? ` · ${workflow.templateDetail.value.versionTag}` : '' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="分类">{{ workflow.templateDetail.value.category || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="状态">{{ workflow.templateDetail.value.startable && !workflow.templateDetail.value.suspended ? '可发起' : '不可发起' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="流程定义 ID"><code>{{ workflow.templateDetail.value.processDefinitionId || '—' }}</code></ElDescriptionsItem><ElDescriptionsItem label="部署 ID"><code>{{ workflow.templateDetail.value.deploymentId || '—' }}</code></ElDescriptionsItem>
            <ElDescriptionsItem label="表单 key">{{ workflow.templateDetail.value.formKey || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="更新时间">{{ workflow.templateDetail.value.updatedAt || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="描述" :span="2">{{ workflow.templateDetail.value.description || '—' }}</ElDescriptionsItem>
          </ElDescriptions>
          <div class="variable-requirements"><strong>全局变量</strong><span v-if="!workflow.templateDetail.value.globalVariables?.length">未定义</span><span v-for="item in workflow.templateDetail.value.globalVariables" :key="item.name"><code>{{ item.name }}</code> · {{ item.type }}{{ item.required ? ' · 必填' : '' }}<small v-if="item.description">{{ item.description }}</small></span></div>
          <ReadOnlyProcessDiagram v-if="workflow.templateDetail.value.bpmnXml" :xml="workflow.templateDetail.value.bpmnXml" />
          <ElAlert v-else type="info" :closable="false" show-icon title="当前模板没有可展示的 BPMN 流程 XML" />
        </template>
      </div>
      <template #footer><ElButton @click="closeTemplateDetail">关闭</ElButton><ElButton type="primary" :icon="Edit" :disabled="!workflow.templateDetail.value?.bpmnXml" @click="editTemplate">进入设计器修改</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
 .business-page { display: flex; flex-direction: column; gap: 16px; }.page-heading, .card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.page-heading h1 { margin: 0; color: #243d35; font-size: 22px; }.page-heading p, .card-heading p { margin: 6px 0 0; color: #798a81; font-size: 12px; }.heading-actions { display: flex; gap: 8px; }.business-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, .85fr); gap: 16px; }.start-grid { grid-template-columns: minmax(0, 920px); }.business-card { min-width: 0; border-color: #e3e9e5; }.card-heading h2 { margin: 0; color: #294d3e; font-size: 16px; }.section-kicker { margin-bottom: 7px; color: #24745e; font-size: 11px; font-weight: 600; letter-spacing: .08em; }.template-card { overflow: hidden; }.template-card :deep(.el-card__header) { padding: 20px 24px 18px; background: linear-gradient(90deg, #f6faf7 0%, #fff 62%); }.template-count { display: flex; align-items: baseline; gap: 6px; padding: 8px 0 0 18px; color: #718176; white-space: nowrap; }.template-count strong { color: #24745e; font-size: 24px; font-weight: 600; line-height: 1; }.template-count span { font-size: 12px; }.template-table-wrap { min-width: 0; width: 100%; overflow-x: auto; }.template-table :deep(.cell) { padding: 0 16px; }.template-table :deep(th.el-table__cell) { height: 42px; }.template-table :deep(td.el-table__cell) { height: 68px; }.template-primary { display: grid; gap: 5px; min-width: 0; }.template-primary strong { overflow: hidden; color: #294d3e; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.template-primary code, .template-definition { overflow: hidden; color: #82928a; font: 12px/1.4 'SFMono-Regular', Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }.version-value { color: #48675a; font-variant-numeric: tabular-nums; }.template-status { border-radius: 4px; }.start-form, .complete-form { margin-top: 18px; }.variable-requirements { display: grid; gap: 7px; margin-top: 14px; padding: 12px; border: 1px solid #e1e9e4; border-radius: 6px; color: #587267; font-size: 12px; }.variable-requirements span { display: block; }.variable-requirements small { display: block; color: #8a9a92; }.instance-result { margin-top: 16px; }.consistency-action { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: #718078; font-size: 12px; }.consistency-list { display: grid; gap: 10px; margin-bottom: 14px; }.consistency-row { display: grid; grid-template-columns: 68px minmax(0, 1fr); align-items: start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #edf1ee; }.consistency-row strong { color: #294d3e; }.consistency-row p { margin: 4px 0 0; color: #718078; font-size: 12px; line-height: 1.6; }.task-filter { padding-top: 4px; }.task-card { min-width: 0; }
 @media (max-width: 1050px) { .business-grid, .start-grid { grid-template-columns: 1fr; } } @media (max-width: 720px) { .page-heading, .card-heading { flex-direction: column; }.template-card :deep(.el-card__header) { padding: 18px 16px 16px; }.template-count { padding: 0; }.template-table-wrap { margin: 0 -16px; }.template-table :deep(.cell) { padding: 0 12px; }.task-filter { display: grid; grid-template-columns: 1fr; } }
.task-actions { display: flex; align-items: center; gap: 2px; white-space: nowrap; }.reassign-form { margin-top: 18px; }
.template-actions { display: flex; align-items: center; gap: 2px; white-space: nowrap; }.template-detail-body { min-height: 70px; }.template-detail-meta { margin-bottom: 14px; }
</style>
