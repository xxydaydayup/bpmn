<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { IconArrowsSplit, IconClock, IconMessage, IconPlayerPlay, IconRobot, IconSquare, IconUserCheck, IconUsers } from '@tabler/icons-vue'
import type { DesignerNodeData } from '../adapter'

const props = defineProps<NodeProps<DesignerNodeData, any, 'workflowNode'>>()
const labels: Record<string, string> = { start: '开始', approval: '审批', countersign: '多人审批', service: '服务调用', receive: '消息等待', timer: '定时等待', condition: '条件分支', end: '结束' }
const iconComponents = { start: IconPlayerPlay, approval: IconUserCheck, countersign: IconUsers, service: IconRobot, receive: IconMessage, timer: IconClock, condition: IconArrowsSplit, end: IconSquare }
const approvalModeLabels: Record<string, string> = { ALL: '会签', ANY: '或签', VOTE: '按比例' }
const serviceModeLabels: Record<string, string> = { ALL: 'ALL 会签', ANY: 'ANY 或签', VOTE: 'VOTE 投票' }
const timerModeLabels: Record<string, string> = { duration: '等时长', date: '指定时刻', cycle: '周期' }
const eventSummary = () => props.data.kind === 'receive'
  ? (typeof props.data.original.messageName === 'string' && props.data.original.messageName ? '等 ' + props.data.original.messageName : '等业务消息')
  : (String(props.data.original.timerValue ?? 'PT30M'))
</script>

<template>
  <article class="wfd-node" :class="['wfd-node-' + props.data.kind, { 'wfd-node-selected': props.selected, 'wfd-node-unknown': !labels[props.data.kind] }]" :aria-label="(labels[props.data.kind] ?? ('未知节点 ' + props.data.kind)) + '：' + props.data.name">
    <Handle v-if="labels[props.data.kind] && props.data.kind !== 'start'" type="target" :position="Position.Top" class="wfd-handle" :connectable="props.connectable" />
    <span class="wfd-node-icon" aria-hidden="true"><component :is="iconComponents[props.data.kind as keyof typeof iconComponents] ?? IconSquare" :size="18" :stroke-width="1.7" /></span>
    <span class="wfd-node-copy"><small>{{ labels[props.data.kind] ?? ('未知 · ' + props.data.kind) }}</small><strong>{{ props.data.name || '未命名节点' }}</strong></span>
    <span v-if="props.data.kind === 'receive'" class="wfd-node-tag wfd-node-tag-receive">{{ eventSummary() }}</span>
    <span v-else-if="props.data.kind === 'timer'" class="wfd-node-tag wfd-node-tag-timer">{{ timerModeLabels[String(props.data.original.timerType ?? 'duration')] }} · {{ eventSummary() }}</span>
    <span v-if="props.data.kind === 'countersign'" class="wfd-node-tag">{{ approvalModeLabels[String(props.data.original.approveMode ?? '')] ?? '发起时选择' }}</span>
    <span v-else-if="props.data.kind === 'service' && props.data.original.countersign === true" class="wfd-node-tag wfd-node-tag-service">{{ serviceModeLabels[String(props.data.original.approveMode ?? '')] ?? '多服务 · 动态' }}</span>
    <Handle v-if="labels[props.data.kind] && props.data.kind !== 'end'" type="source" :position="Position.Bottom" class="wfd-handle" :connectable="props.connectable" />
  </article>
</template>
