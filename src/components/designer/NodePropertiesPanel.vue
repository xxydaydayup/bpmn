<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElOption, ElSelect, ElSwitch } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { presentNode } from '@/bpmn/icons'
import type { NodeProperties, NodePropertyField } from '@/bpmn/types'

const props = defineProps<{ node: NodeProperties | null; disabled: boolean; error?: string }>()
const emit = defineEmits<{ update: [field: NodePropertyField, value: string]; close: [] }>()
const activeTab = ref('basic')
watch(() => props.node?.id, () => { activeTab.value = 'basic' })
const presentation = computed(() => presentNode(props.node?.type))
const draft = reactive({ id: '', name: '', assignee: '', formKey: '', conditionExpression: '', defaultFlowId: '', approvalMode: 'single', approvalOrder: 'parallel', participants: '' })
const canRepairApproval = computed(() => props.node && !props.node.approval.readOnlyReason
  && ['all', 'any'].includes(props.node.approval.mode)
  && props.node.approval.issues.some(issue => ['approval-loop-conflict', 'approval-assignee-conflict', 'approval-count-conflict'].includes(issue.code)))
const nodeType = computed(() => presentation.value.label)

watch(() => props.node, (node) => {
  draft.id = node?.id ?? ''
  draft.name = node?.name ?? ''
  draft.assignee = node?.assignee ?? ''
  draft.formKey = node?.formKey ?? ''
  draft.conditionExpression = node?.conditionExpression ?? ''
  draft.defaultFlowId = node?.defaultFlowId ?? ''
  draft.approvalMode = node?.approval.mode ?? 'single'
  draft.approvalOrder = node?.approval.sequential ? 'sequential' : 'parallel'
  draft.participants = node?.approval.participants.join('\n') ?? ''
}, { immediate: true })
</script>

<template>
  <aside class="properties-panel" aria-label="流程属性面板">
    <div class="properties-heading">
      <h2>{{ node?.kind === 'process' ? '流程属性' : node?.kind === 'flow' ? '连线属性' : '节点属性' }}</h2>
      <button class="designer-icon-button" aria-label="收起属性面板" title="收起属性面板" @click="emit('close')"><DiagramIcon name="properties" /></button>
    </div>
    <template v-if="node">
      <div class="selected-node-summary">
        <span class="node-symbol" :class="`tone-${presentation.tone}`"><DiagramIcon :name="presentation.icon" /></span>
        <div><strong :title="node.name">{{ node.name || '未命名' }}</strong><span>{{ nodeType }}</span></div>
      </div>
      <div class="property-tabs" role="tablist" aria-label="节点配置">
        <button role="tab" :aria-selected="activeTab === 'basic'" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button role="tab" :aria-selected="activeTab === 'advanced'" :class="{ active: activeTab === 'advanced' }" @click="activeTab = 'advanced'">更多设置</button>
      </div>
      <ElForm label-position="top" :disabled="disabled" class="node-property-form" @submit.prevent>
        <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="property-error" />
        <template v-if="activeTab === 'advanced'">
          <h3 class="property-section-title">元素信息</h3>
          <ElFormItem label="标识"><ElInput :model-value="node.id" readonly /></ElFormItem>
          <ElFormItem label="BPMN 类型"><ElInput :model-value="node.type" readonly /></ElFormItem>
          <p class="property-help">名称与业务配置保存在流程文件中。画布外观不会改变节点的 BPMN 类型。</p>
        </template>
        <template v-else>
        <h3 class="property-section-title">基本信息</h3>
        <ElFormItem v-if="node.kind === 'process'" label="流程标识" for="process-id">
          <ElInput id="process-id" v-model="draft.id" @change="emit('update', 'id', draft.id)" />
        </ElFormItem>
        <ElFormItem :label="node.kind === 'process' ? '流程名称' : node.kind === 'flow' ? '连线名称' : '节点名称'" for="node-name">
          <ElInput id="node-name" v-model="draft.name" :placeholder="node.kind === 'process' ? '填写流程名称' : node.kind === 'flow' ? '填写连线名称' : '填写节点名称'" clearable @change="emit('update', 'name', draft.name)" />
        </ElFormItem>
        <ElFormItem v-if="node.kind === 'node'" label="节点类型"><div class="node-type-readonly"><DiagramIcon :name="presentation.icon" />{{ nodeType }}</div></ElFormItem>
        <template v-if="node.isUserTask">
          <h3 class="property-section-title section-divider">审批配置</h3>
          <ElFormItem label="审批方式" for="approval-mode">
            <ElSelect id="approval-mode" v-model="draft.approvalMode" :disabled="!!node.approval.readOnlyReason" @change="value => emit('update', 'approvalMode', String(value))">
              <ElOption label="单人办理" value="single" />
              <ElOption label="会签 · 全员同意" value="all" />
              <ElOption label="或签 · 任一同意" value="any" />
              <ElOption v-if="node.approval.mode === 'unconfigured'" label="多实例待配置" value="unconfigured" disabled />
            </ElSelect>
          </ElFormItem>
          <ElAlert v-if="node.approval.readOnlyReason" class="property-error" :title="node.approval.readOnlyReason" type="warning" :closable="false" />
          <template v-if="node.approval.mode !== 'single'">
            <ElFormItem label="办理顺序" for="approval-order">
              <ElSelect id="approval-order" v-model="draft.approvalOrder" :disabled="!!node.approval.readOnlyReason || node.approval.mode === 'unconfigured'" @change="value => emit('update', 'approvalOrder', String(value))">
                <ElOption label="并行办理" value="parallel" />
                <ElOption label="按名单顺序办理" value="sequential" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="参与人名单" for="approval-participants" required>
              <ElInput id="approval-participants" v-model="draft.participants" type="textarea" :rows="4" :readonly="!!node.approval.readOnlyReason || node.approval.mode === 'unconfigured'" placeholder="每行一个用户标识，也可用逗号分隔" @change="emit('update', 'participants', draft.participants)" />
            </ElFormItem>
            <p v-if="node.approval.mode === 'all'" class="property-help">全员同意才通过，任一拒绝即不通过。</p>
            <p v-if="node.approval.mode === 'any'" class="property-help">任一同意即通过，全员拒绝才不通过。</p>
            <p class="property-help">结果未确定时，任一退回使本环节退回；结果确定后结束本环节剩余待办。规则仅保存，暂不执行。</p>
          </template>
          <ElAlert v-if="node.approval.issues.length && !node.approval.readOnlyReason" class="property-error" :title="node.approval.issues.map(issue => issue.message).join('；')" type="warning" :closable="false" />
          <ElButton v-if="canRepairApproval" size="small" @click="emit('update', 'repairApproval', '')">同步多人配置</ElButton>
          <p v-if="node.approval.mode !== 'single'" class="property-help">多人改为单人时，仅一人的名单会自动带入办理人；否则需重新填写。</p>
        </template>
        <ElFormItem v-if="node.isUserTask && node.approval.mode === 'single'" label="办理人" for="node-assignee" required>
          <ElInput id="node-assignee" v-model="draft.assignee" :disabled="!node.isUserTask" placeholder="用户标识" clearable @change="emit('update', 'assignee', draft.assignee)" />
        </ElFormItem>
        <ElFormItem v-if="node.isUserTask" label="表单" for="node-form">
          <ElInput id="node-form" v-model="draft.formKey" :disabled="!node.isUserTask" placeholder="表单标识" clearable @change="emit('update', 'formKey', draft.formKey)" />
        </ElFormItem>
        <template v-if="node.kind === 'flow'">
          <ElFormItem v-if="node.supportsConditions" label="默认分支" for="flow-default">
            <ElSwitch id="flow-default" :model-value="node.isDefault" @change="value => emit('update', 'defaultFlow', value ? (node?.id ?? '') : '')" />
          </ElFormItem>
          <ElFormItem v-if="node.supportsConditions || node.conditionExpression" label="条件表达式" for="flow-condition">
            <ElInput id="flow-condition" v-model="draft.conditionExpression" type="textarea" :rows="5" :readonly="!node.supportsConditions" placeholder="例如：amount > 5000" @change="emit('update', 'conditionExpression', draft.conditionExpression)" />
          </ElFormItem>
          <p v-if="node.supportsConditions" class="property-help">条件按原文保存，暂不执行。设为默认分支会清除条件；输入条件会取消默认，均可撤销。</p>
          <p v-else class="property-help">本期仅配置排他网关出线的条件和默认分支。</p>
          <p v-if="node.conditionLanguage" class="property-help">已有表达式语言：{{ node.conditionLanguage }}</p>
        </template>
        <ElFormItem v-if="node.type === 'bpmn:ExclusiveGateway'" label="默认分支" for="gateway-default">
          <ElSelect id="gateway-default" v-model="draft.defaultFlowId" clearable placeholder="选择一条出线" @change="value => emit('update', 'defaultFlow', String(value ?? ''))">
            <ElOption v-for="flow in node.outgoingFlows" :key="flow.id" :label="`${flow.label} · ${flow.id}`" :value="flow.id" />
          </ElSelect>
        </ElFormItem>
        <p v-if="node.type === 'bpmn:ExclusiveGateway'" class="property-help">选择出线编辑条件。其他条件均不满足时走默认分支。</p>
        <p v-if="node.type === 'bpmn:ParallelGateway'" class="property-help">支持一层并行分叉与汇合。所有分支结束后统一判断：不通过优先于退回，全部通过才继续。分支内不可直接跳回申请节点。</p>
        </template>
      </ElForm>
      <div class="property-panel-footer"><span></span>修改后请导出保存</div>
    </template>
    <div v-else class="properties-empty">
      <DiagramIcon name="pointer" />
      <h3>选择流程、节点或连线</h3>
    </div>
  </aside>
</template>

<style scoped>
.properties-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-left: 1px solid #e6ebe8; background: #fff; }
.properties-heading { display: flex; align-items: center; justify-content: space-between; min-height: 54px; padding: 0 20px; }
.properties-heading h2 { margin: 0; color: #2a4237; font-size: 14px; font-weight: 600; }
.properties-heading .el-tag { border-color: #e5ebe7; color: #72867b; font-size: 11px; }
.selected-node-summary { display: flex; align-items: center; gap: 11px; padding: 10px 20px 22px; }
.selected-node-summary .node-symbol { width: 39px; height: 39px; border-radius: 10px; }
.selected-node-summary .diagram-icon { width: 22px; height: 22px; }
.selected-node-summary > div { min-width: 0; }
.selected-node-summary strong { display: block; color: #293a34; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.selected-node-summary div > span { display: block; margin-top: 5px; color: #839087; font-size: 11px; line-height: 1.5; }
.node-property-form { padding: 22px 20px; flex: 1; overflow-y: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: #d9e2dc transparent; }
.property-tabs { display: flex; gap: 25px; border-bottom: 1px solid #e6ebe8; margin: 0 20px; }
.property-tabs button { border: 0; border-bottom: 2px solid transparent; padding: 0 0 12px; background: none; font-size: 12px; color: #839087; cursor: pointer; }
.property-tabs button.active { color: var(--diagram-accent); border-color: var(--diagram-accent); }
.property-section-title { margin: 0 0 17px; color: #384b40; font-size: 12px; font-weight: 600; }
.section-divider { border-top: 1px solid #e6ebe8; padding-top: 22px; margin-top: 23px; }
.node-type-readonly { width: 100%; padding: 8px 10px; border-radius: 5px; background: #f8faf9; border: 1px solid #edf1ee; display: flex; align-items: center; gap: 7px; color: #7c8c80; font-size: 12px; }
.node-type-readonly .diagram-icon { width: 15px; height: 15px; }
.property-panel-footer { padding: 13px 20px 16px; font-size: 10px; color: #8a978f; display: flex; align-items: center; gap: 6px; }
.property-panel-footer span { width: 4px; height: 4px; background: #adc3b4; border-radius: 50%; }
.property-error { margin-bottom: 16px; }
.property-help { margin: 10px 0; color: #718176; font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.node-property-form :deep(.el-form-item) { margin-bottom: 18px; }
.node-property-form :deep(.el-form-item__label) { font-size: 12px; color: #63786b; }
.node-property-form :deep(.el-input__wrapper) { min-height: 35px; }
.properties-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 48px 20px; color: #a5b5aa; }
.properties-empty h3 { margin: 18px 0 9px; color: #627b6c; font-size: 14px; font-weight: 500; }
@media (max-width: 1100px) and (min-width: 761px) {
  .properties-heading, .selected-node-summary { padding-left: 16px; padding-right: 16px; }
  .node-property-form { padding-left: 16px; padding-right: 16px; }
}
@media (max-width: 760px) {
  .properties-panel { border-left: 0; border-top: 1px solid #e6ebe8; }
}
</style>
