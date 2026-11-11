<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'

defineProps<WorkflowNodePropertyEditorProps>()
</script>

<template>
  <label class="wfd-field">
    <span>等待条件</span>
    <select
      :value="String(model.timerType ?? 'duration')"
      :disabled="readonly"
      aria-label="等待条件"
      @focus="beginEdit"
      @change="update('timerType', ($event.target as HTMLSelectElement).value)"
    >
      <option value="duration">等待时长</option>
      <option value="date">指定时刻</option>
      <option value="cycle">重复周期</option>
    </select>
  </label>
  <label class="wfd-field">
    <span>定时时间</span>
    <input
      :value="String(model.timerValue ?? '')"
      :disabled="readonly"
      :placeholder="model.timerType === 'date' ? '例如 2026-12-31T23:59:59' : model.timerType === 'cycle' ? '例如 R3/PT10H 或 cron 表达式' : '例如 PT30M、PT2H 或 P1D'"
      @focus="beginEdit"
      @change="update('timerValue', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <p class="wfd-field-note wfd-event-note">
    {{ model.timerType === 'date' ? '使用 ISO-8601 日期时间，例如 2026-12-31T23:59:59。' : model.timerType === 'cycle' ? '使用 ISO-8601 重复间隔（如 R3/PT10H）或后端支持的 cron 表达式。' : '使用 ISO-8601 时长，例如 PT30M、PT2H 或 P1D。' }} 填写后固定在流程模板；留空时启动时必传 <code>{{ model.id }}_timerValue</code>，否则流程运行到此处会报错。到期后引擎自动继续，不产生待办。
  </p>
</template>
