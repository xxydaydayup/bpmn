<script setup lang="ts">
import { ElAlert, ElButton, ElCheckbox, ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { useDesignerTaskTemplate } from '@/composables/useDesignerTaskTemplate'
import type { DesignerDeploymentSnapshot } from '@/bpmn/deployment'

const props = defineProps<{ disabled: boolean; prepare: () => Promise<DesignerDeploymentSnapshot | undefined> }>()
const emit = defineEmits<{ locate: [id: string] }>()
const { visible, preparing, submitting, pending, snapshot, deploymentName, error, uncertain, checkedOutcome,
  result, lastResult, blockingIssues, warnings, canSubmit, open, submit, showLastResult, releaseUncertainAttempt }
  = useDesignerTaskTemplate(() => props.prepare())

function locate(id: string) {
  if (pending.value) return
  visible.value = false
  emit('locate', id)
}
</script>

<template>
  <button v-if="lastResult" class="designer-button" :disabled="pending || uncertain" aria-label="上次发布" title="查看上次任务模板发布结果" @click="showLastResult"><DiagramIcon name="info" /><span>上次发布</span></button>
  <button class="designer-button primary" :disabled="disabled || pending" aria-label="发布任务模板" title="将当前画布发布到后端业务系统" @click="open">
    <DiagramIcon name="upload" /><span>{{ preparing ? '正在准备…' : submitting ? '发布中…' : '发布任务模板' }}</span>
  </button>
  <ElDialog v-model="visible" :title="result ? '任务模板发布结果' : '发布当前流程为任务模板'" width="min(700px, calc(100vw - 32px))"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!pending" :show-close="!pending">
    <div v-if="preparing" class="publish-preparing" role="status">正在检查流程并生成画布快照…</div>
    <template v-else-if="result">
      <ElAlert type="success" :closable="false" show-icon title="任务模板已由后端发布并落库" description="该结果属于业务发布；当前设计稿仍可继续编辑，不会随已发布版本变化。" />
      <dl class="publish-summary">
        <div><dt>任务模板</dt><dd>{{ result.template.taskName || result.processName }}</dd></div>
        <div><dt>taskKey</dt><dd><code>{{ result.template.taskKey }}</code></dd></div>
        <div><dt>模板版本</dt><dd>v{{ result.template.version }}</dd></div>
        <div><dt>租户</dt><dd>{{ result.template.tenantId || '—' }}</dd></div>
        <div><dt>deploymentId</dt><dd><code>{{ result.template.deploymentId }}</code></dd></div>
        <div><dt>definitionId</dt><dd><code>{{ result.template.processDefinitionId }}</code></dd></div>
        <div><dt>可发起</dt><dd>{{ result.template.startable && !result.template.suspended ? '是' : '否' }}</dd></div>
      </dl>
      <div v-if="result.template.globalVariables?.length" class="publish-variables"><strong>全局变量</strong><ul><li v-for="item in result.template.globalVariables" :key="item.name"><code>{{ item.name }}</code> · {{ item.type }}<span v-if="item.required"> · 必填</span><small v-if="item.description">{{ item.description }}</small></li></ul></div>
    </template>
    <template v-else>
      <div class="publish-environment"><span></span><strong>后端业务发布</strong><b>与 Camunda 验证部署相互独立</b></div>
      <dl v-if="snapshot" class="publish-summary"><div><dt>流程名称</dt><dd>{{ snapshot.processes[0]?.name || '未命名流程' }}</dd></div><div><dt>流程标识 / taskKey</dt><dd><code>{{ snapshot.processes[0]?.id || '—' }}</code></dd></div></dl>
      <ElForm label-position="top" :disabled="pending || uncertain" @submit.prevent="submit"><ElFormItem label="发布名称"><ElInput v-model="deploymentName" aria-label="发布名称" maxlength="120" show-word-limit /></ElFormItem></ElForm>
      <div v-if="blockingIssues.length" class="publish-issues" role="alert"><strong>请先修复以下问题</strong><ul><li v-for="(issue, index) in blockingIssues" :key="index"><span>{{ issue.message }}</span><button v-if="issue.elementId" @click="locate(issue.elementId)">定位</button></li></ul></div>
      <div v-if="warnings.length" class="publish-issues warnings"><strong>发布前请确认</strong><ul><li v-for="(issue, index) in warnings" :key="index">{{ issue.message }}</li></ul></div>
      <ElAlert v-if="error" class="publish-error" :type="uncertain ? 'warning' : 'error'" :title="error" :closable="false" show-icon />
      <div v-if="uncertain" class="publish-recovery"><ElCheckbox v-model="checkedOutcome" :disabled="submitting">我已按 taskKey 核对后端任务模板</ElCheckbox><ElButton text :disabled="!checkedOutcome || pending" @click="releaseUncertainAttempt">返回编辑</ElButton></div>
      <p class="publish-note">后端会同时部署 BPMN 并保存任务模板元数据。原始流程设计稿仍需单独保存。</p>
    </template>
    <template #footer><div class="publish-actions"><template v-if="result"><ElButton type="primary" @click="visible = false">返回设计器</ElButton></template><template v-else><ElButton :disabled="pending" @click="visible = false">{{ blockingIssues.length ? '返回修改' : '关闭' }}</ElButton><ElButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">确认发布</ElButton></template></div></template>
  </ElDialog>
</template>

<style scoped>
.publish-preparing { padding: 32px 0; color: #597367; text-align: center; }
.publish-environment { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 14px; border: 1px solid #dce5df; border-radius: 5px; color: #597367; background: #f2f8f4; font-size: 12px; }.publish-environment span { width: 7px; height: 7px; border-radius: 50%; background: #24745e; }.publish-environment strong { color: #243c36; }.publish-environment b { font-weight: 400; color: #83958c; }
.publish-summary { display: grid; gap: 12px; margin: 18px 0; }.publish-summary > div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 12px; }.publish-summary dt { color: #718176; font-size: 12px; }.publish-summary dd { margin: 0; overflow-wrap: anywhere; color: #243c36; }.publish-summary code { font-size: 12px; }
.publish-issues { margin: 14px 0; padding: 14px; border: 1px solid #f4d3d3; border-radius: 5px; color: #993d3d; background: #fef2f2; font-size: 12px; line-height: 1.8; }.publish-issues.warnings { border-color: #efe2b8; color: #866827; background: #fffbef; }.publish-issues ul, .publish-variables ul { margin: 8px 0 0; padding-left: 18px; }.publish-issues button { margin-left: 8px; border: 0; color: inherit; background: transparent; text-decoration: underline; cursor: pointer; }
.publish-variables { padding: 14px; border: 1px solid #dce5df; border-radius: 5px; color: #597367; font-size: 12px; }.publish-variables li { margin: 7px 0; }.publish-variables small { display: block; color: #82938a; }
.publish-error { margin-top: 12px; }.publish-recovery { display: grid; gap: 8px; margin-top: 14px; }.publish-note { margin: 14px 0 0; color: #718176; font-size: 12px; line-height: 1.8; }.publish-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 480px) { .publish-summary > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
