<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElForm, ElFormItem, ElIcon, ElInput, ElTag } from 'element-plus'
import { Connection, User } from '@element-plus/icons-vue'
import type { NodeProperties, NodePropertyField } from '@/bpmn/types'

const props = defineProps<{ node: NodeProperties | null; disabled: boolean }>()
const emit = defineEmits<{ update: [field: NodePropertyField, value: string] }>()
const draft = reactive({ name: '', assignee: '', formKey: '' })
const nodeType = computed(() => {
  if (props.node?.isUserTask) return '人工任务'
  if (props.node?.type === 'bpmn:StartEvent') return '开始事件'
  if (props.node?.type === 'bpmn:EndEvent') return '结束事件'
  return '流程节点'
})

watch(() => props.node, (node) => {
  draft.name = node?.name ?? ''
  draft.assignee = node?.assignee ?? ''
  draft.formKey = node?.formKey ?? ''
}, { immediate: true })
</script>

<template>
  <aside class="properties-panel" aria-label="节点属性面板">
    <div class="properties-heading">
      <h2>节点属性</h2>
      <ElTag v-if="node" size="small" effect="plain" type="info">{{ nodeType }}</ElTag>
    </div>
    <template v-if="node">
      <div class="selected-node-summary">
        <span class="node-symbol"><ElIcon :size="19"><User v-if="node.isUserTask" /><Connection v-else /></ElIcon></span>
        <div><strong>{{ node.name || '未命名节点' }}</strong><span>{{ node.id }}</span></div>
      </div>
      <ElForm label-position="top" :disabled="disabled" class="node-property-form" @submit.prevent>
        <ElFormItem label="节点名称" for="node-name">
          <ElInput id="node-name" v-model="draft.name" placeholder="填写节点名称" clearable @change="emit('update', 'name', draft.name)" />
        </ElFormItem>
        <ElFormItem label="办理人" for="node-assignee">
          <ElInput id="node-assignee" v-model="draft.assignee" :disabled="!node.isUserTask" placeholder="例如：requester" clearable @change="emit('update', 'assignee', draft.assignee)" />
        </ElFormItem>
        <ElFormItem label="表单" for="node-form">
          <ElInput id="node-form" v-model="draft.formKey" :disabled="!node.isUserTask" placeholder="例如：requirement-submit" clearable @change="emit('update', 'formKey', draft.formKey)" />
        </ElFormItem>
        <p class="property-help">{{ node.isUserTask ? '办理人填写用户标识，表单填写对应的表单标识。' : '办理人和表单仅适用于人工任务。' }}</p>
      </ElForm>
      <div class="properties-footer"><span class="status-dot"></span>输入完成后自动应用，可撤销修改</div>
    </template>
    <div v-else class="properties-empty">
      <ElIcon :size="29"><Connection /></ElIcon>
      <h3>选择一个节点</h3>
      <p>点击画布中的单个节点，<br />配置名称、办理人和表单。</p>
    </div>
  </aside>
</template>

<style scoped>
.properties-panel { display: flex; flex-direction: column; min-width: 0; border-left: 1px solid #e6ebe8; background: #fff; }
.properties-heading { display: flex; align-items: center; justify-content: space-between; min-height: 62px; padding: 0 22px; border-bottom: 1px solid #edf1ee; }
.properties-heading h2 { margin: 0; color: #2a4237; font-size: 14px; font-weight: 600; }
.properties-heading .el-tag { border-color: #e5ebe7; color: #72867b; font-size: 11px; }
.selected-node-summary { display: flex; align-items: center; gap: 12px; padding: 24px 22px; }
.node-symbol { display: grid; place-items: center; width: 36px; height: 40px; flex-shrink: 0; color: #24745e; background: #edf4ef; border: 1px solid #dce9df; border-radius: 5px; }
.selected-node-summary > div { min-width: 0; }
.selected-node-summary strong { display: block; color: #294137; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.selected-node-summary div > span { display: block; margin-top: 6px; color: #87948d; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; font-family: 'SFMono-Regular', Consolas, monospace; }
.node-property-form { padding: 0 22px 24px; }
.node-property-form :deep(.el-form-item) { margin-bottom: 22px; }
.node-property-form :deep(.el-form-item__label) { font-size: 12px; color: #63786b; }
.node-property-form :deep(.el-input__wrapper) { min-height: 37px; }
.property-help { margin: 0; color: #89988f; font-size: 11px; line-height: 1.9; }
.properties-footer { display: flex; align-items: center; gap: 7px; margin-top: auto; padding: 17px 22px; border-top: 1px solid #edf1ee; color: #839087; font-size: 10px; }
.status-dot { width: 5px; height: 5px; flex-shrink: 0; border-radius: 50%; background: #7eaa90; }
.properties-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 48px 20px; color: #a5b5aa; }
.properties-empty h3 { margin: 18px 0 9px; color: #627b6c; font-size: 14px; font-weight: 500; }
.properties-empty p { margin: 0; color: #91a095; text-align: center; font-size: 12px; line-height: 1.9; }
@media (max-width: 1100px) and (min-width: 761px) {
  .properties-heading, .selected-node-summary, .properties-footer { padding-left: 16px; padding-right: 16px; }
  .node-property-form { padding-left: 16px; padding-right: 16px; }
}
@media (max-width: 760px) {
  .properties-panel { border-left: 0; border-top: 1px solid #e6ebe8; }
}
</style>
