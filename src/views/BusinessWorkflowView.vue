<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElDialog, ElForm, ElFormItem,
  ElInput, ElTable, ElTableColumn, ElTag,
} from 'element-plus'
import { Check, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { useBusinessWorkflow } from '@/composables/useBusinessWorkflow'
import { resolveWorkflowRuntime } from '@/config/workflowRuntime'
import { businessWorkflowGateway, verifyBusinessEngineConsistency } from '@/api/workflow'
import type { BusinessUserTask, WorkflowConsistencyReport } from '@/api/workflow'
import { camundaGateway } from '@/api/camunda/gateway'

const runtime = resolveWorkflowRuntime(import.meta.env)
const workflow = useBusinessWorkflow()
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
    <ElAlert v-if="workflow.error.value" type="error" :closable="false" show-icon :title="workflow.error.value" />

    <div class="business-grid">
      <ElCard shadow="never" class="business-card">
        <template #header><div class="card-heading"><div><h2>任务模板</h2><p>业务发布生成的可发起模板</p></div><ElTag>{{ workflow.templates.value.length }} 个</ElTag></div></template>
        <ElTable v-loading="workflow.templateLoading.value" :data="workflow.templates.value" highlight-current-row empty-text="暂无任务模板" @current-change="row => row && workflow.selectTemplate(row.taskKey)">
          <ElTableColumn prop="taskName" label="模板" min-width="150" /><ElTableColumn prop="taskKey" label="taskKey" min-width="180" /><ElTableColumn prop="version" label="版本" width="70" /><ElTableColumn label="状态" width="90"><template #default="{ row }"><ElTag :type="row.startable && !row.suspended ? 'success' : 'warning'">{{ row.startable && !row.suspended ? '可发起' : '不可发起' }}</ElTag></template></ElTableColumn>
        </ElTable>
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
      <ElAlert type="info" :closable="false" show-icon title="清理边界" description="后端业务 API 当前未提供删除模板或业务实例接口；自动烟测会清理 Camunda 测试部署，业务侧记录需按后端测试数据策略处理。" />
    </ElCard>

    <ElCard shadow="never" class="business-card task-card">
      <template #header><div class="card-heading"><div><h2>业务人工任务</h2><p>仅展示后端当前已经提供的查询和完成能力</p></div><ElButton :icon="Refresh" :loading="workflow.taskLoading.value" @click="workflow.loadTasks">刷新任务</ElButton></div></template>
      <ElForm inline class="task-filter" @submit.prevent="workflow.loadTasks"><ElFormItem label="办理人"><ElInput v-model="workflow.taskFilter.assignee" clearable /></ElFormItem><ElFormItem label="候选用户"><ElInput v-model="workflow.taskFilter.candidateUser" clearable /></ElFormItem><ElFormItem label="候选组"><ElInput v-model="workflow.taskFilter.candidateGroup" clearable /></ElFormItem><ElFormItem label="流程实例"><ElInput v-model="workflow.taskFilter.processInstanceId" clearable /></ElFormItem><ElFormItem><ElButton type="primary" native-type="submit">查询</ElButton><ElButton @click="workflow.resetTaskFilters">重置</ElButton></ElFormItem></ElForm>
      <ElTable v-loading="workflow.taskLoading.value" :data="workflow.tasks.value" empty-text="暂无业务人工任务"><ElTableColumn prop="name" label="任务" min-width="150" /><ElTableColumn prop="assignee" label="办理人" min-width="110"><template #default="{ row }">{{ row.assignee || '未分配' }}</template></ElTableColumn><ElTableColumn prop="taskDefinitionKey" label="节点" min-width="160" /><ElTableColumn prop="processInstanceId" label="流程实例" min-width="210" /><ElTableColumn prop="created" label="创建时间" min-width="175" /><ElTableColumn label="操作" width="100" fixed="right"><template #default="{ row }"><ElButton type="primary" text @click="openTask(row)">办理</ElButton></template></ElTableColumn></ElTable>
    </ElCard>

    <ElDialog :model-value="!!workflow.selectedTask.value" title="完成业务人工任务" width="min(620px, calc(100vw - 32px))" :close-on-click-modal="!workflow.completing.value" @close="workflow.selectedTask.value = undefined"><template v-if="workflow.selectedTask.value"><ElDescriptions :column="1" border><ElDescriptionsItem label="任务">{{ workflow.selectedTask.value.name || workflow.selectedTask.value.id }}</ElDescriptionsItem><ElDescriptionsItem label="办理人">{{ workflow.selectedTask.value.assignee || '未分配' }}</ElDescriptionsItem><ElDescriptionsItem label="流程实例">{{ workflow.selectedTask.value.processInstanceId }}</ElDescriptionsItem></ElDescriptions><ElForm label-position="top" class="complete-form"><ElFormItem label="完成变量 JSON"><ElInput v-model="workflow.completeVariablesText.value" type="textarea" :rows="8" spellcheck="false" /></ElFormItem></ElForm></template><template #footer><ElButton :disabled="workflow.completing.value" @click="workflow.selectedTask.value = undefined">取消</ElButton><ElButton type="primary" :icon="Check" :loading="workflow.completing.value" @click="workflow.completeSelectedTask">完成任务</ElButton></template></ElDialog>
  </section>
</template>

<style scoped>
.business-page { display: flex; flex-direction: column; gap: 16px; }.page-heading, .card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.page-heading h1 { margin: 0; color: #243d35; font-size: 22px; }.page-heading p, .card-heading p { margin: 6px 0 0; color: #798a81; font-size: 12px; }.heading-actions { display: flex; gap: 8px; }.business-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, .85fr); gap: 16px; }.business-card { border-color: #e3e9e5; }.card-heading h2 { margin: 0; color: #294d3e; font-size: 16px; }.start-form, .complete-form { margin-top: 18px; }.variable-requirements { display: grid; gap: 7px; margin-top: 14px; padding: 12px; border: 1px solid #e1e9e4; border-radius: 6px; color: #587267; font-size: 12px; }.variable-requirements span { display: block; }.variable-requirements small { display: block; color: #8a9a92; }.instance-result { margin-top: 16px; }.consistency-action { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: #718078; font-size: 12px; }.consistency-list { display: grid; gap: 10px; margin-bottom: 14px; }.consistency-row { display: grid; grid-template-columns: 68px minmax(0, 1fr); align-items: start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #edf1ee; }.consistency-row strong { color: #294d3e; }.consistency-row p { margin: 4px 0 0; color: #718078; font-size: 12px; line-height: 1.6; }.task-filter { padding-top: 4px; }.task-card { min-width: 0; }
@media (max-width: 1050px) { .business-grid { grid-template-columns: 1fr; } } @media (max-width: 720px) { .page-heading, .card-heading { flex-direction: column; }.task-filter { display: grid; grid-template-columns: 1fr; } }
</style>
