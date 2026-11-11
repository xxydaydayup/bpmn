<script setup lang="ts">
import type { WorkflowNodePropertyEditorProps } from '../types'

defineProps<WorkflowNodePropertyEditorProps>()
</script>

<template>
  <label class="wfd-field">
    <span>服务名称</span>
    <input
      :value="String(model.serviceName ?? '')"
      :disabled="readonly"
      @focus="beginEdit"
      @change="update('serviceName', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <label class="wfd-field">
    <span>服务地址</span>
    <input
      :value="String(model.serviceUrl ?? '')"
      :disabled="readonly"
      placeholder="https://example.com/api"
      @focus="beginEdit"
      @change="update('serviceUrl', ($event.target as HTMLInputElement).value)"
    >
  </label>
  <label class="wfd-field">
    <span>服务会签</span>
    <select
      aria-label="服务会签"
      :value="model.countersign === true ? 'enabled' : 'disabled'"
      :disabled="readonly"
      @focus="beginEdit"
      @change="update('countersign', ($event.target as HTMLSelectElement).value === 'enabled')"
    >
      <option value="disabled">关闭 · 单次调用</option>
      <option value="enabled">开启 · 多服务调用</option>
    </select>
  </label>
  <template v-if="model.countersign === true">
    <label class="wfd-field">
      <span>执行顺序</span>
      <select
        aria-label="服务执行顺序"
        :value="String(model.sequential ?? false)"
        :disabled="readonly"
        @focus="beginEdit"
        @change="update('sequential', ($event.target as HTMLSelectElement).value === 'true')"
      >
        <option value="false">并行执行</option>
        <option value="true">顺序执行</option>
      </select>
    </label>
    <label class="wfd-field">
      <span>会签方式</span>
      <select
        aria-label="服务会签方式"
        :value="String(model.approveMode ?? '')"
        :disabled="readonly"
        @focus="beginEdit"
        @change="update('approveMode', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">发起时选择（默认 ALL）</option>
        <option value="ALL">会签 · 所有服务通过（ALL）</option>
        <option value="ANY">或签 · 任一服务通过（ANY）</option>
        <option value="VOTE">按比例通过（VOTE）</option>
      </select>
    </label>
    <label v-if="model.approveMode === 'VOTE'" class="wfd-field">
      <span>通过比例（passRate）</span>
      <input
        inputmode="decimal"
        :value="String(model.passRate ?? '')"
        :disabled="readonly"
        placeholder="固定 VOTE 时必填，范围 (0, 1]"
        @focus="beginEdit"
        @change="update('passRate', ($event.target as HTMLInputElement).value)"
      >
    </label>
    <p class="wfd-field-note">服务会签属性写入当前服务节点的业务 JSON。审批方式留空时按后端默认 ALL，也可在启动时提供动态值；固定为 VOTE 时必须配置通过比例。</p>
  </template>
</template>
