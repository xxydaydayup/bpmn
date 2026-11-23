<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ElButton, ElDialog, ElOption, ElSelect, ElMessage } from 'element-plus'
import { View } from '@element-plus/icons-vue'
import { businessWorkflowGateway } from '@/api/workflow'
import type { TaskTemplate } from '@/api/workflow/types'

const templates = shallowRef<TaskTemplate[]>([])
const selectedKey = ref('')
const loadingTemplates = ref(false)
const previewVisible = ref(false)
const previewUrl = ref('')
let listController: AbortController | undefined
let disposed = false

const selectedTemplate = computed(() => templates.value.find(item => item.taskKey === selectedKey.value))

async function loadTemplates() {
  listController?.abort()
  const controller = listController = new AbortController()
  loadingTemplates.value = true
  try {
    const rows: TaskTemplate[] = []
    for (let firstResult = 0; ; firstResult += 100) {
      const page = await businessWorkflowGateway.listTemplates({ firstResult, maxResults: 100 }, controller.signal)
      rows.push(...page)
      if (page.length < 100) break
    }
    if (disposed || controller !== listController || controller.signal.aborted) return
    templates.value = rows
    if (selectedKey.value && !rows.some(row => row.taskKey === selectedKey.value)) {
      selectedKey.value = ''
      previewVisible.value = false
      previewUrl.value = ''
    }
  } catch (cause) {
    if (!disposed && controller === listController && !controller.signal.aborted) {
      ElMessage.error(cause instanceof Error ? cause.message : '加载流程模板失败')
    }
  } finally {
    if (!disposed && controller === listController) loadingTemplates.value = false
  }
}

function openPreview() {
  const template = selectedTemplate.value
  if (!template) return
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
  const target = new URL(base + 'workflow-preview', window.location.origin)
  target.search = new URLSearchParams({ templateKey: template.taskKey }).toString()
  previewUrl.value = target.toString()
  previewVisible.value = true
}

function onSelectionChange() {
  previewVisible.value = false
  previewUrl.value = ''
}

function closePreview() {
  previewUrl.value = ''
}

onMounted(() => { void loadTemplates() })
onBeforeUnmount(() => { disposed = true; listController?.abort() })
</script>

<template>
  <section class="template-preview-page">
    <label for="workflow-template-select">流程模板</label>
    <div class="picker-row">
      <ElSelect
        id="workflow-template-select"
        v-model="selectedKey"
        class="template-select"
        filterable
        clearable
        :loading="loadingTemplates"
        :disabled="loadingTemplates"
        placeholder="请选择流程模板"
        aria-label="选择流程模板"
        @change="onSelectionChange"
      >
        <ElOption
          v-for="template in templates"
          :key="template.taskKey"
          :value="template.taskKey"
          :label="template.taskName + ' · ' + template.taskKey + ' · v' + template.version"
        />
      </ElSelect>
      <ElButton
        class="preview-button"
        circle
        :icon="View"
        :disabled="!selectedKey || loadingTemplates"
        aria-label="预览流程模板"
        title="预览流程模板"
        @click="openPreview"
      />
    </div>

    <ElDialog
      v-model="previewVisible"
      title="流程预览"
      width="min(1100px, calc(100vw - 32px))"
      top="5vh"
      destroy-on-close
      @closed="closePreview"
    >
      <iframe
        v-if="previewUrl"
        :key="previewUrl"
        :src="previewUrl"
        title="流程预览"
        loading="lazy"
        referrerpolicy="same-origin"
      />
    </ElDialog>
  </section>
</template>

<style scoped>
.template-preview-page { display: grid; grid-template-columns: auto minmax(260px, 520px); align-items: center; gap: 12px; max-width: 680px; }
.template-preview-page > label { color: var(--color-text); font-size: 14px; white-space: nowrap; }
.picker-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.template-select { min-width: 0; flex: 1; }
.preview-button { width: 40px; height: 40px; }
iframe { display: block; width: 100%; height: min(72vh, 720px); min-height: 440px; border: 0; }
@media (max-width: 520px) {
  .template-preview-page { grid-template-columns: 1fr; gap: 6px; }
  iframe { height: 68vh; min-height: 380px; }
}
</style>

