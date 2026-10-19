<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElEmpty } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { presentNode } from '@/bpmn/icons'
import type { NodeProperties } from '@/bpmn/types'

const props = defineProps<{ node: NodeProperties | null; disabled: boolean; error?: string }>()
const emit = defineEmits<{
  close: []
  host: [value: HTMLElement | undefined]
}>()
const presentation = computed(() => presentNode(props.node?.type))
const nodeType = computed(() => presentation.value.label)
const templateHost = (value: Element | import('vue').ComponentPublicInstance | null) => {
  emit('host', value instanceof HTMLElement ? value : undefined)
}
</script>

<template>
  <aside class="properties-panel" aria-label="流程属性面板">
    <div class="properties-heading">
      <h2>{{ node?.kind === 'process' ? '流程属性' : node?.kind === 'flow' ? '连线属性' : '节点属性' }}</h2>
      <button class="designer-icon-button" aria-label="收起属性面板" title="收起属性面板" @click="emit('close')"><DiagramIcon name="properties" /></button>
    </div>
    <div v-if="node" class="selected-node-summary">
      <span class="node-symbol" :class="'tone-' + presentation.tone"><DiagramIcon :name="presentation.icon" /></span>
      <div><strong :title="node.name">{{ node.name || '未命名' }}</strong><span>{{ nodeType }}</span></div>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="properties-panel-error" />
    <ElEmpty v-if="!node" class="properties-empty" description="选择流程、节点或连线以查看属性" />
    <div v-show="node" class="official-properties-host bio-theme-parent" :class="{ 'is-disabled': disabled }" :aria-busy="disabled" :ref="templateHost" />
  </aside>
</template>

<style scoped>
.properties-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-left: 1px solid var(--color-border); background: var(--color-surface); }
.properties-heading { display: flex; flex: 0 0 44px; align-items: center; justify-content: space-between; padding: 0 16px 0 20px; border-bottom: 1px solid var(--color-border-soft); }
.properties-heading h2 { margin: 0; color: var(--color-text-heading); font-size: 13px; font-weight: 600; }
.selected-node-summary { display: flex; align-items: center; gap: 10px; min-height: 65px; padding: 11px 17px; border-bottom: 1px solid var(--color-border-soft); }
.node-symbol { display: inline-flex; width: 32px; height: 32px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 7px; background: var(--color-surface-hover); color: var(--color-text-secondary); }
.node-symbol .diagram-icon { width: 17px; height: 17px; }
.selected-node-summary > div { display: grid; min-width: 0; gap: 4px; }
.selected-node-summary strong { overflow: hidden; color: var(--color-text-strong); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.selected-node-summary span:last-child { color: var(--color-text-secondary); font-size: 10px; }
.properties-panel-error { flex: 0 0 auto; margin: 12px; }
.official-properties-host { min-height: 0; flex: 1; overflow: auto; scrollbar-width: thin; }
.official-properties-host.is-disabled { pointer-events: none; opacity: .55; }
.properties-empty { flex: 1; }
</style>
