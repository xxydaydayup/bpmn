<script setup lang="ts">
import { computed, ref } from 'vue'
import { WorkflowDesigner, type WorkflowDesignDocument, type WorkflowInput, type WorkflowModel } from '@workflow/designer'
import '@workflow/designer/style.css'
import fixture from '@workflow/designer/fixtures/project-approval.json'
import { request } from '@/utils/request'
import { businessWorkflowGateway, type TaskTemplate } from '@/api/workflow'
import { diagramCSSVariables } from '@/bpmn/theme'
import '@/styles/designer.css'
import axios from 'axios'

const document = ref<WorkflowInput>({ format: 'workflow-designer', version: 1, model: fixture as WorkflowModel, editor: { theme: { accent: '#28705d' } } } satisfies WorkflowDesignDocument)
const canvasStyle = computed(() => diagramCSSVariables())
const compileNotice = ref('')
const currentModel = computed(() => {
  const value = document.value as Partial<WorkflowDesignDocument>
  return value.model ?? fixture as WorkflowModel
})
const deployedModel = ref('')
const deployment = ref<TaskTemplate>()
const deploymentNotice = ref('')
const assertDeploymentResult = (template: TaskTemplate) => {
  if ([template.taskKey || template.processDefinitionKey, template.deploymentId, template.processDefinitionId].some(value => typeof value !== 'string' || !value.trim()) || !Number.isInteger(template.version) || template.version < 1) {
    throw Object.assign(new Error('后端未返回有效的模板标识、版本和部署/流程定义信息，尚不能确认发布成功'), { code: 'INVALID_DEPLOYMENT_RESULT' })
  }
}
const isDeploymentUncertain = (cause: unknown) => {
  if (axios.isAxiosError(cause)) {
    const status = cause.response?.status
    return !status || status >= 500 || status === 408
  }
  if (!cause || typeof cause !== 'object') return false
  const value = cause as { response?: { status?: number }; code?: string }
  const status = value.response?.status
  if (status === undefined) return value.code === 'INVALID_DEPLOYMENT_RESULT'
  return status >= 500 || status === 408 || value.code === 'INVALID_DEPLOYMENT_RESULT'
}
const deploy = async (model: WorkflowModel) => {
  deploymentNotice.value = ''
  const xml = await compile(model)
  const bpmnXml = xml.bpmnXml
  try {
    const result = await businessWorkflowGateway.publishTemplate(bpmnXml, model.processName, {
      templateKey: model.processId,
      templateName: model.processName,
      startable: true,
      suspended: false,
      displayJson: model,
    })
    assertDeploymentResult(result)
    deployment.value = result
    deployedModel.value = JSON.stringify(model)
    deploymentNotice.value = '流程已发布为可发起的任务模板。'
    return result
  } catch (error) {
    if (isDeploymentUncertain(error)) {
      const uncertain = new Error((error instanceof Error ? error.message : String(error)) + ' 发布结果尚未确认。请先查询模板状态再决定是否重试。') as Error & { uncertain: boolean }
      uncertain.uncertain = true
      throw uncertain
    }
    throw error
  }
}
const verifyDeployment = async (model: WorkflowModel) => {
  const latest = await businessWorkflowGateway.listTemplates({ key: model.processId, maxResults: 10 })
  const matching = latest.find(item => (item.taskKey || item.processDefinitionKey) === model.processId)
  if (!matching) return undefined
  assertDeploymentResult(matching)
  deployment.value = matching
  deployedModel.value = JSON.stringify(model)
  deploymentNotice.value = '已查到流程模板的部署记录。'
  return matching
}
const isDeployedCurrentModel = computed(() => Boolean(deployment.value && deployedModel.value === JSON.stringify(currentModel.value)))
const compile = async (model: WorkflowModel) => {
  compileNotice.value = ''
  const response = await request<{ code: string; data?: { bpmnXml?: string }; message?: string }>({ method: 'POST', url: '/v1/bpmn/json2xml', data: model })
  const bpmnXml = response?.data?.bpmnXml
  if (response?.code !== 'OK') throw new Error(response?.message || '后端编译失败')
  if (!bpmnXml?.trim()) throw new Error('编译接口未返回 BPMN XML')
  compileNotice.value = '后端已返回 BPMN XML（' + bpmnXml.length + ' 个字符）；可查看、下载 XML，或发布为业务任务模板。'
  return { bpmnXml }
}
</script>

<template>
  <section class="designer-page workflow-designer-page" :style="canvasStyle">
    <header class="designer-document-header">
      <div class="designer-document-title"><div class="designer-breadcrumb">工作空间 <span>/</span> 业务流程设计</div><div class="designer-title-line"><h1>{{ currentModel.processName || '未命名流程' }}</h1><span class="designer-draft">业务模型 · {{ currentModel.nodes.length }} 个节点</span></div></div>
    </header>
    <WorkflowDesigner v-model="document" :compile="compile" :deploy="deploy" :verify-deployment="verifyDeployment" :auto-layout-on-init="true" />
    <p v-if="compileNotice" class="host-notice" role="status">{{ compileNotice }}</p>
    <p v-if="deploymentNotice" class="host-notice" role="status">{{ deploymentNotice }}<span v-if="isDeployedCurrentModel && deployment">模板 {{ deployment.taskKey || deployment.processDefinitionKey }} · v{{ deployment.version }} · 部署 {{ deployment.deploymentId }} · 定义 {{ deployment.processDefinitionId }}</span></p>
  </section>
</template>

<style scoped>
.workflow-designer-page { --wfd-accent: var(--diagram-accent); }
.workflow-designer-page :deep(.wfd) { height: auto; min-height: 0; flex: 1; border: 0; border-radius: 0; }
.workflow-designer-page :deep(.wfd-toolbar) { display: flex; flex: 0 0 49px; min-height: 49px; height: 49px; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--color-border); }
.workflow-designer-page :deep(.wfd-brand) { display: none; }
.workflow-designer-page :deep(.wfd-toolbar-actions) { width: 100%; flex-wrap: nowrap; justify-content: flex-start; gap: 6px; overflow-x: auto; scrollbar-width: thin; }
.workflow-designer-page :deep(.wfd-button) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 35px; min-height: 35px; padding: 0 10px; border-radius: 5px; color: #455b4e; font-size: 12px !important; white-space: nowrap; }
.workflow-designer-page :deep(.wfd-button:hover:not(:disabled)) { border-color: #bdd5cf; color: var(--diagram-accent); background: #f5f8f6; }
.workflow-designer-page :deep(.wfd-button-primary), .workflow-designer-page :deep(.wfd-button-primary:hover:not(:disabled)) { color: white; background: var(--diagram-accent); border-color: var(--diagram-accent); }
.workflow-designer-page :deep(.wfd-workspace) { grid-template-columns: 196px minmax(0, 1fr) 296px; }
.workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed) { grid-template-columns: 54px minmax(0, 1fr) 296px; }
.workflow-designer-page :deep(.wfd-workspace.wfd-properties-collapsed) { grid-template-columns: 196px minmax(0, 1fr) 54px; }
.workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed.wfd-properties-collapsed) { grid-template-columns: 54px minmax(0, 1fr) 54px; }
.workflow-designer-page :deep(.wfd-library), .workflow-designer-page :deep(.wfd-inspector) { padding: 12px; }
.workflow-designer-page :deep(.wfd-section-heading) { min-height: 42px; margin: 0 0 10px; }
.workflow-designer-page :deep(.wfd-panel-toggle) { width: 40px; height: 40px; flex-basis: 40px; color: #506c5f; border-color: #e0e8e3; background: #fff; }
.workflow-designer-page :deep(.wfd-panel-toggle:hover) { color: var(--diagram-accent); border-color: #bdd5cf; background: #f4f8f5; }
.workflow-designer-page :deep(.wfd-panel-toggle .tabler-icon) { width: 21px; height: 21px; stroke-width: 1.8; }
.workflow-designer-page :deep(.wfd-library-collapsed .wfd-library), .workflow-designer-page :deep(.wfd-inspector-hidden .wfd-inspector) { padding: 8px 6px; }
.workflow-designer-page :deep(.wfd-library-collapsed .wfd-panel-toggle), .workflow-designer-page :deep(.wfd-inspector-hidden .wfd-panel-toggle) { width: 40px; height: 40px; flex-basis: 40px; }
.workflow-designer-page :deep(.wfd-icon-button svg) { width: 17px; height: 17px; stroke-width: 1.7; }
.workflow-designer-page :deep(.wfd-library-item) { min-height: 52px; margin-bottom: 5px; padding: 7px; border-radius: 5px; }
.workflow-designer-page :deep(.wfd-library-icon) { width: 30px; height: 30px; flex-basis: 30px; }
.workflow-designer-page :deep(.wfd-library-icon svg) { width: 18px; height: 18px; stroke-width: 1.7; }
.workflow-designer-page :deep(.wfd-node) { width: 184px; min-height: 72px; padding: 9px 12px; border-radius: 5px; box-shadow: 0 2px 6px rgb(29 63 52 / 6%); }
.workflow-designer-page :deep(.wfd-node-icon) { width: 31px; height: 31px; flex-basis: 31px; border-radius: 5px; }
.workflow-designer-page :deep(.wfd-node-icon svg) { width: 19px; height: 19px; stroke-width: 1.7; }
.workflow-designer-page :deep(.wfd-canvas-wrap) { background-color: var(--diagram-background); background-image: radial-gradient(var(--diagram-grid) .7px, transparent .7px); background-size: 18px 18px; }
.workflow-designer-page :deep(.wfd-flow .vue-flow__controls), .workflow-designer-page :deep(.wfd-flow .vue-flow__minimap) { border-radius: 5px; box-shadow: none; }
.workflow-designer-page :deep(.wfd-flow .vue-flow__controls-button) { width: 30px; height: 30px; }
.workflow-designer-page :deep(.wfd-canvas-actions) { right: 18px; bottom: 18px; gap: 3px; padding: 4px; border-radius: 5px; box-shadow: 0 2px 6px rgb(32 59 45 / 6%); }
.workflow-designer-page :deep(.wfd-canvas-actions button) { width: 30px; height: 30px; padding: 0; }
.host-notice { flex: 0 0 auto; margin: 10px 18px; padding: 9px 12px; border: 1px solid #d2e8dc; border-radius: 5px; color: #27634e; background: #eff8f2; font-size: 12px; }
.host-notice span { display: block; margin-top: 5px; font-variant-numeric: tabular-nums; }
@media (max-width: 1200px) {
  .workflow-designer-page :deep(.wfd-workspace) { grid-template-columns: 58px minmax(0, 1fr) 268px; }
  .workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed) { grid-template-columns: 48px minmax(0, 1fr) 268px; }
  .workflow-designer-page :deep(.wfd-workspace.wfd-properties-collapsed) { grid-template-columns: 58px minmax(0, 1fr) 48px; }
  .workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed.wfd-properties-collapsed) { grid-template-columns: 48px minmax(0, 1fr) 48px; }
}
@media (max-width: 1200px) {
  .workflow-designer-page :deep(.wfd-button > span) { display: none; }
  .workflow-designer-page :deep(.wfd-button) { width: 36px; padding: 0; }
  .workflow-designer-page :deep(.wfd-button-primary) { width: 36px; }
  .workflow-designer-page :deep(.wfd-toolbar-actions) { overflow-x: visible; }
}
@media (max-width: 820px) {
  .workflow-designer-page :deep(.wfd) { flex: 0 0 auto; min-height: 0; overflow: visible; }
  .workflow-designer-page :deep(.wfd-toolbar) { flex: 0 0 auto; height: auto; min-height: 49px; padding: 8px 12px; }
  .workflow-designer-page :deep(.wfd-button > span) { display: inline; }
  .workflow-designer-page :deep(.wfd-button), .workflow-designer-page :deep(.wfd-button-primary) { width: auto; padding: 0 9px; }
  .workflow-designer-page :deep(.wfd-toolbar-actions) { flex-wrap: wrap; overflow: visible; }
  .workflow-designer-page :deep(.wfd-workspace) { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(390px, 55vh) auto; }
  .workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed), .workflow-designer-page :deep(.wfd-workspace.wfd-properties-collapsed), .workflow-designer-page :deep(.wfd-workspace.wfd-library-collapsed.wfd-properties-collapsed) { grid-template-columns: minmax(0, 1fr); }
  .workflow-designer-page :deep(.wfd-library) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .workflow-designer-page :deep(.wfd-inspector) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workflow-designer-page :deep(.wfd-inspector > .wfd-section-heading), .workflow-designer-page :deep(.wfd-inspector > .wfd-selected-kind), .workflow-designer-page :deep(.wfd-inspector > .wfd-issue-list), .workflow-designer-page :deep(.wfd-inspector > .wfd-compile-panel), .workflow-designer-page :deep(.wfd-inspector > .wfd-inspector-empty) { grid-column: 1 / -1; }
}
@media (max-width: 520px) {
  .workflow-designer-page :deep(.wfd-toolbar-actions) { width: 100%; }
  .workflow-designer-page :deep(.wfd-button) { min-height: 36px; padding: 0 8px; font-size: 11px !important; }
  .workflow-designer-page :deep(.wfd-library) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workflow-designer-page :deep(.wfd-inspector) { grid-template-columns: 1fr; }
  .workflow-designer-page :deep(.wfd-inspector > *) { grid-column: 1 / -1; }
  .workflow-designer-page :deep(.wfd-flow .vue-flow__minimap) { display: none; }
}
@media (prefers-reduced-motion: reduce) { .workflow-designer-page :deep(.wfd *), .workflow-designer-page :deep(.wfd *::before), .workflow-designer-page :deep(.wfd *::after) { transition: none !important; } }
</style>
