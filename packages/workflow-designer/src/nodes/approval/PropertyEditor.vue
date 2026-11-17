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
  <ReminderEditor v-bind="$props" />
</template>
