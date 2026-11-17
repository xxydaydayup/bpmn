<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElAlert, ElButton } from 'element-plus'
import { formError, formGateway, type FormGateway, type TaskBusinessForm as TaskForm } from '@/api/workflow/forms'
import FormJsSurface from './FormJsSurface.vue'
const props = defineProps<{ taskId: string; gateway?: FormGateway; disabled?: boolean }>()
const emit = defineEmits<{ completed: [taskId: string]; busy: [busy: boolean] }>()
const response = ref<TaskForm>()
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const ready = ref(false)
const invalid = ref('')
const viewer = ref<InstanceType<typeof FormJsSurface>>()
let controller: AbortController | undefined
let revision = 0
let disposed = false
async function load() {
  const requestRevision = ++revision
  const taskId = props.taskId
  controller?.abort(); controller = new AbortController()
  response.value = undefined; loading.value = true; error.value = ''; invalid.value = ''; ready.value = false
  try {
    const result = await (props.gateway ?? formGateway).task(taskId, controller.signal)
    if (disposed || requestRevision !== revision || taskId !== props.taskId) return
    response.value = result
    if (!['form', 'route', 'none'].includes(result.type)) error.value = '暂不支持此表单类型，请使用兼容办理入口或联系管理员。'
  } catch (cause) { if (!disposed && requestRevision === revision && !controller.signal.aborted) error.value = formError(cause) }
  finally { if (!disposed && requestRevision === revision) loading.value = false }
}
async function complete() {
  if (busy.value || props.disabled || !ready.value || response.value?.type !== 'form') return
  const values = viewer.value?.submit()
  if (!values) { invalid.value = '请检查并修正表单中的必填或格式错误。'; return }
  const taskId = props.taskId
  const requestRevision = revision
  busy.value = true; emit('busy', true); error.value = ''; invalid.value = ''
  try {
    await (props.gateway ?? formGateway).complete(taskId, values)
    if (!disposed && requestRevision === revision && taskId === props.taskId) emit('completed', taskId)
  } catch (cause) { if (!disposed && requestRevision === revision && taskId === props.taskId) error.value = formError(cause) + '；输入已保留，请核对任务状态后重试。' }
  finally { if (!disposed) { busy.value = false; emit('busy', false) } }
}
watch(() => props.taskId, () => { void load() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++revision; controller?.abort() })
</script>
<template>
  <section class="task-business-form" aria-label="当前任务业务表单">
    <h3>业务表单</h3>
    <p v-if="loading" role="status">正在读取当前任务表单…</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <ElButton v-if="error && !response" :disabled="loading" @click="load">重新读取表单</ElButton>
    <template v-if="response?.type === 'form'">
      <FormJsSurface ref="viewer" :schema="response.data" :data="response.values" :disabled="busy || disabled" @loading="ready = false" @ready="ready = true" @error="error = $event; ready = false" />
      <ElAlert v-if="invalid" :title="invalid" type="warning" :closable="false" />
      <ElButton type="primary" :loading="busy" :disabled="!ready || disabled" @click="complete">提交表单并完成任务</ElButton>
    </template>
    <ElAlert v-else-if="response?.type === 'route'" title="此任务使用业务路由表单" :description="String(response.data) + '；请在对应业务系统办理，或使用下方兼容入口。'" type="info" :closable="false" />
    <ElAlert v-else-if="response?.type === 'none'" title="当前任务未返回业务表单" description="可继续使用下方兼容办理入口。" type="info" :closable="false" />
  </section>
</template>
<style scoped>
.task-business-form { margin: 20px 0; display: grid; gap: 14px; }.task-business-form h3 { margin: 0; color: #294d3e; font-size: 16px; }.task-business-form > .el-button { justify-self: start; }
</style>
