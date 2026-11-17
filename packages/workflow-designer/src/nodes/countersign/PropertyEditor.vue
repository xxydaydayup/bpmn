<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'
import ReminderEditor from '../shared/ReminderEditor.vue'
import BusinessFormEditor from '../shared/BusinessFormEditor.vue'

defineProps<WorkflowNodePropertyEditorProps>()
</script>

<template>
  <BusinessFormEditor v-bind="$props" />
  <label class="wfd-field">
    <span>BPMN 表单引用（form）</span>
    <input
      :value="String(model.form ?? '')"
      :disabled="readonly"
      placeholder="例如：project-form"
      @focus="beginEdit"
      @change="update('form', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <label class="wfd-field">
    <span>办理顺序</span>
    <select
      :value="String(model.sequential ?? false)"
      :disabled="readonly"
      @focus="beginEdit"
      @change="update('sequential', ($event.target as HTMLSelectElement).value === 'true')"
    >
      <option value="false">并行办理</option>
      <option value="true">顺序办理</option>
    </select>
  </label>
  <label class="wfd-field">
    <span>审批方式</span>
    <select
      :value="String(model.approveMode ?? '')"
      :disabled="readonly"
      @focus="beginEdit"
      @change="update('approveMode', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">发起时选择（默认会签 ALL）</option>
      <option value="ALL">会签 · 所有人通过（ALL）</option>
      <option value="ANY">或签 · 任一人通过（ANY）</option>
      <option value="VOTE">按比例通过（VOTE）</option>
    </select>
  </label>
  <label v-if="model.approveMode === 'VOTE'" class="wfd-field">
    <span>通过比例（passRate）</span>
    <input
      inputmode="decimal"
      :value="String(model.passRate ?? '')"
      :disabled="readonly"
      placeholder="范围 (0, 1]；也可在发起时提供"
      @focus="beginEdit"
      @change="update('passRate', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <p class="wfd-field-note">多人审批字段属于节点配置；审批方式留空时，发起人可传 {{ model.id }}_approveMode，默认 ALL。比例仅用于 VOTE 模式，留空时可按节点 ID 在发起时提供。</p>
  <ReminderEditor v-bind="$props" />
</template>
