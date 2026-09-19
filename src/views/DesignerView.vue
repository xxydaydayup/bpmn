<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElMessage } from 'element-plus'
import { Download, FullScreen, Upload } from '@element-plus/icons-vue'
import Modeler from 'bpmn-js/lib/Modeler'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

const container = ref<HTMLDivElement>()
const fileInput = ref<HTMLInputElement>()
const ready = ref(false)
const initialized = ref(false)
const busy = ref(false)
const error = ref('')
let modeler: Modeler | undefined
let disposed = false

function fitViewport() {
  modeler?.get<{ zoom: (value: string) => void }>('canvas').zoom('fit-viewport')
}

onMounted(async () => {
  if (!container.value) return
  try {
    modeler = new Modeler({ container: container.value })
    await modeler.createDiagram()
    if (disposed) return
    initialized.value = true
    ready.value = true
    fitViewport()
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '画布初始化失败'
  }
})

async function importDiagram(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !modeler) return
  busy.value = true
  try {
    const xml = await file.text()
    if (disposed) return
    await modeler.importXML(xml)
    if (disposed) return
    error.value = ''
    ready.value = true
    fitViewport()
    ElMessage.success('流程已导入')
  } catch (cause) {
    if (!disposed) {
      ready.value = false
      error.value = cause instanceof Error ? cause.message : '导入失败，请检查 BPMN 文件'
    }
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function exportDiagram() {
  if (!modeler) return
  try {
    const { xml } = await modeler.saveXML({ format: true })
    if (!xml || disposed) return
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'process.bpmn'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    if (!disposed) ElMessage.error('导出失败，请重试')
  }
}

onBeforeUnmount(() => {
  disposed = true
  modeler?.destroy()
  modeler = undefined
})
</script>

<template>
  <section class="designer-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">WORKSPACE / DESIGNER</p>
        <h1>流程设计</h1>
        <p class="page-description">从左侧工具栏添加节点，连接并绘制你的第一个流程。</p>
      </div>
    </div>
    <div class="surface designer-surface">
      <div class="designer-toolbar">
        <span class="table-title">BPMN 画布</span>
        <div class="toolbar-actions">
          <input ref="fileInput" class="visually-hidden" type="file" accept=".bpmn,.xml" aria-label="选择 BPMN 文件" @change="importDiagram" />
          <ElButton :icon="Upload" :loading="busy" :disabled="!initialized" @click="fileInput?.click()">导入 XML</ElButton>
          <ElButton :icon="FullScreen" :disabled="!ready || busy" @click="fitViewport">适应画布</ElButton>
          <ElButton type="primary" :icon="Download" :disabled="!ready || busy" @click="exportDiagram">导出 XML</ElButton>
        </div>
      </div>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <div ref="container" class="bpmn-canvas" aria-label="BPMN 流程编辑器"></div>
    </div>
    <p class="page-note">画布内容仅保留在当前页面，离开前请导出 XML 保存。点击画布后可用 Ctrl / ⌘ + Z 撤销。</p>
  </section>
</template>
