<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElAlert, ElButton, ElDialog, ElMessage } from 'element-plus'
import { CopyDocument, Upload } from '@element-plus/icons-vue'
import NodePropertiesPanel from '@/components/designer/NodePropertiesPanel.vue'
import NodeLibrary from '@/components/designer/NodeLibrary.vue'
import DiagramIcon from '@/components/designer/DiagramIcon.vue'
import WorkflowValidationPanel from '@/components/designer/WorkflowValidationPanel.vue'
import { workflowTemplates } from '@/bpmn/templates'
import { useBpmnDesigner } from '@/composables/useBpmnDesigner'
import { diagramCSSVariables, themePresets, type ThemeId } from '@/bpmn/theme'
import '@/styles/designer.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

const container = ref<HTMLDivElement>()
const fileInput = ref<HTMLInputElement>()
const xmlDialogVisible = ref(false)
const xmlDraft = ref('')
const xmlDialogMode = ref<'edit' | 'import'>('edit')
const xmlDialogError = ref('')
const xmlTextarea = ref<HTMLTextAreaElement>()
const previewLoading = ref(false)
const copyingXML = ref(false)
const readingXMLFile = ref(false)
const applyingXML = ref(false)
const showValidation = ref(false)
const templateDialogVisible = ref(false)
const selectedTemplateId = ref<string>(workflowTemplates[0].id)
const templateError = ref('')
const libraryCollapsed = ref(false)
const propertiesVisible = ref(!window.matchMedia('(max-width: 760px)').matches)
const {
  ready, initialized, busy, error, warning, selectedNode, canUndo, canRedo,
  fitViewport, importXML, exportXML, updateProperty, undo, redo,
  propertyError, validationIssues, checkWorkflow, locateElement, showProcessProperties,
  processName, diagramCounts, zoomPercent, zoomBy, activateHand, createNode, arrangeLayout, canArrange, layoutReason, layoutStatus,
  themeSnapshot, setTheme,
} = useBpmnDesigner(container)
const xmlDialogBusy = computed(() => busy.value || readingXMLFile.value || applyingXML.value || copyingXML.value)
const canvasStyle = computed(() => diagramCSSVariables(themeSnapshot.value))
const themeOptions = Object.values(themePresets)

function handleThemeChange(event: Event) {
  const id = (event.target as HTMLSelectElement).value as ThemeId
  setTheme(id)
}

async function togglePanel(panel: 'library' | 'properties') {
  if (panel === 'library') libraryCollapsed.value = !libraryCollapsed.value
  else propertiesVisible.value = !propertiesVisible.value
  await nextTick()
  fitViewport()
}

async function organizeDiagram() {
  if (await arrangeLayout()) ElMessage.success('布局已整理，可撤销')
}

function inspectProcess() {
  propertiesVisible.value = true
  showProcessProperties()
}

function openXMLImport() {
  if (!initialized.value || xmlDialogBusy.value || previewLoading.value) return
  xmlDialogMode.value = 'import'
  xmlDraft.value = ''
  xmlDialogError.value = ''
  xmlDialogVisible.value = true
}

async function readXMLFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || xmlDialogBusy.value) return
  readingXMLFile.value = true
  xmlDialogError.value = ''
  try {
    xmlDraft.value = await file.text()
  } catch {
    xmlDialogError.value = '文件读取失败，请重新选择或粘贴 XML'
  } finally {
    readingXMLFile.value = false
    input.value = ''
  }
}

async function exportDiagram() {
  if (!ready.value || busy.value) return
  if (checkWorkflow().some(issue => issue.severity === 'error')) {
    showValidation.value = true
    ElMessage.error('流程存在错误，请修复后再导出；仍可编辑和复制 XML')
    return
  }
  try {
    const xml = await exportXML()
    if (!xml) return
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${processName.value.replace(/[\\/:*?"<>|]/g, '_') || 'process'}.bpmn`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    ElMessage.error('导出失败，请重试')
  }
}

function inspectWorkflow() {
  checkWorkflow()
  showValidation.value = true
}

async function applyTemplate() {
  if (busy.value) return
  const template = workflowTemplates.find(item => item.id === selectedTemplateId.value)
  if (!template) return
  templateError.value = ''
  if (await importXML(template.xml)) {
    templateDialogVisible.value = false
    ElMessage.success(`已载入${template.name}`)
  } else templateError.value = error.value || '模板载入失败，请重试'
}

async function previewDiagram() {
  if (previewLoading.value || xmlDialogBusy.value) return
  previewLoading.value = true
  try {
    const xml = await exportXML()
    if (!xml) return
    xmlDialogMode.value = 'edit'
    xmlDraft.value = xml
    xmlDialogError.value = ''
    xmlDialogVisible.value = true
  } catch {
    ElMessage.error('XML 加载失败，请重试')
  } finally {
    previewLoading.value = false
  }
}

async function applyXMLDraft() {
  if (!initialized.value || xmlDialogBusy.value) return
  if (!xmlDraft.value.trim()) {
    xmlDialogError.value = '请先输入或粘贴 BPMN XML'
    return
  }
  applyingXML.value = true
  xmlDialogError.value = ''
  try {
    if (await importXML(xmlDraft.value)) {
      xmlDialogVisible.value = false
      ElMessage.success(xmlDialogMode.value === 'import' ? '流程已导入' : 'XML 已应用到画布')
    } else {
      xmlDialogError.value = error.value || '导入失败，请检查 XML 后重试'
    }
  } catch {
    xmlDialogError.value = '导入失败，请检查 XML 后重试'
  } finally {
    applyingXML.value = false
  }
}

function focusXMLPreview() {
  const textarea = xmlTextarea.value
  if (!textarea) return
  textarea.focus()
  textarea.setSelectionRange(0, 0)
  textarea.scrollTop = 0
  textarea.scrollLeft = 0
}

async function copyXML() {
  if (!xmlDraft.value || xmlDialogBusy.value) return
  copyingXML.value = true
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(xmlDraft.value)
    ElMessage.success('XML 已复制')
  } catch {
    const textarea = xmlTextarea.value
    if (!textarea) return
    textarea.focus()
    textarea.select()
    let copied = false
    try {
      // Support HTTP environments where the Clipboard API is unavailable.
      copied = document.execCommand('copy')
    } catch {
      // Keep the text selected so it can still be copied with the keyboard.
    }
    if (copied) ElMessage.success('XML 已复制')
    else ElMessage.warning('XML 已全选，请按 Ctrl+C（Mac 为 ⌘C）复制')
  } finally {
    copyingXML.value = false
  }
}
</script>

<template>
  <section class="designer-page" :style="canvasStyle">
    <header class="designer-document-header">
      <div class="designer-document-title"><div class="designer-breadcrumb">工作空间 <span>/</span> 流程设计</div><div class="designer-title-line"><h1>{{ processName }}</h1><span class="designer-draft">本地草稿</span></div></div>
      <div class="designer-document-actions">
        <label class="designer-theme-picker"><span>主题</span><select :value="themeSnapshot.id" aria-label="选择画布主题" :disabled="!initialized || busy" @change="handleThemeChange"><option v-for="theme in themeOptions" :key="theme.id" :value="theme.id">{{ theme.label }}</option></select></label>
        <button class="designer-button" :disabled="!initialized || busy" aria-label="流程模板" title="流程模板" @click="templateError = ''; templateDialogVisible = true"><DiagramIcon name="template" /><span>流程模板</span></button>
        <button class="designer-button" :disabled="!initialized || busy || previewLoading" aria-label="导入 XML" title="导入 XML" @click="openXMLImport"><DiagramIcon name="upload" /><span>导入 XML</span></button>
        <button class="designer-button" :disabled="!ready || busy" aria-label="检查流程" title="检查流程" @click="inspectWorkflow"><DiagramIcon name="check" /><span>流程检查</span></button>
        <button class="designer-button primary" :disabled="!ready || busy" aria-label="导出 XML" title="导出 XML" @click="exportDiagram"><DiagramIcon name="download" /><span>导出 XML</span></button>
      </div>
    </header>
    <div class="designer-surface">
      <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <ElAlert v-if="warning" :title="warning" type="warning" :closable="false" show-icon />
      <WorkflowValidationPanel v-if="showValidation" :issues="validationIssues" :disabled="busy" @locate="locateElement" @close="showValidation = false" />
      <div class="designer-workspace" :class="{ 'is-library-collapsed': libraryCollapsed, 'is-properties-hidden': !propertiesVisible }">
        <NodeLibrary :disabled="!ready || busy" :collapsed="libraryCollapsed" @toggle="togglePanel('library')" @create="createNode" @drag="createNode" />
        <div class="diagram-area">
          <div class="designer-canvas-toolbar">
            <div class="designer-tools">
              <button class="designer-icon-button" aria-label="流程属性" title="流程属性" :disabled="!ready || busy" @click="inspectProcess"><DiagramIcon name="settings" /></button>
              <button class="designer-icon-button hand-tool" aria-label="移动画布" title="移动画布" :disabled="!ready || busy" @click="activateHand"><DiagramIcon name="hand" /></button>
              <span class="designer-tool-divider"></span>
              <button class="designer-icon-button" aria-label="撤销" title="撤销" :disabled="!canUndo || busy" @click="undo"><DiagramIcon name="undo" /></button>
              <button class="designer-icon-button" aria-label="重做" title="重做" :disabled="!canRedo || busy" @click="redo"><DiagramIcon name="redo" /></button>
            </div>
            <div class="designer-tools">
              <button class="designer-text-button" :disabled="!ready || busy || !canArrange" :title="layoutReason || '整理布局，支持整体撤销'" @click="organizeDiagram"><DiagramIcon name="layout" /><span>整理布局</span></button>
              <span class="designer-tool-divider"></span>
              <button class="designer-icon-button" aria-label="编辑 XML" title="编辑 XML" :disabled="!ready || busy || previewLoading" @click="previewDiagram"><DiagramIcon name="code" /></button>
              <button class="designer-icon-button" aria-label="显示或隐藏属性面板" title="显示或隐藏属性面板" :aria-expanded="propertiesVisible" @click="togglePanel('properties')"><DiagramIcon name="properties" /></button>
            </div>
          </div>
          <div class="canvas-stage" :aria-busy="busy">
            <div class="canvas-caption"><span></span>{{ processName }}<b>/</b>流程设计</div>
            <div ref="container" class="bpmn-canvas" aria-label="BPMN 流程编辑器" :inert="busy || !ready"></div>
            <div v-if="busy" class="canvas-working" role="status">正在处理流程…</div>
            <div class="canvas-bottom-controls">
              <div class="canvas-legend"><span><b class="human-dot"></b>人工任务</span><span><b class="service-dot"></b>服务任务</span><span><b class="branch-dot"></b>分支</span></div>
              <div class="canvas-zoom">
                <button class="designer-icon-button" aria-label="缩小画布" title="缩小" :disabled="!ready || busy" @click="zoomBy(-.1)"><DiagramIcon name="zoomOut" /></button><span>{{ zoomPercent }}%</span>
                <button class="designer-icon-button" aria-label="放大画布" title="放大" :disabled="!ready || busy" @click="zoomBy(.1)"><DiagramIcon name="zoomIn" /></button><b></b>
                <button class="designer-icon-button" aria-label="适应画布" title="适应画布" :disabled="!ready || busy" @click="fitViewport"><DiagramIcon name="fit" /></button>
              </div>
            </div>
          </div>
          <div class="designer-canvas-status"><span>{{ selectedNode?.name || selectedNode?.id || '选择节点或连线' }}</span><span>{{ diagramCounts.nodes }} 个节点 <b>/</b> {{ diagramCounts.flows }} 条连线</span></div>
        </div>
        <NodePropertiesPanel v-show="propertiesVisible" :node="selectedNode" :disabled="busy || !ready" :error="propertyError" @update="updateProperty" @close="togglePanel('properties')" />
      </div>
    </div>
    <footer class="designer-footer"><span><b></b>修改未自动保存，离开前请导出或复制 XML。</span><span>{{ layoutStatus || 'BPMN 设计文件' }}</span></footer>
    <ElDialog v-model="templateDialogVisible" title="流程模板" width="min(600px, calc(100vw - 32px))" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" append-to-body>
      <p class="template-notice">使用模板将替换当前画布并重置撤销记录。需要保留当前设计时，可先导出或复制 XML。</p>
      <div class="template-options" role="radiogroup" aria-label="选择流程模板">
        <label v-for="template in workflowTemplates" :key="template.id" class="template-option">
          <input v-model="selectedTemplateId" type="radio" name="workflow-template" :value="template.id" :disabled="busy" />
          <span><strong>{{ template.name }}</strong><small>{{ template.description }}</small></span>
        </label>
      </div>
      <ElAlert v-if="templateError" :title="templateError" type="error" :closable="false" show-icon />
      <template #footer>
        <ElButton :disabled="busy" @click="templateDialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="busy" @click="applyTemplate">使用模板</ElButton>
      </template>
    </ElDialog>
    <ElDialog
      v-model="xmlDialogVisible"
      :title="xmlDialogMode === 'import' ? '导入 XML' : '编辑流程 XML'"
      width="min(960px, calc(100vw - 32px))"
      top="6vh"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :close-on-press-escape="!xmlDialogBusy"
      :show-close="!xmlDialogBusy"
      @opened="focusXMLPreview"
    >
      <div class="xml-dialog-toolbar">
        <p>可编辑或粘贴 XML，应用后会替换当前流程并重置画布撤销记录。</p>
        <template v-if="xmlDialogMode === 'import'">
          <input ref="fileInput" class="visually-hidden" type="file" accept=".bpmn,.xml" aria-label="选择 BPMN 文件" @change="readXMLFile" />
          <ElButton :icon="Upload" :loading="readingXMLFile" :disabled="xmlDialogBusy" @click="fileInput?.click()">选择文件</ElButton>
        </template>
      </div>
      <ElAlert v-if="xmlDialogError" class="xml-dialog-error" :title="xmlDialogError" type="error" :closable="false" show-icon />
      <textarea
        ref="xmlTextarea"
        v-model="xmlDraft"
        class="xml-preview"
        aria-label="BPMN XML 文本"
        placeholder="在此粘贴 BPMN XML，或选择 .bpmn / .xml 文件"
        :readonly="xmlDialogBusy"
        spellcheck="false"
        wrap="off"
        @input="xmlDialogError = ''"
      ></textarea>
      <template #footer>
        <div class="xml-dialog-actions">
          <ElButton :disabled="xmlDialogBusy" @click="xmlDialogVisible = false">取消</ElButton>
          <ElButton :icon="CopyDocument" :loading="copyingXML" :disabled="xmlDialogBusy || !xmlDraft" @click="copyXML">复制 XML</ElButton>
          <ElButton type="primary" :loading="applyingXML" :disabled="!initialized || xmlDialogBusy || !xmlDraft.trim()" @click="applyXMLDraft">
            {{ xmlDialogMode === 'import' ? '导入到画布' : '应用到画布' }}
          </ElButton>
        </div>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.template-notice { margin: 0 0 16px; color: #718176; font-size: 12px; line-height: 1.8; }
.template-options { display: grid; gap: 12px; margin-bottom: 12px; }
.template-option { display: flex; align-items: flex-start; gap: 12px; padding: 18px; border: 1px solid #dce5df; border-radius: 5px; cursor: pointer; }
.template-option:has(input:checked) { border-color: #24745e; background: #f2f8f4; }
.template-option input { accent-color: #24745e; }
.template-option strong { display: block; font-size: 14px; }
.template-option small { display: block; margin-top: 8px; color: #718176; line-height: 1.7; }
.xml-dialog-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.xml-dialog-toolbar p { flex: 1; min-width: 180px; margin: 0; color: #718176; font-size: 12px; line-height: 1.7; }
.xml-dialog-error { margin-bottom: 12px; }
.xml-dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.xml-dialog-actions .el-button + .el-button { margin-left: 0; }
.xml-preview { display: block; width: 100%; height: 50vh; resize: none; padding: 16px; border: 1px solid #dce5df; border-radius: 5px; background: #fafcfb; color: #243c36; font: 13px/1.7 'SFMono-Regular', Consolas, monospace; tab-size: 2; }
.xml-preview:focus { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.designer-theme-picker { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; color: #718176; font-size: 12px; }
.designer-theme-picker select { min-width: 88px; height: 32px; padding: 0 24px 0 10px; border: 1px solid #dce5df; border-radius: 4px; background: #fff; color: #293a34; font: inherit; }
.designer-theme-picker select:focus { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
@media (max-width: 760px) {
  .designer-theme-picker > span { display: none; }
  .designer-theme-picker select { min-width: 76px; height: 33px; padding-left: 8px; padding-right: 18px; }
}
</style>
