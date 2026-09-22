<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElForm, ElFormItem, ElInput, ElOption, ElSelect, ElSwitch } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { presentNode } from '@/bpmn/icons'
import type { NodeProperties, NodePropertyField } from '@/bpmn/types'

const props = defineProps<{ node: NodeProperties | null; disabled: boolean; error?: string }>()
const emit = defineEmits<{ update: [field: NodePropertyField, value: string]; close: [] }>()
const activeTab = ref('basic')
watch(() => props.node?.id, () => { activeTab.value = 'basic' })
const presentation = computed(() => presentNode(props.node?.type))
const draft = reactive({ id: '', name: '', assignee: '', candidateUsers: '', candidateGroups: '', formKey: '', conditionExpression: '', defaultFlowId: '' })
const nodeType = computed(() => presentation.value.label)

watch(() => props.node, (node) => {
  draft.id = node?.id ?? ''
  draft.name = node?.name ?? ''
  draft.assignee = node?.assignee ?? ''
  draft.candidateUsers = node?.candidateUsers ?? ''
  draft.candidateGroups = node?.candidateGroups ?? ''
  draft.formKey = node?.formKey ?? ''
  draft.conditionExpression = node?.conditionExpression ?? ''
  draft.defaultFlowId = node?.defaultFlowId ?? ''
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
          <h3 class="property-section-title section-divider">Camunda 任务分配</h3>
          <ElFormItem label="办理人" for="node-assignee">
            <ElInput id="node-assignee" v-model="draft.assignee" placeholder="用户标识或 UEL 表达式" clearable @change="emit('update', 'assignee', draft.assignee)" />
          </ElFormItem>
          <ElFormItem label="候选用户" for="node-candidate-users">
            <ElInput id="node-candidate-users" v-model="draft.candidateUsers" placeholder="多个用户用逗号分隔，可使用 UEL" clearable @change="emit('update', 'candidateUsers', draft.candidateUsers)" />
          </ElFormItem>
          <ElFormItem label="候选组" for="node-candidate-groups">
            <ElInput id="node-candidate-groups" v-model="draft.candidateGroups" placeholder="多个组用逗号分隔，可使用 UEL" clearable @change="emit('update', 'candidateGroups', draft.candidateGroups)" />
          </ElFormItem>
          <p class="property-help">前端只保存静态值或 UEL 原文，不执行表达式。办理人、候选用户和候选组的授权与解析由 Camunda 运行时负责。</p>
        </template>
        <ElFormItem v-if="node.isUserTask" label="表单" for="node-form">
          <ElInput id="node-form" v-model="draft.formKey" :disabled="!node.isUserTask" placeholder="表单标识" clearable @change="emit('update', 'formKey', draft.formKey)" />
        </ElFormItem>
        <template v-if="node.supportsMultiInstance">
          <h3 class="property-section-title section-divider">Camunda 多实例</h3>
          <ElFormItem label="多实例"><ElSwitch :model-value="node.multiInstance.enabled" :disabled="!!node.multiInstance.readOnlyReason" @change="value => emit('update', 'multiInstanceEnabled', value ? 'true' : 'false')" /></ElFormItem>
          <ElAlert v-if="node.multiInstance.readOnlyReason" class="property-error" :title="node.multiInstance.readOnlyReason" type="warning" :closable="false" />
          <template v-if="node.multiInstance.enabled">
            <ElFormItem label="实例来源" for="multi-instance-mode">
              <ElSelect id="multi-instance-mode" :model-value="node.multiInstance.mode" :disabled="!!node.multiInstance.readOnlyReason" @change="value => emit('update', 'multiInstanceMode', String(value))">
                <ElOption label="Camunda 集合" value="collection" />
                <ElOption label="循环次数" value="cardinality" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="办理顺序" for="multi-instance-order">
              <ElSelect id="multi-instance-order" :model-value="node.multiInstance.sequential ? 'sequential' : 'parallel'" :disabled="!!node.multiInstance.readOnlyReason" @change="value => emit('update', 'multiInstanceOrder', String(value))">
                <ElOption label="并行办理" value="parallel" />
                <ElOption label="顺序办理" value="sequential" />
              </ElSelect>
            </ElFormItem>
            <template v-if="node.multiInstance.mode === 'collection'">
              <ElFormItem label="集合表达式" for="multi-instance-collection">
                <ElInput id="multi-instance-collection" :model-value="node.multiInstance.collection" :disabled="!!node.multiInstance.readOnlyReason" placeholder="例如：${reviewers}" @change="value => emit('update', 'multiInstanceCollection', String(value))" />
              </ElFormItem>
              <ElFormItem label="元素变量" for="multi-instance-variable">
                <ElInput id="multi-instance-variable" :model-value="node.multiInstance.elementVariable" :disabled="!!node.multiInstance.readOnlyReason" placeholder="例如：reviewer" @change="value => emit('update', 'multiInstanceElementVariable', String(value))" />
              </ElFormItem>
              <p class="property-help">通常将办理人配置为 `${reviewer}`，每个集合元素创建一个实例。集合和表达式由 Camunda 运行时解析。</p>
            </template>
            <ElFormItem v-else label="循环次数表达式" for="multi-instance-cardinality">
              <ElInput id="multi-instance-cardinality" :model-value="node.multiInstance.cardinality" :disabled="!!node.multiInstance.readOnlyReason" placeholder="固定数量或 UEL 表达式" @change="value => emit('update', 'multiInstanceCardinality', String(value))" />
            </ElFormItem>
          </template>
        </template>
        <template v-if="node.supportsServiceConfiguration">
          <h3 class="property-section-title section-divider">Camunda 服务任务</h3>
          <ElAlert v-if="node.serviceTask.readOnlyReason" class="property-error" :title="node.serviceTask.readOnlyReason" type="warning" :closable="false" />
          <ElFormItem label="执行方式" for="service-implementation">
            <ElSelect id="service-implementation" :model-value="node.serviceTask.implementation" :disabled="!!node.serviceTask.readOnlyReason" @change="value => emit('update', 'serviceImplementation', String(value))">
              <ElOption label="未配置" value="none" />
              <ElOption label="External Task" value="external" />
              <ElOption label="Java class" value="class" />
              <ElOption label="Delegate expression" value="delegateExpression" />
              <ElOption label="Expression" value="expression" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="node.serviceTask.implementation === 'external'" label="Topic" for="service-topic" required>
            <ElInput id="service-topic" :model-value="node.serviceTask.topic" :disabled="!!node.serviceTask.readOnlyReason" placeholder="Go worker 订阅的 topic" @change="value => emit('update', 'serviceTopic', String(value))" />
          </ElFormItem>
          <ElFormItem v-else-if="node.serviceTask.implementation === 'class'" label="Java class" for="service-class" required>
            <ElInput id="service-class" :model-value="node.serviceTask.className" :disabled="!!node.serviceTask.readOnlyReason" placeholder="完整类名" @change="value => emit('update', 'serviceClass', String(value))" />
          </ElFormItem>
          <ElFormItem v-else-if="node.serviceTask.implementation === 'delegateExpression'" label="Delegate expression" for="service-delegate" required>
            <ElInput id="service-delegate" :model-value="node.serviceTask.delegateExpression" :disabled="!!node.serviceTask.readOnlyReason" placeholder="${serviceDelegate}" @change="value => emit('update', 'serviceDelegateExpression', String(value))" />
          </ElFormItem>
          <template v-else-if="node.serviceTask.implementation === 'expression'">
            <ElFormItem label="Expression" for="service-expression" required>
              <ElInput id="service-expression" :model-value="node.serviceTask.expression" :disabled="!!node.serviceTask.readOnlyReason" placeholder="${service.execute(execution)}" @change="value => emit('update', 'serviceExpression', String(value))" />
            </ElFormItem>
            <ElFormItem label="结果变量" for="service-result-variable">
              <ElInput id="service-result-variable" :model-value="node.serviceTask.resultVariable" :disabled="!!node.serviceTask.readOnlyReason" clearable @change="value => emit('update', 'serviceResultVariable', String(value))" />
            </ElFormItem>
          </template>
          <p v-if="node.serviceTask.implementation === 'external'" class="property-help">Go worker 通过 Camunda External Task REST 按 topic 获取任务；浏览器此阶段不充当 worker。</p>
          <p v-else-if="node.serviceTask.implementation !== 'none'" class="property-help">前端只保存配置原文。Java class、Delegate expression 和 Expression 是否可执行取决于 Camunda 引擎部署环境。</p>
        </template>
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
