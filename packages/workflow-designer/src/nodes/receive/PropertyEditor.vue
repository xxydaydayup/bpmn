<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'

defineProps<WorkflowNodePropertyEditorProps>()
</script>

<template>
  <label class="wfd-field">
    <span>消息名</span>
    <input
      :value="String(model.messageName ?? '')"
      :disabled="readonly"
      placeholder="留空时使用节点标识"
      @focus="beginEdit"
      @change="update('messageName', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <p class="wfd-field-note wfd-event-note">
    填写后固定为此消息名；留空时启动变量为 <code>{{ model.id }}_messageName</code>，未提供则使用节点标识。业务方发送匹配消息后流程继续，并可携带流程变量。本节点不产生人工待办。
  </p>
</template>
