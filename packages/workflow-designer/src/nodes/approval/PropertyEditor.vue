<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'
import ReminderEditor from '../shared/ReminderEditor.vue'

defineProps<WorkflowNodePropertyEditorProps>()
</script>

<template>
  <label class="wfd-field">
    <span>表单引用</span>
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
