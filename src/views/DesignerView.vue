<script setup lang="ts">
import { ref } from 'vue'
import { ElAlert, ElButton, ElMessage, ElTooltip } from 'element-plus'
import { Download, FullScreen, RefreshLeft, RefreshRight, Upload } from '@element-plus/icons-vue'
import NodePropertiesPanel from '@/components/designer/NodePropertiesPanel.vue'
import { useBpmnDesigner } from '@/composables/useBpmnDesigner'
import { diagramTheme } from '@/bpmn/theme'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

const container = ref<HTMLDivElement>()
const fileInput = ref<HTMLInputElement>()
const {
  ready, initialized, busy, error, warning, selectedNode, canUndo, canRedo,
  fitViewport, importXML, exportXML, updateProperty, undo, redo,
} = useBpmnDesigner(container)
const canvasStyle = {
  '--diagram-background': diagramTheme.canvas.background,
  '--diagram-grid': diagramTheme.canvas.grid,
  '--diagram-accent': diagramTheme.canvas.accent,
}

async function importDiagram(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || busy.value) return
  try {
    if (await importXML(await file.text())) ElMessage.success('流程已导入')
  } catch {
    ElMessage.error('文件读取失败，请重新选择')
  } finally {
    input.value = ''
  }
}

async function exportDiagram() {
  try {
    const xml = await exportXML()
    if (!xml) return
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'requirement-process.bpmn'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    ElMessage.error('导出失败，请重试')
  }
}
</script>

<template>
  <section class="designer-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">WORKSPACE / DESIGNER</p>
        <h1>流程设计</h1>
        <p class="page-description">从提交到确认。选择一个节点，为需求流程配置办理人和表单。</p>
      </div>
      <div class="example-caption"><span></span>需求确认 · 最小示例</div>
    </div>
    <div class="surface designer-surface">
      <div class="designer-toolbar">
        <div class="canvas-toolbar-start">
          <span class="table-title">流程画布</span>
          <div class="history-actions">
            <ElTooltip content="撤销" placement="top">
              <ElButton text :icon="RefreshLeft" aria-label="撤销" :disabled="!canUndo || busy" @click="undo" />
            </ElTooltip>
            <ElTooltip content="重做" placement="top">
              <ElButton text :icon="RefreshRight" aria-label="重做" :disabled="!canRedo || busy" @click="redo" />
            </ElTooltip>
          </div>
        </div>
        <div class="toolbar-actions">
          <input ref="fileInput" class="visually-hidden" type="file" accept=".bpmn,.xml" aria-label="选择 BPMN 文件" @change="importDiagram" />
          <ElButton :icon="Upload" :loading="busy" :disabled="!initialized || busy" @click="fileInput?.click()">导入 XML</ElButton>
          <ElButton :icon="FullScreen" :disabled="!ready || busy" @click="fitViewport">适应画布</ElButton>
          <ElButton type="primary" :icon="Download" :disabled="!ready || busy" @click="exportDiagram">导出 XML</ElButton>
        </div>
      </div>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <ElAlert v-if="warning" :title="warning" type="warning" :closable="false" show-icon />
      <div class="designer-workspace">
        <div class="diagram-area" :style="canvasStyle">
          <div ref="container" class="bpmn-canvas" aria-label="BPMN 流程编辑器"></div>
          <div class="canvas-footer"><span>点击节点编辑属性 · 拖动节点调整布局</span><span>Ctrl / ⌘ + Z 撤销</span></div>
        </div>
        <NodePropertiesPanel :node="selectedNode" :disabled="busy || !ready" @update="updateProperty" />
      </div>
    </div>
    <p class="page-note">修改仅保留在当前页面，离开前请导出 XML。再次导入可继续编辑节点属性与流程布局。</p>
  </section>
</template>

<style scoped>
.example-caption { display: flex; align-items: center; gap: 8px; align-self: flex-end; padding-bottom: 5px; white-space: nowrap; color: #778a7d; font-size: 12px; }
.example-caption span { width: 6px; height: 6px; border-radius: 50%; background: #739d83; }
.canvas-toolbar-start { display: flex; align-items: center; gap: 22px; }
.history-actions { display: flex; align-items: center; border-left: 1px solid #e3e9e5; padding-left: 12px; }
.history-actions .el-button { width: 30px; height: 30px; margin: 0; padding: 0; }
.designer-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 286px; }
.diagram-area { display: flex; flex-direction: column; min-width: 0; background: var(--diagram-background); }
.bpmn-canvas { flex: 1; min-height: 490px; background-color: var(--diagram-background); background-image: radial-gradient(var(--diagram-grid) .75px, transparent .75px); }
.bpmn-canvas :deep(.djs-parent) {
  --accent-color: var(--diagram-accent);
  --element-hover-outline-fill-color: var(--diagram-accent);
  --element-selected-outline-secondary-stroke-color: var(--diagram-accent);
  --palette-entry-hover-color: var(--diagram-accent);
}
.canvas-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 16px; padding: 12px 18px; color: #84988a; font-size: 10px; border-top: 1px solid #e8eeea; background: #fafcfb; }
@media (max-width: 1100px) and (min-width: 761px) {
  .designer-workspace { grid-template-columns: minmax(0, 1fr) 252px; }
  .example-caption { display: none; }
}
@media (max-width: 760px) {
  .example-caption { align-self: flex-start; }
  .designer-workspace { grid-template-columns: minmax(0, 1fr); }
  .bpmn-canvas { height: 410px; min-height: 410px; flex: auto; }
  .canvas-footer { padding: 12px; }
}
</style>
