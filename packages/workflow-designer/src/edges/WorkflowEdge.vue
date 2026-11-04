<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'
import type { DesignerEdgeData } from '../adapter'
import { followRouteEndpoints } from './route'

const props = defineProps<EdgeProps<DesignerEdgeData, any, 'workflowRoute'>>()
const path = computed(() => getSmoothStepPath({ sourceX: props.sourceX, sourceY: props.sourceY, sourcePosition: props.sourcePosition, targetX: props.targetX, targetY: props.targetY, targetPosition: props.targetPosition, borderRadius: 8, offset: 22 }))
const routePoints = computed(() => (props.data as DesignerEdgeData & { routePoints?: { x: number; y: number }[] } | undefined)?.routePoints)
const liveRoutePoints = computed(() => routePoints.value && routePoints.value.length >= 2
  ? followRouteEndpoints(routePoints.value, { x: props.sourceX, y: props.sourceY }, { x: props.targetX, y: props.targetY })
  : undefined)
const edgePath = computed(() => liveRoutePoints.value?.length ? 'M ' + liveRoutePoints.value.map(point => point.x + ' ' + point.y).join(' L ') : path.value[0])
const edgeLabelPosition = computed(() => liveRoutePoints.value?.length
  ? liveRoutePoints.value[Math.floor((liveRoutePoints.value.length - 1) / 2)]
  : { x: path.value[1], y: path.value[2] })
</script>

<template>
  <BaseEdge :id="props.id" :path="edgePath" :marker-end="props.markerEnd" :style="{ stroke: props.data?.branch === 'reject' ? 'var(--wfd-danger)' : 'var(--wfd-edge)', strokeWidth: 1.7 }" />
  <EdgeLabelRenderer v-if="props.data?.branch || props.data?.conditionExpression">
    <span class="wfd-edge-label" :class="'wfd-edge-label-' + (props.data?.branch ?? 'condition')" :style="{ transform: 'translate(-50%, -50%) translate(' + edgeLabelPosition.x + 'px,' + edgeLabelPosition.y + 'px)' }">{{ props.data?.branch === 'pass' ? '通过' : props.data?.branch === 'reject' ? '驳回' : props.data?.conditionExpression }}</span>
  </EdgeLabelRenderer>
</template>
