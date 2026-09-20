<script setup lang="ts">
import { computed, ref } from 'vue'
import DiagramIcon from './DiagramIcon.vue'
import { libraryGroups, presentNode } from '@/bpmn/icons'

defineProps<{ disabled: boolean; collapsed: boolean }>()
const emit = defineEmits<{ toggle: []; create: [type: string]; drag: [type: string, event: MouseEvent | TouchEvent] }>()
const query = ref('')
const groups = computed(() => libraryGroups.map(group => ({ ...group, types: group.types.filter(type => presentNode(type).label.includes(query.value.trim())) })).filter(group => group.types.length))
let start: { x: number; y: number; type: string } | undefined
let dragged = false
function pointerDown(type: string, event: PointerEvent) {
  if (event.button !== 0) return
  start = { x: event.clientX, y: event.clientY, type }
  dragged = false
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function pointerMove(event: PointerEvent) {
  if (start && event.buttons === 1 && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
    dragged = true
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    emit('drag', start.type, event)
    start = undefined
  }
}
function click(type: string) { start = undefined; if (!dragged) emit('create', type); dragged = false }
</script>

<template>
  <aside class="node-library" :class="{ 'library-collapsed': collapsed }" aria-label="节点库">
    <div class="library-heading"><h2>节点库</h2><button class="designer-icon-button" :aria-label="collapsed ? '展开节点库' : '收起节点库'" :title="collapsed ? '展开节点库' : '收起节点库'" @click="emit('toggle')"><DiagramIcon name="library" /></button></div>
    <div class="library-content">
      <label class="node-search"><DiagramIcon name="search" /><input v-model="query" placeholder="搜索节点" aria-label="搜索节点" /></label>
      <p class="library-hint">拖入画布，或点击添加</p>
      <section v-for="group in groups" :key="group.name" class="library-group">
        <h3>{{ group.name }}<span>{{ group.types.length }}</span></h3>
        <button v-for="type in group.types" :key="type" class="library-item" :aria-label="`添加${presentNode(type).label}`" :title="presentNode(type).label" :disabled="disabled" @pointerdown="pointerDown(type, $event)" @pointermove="pointerMove" @pointercancel="start = undefined" @pointerup="start = undefined" @click="click(type)">
          <span class="node-symbol" :class="`tone-${presentNode(type).tone}`"><DiagramIcon :name="presentNode(type).icon" /></span><span class="library-item-label">{{ presentNode(type).label }}</span><DiagramIcon class="library-grip" name="grip" />
        </button>
      </section>
      <p v-if="!groups.length" class="library-empty">没有匹配的节点</p>
    </div>
    <div class="library-footer"><DiagramIcon name="info" /><p>先搭建流转路径，<br>再配置节点的办理规则。</p></div>
  </aside>
</template>

<style scoped>
.node-library { min-height: 0; display: flex; flex-direction: column; border-right: 1px solid #e6ebe8; background: #fff; }
.library-heading { height: 54px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 15px 0 20px; }
h2 { margin: 0; font-size: 13px; font-weight: 600; }
.library-content { overflow-y: auto; padding: 0 13px; scrollbar-width: thin; }
.node-search { display: flex; align-items: center; gap: 7px; border: 1px solid #e6ebe8; border-radius: 5px; height: 34px; padding: 0 8px; color: #94a197; }
.node-search .diagram-icon { width: 15px; height: 15px; }
.node-search input { min-width: 0; width: 100%; border: 0; outline: 0; font-size: 11px; background: none; color: #293a34; }
.node-search:focus-within { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }
.library-hint { margin: 10px 0 0; font-size: 10px; color: #839087; }
.library-group { padding-top: 22px; }
h3 { display: flex; justify-content: space-between; margin: 0; padding: 0 7px 8px; font-size: 11px; font-weight: 400; color: #839087; }
.library-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; margin: 2px 0; padding: 6px 7px; border: 1px solid transparent; border-radius: 6px; background: none; text-align: left; color: #293a34; font-size: 13px; cursor: grab; touch-action: none; }
.library-item:hover:not(:disabled) { background: #fafcfb; border-color: #e6ebe8; }
.library-item:disabled { opacity: .4; cursor: default; }
.library-item .node-symbol { width: 28px; height: 28px; }
.library-grip { margin-left: auto; width: 14px; color: #c2cbc5; opacity: 0; }
.library-item:hover .library-grip { opacity: 1; }
.library-footer { display: flex; gap: 7px; margin: auto 20px 22px; padding-top: 22px; color: #839087; font-size: 10px; line-height: 1.8; }
.library-footer .diagram-icon { width: 14px; height: 14px; margin-top: 3px; }
.library-footer p { margin: 0; }
.library-empty { color: #839087; font-size: 12px; padding: 20px 0; text-align: center; }
.library-collapsed .library-content, .library-collapsed .library-footer, .library-collapsed h2 { display: none; }
.library-collapsed .library-heading { padding: 0; justify-content: center; }
@media (max-width: 1200px) {
  .library-heading { padding: 0; justify-content: center; }
  h2, .node-search, .library-hint, h3, .library-item-label, .library-grip, .library-footer { display: none; }
  .library-content { padding: 0 7px; }
  .library-item { justify-content: center; padding: 4px; }
}
</style>
