<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer'
import type Canvas from 'diagram-js/lib/core/Canvas'
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry'
import camundaDescriptor from 'camunda-bpmn-moddle/resources/camunda.json'
import 'bpmn-js/dist/assets/diagram-js.css'

const props = withDefaults(defineProps<{ xml: string; activeIds?: string[] }>(), { activeIds: () => [] })
const host = ref<HTMLDivElement>()
const busy = ref(false)
const error = ref('')
const warning = ref('')
let viewer: NavigatedViewer | undefined
let observer: ResizeObserver | undefined
let sequence = 0
let disposed = false
let queue = Promise.resolve()
let marked: string[] = []

function fit() { viewer?.get<Canvas>('canvas').zoom('fit-viewport') }
function highlight() {
  if (!viewer || disposed) return
  const canvas = viewer.get<Canvas>('canvas')
  const registry = viewer.get<ElementRegistry>('elementRegistry')
  marked.forEach(id => { if (registry.get(id)) canvas.removeMarker(id, 'runtime-active') })
  marked = props.activeIds.filter(id => Boolean(registry.get(id)))
  marked.forEach(id => canvas.addMarker(id, 'runtime-active'))
}
function render() {
  const request = ++sequence
  const xml = props.xml
  busy.value = Boolean(xml)
  error.value = ''
  warning.value = ''
  // bpmn-js 导入不支持取消，串行执行并隔离旧结果，防止同一个画布并发替换。
  queue = queue.then(async () => {
    if (disposed || request !== sequence || !viewer) return
    if (!xml) { viewer.clear(); return }
    try {
      const result = await viewer.importXML(xml)
      if (disposed || request !== sequence) return
      marked = []
      highlight()
      fit()
      if (result.warnings.length) warning.value = '流程图包含 ' + result.warnings.length + ' 条导入警告，部分图形可能未显示；可下载原始 XML 核对。'
    } catch (cause) {
      if (!disposed && request === sequence) error.value = cause instanceof Error ? cause.message : '流程图无法显示，请查看原始 XML'
    } finally {
      if (!disposed && request === sequence) busy.value = false
    }
  })
}
watch(() => props.xml, render)
watch(() => props.activeIds, () => { if (!busy.value) highlight() }, { deep: true })
onMounted(() => {
  if (!host.value) return
  viewer = new NavigatedViewer({ container: host.value, moddleExtensions: { camunda: camundaDescriptor } })
  observer = new ResizeObserver(() => { if (!disposed && !busy.value) viewer?.get<Canvas>('canvas').resized() })
  observer.observe(host.value)
  render()
})
onBeforeUnmount(() => {
  disposed = true
  sequence += 1
  observer?.disconnect()
  void queue.finally(() => { viewer?.destroy(); viewer = undefined })
})
</script>

<template>
  <section class="process-diagram" aria-label="只读流程图">
    <div class="diagram-toolbar">
      <span>{{ activeIds.length ? '绿色描边：当前活动或异步等待节点' : '已部署流程图 · 只读' }}</span>
      <ElButton size="small" :disabled="busy || !xml || Boolean(error)" @click="fit">适应画布</ElButton>
    </div>
    <ElAlert v-if="error" type="error" :title="error" :closable="false" />
    <ElAlert v-if="warning" type="warning" :title="warning" :closable="false" />
    <div class="diagram-content" :aria-busy="busy">
      <div ref="host" class="diagram-canvas" :class="{ hidden: busy || !xml || error }" />
      <p v-if="busy || !xml" class="diagram-placeholder">{{ busy ? '加载流程图…' : '选择记录后加载流程图' }}</p>
    </div>
  </section>
</template>

<style scoped>
.process-diagram { margin-top: 14px; border: 1px solid #e1e9e4; border-radius: 8px; background: #fff; overflow: hidden; }
.diagram-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #e1e9e4; color: #557568; font-size: 12px; }
.diagram-content { position: relative; }
.diagram-canvas { height: 360px; }
.diagram-canvas.hidden { visibility: hidden; }
.diagram-placeholder { position: absolute; inset: 40% 0 auto; text-align: center; color: #72857c; }
:deep(.runtime-active .djs-visual > :first-child) { stroke: #16845b !important; stroke-width: 4px !important; }
@media (max-width: 760px) { .diagram-canvas { height: 280px; } }
</style>
