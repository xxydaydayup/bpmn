<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { WorkflowPreview } from '@workflow/designer'
import '@workflow/designer/style.css'
import ReadOnlyProcessDiagram from '@/components/camunda/ReadOnlyProcessDiagram.vue'

const props = defineProps<{
  model?: unknown
  metadata?: { name?: string; key?: string; version?: string | number; processDefinitionId?: string }
  bpmnXml?: string
  nodeStates?: Record<string, 'active' | 'completed' | 'canceled'>
  warning?: string
}>()

const view = ref<'business' | 'xml'>('business')
const modelError = ref('')
const hasModel = computed(() => props.model !== null && props.model !== undefined && props.model !== '')
watch(() => [props.model, props.bpmnXml, props.metadata?.processDefinitionId], () => {
  view.value = 'business'
  modelError.value = ''
}, { flush: 'sync' })
</script>

<template>
  <section class="workflow-snapshot-preview" aria-label="流程快照只读预览">
    <dl v-if="metadata" class="snapshot-metadata">
      <div><dt>模板名称</dt><dd>{{ metadata.name || '—' }}</dd></div>
      <div><dt>模板 key</dt><dd>{{ metadata.key || '—' }}</dd></div>
      <div><dt>版本</dt><dd>{{ metadata.version ?? '—' }}</dd></div>
      <div class="definition-id"><dt>流程定义 ID</dt><dd>{{ metadata.processDefinitionId || '—' }}</dd></div>
    </dl>
    <ElAlert v-if="warning" :title="warning" type="warning" :closable="false" show-icon />
    <div class="snapshot-toolbar">
      <strong>{{ view === 'xml' ? 'BPMN XML 备用视图 · 只读' : '业务流程图 · 只读' }}</strong>
      <ElButton v-if="view === 'business' && bpmnXml" size="small" @click="view = 'xml'">查看 BPMN XML 备用图</ElButton>
      <ElButton v-if="view === 'xml'" size="small" @click="view = 'business'">返回业务流程图</ElButton>
    </div>
    <ElAlert v-if="!hasModel" title="此版本缺少业务工作流模型，业务流程图不可用" type="warning" :closable="false" show-icon />
    <ElAlert v-else-if="modelError && view === 'xml'" :title="'业务工作流模型无法可靠展示：' + modelError" type="warning" :closable="false" show-icon />
    <WorkflowPreview v-if="view === 'business' && hasModel" :model="model" :node-states="nodeStates" @error="modelError = $event" @ready="modelError = ''" />
    <ReadOnlyProcessDiagram v-else-if="view === 'xml' && bpmnXml" :xml="bpmnXml" :node-states="nodeStates" />
    <p v-if="!bpmnXml && (!hasModel || modelError)" class="snapshot-empty" role="status">此版本也没有可用的 BPMN XML 备用图。</p>
  </section>
</template>

<style scoped>
.workflow-snapshot-preview { min-width: 0; display: grid; gap: 12px; }
.snapshot-metadata { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 24px; margin: 0; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface-muted); font-size: 13px; }
.snapshot-metadata dt { color: var(--color-text-secondary); margin-bottom: 4px; }
.snapshot-metadata dd { color: var(--color-text); margin: 0; overflow-wrap: anywhere; }
.definition-id { grid-column: 1 / -1; }
.snapshot-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; color: var(--color-text); font-size: 13px; }
.snapshot-empty { padding: 24px; margin: 0; text-align: center; color: var(--color-text-secondary); }
@media (max-width: 520px) { .snapshot-metadata { grid-template-columns: minmax(0, 1fr); } }
</style>
