<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElAlert, ElButton } from 'element-plus'
import { businessWorkflowGateway } from '@/api/workflow/sdkGateway'
import type { BusinessWorkflowGateway, TaskTemplateDetail } from '@/api/workflow/types'
import WorkflowSnapshotPreview from '@/components/workflow/WorkflowSnapshotPreview.vue'
import WorkflowInstancePreview from '@/components/workflow/WorkflowInstancePreview.vue'

const props = defineProps<{ gateway?: Pick<BusinessWorkflowGateway, 'getTemplate'> }>()
const route = useRoute()
const template = shallowRef<TaskTemplateDetail>()
const loading = ref(false)
const error = ref('')
let controller: AbortController | undefined
let sequence = 0

const target = computed(() => {
  const keys = Object.keys(route.query)
  if (keys.length !== 1 || !['templateKey', 'processInstanceId'].includes(keys[0]!)) return undefined
  const kind = keys[0] as 'templateKey' | 'processInstanceId'
  const value = route.query[kind]
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) return undefined
  return { kind, id: value }
})
const metadata = computed(() => template.value ? {
  name: template.value.taskName, key: template.value.taskKey,
  version: template.value.version, processDefinitionId: template.value.processDefinitionId,
} : undefined)
const sameOriginApi = (() => {
  try { return new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.href).origin === window.location.origin }
  catch { return false }
})()

function failureMessage(cause: unknown): string {
  const value = cause as { httpStatus?: number; response?: { status?: number } } | undefined
  const status = value?.httpStatus ?? value?.response?.status
  if (status === 401) return '登录已失效，请在业务系统登录后重试。'
  if (status === 403) return '当前账号无权查看此模板。'
  if (status === 404) return '模板不存在或已被删除。'
  return '模板加载失败，请稍后重试。'
}

async function load(): Promise<void> {
  const requestId = ++sequence
  controller?.abort()
  controller = undefined
  template.value = undefined
  loading.value = false
  error.value = ''
  const selected = target.value
  if (!selected || !sameOriginApi || selected.kind !== 'templateKey') return
  const currentController = new AbortController()
  controller = currentController
  loading.value = true
  try {
    const detail = await (props.gateway ?? businessWorkflowGateway).getTemplate(selected.id, currentController.signal)
    if (requestId !== sequence || currentController.signal.aborted) return
    if (detail.taskKey !== selected.id) throw new Error('模板响应与请求不一致')
    template.value = detail
  } catch (cause: unknown) {
    if (requestId === sequence && !currentController.signal.aborted) error.value = failureMessage(cause)
  } finally {
    if (requestId === sequence) loading.value = false
  }
}

watch(() => route.fullPath, () => { void load() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { sequence += 1; controller?.abort() })
</script>

<template>
  <main class="workflow-embed" aria-label="流程只读预览">
    <header class="embed-heading">
      <h1>流程预览</h1>
      <span>只读</span>
    </header>
    <ElAlert v-if="!sameOriginApi" type="error" :closable="false" title="预览数据接口须配置为同源地址，请联系系统管理员。" />
    <ElAlert v-else-if="!target" type="error" :closable="false" title="预览地址无效：请仅提供一个 templateKey 或 processInstanceId，不接受其他参数。" />
    <WorkflowInstancePreview v-else-if="target.kind === 'processInstanceId'" :key="target.id" :instance-id="target.id" />
    <section v-else :aria-busy="loading" class="embed-template">
      <p v-if="loading" class="embed-status" role="status">正在加载模板…</p>
      <div v-else-if="error" class="embed-error">
        <ElAlert type="error" :title="error" :closable="false" show-icon />
        <ElButton @click="load">重新加载模板</ElButton>
      </div>
      <WorkflowSnapshotPreview v-else-if="template" :key="target.id" :model="template.displayJson" :metadata="metadata" :bpmn-xml="template.bpmnXml" />
    </section>
  </main>
</template>

<style scoped>
.workflow-embed { min-height: 100dvh; min-width: 0; padding: 20px; background: var(--color-surface); }
.embed-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.embed-heading h1 { font-size: 20px; }
.embed-heading span { padding: 4px 10px; color: var(--color-primary-strong); background: var(--color-primary-soft); border-radius: 4px; font-size: 13px; }
.embed-template { min-width: 0; }
.embed-status { display: grid; place-items: center; min-height: 320px; margin: 0; color: var(--color-text-secondary); }
.embed-error { display: grid; justify-items: start; gap: 16px; }
.embed-error .el-button { min-height: 44px; }
@media (max-width: 600px) { .workflow-embed { padding: 12px; } }
</style>
