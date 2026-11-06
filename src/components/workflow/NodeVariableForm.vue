<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElInput, ElOption, ElSelect } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { BusinessVariables } from '@/api/workflow/types'
import { formValueKey, type NodeFormConfig, type NodeFormField } from '@/api/workflow/nodeForms'

const props = withDefaults(defineProps<{
  configs: NodeFormConfig[]
  modelValue: BusinessVariables
  errors?: Record<string, string>
  disabled?: boolean
}>(), { errors: () => ({}), disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: BusinessVariables] }>()

const nodeLabels: Record<string, string> = { approval: '审批节点', countersign: '多人审批节点', service: '服务节点', receive: '消息等待节点', timer: '定时等待节点' }
const groups = computed(() => props.configs.map(config => ({
  ...config,
  label: config.nodeName + ' · ' + (nodeLabels[config.nodeType] || config.nodeType),
})))

function value(field: NodeFormField, nodeId: string) {
  return props.modelValue[formValueKey(nodeId, field.key)]
}

function update(nodeId: string, field: NodeFormField, nextValue: unknown) {
  emit('update:modelValue', { ...props.modelValue, [formValueKey(nodeId, field.key)]: nextValue })
}

function updateList(nodeId: string, field: NodeFormField, index: number, nextValue: string) {
  const list = Array.isArray(value(field, nodeId)) ? [...value(field, nodeId) as unknown[]] : []
  list[index] = nextValue
  update(nodeId, field, list)
}

function updateService(nodeId: string, field: NodeFormField, index: number, key: 'serviceName' | 'serviceUrl', nextValue: string) {
  const list = Array.isArray(value(field, nodeId)) ? [...value(field, nodeId) as unknown[]] : []
  const row = list[index] && typeof list[index] === 'object' ? { ...list[index] as Record<string, unknown> } : {}
  row[key] = nextValue
  list[index] = row
  update(nodeId, field, list)
}

function addRow(nodeId: string, field: NodeFormField) {
  const list = Array.isArray(value(field, nodeId)) ? [...value(field, nodeId) as unknown[]] : []
  list.push(field.kind === 'service-list' ? { serviceName: '', serviceUrl: '' } : '')
  update(nodeId, field, list)
}

function removeRow(nodeId: string, field: NodeFormField, index: number) {
  const list = Array.isArray(value(field, nodeId)) ? [...value(field, nodeId) as unknown[]] : []
  list.splice(index, 1)
  update(nodeId, field, list)
}

function inputText(field: NodeFormField, nodeId: string) {
  const current = value(field, nodeId)
  return current === undefined || current === null ? '' : String(current)
}
</script>

<template>
  <div v-if="!groups.length" class="node-form-empty">此阶段没有需要填写的流程节点表单。</div>
  <div v-else class="node-variable-form">
    <section v-for="group in groups" :key="group.nodeId" class="node-form-group">
      <header class="node-form-group-heading">
        <span class="node-form-dot" aria-hidden="true"></span>
        <strong>{{ group.label }}</strong>
        <code>{{ group.nodeId }}</code>
      </header>
      <div class="node-form-fields">
        <div v-for="field in group.fields" :key="field.key" class="node-form-field" :class="{ 'has-error': errors[formValueKey(group.nodeId, field.key)] }">
          <label class="node-form-label" :for="'variable-' + formValueKey(group.nodeId, field.key)">
            <span>{{ field.label }}<i v-if="field.required">*</i></span>
            <code>{{ field.variableName ?? field.key }}</code>
          </label>

          <template v-if="field.kind === 'service-list'">
            <div v-for="(row, index) in (Array.isArray(value(field, group.nodeId)) ? value(field, group.nodeId) as unknown[] : [])" :key="index" class="service-form-row">
              <ElInput :model-value="String((row as Record<string, unknown>)?.serviceName ?? '')" :disabled="disabled" placeholder="服务名称，例如 warehouse-a" :aria-label="'服务名称 ' + (index + 1)" @update:model-value="updateService(group.nodeId, field, Number(index), 'serviceName', String($event ?? ''))" />
              <ElInput :model-value="String((row as Record<string, unknown>)?.serviceUrl ?? '')" :disabled="disabled" placeholder="服务地址（可选）" :aria-label="'服务地址 ' + (index + 1)" @update:model-value="updateService(group.nodeId, field, Number(index), 'serviceUrl', String($event ?? ''))" />
              <ElButton text type="danger" :icon="Delete" :disabled="disabled" :aria-label="'删除服务 ' + (index + 1)" @click="removeRow(group.nodeId, field, Number(index))" />
            </div>
            <ElButton class="add-form-row" :icon="Plus" :disabled="disabled" @click="addRow(group.nodeId, field)">添加服务</ElButton>
          </template>

          <template v-else-if="field.kind === 'string-list'">
            <div v-for="(item, index) in (Array.isArray(value(field, group.nodeId)) ? value(field, group.nodeId) as unknown[] : [])" :key="index" class="list-form-row">
              <ElInput :model-value="String(item ?? '')" :disabled="disabled" :placeholder="'请输入第 ' + (Number(index) + 1) + ' 位用户 ID'" :aria-label="'审批参与人 ' + (Number(index) + 1)" @update:model-value="updateList(group.nodeId, field, Number(index), String($event ?? ''))" />
              <ElButton text type="danger" :icon="Delete" :disabled="disabled" :aria-label="'删除参与人 ' + (Number(index) + 1)" @click="removeRow(group.nodeId, field, Number(index))" />
            </div>
            <ElButton class="add-form-row" :icon="Plus" :disabled="disabled" @click="addRow(group.nodeId, field)">添加人员</ElButton>
          </template>

          <ElSelect v-else-if="field.kind === 'boolean'" :model-value="value(field, group.nodeId) as boolean | undefined" :disabled="disabled" clearable placeholder="请选择结果" :aria-label="field.label" @update:model-value="update(group.nodeId, field, $event)">
            <ElOption label="通过" :value="true" />
            <ElOption label="驳回" :value="false" />
          </ElSelect>
          <ElSelect v-else-if="field.kind === 'vote'" :model-value="value(field, group.nodeId) as string | undefined" :disabled="disabled" clearable placeholder="请选择表决结果" :aria-label="field.label" @update:model-value="update(group.nodeId, field, $event)">
            <ElOption label="同意" value="agree" />
            <ElOption label="驳回" value="reject" />
          </ElSelect>
          <ElInput v-else :id="'variable-' + formValueKey(group.nodeId, field.key)" :model-value="inputText(field, group.nodeId)" :disabled="disabled" clearable autocomplete="off" :placeholder="'请输入' + field.label" @update:model-value="update(group.nodeId, field, $event)" />

          <p v-if="errors[formValueKey(group.nodeId, field.key)]" class="node-form-error" role="alert">{{ errors[formValueKey(group.nodeId, field.key)] }}</p>
          <p v-if="field.hint" class="node-form-hint">{{ field.hint }}</p>
          <p v-else-if="field.kind === 'service-list'" class="node-form-hint">每项填写服务名称；地址留空时使用节点配置的默认地址。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.node-form-empty { padding: 13px 14px; border: 1px dashed #dce6df; border-radius: 7px; color: #718078; background: #fafcfb; font-size: 13px; }
.node-variable-form { display: grid; gap: 13px; }
.node-form-group { padding: 14px; border: 1px solid #e2eae5; border-radius: 8px; background: #fff; }
.node-form-group-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #294d3e; font-size: 13px; }
.node-form-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #4d9275; }
.node-form-group-heading code { margin-left: auto; color: #8b9a92; font: 11px/1.4 Consolas, monospace; }
.node-form-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.node-form-field { min-width: 0; }
.node-form-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; color: #3d594c; font-size: 12px; font-weight: 600; }
.node-form-label i { margin-left: 3px; color: #c6634e; font-style: normal; }
.node-form-label code { overflow: hidden; color: #94a199; font: 10px/1.4 Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.node-form-error { margin: 6px 0 0; color: #c45648; font-size: 11px; }
.node-form-hint { margin: 6px 0 0; color: #839188; font-size: 11px; line-height: 1.5; }
.has-error :deep(.el-input__wrapper), .has-error :deep(.el-select__wrapper) { box-shadow: 0 0 0 1px #d97061 inset; }
.service-form-row { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr) 30px; align-items: center; gap: 7px; margin-bottom: 8px; }
.list-form-row { display: grid; grid-template-columns: minmax(0, 1fr) 30px; align-items: center; gap: 7px; margin-bottom: 8px; }
.add-form-row { margin-top: 2px; }
@media (max-width: 560px) { .node-form-fields { grid-template-columns: 1fr; }.service-form-row { grid-template-columns: 1fr 1fr 30px; gap: 5px; }.node-form-group { padding: 12px; } }
</style>
