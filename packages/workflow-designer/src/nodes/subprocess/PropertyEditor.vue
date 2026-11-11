<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { WorkflowNodePropertyEditorProps } from '../types'
import ReminderEditor from '../shared/ReminderEditor.vue'
import type { WorkflowSubProcessFragment } from '../../types'

const props = defineProps<WorkflowNodePropertyEditorProps>()
const items = ref<WorkflowSubProcessFragment[]>([])
const loading = ref(false)
const error = ref('')
const selectedKey = computed(() => String(props.model.subProcessKey ?? ''))
const selectedName = computed(() => String(props.model.subProcessName ?? ''))
const snapshot = computed(() => props.model.process && typeof props.model.process === 'object' ? props.model.process : undefined)
const selectedOption = ref('')
let requestGeneration = 0

watch(selectedKey, key => { selectedOption.value = key })

function createProcessSnapshot(displayJson: WorkflowSubProcessFragment['displayJson']) {
  return JSON.parse(JSON.stringify({
    ...(displayJson.processId !== undefined ? { processId: displayJson.processId } : {}),
    ...(displayJson.processName !== undefined ? { processName: displayJson.processName } : {}),
    nodes: displayJson.nodes,
    ...(Array.isArray(displayJson.flows) ? { flows: displayJson.flows } : {}),
  })) as NonNullable<typeof props.model.process>
}

async function load() {
  if (!props.subprocessFragments) return
  const generation = ++requestGeneration
  loading.value = true
  error.value = ''
  try {
    items.value = await props.subprocessFragments.list()
    if (generation !== requestGeneration) return
    if (selectedKey.value && !items.value.some(item => item.key === selectedKey.value)) {
      items.value = [{ key: selectedKey.value, name: selectedName.value, displayJson: snapshot.value ?? { nodes: [], flows: [] } }, ...items.value]
    }
    selectedOption.value = selectedKey.value
  } catch (cause) {
    if (generation !== requestGeneration) return
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

async function choose(key: string) {
  selectedOption.value = key
  if (!key) { clear(); return }
  if (!props.subprocessFragments || props.readonly) return
  const generation = ++requestGeneration
  loading.value = true
  error.value = ''
  try {
    const detail = await props.subprocessFragments.get(key)
    if (generation !== requestGeneration) return
    if (!Array.isArray(detail.displayJson.nodes) || detail.displayJson.nodes.length === 0) {
      selectedOption.value = selectedKey.value
      error.value = '该片段没有可嵌入的节点。'
      return
    }
    props.beginEdit()
    props.update('subProcessSelection', { key: detail.key, name: detail.name, process: createProcessSnapshot(detail.displayJson) })
  } catch (cause) {
    if (generation !== requestGeneration) return
    selectedOption.value = selectedKey.value
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

async function refresh() {
  if (!selectedKey.value || !props.subprocessFragments || props.readonly) return
  loading.value = true
  const generation = ++requestGeneration
  error.value = ''
  try {
    const detail = await props.subprocessFragments.get(selectedKey.value)
    if (generation !== requestGeneration) return
    const updated = JSON.stringify(createProcessSnapshot(detail.displayJson)) !== JSON.stringify(snapshot.value)
      || detail.name !== selectedName.value
    if (!updated) { error.value = '片段库内容没有变化。'; return }
    if (!window.confirm('片段库中的内容已更新。刷新会覆盖当前节点保存的快照，是否继续？')) return
    props.beginEdit()
    props.update('subProcessSelection', { key: detail.key, name: detail.name, process: createProcessSnapshot(detail.displayJson) })
  } catch (cause) {
    if (generation !== requestGeneration) return
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

function clear() {
  if (props.readonly) return
  requestGeneration += 1
  loading.value = false
  selectedOption.value = ''
  error.value = ''
  props.beginEdit()
  props.update('subProcessSelection', undefined)
}

onMounted(() => { void load() })
onBeforeUnmount(() => { requestGeneration += 1 })
</script>

<template>
  <div class="wfd-subprocess-editor">
    <label class="wfd-field"><span>节点名称</span><input :value="model.name" :disabled="readonly" @focus="beginEdit" @change="update('name', ($event.target as HTMLInputElement).value)"></label>
    <ReminderEditor v-bind="$props" />
    <div class="wfd-subprocess-select-card">
      <label class="wfd-field wfd-subprocess-select-field"><span>引用子流程片段</span><select :value="selectedOption" :disabled="readonly || loading || !subprocessFragments" aria-describedby="wfd-subprocess-hint" @change="choose(($event.target as HTMLSelectElement).value)"><option value="">{{ loading ? '正在读取片段…' : '请选择片段' }}</option><option v-for="item in items" :key="item.key" :value="item.key">{{ item.name }}</option></select></label>
      <p v-if="!loading && !error && !items.length && subprocessFragments" class="wfd-subprocess-empty" role="status">片段库暂无可用内容，请先在“管理子流程片段”中创建。</p>
      <p id="wfd-subprocess-hint" class="wfd-field-note wfd-subprocess-hint">选择后会将片段内容复制到当前流程；之后修改片段库不会自动更新这里的快照。</p>
      <p v-if="selectedKey" class="wfd-subprocess-source"><span>当前引用</span><strong>{{ selectedName }}</strong><code>{{ selectedKey }}</code></p>
      <div v-if="selectedKey" class="wfd-subprocess-actions"><button class="wfd-button" type="button" :disabled="readonly || loading" @click="refresh">刷新快照</button><button class="wfd-button wfd-button-subtle-danger" type="button" :disabled="readonly || loading" @click="clear">清除引用</button></div>
      <p v-if="error" class="wfd-subprocess-error" :role="error.includes('没有变化') ? 'status' : 'alert'">{{ error }}</p>
    </div>
    <div v-if="!subprocessFragments" class="wfd-subprocess-state">当前宿主没有提供子流程片段数据源。</div>
  </div>
</template>
