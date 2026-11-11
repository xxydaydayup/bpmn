<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElButton, ElDialog, ElInput, ElMessage, ElMessageBox } from 'element-plus'
import { WorkflowDesigner, type WorkflowDesignDocument, type WorkflowInput, type WorkflowModel } from '@workflow/designer'
import type { WorkflowSubProcessDisplayJson } from '@workflow/designer/types'
import type { WorkflowSubProcessFragment } from '@workflow/designer/types'
import '@workflow/designer/style.css'
import { createNodeRecord, createDesignDocument } from '@workflow/designer'
import { subProcessLibraryGateway } from '@/api/workflow'
import DataTable, { type DataTableColumn } from '@/components/common/DataTable'
import { diagramCSSVariables } from '@/bpmn/theme'

const route = useRoute()
const router = useRouter()
const isEditing = computed(() => route.query.editor === '1')
const editingKey = computed(() => typeof route.query.key === 'string' ? route.query.key : '')
const searchText = ref('')
const fragments = ref<WorkflowSubProcessFragment[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const hasMore = ref(true)
const pageSize = 20
const deletingKey = ref('')
const saving = ref(false)
const metadataOpen = ref(false)
const fragmentName = ref('')
const fragmentDescription = ref('')
const design = shallowRef<WorkflowInput>()
const blankModel = (): WorkflowModel => ({ processId: 'fragment', processName: '新建片段', nodes: [createNodeRecord('approval', 'approval_initial', 300, 180)], flows: [] })
const editorRef = ref<{ exportDesign: () => WorkflowDesignDocument | Record<string, unknown>; validate: () => { code: string; message: string }[]; check: () => void }>()
const editorExtensions = { nodeTypes: ['start', 'approval', 'countersign', 'condition', 'service', 'receive', 'timer', 'subProcess', 'end'] as const, subprocessFragments: subProcessLibraryGateway }
const canvasStyle = computed(() => diagramCSSVariables())
const columns = computed<DataTableColumn<WorkflowSubProcessFragment>[]>(() => [
  { key: 'name', prop: 'name', label: '片段名称', minWidth: 220 },
  { key: 'key', prop: 'key', label: 'Key', minWidth: 190, showOverflowTooltip: true },
  {
    key: 'content', label: '内容', width: 144,
    formatter: ({ row }) => `${row.displayJson.nodes.length} 节点 · ${row.displayJson.flows?.length ?? 0} 连线`,
  },
  {
    key: 'updatedAt', prop: 'updatedAt', label: '最近更新', minWidth: 175,
    formatter: ({ value }) => {
      if (typeof value !== 'string' || !value) return '—'
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
    },
  },
  {
    key: 'actions', label: '操作', width: 148, align: 'center', fixed: 'right',
    buttons: [
      { key: 'edit', label: '编辑', type: 'primary', onClick: ({ row }) => editFragment(row) },
      { key: 'delete', label: '删除', type: 'danger', disabled: ({ row }) => deletingKey.value === row.key, onClick: ({ row }) => deleteFragment(row) },
    ],
  },
])
let requestController: AbortController | undefined
let listRequestGeneration = 0
let searchTimer: number | undefined
let lastSavedModel = ''
let allowNavigationOnce = false

async function load(reset = true) {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  const generation = ++listRequestGeneration
  if (reset) { fragments.value = []; hasMore.value = true; loading.value = true }
  else loadingMore.value = true
  error.value = ''
  const offset = reset ? 0 : fragments.value.length
  try {
    const rows = await subProcessLibraryGateway.listPage({
      name: searchText.value.trim(), key: searchText.value.trim(), firstResult: offset, maxResults: pageSize,
    }, controller.signal)
    if (reset) fragments.value = rows
    else fragments.value = [...fragments.value, ...rows]
    hasMore.value = rows.length === pageSize
  } catch (cause) {
    if (!controller.signal.aborted && generation === listRequestGeneration) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (generation === listRequestGeneration) { loading.value = false; loadingMore.value = false }
  }
}

function search() { void load(true) }
function scheduleSearch() { if (searchTimer) window.clearTimeout(searchTimer); searchTimer = window.setTimeout(search, 280) }

async function createFragment() {
  fragmentName.value = ''
  fragmentDescription.value = ''
  design.value = createDesignDocument(blankModel())
  metadataOpen.value = true
}

async function editFragment(row: WorkflowSubProcessFragment) {
  await router.push({ path: '/sub-processes', query: { editor: '1', key: row.key } })
}

async function confirmMetadata() {
  if (!fragmentName.value.trim()) { ElMessage.warning('请填写片段名称。'); return }
  metadataOpen.value = false
  editorName.value = fragmentName.value
  editorDescription.value = fragmentDescription.value
  await router.push({ path: '/sub-processes', query: { editor: '1', new: '1' } })
}

const editorName = ref('')
const editorDescription = ref('')
const initialLoadedKey = ref('')
const editorLoadGeneration = ref(0)
async function loadEditor() {
  if (!isEditing.value) return
  if (route.query.new === '1') {
    editorName.value = fragmentName.value
    editorDescription.value = fragmentDescription.value
    design.value = design.value ?? createDesignDocument(blankModel())
    return
  }
  if (!editingKey.value || initialLoadedKey.value === editingKey.value) return
  const generation = ++editorLoadGeneration.value
  loading.value = true
  error.value = ''
  try {
    const fragment = await subProcessLibraryGateway.get(editingKey.value)
    if (generation !== editorLoadGeneration.value) return
    editorName.value = fragment.name
    editorDescription.value = fragment.description ?? ''
    design.value = createDesignDocument({
      ...fragment.displayJson,
      processId: fragment.displayJson.processId || fragment.key,
      processName: fragment.displayJson.processName || fragment.name,
      nodes: fragment.displayJson.nodes ?? [],
      flows: fragment.displayJson.flows ?? [],
    })
    lastSavedModel = JSON.stringify({ name: editorName.value.trim(), description: editorDescription.value.trim(), model: { processId: fragment.displayJson.processId, processName: fragment.displayJson.processName, bizFormKey: fragment.displayJson.bizFormKey, nodes: fragment.displayJson.nodes, flows: fragment.displayJson.flows } })
    initialLoadedKey.value = fragment.key
  } catch (cause) { if (generation === editorLoadGeneration.value) error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { if (generation === editorLoadGeneration.value) loading.value = false }
}

async function save() {
  if (saving.value || !design.value) return
  const issues = editorRef.value?.validate() ?? [{ code: 'editor-loading', message: '片段编辑器还没有准备好。' }]
  if (issues.length) {
    editorRef.value?.check()
    ElMessage.warning('请先修复片段中的结构问题。')
    return
  }
  const model = editorRef.value?.exportDesign().model as WorkflowModel | undefined
  if (!model || model.nodes.length === 0) { ElMessage.warning('子流程片段至少需要一个节点。'); return }
  if (!editorName.value.trim()) { ElMessage.warning('请填写片段名称。'); return }
  const signature = JSON.stringify({ name: editorName.value.trim(), description: editorDescription.value.trim(), model: { processId: model.processId, processName: model.processName, bizFormKey: model.bizFormKey, nodes: model.nodes, flows: model.flows } })
  if (editingKey.value && signature === lastSavedModel) { ElMessage.info('内容没有变化，无需保存。'); return }
  saving.value = true
  try {
    const content: WorkflowSubProcessDisplayJson = { processId: model.processId, processName: model.processName, nodes: model.nodes, flows: model.flows, width: model.width, height: model.height }
    if (editingKey.value) {
      const saved = await subProcessLibraryGateway.update(editingKey.value, { name: editorName.value, description: editorDescription.value, displayJson: content })
      editorName.value = saved.name
      editorDescription.value = saved.description ?? ''
      lastSavedModel = JSON.stringify({ name: saved.name.trim(), description: (saved.description ?? '').trim(), model: { processId: saved.displayJson.processId, processName: saved.displayJson.processName, bizFormKey: saved.displayJson.bizFormKey, nodes: saved.displayJson.nodes, flows: saved.displayJson.flows } })
      ElMessage.success('子流程片段已保存。')
    } else {
      const saved = await subProcessLibraryGateway.create({ name: editorName.value, description: editorDescription.value, displayJson: content })
      editorName.value = saved.name
      lastSavedModel = JSON.stringify({ name: saved.name.trim(), description: (saved.description ?? '').trim(), model: { processId: saved.displayJson.processId, processName: saved.displayJson.processName, bizFormKey: saved.displayJson.bizFormKey, nodes: saved.displayJson.nodes, flows: saved.displayJson.flows } })
      ElMessage.success(`子流程片段已创建：${saved.key}`)
      await router.replace({ path: '/sub-processes', query: { editor: '1', key: saved.key } })
    }
  } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : String(cause)) }
  finally { saving.value = false }
}

async function deleteFragment(row: WorkflowSubProcessFragment) {
  try {
    await ElMessageBox.confirm(`删除“${row.name}”（${row.key}）？此操作会从片段库移除记录，已保存到主流程中的内容快照不受影响。`, '删除子流程片段', { type: 'warning', confirmButtonText: '删除片段', cancelButtonText: '取消' })
    deletingKey.value = row.key
    await subProcessLibraryGateway.delete(row.key)
    ElMessage.success('子流程片段已删除。')
    await load(true)
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') ElMessage.error(cause instanceof Error ? cause.message : String(cause))
  } finally { deletingKey.value = '' }
}

function leaveEditor() {
  if (!isEditing.value) return
  void ElMessageBox.confirm('返回片段库后，本页面尚未保存的修改将丢失。确定返回吗？', '离开编辑器', { type: 'warning', confirmButtonText: '离开编辑器', cancelButtonText: '继续编辑' })
    .then(() => { allowNavigationOnce = true; return router.push('/sub-processes') })
    .catch(() => undefined)
}
onBeforeRouteLeave(() => {
  if (allowNavigationOnce) { allowNavigationOnce = false; return true }
  if (!isEditing.value) return true
  const current = editorRef.value?.exportDesign().model as WorkflowModel | undefined
  const signature = JSON.stringify({ name: editorName.value.trim(), description: editorDescription.value.trim(), model: current ? { processId: current.processId, processName: current.processName, bizFormKey: current.bizFormKey, nodes: current.nodes, flows: current.flows } : undefined })
  if (!current || signature === lastSavedModel) return true
  return ElMessageBox.confirm('当前子流程片段有尚未保存的修改。离开后这些修改将丢失。', '离开编辑器', { type: 'warning', confirmButtonText: '放弃修改并离开', cancelButtonText: '继续编辑' })
    .then(() => true, () => false)
})
watch(() => route.fullPath, () => {
  if (isEditing.value) {
    editorName.value = fragmentName.value
    editorDescription.value = fragmentDescription.value
    initialLoadedKey.value = ''
    void loadEditor()
  } else void load(true)
})
onMounted(() => { if (isEditing.value) { editorName.value = fragmentName.value; editorDescription.value = fragmentDescription.value; void loadEditor() } else void load() })
</script>

<template>
  <section class="subprocess-page" :class="{ 'is-editor': isEditing }" :style="canvasStyle">
    <template v-if="isEditing">
      <header class="subprocess-editor-header">
        <div><button class="subprocess-back" type="button" @click="leaveEditor">← 返回片段库</button><p class="subprocess-eyebrow">局部流程编辑</p><h1>{{ editorName || '新建子流程片段' }}</h1><p class="subprocess-explainer">片段保存为画布内容，可不包含开始和结束节点；保存后它不会单独部署。</p></div>
        <div class="subprocess-editor-actions"><ElButton @click="leaveEditor">返回列表</ElButton><ElButton type="primary" :loading="saving" @click="save">保存片段</ElButton></div>
      </header>
      <div v-if="loading" class="subprocess-editor-loading" role="status">正在读取片段内容…</div>
      <div v-else-if="error" class="subprocess-editor-error" role="alert">{{ error }}</div>
      <div v-else class="subprocess-editor-body">
        <div class="subprocess-metadata"><label><span>片段名称</span><ElInput v-model="editorName" maxlength="80" show-word-limit placeholder="例如：部门审批步骤" /></label><label><span>片段描述</span><ElInput v-model="editorDescription" maxlength="240" placeholder="说明适用场景和入口、出口" /></label><code v-if="editingKey">{{ editingKey }}</code><span v-else class="subprocess-key-pending">key 由后端创建时生成</span></div>
        <WorkflowDesigner v-if="design" ref="editorRef" v-model="design" mode="subprocess-fragment" :extensions="editorExtensions" />
      </div>
    </template>
    <template v-else>
      <header class="subprocess-page-header"><div><p class="subprocess-eyebrow">WORKFLOW COMPONENTS</p><h1>子流程片段</h1><p>维护可复用的局部流程内容，在业务流程中嵌入时会复制当前画布快照。</p></div><ElButton type="primary" size="large" @click="createFragment">新建片段</ElButton></header>
      <section class="subprocess-note"><span class="subprocess-note-mark" aria-hidden="true">i</span><p><strong>保存的画布内容，不是已发布流程</strong><br>片段可以没有开始或结束节点，也不会直接部署到流程引擎。</p></section>
      <section class="subprocess-library-panel"><div class="subprocess-list-toolbar"><div><h2>片段库</h2><span>按最近更新时间排序</span></div><ElInput v-model="searchText" clearable placeholder="搜索片段名称或 key" class="subprocess-search" aria-label="搜索子流程片段名称或 key" @input="scheduleSearch" @keyup.enter="search" /></div>
        <div v-if="error" class="subprocess-list-error" role="alert"><span>{{ error }}</span><ElButton @click="load(true)">重试</ElButton></div>
        <div v-else-if="loading && !fragments.length" class="subprocess-list-loading" role="status">正在读取片段库…</div>
        <div v-else-if="fragments.length || loading" class="subprocess-table">
          <DataTable :rows="fragments" :columns="columns" :loading="loading" row-key="key" empty-text="暂时没有子流程片段">
            <template #cell-name="{ row }"><div class="subprocess-name-cell"><strong>{{ row.name }}</strong><span>{{ row.description || '暂无描述' }}</span></div></template>
            <template #cell-key="{ row }"><code class="subprocess-key">{{ row.key }}</code></template>
          </DataTable>
        </div>
        <ElEmpty v-else :description="searchText ? '没有找到匹配的片段' : '片段库还是空的'"><template #description><div class="subprocess-empty-copy"><strong>{{ searchText ? '没有找到匹配的片段' : '还没有子流程片段' }}</strong><span>{{ searchText ? '试试缩短名称或使用 key 搜索。' : '创建一个局部流程，之后可在主流程设计器中复用。' }}</span></div></template><ElButton v-if="!searchText" type="primary" @click="createFragment">新建第一个片段</ElButton></ElEmpty>
        <div v-if="fragments.length && hasMore" class="subprocess-load-more"><ElButton :loading="loadingMore" @click="load(false)">加载更多</ElButton></div><div v-else-if="fragments.length" class="subprocess-list-end">已显示全部片段</div>
      </section>
      <ElDialog v-model="metadataOpen" title="新建子流程片段" width="480px"><div class="subprocess-metadata-dialog"><label><span>片段名称</span><ElInput v-model="fragmentName" autofocus maxlength="80" show-word-limit placeholder="例如：部门审批步骤" /></label><label><span>描述（选填）</span><ElInput v-model="fragmentDescription" maxlength="240" placeholder="说明适用场景和入口、出口" /></label></div><template #footer><ElButton @click="metadataOpen = false">取消</ElButton><ElButton type="primary" @click="confirmMetadata">开始编辑</ElButton></template></ElDialog>
    </template>
  </section>
</template>

<style>
.subprocess-page { --subprocess-ink: #173d32; --subprocess-muted: #708077; --subprocess-border: #e2e9e4; --subprocess-surface: #fff; min-height: calc(100vh - 64px); color: var(--subprocess-ink); }
.subprocess-page:not(.is-editor) { max-width: 1380px; margin: 0 auto; padding: 42px 48px 64px; }
.subprocess-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.subprocess-page-header h1, .subprocess-editor-header h1 { margin: 0; font-size: 30px; line-height: 1.25; letter-spacing: -.4px; color: var(--subprocess-ink); }
.subprocess-page-header p:not(.subprocess-eyebrow), .subprocess-explainer { margin: 10px 0 0; color: var(--subprocess-muted); font-size: 14px; line-height: 1.7; }
.subprocess-eyebrow { margin: 0 0 8px; color: #71877c; font: 600 10px/1.4 'SFMono-Regular', Consolas, monospace; letter-spacing: 1.8px; }
.subprocess-note { display: flex; gap: 13px; align-items: flex-start; margin: 0 0 25px; padding: 17px 19px; border: 1px solid #dce8df; border-radius: 8px; background: #f3f8f4; }
.subprocess-note-mark { display: grid; flex: 0 0 22px; place-items: center; width: 22px; height: 22px; border: 1px solid #b7d0c0; border-radius: 50%; color: #36654e; font: 600 12px Georgia, serif; }
.subprocess-note p { margin: 0; color: #64776b; font-size: 12px; line-height: 1.7; }
.subprocess-note strong { color: #315744; font-size: 13px; font-weight: 600; }
.subprocess-library-panel { overflow: hidden; border: 1px solid var(--subprocess-border); border-radius: 9px; background: var(--subprocess-surface); box-shadow: 0 8px 26px rgb(20 54 41 / 4%); }
.subprocess-list-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 22px; border-bottom: 1px solid #edf1ee; }
.subprocess-list-toolbar > div { display: flex; align-items: baseline; gap: 12px; }
.subprocess-list-toolbar h2 { margin: 0; font-size: 15px; font-weight: 650; }
.subprocess-list-toolbar > div > span { color: #859187; font-size: 12px; }
.subprocess-search { width: min(340px, 100%); }
.subprocess-search .el-input__wrapper { min-height: 38px; box-shadow: 0 0 0 1px #e4eae6 inset; }
.subprocess-table { --el-table-header-bg-color: #f8faf8; --el-table-header-text-color: #66766c; --el-table-border-color: #edf1ee; --el-table-row-hover-bg-color: #f7faf7; color: #34483d; }
.subprocess-table th.el-table__cell { height: 48px; font-size: 12px; font-weight: 600; letter-spacing: .1px; }
.subprocess-table td.el-table__cell { height: 76px; }
.subprocess-table .cell { padding: 0 18px; }
.subprocess-name-cell { display: grid; gap: 6px; min-width: 0; }
.subprocess-name-cell strong { overflow: hidden; color: #244337; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.subprocess-name-cell span { overflow: hidden; color: #63756a; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.subprocess-key { display: inline-block; max-width: 100%; overflow: hidden; color: #50665a; font: 12px/1.6 'SFMono-Regular', Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.subprocess-table :deep(.data-table__actions) { display: flex; justify-content: center; gap: 8px; }
.subprocess-table :deep(.data-table__actions .el-button) { min-height: 38px; padding: 0 8px; }
.subprocess-table :deep(.data-table__actions .el-button:focus-visible), .subprocess-page :deep(.el-button:focus-visible) { outline: 2px solid var(--diagram-accent); outline-offset: 2px; }
.subprocess-load-more { display: flex; justify-content: center; padding: 16px; border-top: 1px solid #f0f3f1; }
.subprocess-list-end { padding: 17px; color: #98a39b; text-align: center; font-size: 11px; }
.subprocess-empty-copy { display: grid; gap: 7px; color: #748278; font-size: 12px; }
.subprocess-empty-copy strong { color: #455d4e; font-size: 14px; font-weight: 600; }
.subprocess-list-error { display: flex; align-items: center; justify-content: space-between; padding: 28px; color: #a14942; font-size: 13px; }
.subprocess-editor-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 98px; padding: 12px 25px 15px; border-bottom: 1px solid var(--subprocess-border); background: #fff; }
.subprocess-back { margin-bottom: 11px; padding: 0; border: 0; color: #5d7668; background: none; cursor: pointer; font-size: 12px; }
.subprocess-editor-header h1 { font-size: 21px; }
.subprocess-editor-header .subprocess-eyebrow { margin: 8px 0 4px; }
.subprocess-editor-header .subprocess-explainer { margin-top: 5px; font-size: 12px; }
.subprocess-editor-actions { display: flex; gap: 9px; }
.subprocess-editor-body { display: grid; grid-template-rows: auto minmax(580px, 1fr); gap: 12px; padding: 16px; }
.subprocess-metadata { display: flex; align-items: flex-end; gap: 14px; padding: 14px 17px; border: 1px solid var(--subprocess-border); border-radius: 7px; background: #fff; }
.subprocess-metadata label, .subprocess-metadata-dialog label { display: grid; flex: 1; gap: 7px; min-width: 0; color: #627569; font-size: 11px; }
.subprocess-metadata code, .subprocess-key-pending { align-self: center; color: #85958a; font: 11px/1.5 'SFMono-Regular', Consolas, monospace; }
.subprocess-editor-body :deep(.wfd) { min-height: 640px; }
.subprocess-editor-body :deep(.wfd-toolbar) { display: flex; min-height: 48px; height: 48px; padding: 0 10px; }
.subprocess-editor-body :deep(.wfd-brand) { display: none; }
.subprocess-editor-body :deep(.wfd-toolbar-actions) { justify-content: flex-start; }
.subprocess-editor-body :deep(.wfd-workspace) { min-height: 560px; }
.subprocess-editor-body :deep(.wfd-node-library-group h3) { display: none; }
.subprocess-editor-loading, .subprocess-editor-error, .subprocess-list-loading { display: grid; place-items: center; min-height: 300px; color: #78867d; font-size: 13px; }
.subprocess-editor-error { color: #a14942; }
.subprocess-metadata-dialog { display: grid; gap: 18px; padding: 8px 2px; }
@media (max-width: 760px) {
  .subprocess-page:not(.is-editor) { padding: 26px 14px 44px; }
  .subprocess-page-header, .subprocess-list-toolbar, .subprocess-editor-header { align-items: stretch; flex-direction: column; }
  .subprocess-page-header { gap: 16px; }
  .subprocess-page-header > .el-button { align-self: flex-start; }
  .subprocess-list-toolbar > div { align-items: flex-start; flex-direction: column; gap: 4px; }
  .subprocess-search { width: 100%; }
  .subprocess-editor-header { gap: 12px; padding: 14px; }
  .subprocess-editor-actions { justify-content: flex-end; }
  .subprocess-metadata { align-items: stretch; flex-direction: column; }
  .subprocess-editor-body { padding: 10px; }
}
</style>
