<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodePropertyEditorProps } from '../types'
import type { WorkflowFormOption } from '../../types'
const props = defineProps<WorkflowNodePropertyEditorProps>()
const options = ref<WorkflowFormOption[]>([])
const detail = ref<WorkflowFormOption>()
const keyword = ref('')
const error = ref('')
const detailError = ref('')
const loading = ref(false)
const hasNext = ref(false)
const offset = ref(0)
const reference = computed(() => String(props.model.bizFormKey ?? ''))
const key = computed(() => /^form:([^@]+)(?:@.*)?$/.exec(reference.value)?.[1])
let generation = 0
let detailGeneration = 0
let disposed = false
async function load(reset = true) {
  if (!props.businessForms) return
  const revision = ++generation
  if (reset) offset.value = 0
  loading.value = true; error.value = ''
  try {
    const rows = await props.businessForms.list({ nameLike: keyword.value.trim(), firstResult: offset.value, maxResults: 21 })
    if (disposed || revision !== generation) return
    options.value = reset ? rows.slice(0,20) : [...options.value, ...rows.slice(0,20)]
    hasNext.value = rows.length > 20
  } catch (cause) { if (!disposed && revision === generation) error.value = cause instanceof Error ? cause.message : '表单目录读取失败' }
  finally { if (!disposed && revision === generation) loading.value = false }
}
function select(event: Event) { props.beginEdit(); props.update('bizFormKey', (event.target as HTMLSelectElement).value) }
watch(() => props.businessForms, () => { void load() }, { immediate: true })
watch([key, () => props.businessForms], async () => {
  const revision = ++detailGeneration
  detail.value = undefined; detailError.value = ''
  if (!key.value || !props.businessForms) return
  try { const value = await props.businessForms.get(key.value); if (!disposed && revision === detailGeneration) detail.value = value }
  catch (cause) { if (!disposed && revision === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '无法核对当前引用' }
}, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++generation; ++detailGeneration })
</script>
<template>
  <div v-if="businessForms" class="business-form-editor">
    <label class="wfd-field"><span>业务表单</span><select :value="reference" :disabled="readonly || loading" @change="select"><option value="">未绑定（沿用流程级配置）</option><option v-if="reference && !options.some(item => 'form:' + item.key + '@' + item.version === reference)" :value="reference">{{ reference }}</option><option v-for="item in options" :key="item.key" :value="'form:' + item.key + '@' + item.version">{{ item.name }} · {{ item.key }} · v{{ item.version }} · 已发布</option></select></label>
    <div class="catalog-search"><input v-model="keyword" aria-label="搜索业务表单" placeholder="搜索表单名称" :disabled="readonly" @keydown.enter.prevent="load()"><button type="button" class="wfd-button" :disabled="loading" @click="load()">查询</button></div>
    <button v-if="hasNext" class="wfd-button" type="button" :disabled="loading" @click="offset += 20; load(false)">加载更多</button>
    <p v-if="loading" class="wfd-field-note" role="status">正在读取表单目录…</p>
    <p v-if="error || detailError" class="form-error" role="alert">{{ error || detailError }}</p>
    <p v-if="detail" class="wfd-field-note">{{ detail.name }} · {{ detail.key }} · {{ detail.status }}；引用：{{ reference }}</p>
    <p v-if="reference.startsWith('route:')" class="wfd-field-note">已保留业务路由引用；办理页仅显示路由信息。</p>
    <p v-else-if="reference && (!reference.includes('@') || reference.endsWith('@latest'))" class="wfd-field-note">当前引用读取最新发布版本；后续发布会影响读取结果。</p>
    <p v-else class="wfd-field-note">选择后固定发布版本，后续发布或回滚不改变此引用。</p>
  </div>
</template>
<style scoped>
.catalog-search { display: flex; gap: 6px; margin: 8px 0; }.catalog-search input { min-width: 0; width: 100%; border: 1px solid var(--wfd-border, #d9e2dc); border-radius: 4px; padding: 7px; font: inherit; }.form-error { color: #b42318; font-size: 12px; overflow-wrap: anywhere; }.business-form-editor { padding: 8px 0; }
</style>
