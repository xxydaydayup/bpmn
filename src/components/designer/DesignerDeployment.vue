<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElAlert, ElButton, ElCheckbox, ElDialog, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { useDesignerDeployment } from '@/composables/useDesignerDeployment'
import type { DesignerDeploymentSnapshot } from '@/bpmn/deployment'

const props = defineProps<{ disabled: boolean; prepare: () => Promise<DesignerDeploymentSnapshot | undefined> }>()
const emit = defineEmits<{ locate: [id: string] }>()
const router = useRouter()
const { visible, preparing, submitting, pending, snapshot, deploymentName, error, uncertain, checkedOutcome,
  result, lastResult, blockingIssues, warnings, canSubmit, open, submit, showLastResult, releaseUncertainAttempt }
  = useDesignerDeployment(() => props.prepare())
const definitions = computed(() => Object.values(result.value?.deployment.deployedProcessDefinitions ?? {}))
const consoleHref = (id?: string) => router.resolve({ path: '/camunda-console', query: id ? { definitionId: id } : { tab: 'definitions' } }).href

function locate(id: string) {
  if (pending.value) return
  visible.value = false
  emit('locate', id)
}

async function copyIdentifiers() {
  if (!result.value) return
  const text = [
    `deploymentId: ${result.value.deployment.id}`,
    ...definitions.value.map(item => `definitionId: ${item.id} | key: ${item.key} | version: ${item.version ?? '—'}`),
  ].join('\n')
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    ElMessage.success('部署标识已复制')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    let copied = false
    try { copied = document.execCommand('copy') } catch { /* The identifiers remain selectable in the dialog. */ }
    textarea.remove()
    if (copied) ElMessage.success('部署标识已复制')
    else ElMessage.warning('复制失败，请选择弹窗中的标识手动复制')
  }
}
</script>

<template>
  <button v-if="lastResult" class="designer-button" :disabled="pending || uncertain" aria-label="上次部署" title="查看上次部署结果" @click="showLastResult"><DiagramIcon name="info" /><span>上次部署</span></button>
  <button class="designer-button primary" :disabled="disabled || pending" aria-label="部署流程" title="将当前画布部署到 Camunda" @click="open">
    <DiagramIcon name="upload" /><span>{{ preparing ? '正在准备…' : submitting ? '部署中…' : '部署流程' }}</span>
  </button>
  <ElDialog v-model="visible" :title="result ? '部署结果' : '部署当前流程'" width="min(680px, calc(100vw - 32px))"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!pending" :show-close="!pending">
    <div v-if="preparing" class="deployment-preparing" role="status">正在检查流程并生成画布快照…</div>
    <template v-else-if="result">
      <ElAlert :type="definitions.length ? 'success' : 'warning'" :closable="false" show-icon
        :title="definitions.length ? '已收到流程定义部署结果' : '请求已完成，未返回新流程定义'"
        :description="definitions.length ? '下方版本对应本次提交的画布快照，部署不会自动启动流程实例。' : '可能触发了重复过滤。请在管理台核对部署资源及定义版本。'" />
      <dl class="deployment-summary">
        <div><dt>流程</dt><dd>{{ result.processName || '未命名流程' }} <code>{{ result.processId }}</code></dd></div>
        <div><dt>部署名称</dt><dd>{{ result.deploymentName }}</dd></div>
        <div><dt>deploymentId</dt><dd><code>{{ result.deployment.id }}</code></dd></div>
        <div v-if="result.deployment.deploymentTime"><dt>部署时间</dt><dd>{{ result.deployment.deploymentTime }}</dd></div>
      </dl>
      <div v-for="definition in definitions" :key="definition.id" class="deployment-definition">
        <div class="deployment-definition-heading"><strong>{{ definition.name || definition.key }}</strong><span>版本 {{ definition.version ?? '—' }}</span></div>
        <p>流程 key：<code>{{ definition.key }}</code></p>
        <p>definitionId：<code>{{ definition.id }}</code></p>
        <a class="deployment-link" :href="consoleHref(definition.id)" target="_blank" rel="noopener noreferrer">在管理台查看此版本 ↗</a>
      </div>
      <p class="deployment-note">当前设计稿仍可继续编辑；上次部署结果不会随编辑改变。原始设计稿请另行导出保存。</p>
    </template>
    <template v-else>
      <div class="deployment-environment"><span class="deployment-environment-dot"></span><strong>Camunda 7</strong><span>当前配置的引擎 · 开发联调</span></div>
      <dl v-if="snapshot" class="deployment-summary">
        <div><dt>流程名称</dt><dd>{{ snapshot.processes[0]?.name || '未命名流程' }}</dd></div>
        <div><dt>流程标识 / key</dt><dd><code>{{ snapshot.processes[0]?.id || '—' }}</code></dd></div>
      </dl>
      <ElForm label-position="top" :disabled="pending || uncertain" @submit.prevent="submit">
        <ElFormItem label="部署名称"><ElInput v-model="deploymentName" aria-label="部署名称" maxlength="120" show-word-limit /></ElFormItem>
      </ElForm>
      <div v-if="blockingIssues.length" class="deployment-issues" role="alert">
        <strong>请先修复以下问题</strong>
        <ul><li v-for="(issue, index) in blockingIssues" :key="index"><span>{{ issue.message }}</span><button v-if="issue.elementId" class="deployment-locate" @click="locate(issue.elementId)">定位</button></li></ul>
      </div>
      <div v-if="warnings.length" class="deployment-issues warnings"><strong>部署前请确认</strong><ul><li v-for="(issue, index) in warnings" :key="index">{{ issue.message }}</li></ul></div>
      <ElAlert v-if="error" class="deployment-error" :type="uncertain ? 'warning' : 'error'" :title="error" :closable="false" show-icon />
      <div v-if="uncertain" class="deployment-recovery">
        <a class="deployment-link" :href="consoleHref()" target="_blank" rel="noopener noreferrer">打开管理台核对结果 ↗</a>
        <ElCheckbox v-model="checkedOutcome" :disabled="submitting">我已核对本次部署结果</ElCheckbox>
        <ElButton text :disabled="!checkedOutcome || pending" @click="releaseUncertainAttempt">返回编辑</ElButton>
      </div>
      <p class="deployment-note">提交的是当前已应用的画布快照，不会自动启动流程实例。原始设计稿请另行导出保存。</p>
    </template>
    <template #footer>
      <div class="deployment-actions">
        <template v-if="result">
          <ElButton @click="copyIdentifiers">复制部署标识</ElButton>
          <a v-if="!definitions.length" class="deployment-link" :href="consoleHref()" target="_blank" rel="noopener noreferrer">到管理台核对 ↗</a>
          <ElButton type="primary" @click="visible = false">返回设计器</ElButton>
        </template>
        <template v-else>
          <ElButton :disabled="pending" @click="visible = false">{{ blockingIssues.length ? '返回修改' : '关闭' }}</ElButton>
          <ElButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">{{ uncertain ? '重新提交此快照' : '确认部署' }}</ElButton>
        </template>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped>
.deployment-environment { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 14px; border: 1px solid #dce5df; border-radius: 5px; background: #f2f8f4; font-size: 12px; color: #597367; }
.deployment-environment strong { color: #243c36; }
.deployment-environment-dot { width: 7px; height: 7px; border-radius: 50%; background: #24745e; }
.deployment-summary { margin: 18px 0; display: grid; gap: 12px; }
.deployment-summary > div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 12px; }
.deployment-summary dt { color: #718176; font-size: 12px; }
.deployment-summary dd { margin: 0; color: #243c36; overflow-wrap: anywhere; }
code { font-size: 12px; overflow-wrap: anywhere; user-select: text; }
.deployment-summary dd > code { display: block; }
.deployment-issues { padding: 14px; margin: 14px 0; background: #fef2f2; border: 1px solid #f4d3d3; border-radius: 5px; color: #993d3d; font-size: 12px; line-height: 1.8; }
.deployment-issues.warnings { background: #fffbef; border-color: #efe2b8; color: #866827; }
.deployment-issues ul { margin: 8px 0 0; padding-left: 18px; }
.deployment-locate { margin-left: 8px; color: inherit; border: 0; background: transparent; cursor: pointer; text-decoration: underline; }
.deployment-note { color: #718176; font-size: 12px; line-height: 1.8; margin: 14px 0 0; }
.deployment-error { margin-top: 12px; }
.deployment-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.deployment-actions .el-button + .el-button { margin-left: 0; }
.deployment-definition { margin: 14px 0; padding: 16px; border: 1px solid #dce5df; border-radius: 5px; }
.deployment-definition-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; color: #243c36; }
.deployment-definition-heading span { color: #24745e; font-size: 12px; }
.deployment-definition p { margin: 10px 0; font-size: 12px; color: #597367; overflow-wrap: anywhere; }
.deployment-link { color: #24745e; font-size: 12px; text-underline-offset: 3px; }
.deployment-recovery { display: flex; align-items: flex-start; flex-direction: column; gap: 8px; margin-top: 14px; }
.deployment-preparing { padding: 32px 0; text-align: center; color: #597367; }
@media (max-width: 480px) { .deployment-summary > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
