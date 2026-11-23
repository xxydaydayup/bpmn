<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import WorkflowNode from './WorkflowNode.vue'
import { getWorkflowNodeDefinition } from './index'
import type { DesignerNodeData } from '../adapter'
import type { WorkflowPreviewNodeState } from '../preview'
import { WORKFLOW_NODE_HEIGHT, WORKFLOW_NODE_WIDTH } from '../layout'

const props = defineProps<NodeProps<DesignerNodeData & { previewState?: WorkflowPreviewNodeState }, any, 'workflowNode'>>()
const stateLabels: Record<WorkflowPreviewNodeState, string> = { active: '当前活动', completed: '已完成', canceled: '已取消' }
const nodeStyle = computed(() => {
  const { width, height } = props.data.original
  const safeHeight = typeof height === 'number' && Number.isFinite(height) && height > 0 ? height : WORKFLOW_NODE_HEIGHT
  return {
    width: (typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : WORKFLOW_NODE_WIDTH) + 'px',
    height: safeHeight + 'px',
    minHeight: safeHeight + 'px',
  }
})
</script>

<template>
  <div class="wfd-preview-node" :class="props.data.previewState ? 'wfd-preview-state-' + props.data.previewState : undefined" :data-node-id="props.id" :data-state="props.data.previewState">
    <WorkflowNode v-bind="props" :connectable="false" :style="nodeStyle" />
    <template v-if="!getWorkflowNodeDefinition(props.data.kind)">
      <Handle type="target" :position="Position.Top" :connectable="false" class="wfd-handle" />
      <Handle type="source" :position="Position.Bottom" :connectable="false" class="wfd-handle" />
    </template>
    <span v-if="props.data.previewState" class="wfd-preview-state-label">{{ stateLabels[props.data.previewState] }}</span>
  </div>
</template>
