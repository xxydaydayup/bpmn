<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'

const props = defineProps<WorkflowNodePropertyEditorProps>()

function updateReminder(value: Record<string, unknown> | undefined) {
  props.update('reminder', value)
}
</script>

<template>
  <details class="wfd-advanced" open>
    <summary>超时提醒</summary>
    <label class="wfd-field">
      <span>提醒状态</span>
      <select
        :value="model.reminder ? 'enabled' : 'disabled'"
        :disabled="readonly"
        @focus="beginEdit"
        @change="updateReminder(($event.target as HTMLSelectElement).value === 'enabled'
          ? { duration: model.reminder?.duration ?? '', action: model.reminder?.action ?? 'notify', name: model.reminder?.name ?? '' }
          : undefined)"
      >
        <option value="disabled">关闭提醒</option>
        <option value="enabled">启用提醒</option>
      </select>
    </label>
    <template v-if="model.reminder">
      <label class="wfd-field">
        <span>超时处理方式</span>
        <select
          aria-label="超时处理方式"
          :value="String(model.reminder.action ?? 'notify')"
          :disabled="readonly"
          @focus="beginEdit"
          @change="update('reminderAction', ($event.target as HTMLSelectElement).value)"
        >
          <option value="notify">提醒并继续（notify）</option>
          <option value="return">中断并退回（return）</option>
          <option value="end">中断并结束（end）</option>
        </select>
      </label>
      <label v-if="model.reminder.action === 'return'" class="wfd-field">
        <span>退回目标</span>
        <select
          aria-label="超时退回目标"
          :value="String(model.reminder.target ?? '')"
          :disabled="readonly"
          @focus="beginEdit"
          @change="update('reminderTarget', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">请选择审批或服务节点</option>
          <option v-for="target in reminderTargets" :key="target.id" :value="target.id">
            {{ target.name }}（{{ target.id }}）
          </option>
        </select>
      </label>
      <label class="wfd-field">
        <span>提醒时长</span>
        <input
          :value="String(model.reminder.duration ?? '')"
          :disabled="readonly"
          placeholder="ISO-8601，例如 PT30M；默认 P1D"
          @focus="beginEdit"
          @change="updateReminder({ ...model.reminder, duration: ($event.target as HTMLInputElement).value })"
        >
      </label>
      <label class="wfd-field">
        <span>提醒名称</span>
        <input
          :value="String(model.reminder.name ?? '')"
          :disabled="readonly"
          :placeholder="model.name + (model.reminder.action === 'return' ? '超时退回' : model.reminder.action === 'end' ? '超时结束' : '超时提醒')"
          @focus="beginEdit"
          @change="updateReminder({ ...model.reminder, name: ($event.target as HTMLInputElement).value })"
        >
      </label>
      <p class="wfd-field-note">
        {{ model.reminder.action === 'return' ? '到期后取消当前审批并流转到指定节点。' : model.reminder.action === 'end' ? '到期后取消当前审批并结束流程。' : '到期后发送提醒消息，当前审批继续等待。' }} 留空时长可在启动实例时传 {{ model.id }}_reminderDuration，默认 P1D。
      </p>
    </template>
  </details>
</template>
