<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import type { FormSchema } from '@/api/workflow/forms'
import '@bpmn-io/form-js-viewer/dist/assets/form-js.css'
import '@bpmn-io/form-js-editor/dist/assets/form-js-editor.css'

const props = withDefaults(defineProps<{ schema: FormSchema; data?: Record<string, unknown>; mode?: 'editor' | 'viewer'; disabled?: boolean }>(), { mode: 'viewer', data: () => ({}) })
const emit = defineEmits<{ change: [schema: FormSchema]; error: [message: string]; ready: []; loading: [] }>()
const container = ref<HTMLDivElement>()
const failure = ref('')
const loading = ref(true)
type Surface = {
  importSchema: (schema: unknown, data?: unknown) => Promise<unknown>
  destroy: () => void
  on: (event: string, callback: (event: { data?: Record<string, unknown>; errors?: Record<string, unknown> }) => void) => void
  off: (event: string, callback: (event: { data?: Record<string, unknown>; errors?: Record<string, unknown> }) => void) => void
  saveSchema?: () => FormSchema
  submit?: () => { data: Record<string, unknown>; errors: Record<string, unknown> }
  validate?: () => Record<string, unknown>
}
let surface: Surface | undefined
let revision = 0
let disposed = false
let lastEmission = ''
let value: Record<string, unknown> = {}
const clone = <T,>(item: T): T => JSON.parse(JSON.stringify(toRaw(item))) as T

async function render() {
  const generation = ++revision
  loading.value = true; failure.value = ''
  lastEmission = ''
  emit('loading')
  surface?.destroy(); surface = undefined
  let instance: Surface | undefined
  try {
    const module = props.mode === 'editor' ? await import('@bpmn-io/form-js-editor') : await import('@bpmn-io/form-js-viewer')
    if (disposed || generation !== revision || !container.value) return
    const Constructor = ('FormEditor' in module ? module.FormEditor : module.Form) as unknown as new (options: Record<string, unknown>) => Surface
    instance = new Constructor({ container: container.value })
    surface = instance
    value = clone(props.data)
    await instance.importSchema(clone(props.schema), value)
    if (disposed || generation !== revision) return
    if (props.mode === 'editor') {
      instance.on('changed', () => {
        if (generation !== revision || !surface?.saveSchema) return
        const schema = clone(surface.saveSchema())
        lastEmission = JSON.stringify(schema)
        emit('change', schema)
      })
    } else {
      instance.on('changed', event => { if (generation === revision && event.data) value = clone(event.data) })
    }
    emit('ready')
  } catch (cause) {
    if (!disposed && generation === revision) { failure.value = cause instanceof Error ? cause.message : '表单无法加载'; emit('error', failure.value) }
  } finally { if (!disposed && generation === revision) loading.value = false }
}
function submit(): Record<string, unknown> | undefined {
  if (!surface || loading.value || failure.value || props.disabled) return
  try {
    const result = surface.submit?.()
    if (!result || Object.keys(result.errors).length) return
    return clone(result.data)
  } catch (cause) {
    emit('error', cause instanceof Error ? cause.message : '表单校验失败')
  }
}
onMounted(() => { void render() })
watch([() => props.schema, () => props.mode], ([schema, mode], [, oldMode]) => { if (mode !== oldMode || JSON.stringify(schema) !== lastEmission) void render() })
watch(() => props.data, () => { if (props.mode === 'viewer') void render() })
onBeforeUnmount(() => { disposed = true; ++revision; surface?.destroy(); surface = undefined })
defineExpose({ submit })
</script>

<template>
  <div class="form-surface" :class="{ 'is-editor': mode === 'editor', 'is-disabled': disabled }" :aria-busy="loading">
    <p v-if="loading" class="surface-message" role="status">正在加载表单…</p>
    <p v-if="failure" class="surface-error" role="alert">表单无法加载：{{ failure }}</p>
    <div ref="container" :inert="disabled || undefined" />
  </div>
</template>

<style scoped>
.form-surface { min-height: 120px; background: white; overflow: auto; position: relative; }
.form-surface.is-editor { min-height: 530px; height: min(65vh, 760px); }
.is-editor > div { height: 100%; min-width: 760px; }
.surface-message, .surface-error { padding: 16px; margin: 0; color: #526b60; }
.surface-error { color: #b42318; background: #fff4f2; }
.is-disabled { opacity: .75; }
.form-surface :deep(.fjs-container) { font-family: inherit; --color-primary: #28705d; }
</style>
