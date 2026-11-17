<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElMessageBox, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import FormJsSurface from '@/components/forms/FormJsSurface.vue'
import { useFormManagement } from '@/composables/useFormManagement'
import type { BusinessForm, FormGateway, FormHistory } from '@/api/workflow/forms'

const props = defineProps<{ gateway?: FormGateway }>()
const forms = useFormManagement(props.gateway)
const preview = ref(false)
const historyOpen = ref(false)
const surfaceReady = ref(false)
const statusNames = { DRAFT: '草稿', PUBLISHED: '已发布', DISABLED: '已停用' }
const title = computed(() => forms.current.value ? forms.current.value.formName : '新建表单')
const locked = computed(() => forms.busy.value || !!forms.pendingWrite.value)
async function confirm(message: string, heading = '请确认') {
  try { await ElMessageBox.confirm(message, heading, { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }); return true } catch { return false }
}
async function discard() { return !forms.dirty.value || await confirm('表单有未保存的改动，确定离开并丢弃这些改动吗？', '未保存的草稿') }
async function open(row: unknown) { if (await discard()) { preview.value = false; await forms.open((row as BusinessForm).formKey) } }
function previewHistory(row: unknown) { forms.historyPreview.value = row as FormHistory }
async function create() { if (await discard()) { preview.value = false; forms.create() } }
async function close() { if (!locked.value && await discard()) forms.close() }
async function action(kind: 'publish' | 'rollback' | 'enable' | 'disable' | 'delete', version?: number) {
  const messages = {
    publish: '发布当前已保存的草稿？这会生成一个新的发布版本。',
    rollback: `将历史 v${version} 发布为新版本？旧快照和固定版本引用保持不变，latest 引用会读取新版本。`,
    enable: '启用此表单供新绑定使用？将复用已有发布版本，不新增版本。',
    disable: '停用后不能新绑定此表单。此操作不撤销已部署流程、不取消任务，已有历史快照仍保留。',
    delete: '删除此表单主记录？历史发布快照仍保留，已有固定引用不自动改绑。同 key 重建时版本从历史最大值继续递增。',
  }
  if (await confirm(messages[kind], (forms.current.value?.formName || '业务表单') + ' · ' + (forms.current.value?.formKey || ''))) await forms.action(kind, version)
}
async function rowAction(row: unknown, kind: 'enable' | 'disable' | 'delete') {
  if (locked.value || !await discard()) return
  const key = (row as BusinessForm).formKey
  await forms.open(key, false)
  if (!forms.error.value && forms.current.value?.formKey === key) await action(kind)
}
async function unlock() { if (await confirm('已核对服务器详情和历史快照，并理解原请求仍可能成功执行？解除锁定后再次发布或回滚可能新增版本。', '确认核对结果')) forms.pendingWrite.value = undefined }
async function history() { historyOpen.value = true; await forms.loadHistory() }
onMounted(() => { void forms.load() })
onBeforeUnmount(forms.dispose)
onBeforeRouteLeave(async () => locked.value ? false : await discard())
function beforeUnload(event: BeforeUnloadEvent) { if (forms.dirty.value || locked.value) event.preventDefault() }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>

<template>
  <section class="forms-page">
    <header class="page-heading"><div><p class="eyebrow">FORM LIBRARY</p><h1>业务表单</h1><p>设计可复用的业务表单，发布后绑定到人工任务。</p></div><div class="actions"><ElButton :icon="Refresh" :loading="forms.loading.value" @click="forms.load">刷新</ElButton><ElButton type="primary" :icon="Plus" :disabled="locked" @click="create">新建表单</ElButton></div></header>
    <ElAlert v-if="forms.error.value" :title="forms.error.value" type="error" :closable="false" show-icon />
    <ElAlert v-if="forms.notice.value" :title="forms.notice.value" type="success" :closable="false" show-icon />
    <ElCard shadow="never">
      <ElForm inline @submit.prevent="forms.search()"><ElFormItem label="名称"><ElInput v-model="forms.filters.nameLike" placeholder="搜索表单名称" clearable /></ElFormItem><ElFormItem label="状态"><ElSelect v-model="forms.filters.status" placeholder="全部状态" style="width: 150px" clearable><ElOption v-for="(label, status) in statusNames" :key="status" :value="status" :label="label" /></ElSelect></ElFormItem><ElFormItem><ElButton type="primary" native-type="submit">查询</ElButton><ElButton @click="forms.search(true)">重置</ElButton></ElFormItem></ElForm>
      <ElTable v-loading="forms.loading.value || forms.detailLoading.value" :data="forms.rows.value" empty-text="暂无表单，创建第一份业务表单吧"><ElTableColumn prop="formName" label="表单名称" min-width="180" /><ElTableColumn prop="formKey" label="表单 key" min-width="180" /><ElTableColumn label="状态" width="110"><template #default="{ row }"><ElTag :type="row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'info' : 'warning'" effect="plain">{{ statusNames[row.status as keyof typeof statusNames] || row.status }}</ElTag></template></ElTableColumn><ElTableColumn label="发布版本" width="110"><template #default="{ row }">{{ row.version > 0 ? 'v' + row.version : '尚未发布' }}</template></ElTableColumn><ElTableColumn prop="updatedAt" label="更新时间" min-width="180" /><ElTableColumn label="操作" width="230" fixed="right"><template #default="{ row }"><ElButton type="primary" text :disabled="locked || forms.detailLoading.value" @click="open(row)">打开</ElButton><ElButton v-if="row.status === 'PUBLISHED'" text :disabled="locked || forms.detailLoading.value" @click="rowAction(row, 'disable')">停用</ElButton><ElButton v-if="row.status === 'DISABLED'" text :disabled="locked || forms.detailLoading.value" @click="rowAction(row, 'enable')">启用</ElButton><ElButton type="danger" text :disabled="locked || forms.detailLoading.value" @click="rowAction(row, 'delete')">删除</ElButton></template></ElTableColumn></ElTable>
      <div class="pagination"><span>第 {{ forms.offset.value / 20 + 1 }} 页</span><ElButton :disabled="forms.offset.value === 0 || forms.loading.value" @click="forms.page(-1)">上一页</ElButton><ElButton :disabled="!forms.hasNext.value || forms.loading.value" @click="forms.page(1)">下一页</ElButton></div>
    </ElCard>
    <ElDialog :model-value="forms.editing.value" :title="title" width="min(1400px, calc(100vw - 32px))" top="4vh" :show-close="!locked" :close-on-click-modal="false" :close-on-press-escape="false" :before-close="close">
      <template v-if="forms.editing.value">
        <ElAlert v-if="forms.error.value" :title="forms.error.value" type="error" :closable="false" />
        <ElAlert v-if="forms.notice.value" :title="forms.notice.value" type="success" :closable="false" />
        <div v-if="forms.pendingWrite.value" class="reconcile"><ElButton :loading="forms.busy.value" @click="forms.verifyWrite">核对服务器状态</ElButton><ElButton :disabled="forms.busy.value" @click="unlock">已核对，解除锁定</ElButton></div>
        <ElForm label-position="top" class="metadata"><ElFormItem label="表单 key（创建后不可改）" required><ElInput v-model="forms.draft.formKey" :disabled="!!forms.current.value || locked" placeholder="例如 leave-request" /></ElFormItem><ElFormItem label="表单名称" required><ElInput v-model="forms.draft.formName" :disabled="locked" /></ElFormItem><ElFormItem label="说明"><ElInput v-model="forms.draft.description" :disabled="locked" /></ElFormItem></ElForm>
        <div class="editor-toolbar"><div class="actions"><ElTag v-if="forms.current.value" effect="plain">{{ statusNames[forms.current.value.status] }} · {{ forms.current.value.version ? 'v' + forms.current.value.version : '尚未发布' }}</ElTag><span>{{ forms.dirty.value ? '有未保存的改动' : '当前改动已保存' }}</span></div><div class="actions"><ElButton :type="!preview ? 'primary' : 'default'" @click="preview = false">设计</ElButton><ElButton :type="preview ? 'primary' : 'default'" @click="preview = true">预览</ElButton><ElButton :disabled="!forms.current.value || locked" @click="history">发布历史</ElButton></div></div>
        <FormJsSurface :schema="forms.schema.value" :mode="preview ? 'viewer' : 'editor'" :disabled="locked" @loading="surfaceReady = false" @ready="surfaceReady = true" @change="forms.schema.value = $event" @error="forms.error.value = $event; surfaceReady = false" />
        <p v-if="!preview" class="narrow-editor-hint">窄屏可在设计区域横向滚动，查看字段和属性；也可切换预览。</p>
        <p class="helper">保存仅更新草稿。发布生成新快照；历史版本引用不会因草稿修改而改变。</p>
      </template>
      <template #footer><div class="editor-footer"><div class="actions"><ElButton v-if="forms.current.value" type="danger" plain :disabled="locked || forms.dirty.value" @click="action('delete')">删除</ElButton><ElButton v-if="forms.current.value?.status === 'PUBLISHED'" :disabled="locked || forms.dirty.value" @click="action('disable')">停用</ElButton><ElButton v-if="forms.current.value?.status === 'DISABLED'" :disabled="locked || forms.dirty.value" @click="action('enable')">启用</ElButton></div><div class="actions"><ElButton :disabled="locked" @click="close">关闭</ElButton><ElButton :loading="forms.busy.value" :disabled="locked || !surfaceReady" @click="forms.save">保存草稿</ElButton><ElButton type="primary" :disabled="locked || !surfaceReady || !forms.current.value || forms.dirty.value" @click="action('publish')">发布已保存草稿</ElButton></div></div></template>
    </ElDialog>
    <ElDialog v-model="historyOpen" title="发布历史" width="min(1000px, calc(100vw - 32px))" :close-on-click-modal="false">
      <ElAlert v-if="forms.error.value" :title="forms.error.value" type="error" :closable="false" />
      <ElTable v-loading="forms.historyLoading.value" :data="forms.history.value" empty-text="尚无发布历史"><ElTableColumn prop="version" label="版本" width="80" /><ElTableColumn prop="createdAt" label="发布时间" min-width="180" /><ElTableColumn prop="publishedBy" label="发布人" min-width="120" /><ElTableColumn label="操作" width="180"><template #default="{ row }"><ElButton text @click="previewHistory(row)">预览</ElButton><ElButton type="primary" text :disabled="locked || forms.dirty.value" @click="action('rollback', row.version)">回滚为新版本</ElButton></template></ElTableColumn></ElTable>
      <div class="pagination"><span>第 {{ forms.historyOffset.value / 20 + 1 }} 页</span><ElButton :disabled="forms.historyOffset.value === 0 || forms.historyLoading.value" @click="forms.historyPage(-1)">上一页</ElButton><ElButton :disabled="!forms.historyHasNext.value || forms.historyLoading.value" @click="forms.historyPage(1)">下一页</ElButton></div>
      <template v-if="forms.historyPreview.value"><h3>历史快照 · v{{ forms.historyPreview.value.version }}</h3><FormJsSurface :schema="forms.historyPreview.value.formJson" /></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.forms-page { display: grid; gap: 16px; }.page-heading, .actions, .editor-toolbar, .editor-footer, .pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.page-heading { align-items: flex-start; }.page-heading h1 { margin: 0; font-size: 24px; color: #294d3e; }.page-heading p { color: #64796d; font-size: 13px; }.page-heading .eyebrow { margin: 0 0 8px; color: #28705d; font-size: 10px; letter-spacing: .15em; }.actions { justify-content: flex-start; flex-wrap: wrap; gap: 8px; }.metadata { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 16px; margin-top: 16px; }.editor-toolbar { padding: 12px 0; border-top: 1px solid #e0e8e2; }.editor-toolbar span, .helper, .pagination { font-size: 12px; color: #64796d; }.pagination { justify-content: flex-end; margin-top: 20px; }.editor-footer { flex-wrap: wrap; }.reconcile { display: flex; gap: 8px; padding: 12px 0; }
.narrow-editor-hint { display: none; font-size: 12px; color: #64796d; }
@media(max-width: 900px) { .narrow-editor-hint { display: block; } }
@media(max-width: 760px) { .page-heading { flex-direction: column; }.metadata { grid-template-columns: 1fr; gap: 0; }.editor-toolbar { align-items: flex-start; flex-direction: column; }.editor-footer { gap: 14px; }.page-heading .actions { width: 100%; } }
</style>
