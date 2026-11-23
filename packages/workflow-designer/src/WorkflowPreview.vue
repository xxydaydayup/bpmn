<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import WorkflowPreviewNode from './nodes/WorkflowPreviewNode.vue'
import WorkflowEdge from './edges/WorkflowEdge.vue'
import { prepareWorkflowPreview, type WorkflowPreviewMetadata, type WorkflowPreviewNodeState, type WorkflowPreviewReady } from './preview'
import type { DesignerNode, DesignerEdge } from './adapter'
import './style.css'

const props = defineProps<{ model: unknown; metadata?: WorkflowPreviewMetadata; nodeStates?: Record<string, WorkflowPreviewNodeState> }>()
const emit = defineEmits<{ error: [message: string]; ready: [payload: WorkflowPreviewReady]; warning: [message: string] }>()
const flowId = 'workflow-preview-' + useId()
const flow = useVueFlow(flowId)
const nodes = shallowRef<DesignerNode[]>([])
const edges = shallowRef<DesignerEdge[]>([])
const warnings = ref<string[]>([])
const error = ref('')
const loading = ref(false)
const generation = ref(0)
const nodeTypes = { workflowNode: markRaw(WorkflowPreviewNode) }
const edgeTypes = { workflowRoute: markRaw(WorkflowEdge) }
const visibleNodes = computed(() => nodes.value.map(node => ({ ...node, data: { ...node.data, previewState: props.nodeStates?.[node.id] } })))
const unmatchedIds = computed(() => Object.keys(props.nodeStates ?? {}).filter(id => !nodes.value.some(node => node.id === id)))
const mismatchWarning = computed(() => unmatchedIds.value.length ? `部分活动无法与当前外层模型节点匹配（${unmatchedIds.value.join('、')}），未标记这些活动。` : '')

watch(() => props.model, async value => {
  const current = ++generation.value
  nodes.value = []
  edges.value = []
  warnings.value = []
  error.value = ''
  loading.value = true
  try {
    const prepared = await prepareWorkflowPreview(value)
    if (current !== generation.value) return
    nodes.value = prepared.nodes
    edges.value = prepared.edges
    warnings.value = prepared.warnings
    for (const warning of prepared.warnings) emit('warning', warning)
    emit('ready', { nodeIds: prepared.nodeIds })
  } catch (cause) {
    if (current !== generation.value) return
    error.value = cause instanceof Error ? cause.message : '业务工作流模型无法展示。'
    emit('error', error.value)
  } finally {
    if (current === generation.value) loading.value = false
  }
}, { immediate: true, deep: true })

watch(mismatchWarning, value => { if (value && nodes.value.length) emit('warning', value) })
onBeforeUnmount(() => { generation.value++ })
async function fitCanvas() {
  if (nodes.value.length) await flow.fitView({ padding: 0.2, duration: 0 })
}
</script>

<template>
  <section class="wfd wfd-preview" aria-label="只读业务流程预览" :aria-busy="loading">
    <dl v-if="metadata" class="wfd-preview-metadata">
      <div v-if="metadata.name"><dt>模板名称</dt><dd>{{ metadata.name }}</dd></div>
      <div v-if="metadata.key"><dt>Key</dt><dd>{{ metadata.key }}</dd></div>
      <div v-if="metadata.version !== undefined"><dt>版本</dt><dd>{{ metadata.version }}</dd></div>
      <div v-if="metadata.processDefinitionId"><dt>流程定义 ID</dt><dd>{{ metadata.processDefinitionId }}</dd></div>
    </dl>
    <div v-for="warning in warnings" :key="warning" class="wfd-preview-notice" role="status">{{ warning }}</div>
    <div v-if="mismatchWarning && nodes.length" class="wfd-preview-notice" role="status">{{ mismatchWarning }}</div>
    <p v-if="loading" class="wfd-preview-empty" role="status">正在加载业务流程图…</p>
    <p v-else-if="error" class="wfd-preview-empty wfd-preview-error" role="alert">{{ error }}</p>
    <template v-else>
      <div class="wfd-preview-toolbar" role="toolbar" aria-label="流程图查看工具">
        <span>业务流程图 · 只读</span>
        <div>
          <button type="button" aria-label="缩小流程图" @click="flow.zoomOut()">−</button>
          <button type="button" aria-label="放大流程图" @click="flow.zoomIn()">+</button>
          <button type="button" @click="fitCanvas">适应画布</button>
        </div>
      </div>
      <div class="wfd-preview-stage">
        <VueFlow :id="flowId" :nodes="visibleNodes" :edges="edges" :node-types="nodeTypes" :edge-types="edgeTypes" :nodes-draggable="false" :nodes-connectable="false" :edges-updatable="false" :elements-selectable="false" :nodes-focusable="false" :edges-focusable="false" :delete-key-code="null" :selection-key-code="null" :min-zoom="0.1" :max-zoom="3" :fit-view-on-init="true" @nodes-initialized="fitCanvas" />
      </div>
    </template>
  </section>
</template>
