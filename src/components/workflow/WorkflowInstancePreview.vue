<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { previewHttpStatus, workflowPreviewGateway, type WorkflowInstanceSnapshot, type WorkflowPreviewGateway, type WorkflowPreviewMode } from '@/api/workflow/previewGateway'
import WorkflowSnapshotPreview from '@/components/workflow/WorkflowSnapshotPreview.vue'

const props = withDefaults(defineProps<{ instanceId: string; mode?: WorkflowPreviewMode; gateway?: WorkflowPreviewGateway }>(), { mode: 'auto' })
const snapshot = shallowRef<WorkflowInstanceSnapshot>()
const loading = ref(false)
const error = ref('')
let controller: AbortController | undefined
let disposed = false
const stateLabel = computed(() => {
  const value = snapshot.value?.instance
  if (!value) return ''
  return ({ ACTIVE: '运行中', SUSPENDED: '已挂起', COMPLETED: '已完成', EXTERNALLY_TERMINATED: '已外部终止', INTERNALLY_TERMINATED: '已内部终止' } as Record<string, string>)[value.state] || (value.ended ? '已结束' : value.state)
})
async function load() {
  controller?.abort()
  const current = controller = new AbortController()
  snapshot.value = undefined
  error.value = ''
  loading.value = Boolean(props.instanceId)
  if (!props.instanceId) return
  try {
    const result = await (props.gateway ?? workflowPreviewGateway).load(props.instanceId, props.mode, current.signal)
    if (!disposed && controller === current && !current.signal.aborted) snapshot.value = result
  } catch (cause) {
    if (disposed || controller !== current || current.signal.aborted) return
    const status = previewHttpStatus(cause)
    error.value = status === 401 ? '尚未认证或登录已过期，请登录业务系统后重试。'
      : status === 403 ? '当前用户无权查看此流程实例或其版本数据。'
        : status === 404 ? '流程实例不存在或已被清理。'
          : cause instanceof Error ? cause.message : '流程实例预览加载失败。'
  } finally {
    if (!disposed && controller === current) loading.value = false
  }
}
watch(() => [props.instanceId, props.mode, props.gateway], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { disposed = true; controller?.abort() })
</script>

<template>
  <section class="workflow-instance-preview" aria-label="流程实例只读预览" :aria-busy="loading">
    <p v-if="loading" class="instance-placeholder" role="status">正在加载流程实例及其准确版本…</p>
    <template v-else-if="error">
      <ElAlert :title="error" type="error" :closable="false" show-icon />
      <ElButton @click="load">重试</ElButton>
    </template>
    <template v-else-if="snapshot">
      <div class="instance-preview-heading"><strong>{{ snapshot.instance.ended ? '历史实例详情' : '运行实例详情' }} · {{ stateLabel }}</strong><ElButton size="small" @click="load">刷新预览</ElButton></div>
      <dl class="instance-metadata">
        <div><dt>流程实例 ID</dt><dd>{{ snapshot.instance.id }}</dd></div>
        <div><dt>业务键 businessKey</dt><dd>{{ snapshot.instance.businessKey || '—' }}</dd></div>
      </dl>
      <WorkflowSnapshotPreview :model="snapshot.model" :metadata="snapshot.metadata" :bpmn-xml="snapshot.bpmnXml" :node-states="snapshot.nodeStates" :warning="snapshot.warning" />
      <p class="instance-scope">{{ snapshot.instance.ended ? '仅标记接口明确返回的历史活动状态；不推断顺序流的实际执行路径。' : '仅标记当前活动或异步等待节点；当前活动树不代表完整历史轨迹。' }}</p>
    </template>
    <p v-else class="instance-placeholder" role="status">选择流程实例后查看只读预览。</p>
  </section>
</template>

<style scoped>
.workflow-instance-preview { display: grid; gap: 14px; min-width: 0; }
.instance-preview-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.instance-metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 0; font-size: 13px; }
.instance-metadata dt, .instance-scope { color: var(--color-text-secondary); }
.instance-metadata dd { margin: 4px 0 0; overflow-wrap: anywhere; color: var(--color-text); }
.instance-placeholder { padding: 36px 16px; margin: 0; text-align: center; color: var(--color-text-secondary); }
.instance-scope { font-size: 12px; margin: 0; line-height: 1.6; }
@media (max-width: 520px) { .instance-metadata { grid-template-columns: minmax(0, 1fr); } }
</style>
