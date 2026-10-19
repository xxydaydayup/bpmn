<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElOption, ElSelect, ElSwitch } from 'element-plus'
import DiagramIcon from './DiagramIcon.vue'
import { presentNode } from '@/bpmn/icons'
import type { NodeProperties, NodePropertyField } from '@/bpmn/types'
import type { CamundaListenerKind, CamundaListenerSnapshot } from '@/bpmn/camundaListeners'

const props = defineProps<{ node: NodeProperties | null; disabled: boolean; error?: string }>()
const emit = defineEmits<{ update: [field: NodePropertyField, value: string]; close: []; editXml: [] }>()
const activeTab = ref('basic')
watch(() => props.node?.id, () => { activeTab.value = 'basic' })
const presentation = computed(() => presentNode(props.node?.type))
const draft = reactive({ id: '', name: '', assignee: '', candidateUsers: '', candidateGroups: '', formKey: '', conditionExpression: '', defaultFlowId: '' })
function formField(index: number, property: string): NodePropertyField { return `formFieldSet:${index}:${property}` }
function formOption(index: number, optionIndex: number, property: string): NodePropertyField { return `formOptionSet:${index}:${optionIndex}:${property}` }
function formConstraint(index: number, constraintIndex: number, property: string): NodePropertyField { return `formConstraintSet:${index}:${constraintIndex}:${property}` }
function formProperty(index: number, propertyIndex: number, property: string): NodePropertyField { return `formPropertySet:${index}:${propertyIndex}:${property}` }
const listenerKind = ref<CamundaListenerKind>('execution')
const formMode = ref<'embedded' | 'key' | 'reference'>('embedded')
const previousNodeId = ref<string | undefined>()
const formDraft = reactive({ formKey: '', formRef: '', formRefBinding: '', formRefVersion: '', businessKey: '' })
const formCommitPending = ref(false)
const nodeType = computed(() => presentation.value.label)
const countersignReadiness = computed(() => {
  const node = props.node
  if (!node || node.kind !== 'node' || !node.isUserTask) return undefined

  const voteField = node.camundaForm.fields.find(field => field.id === 'vote')
  const hasVoteCounter = node.executionListeners.some(listener => listener.expression.includes('agreeCount') && listener.expression.includes('vote'))
  const isCountersign = node.name.includes('会签') || (node.multiInstance.enabled && (!!voteField || hasVoteCounter))
  if (!isCountersign) return undefined

  const endExpressions = node.executionListeners.filter(listener => listener.event === 'end' && listener.implementation === 'expression')
  return [
    {
      label: '评审人集合、元素变量与并行办理',
      ready: node.multiInstance.enabled && node.multiInstance.mode === 'collection'
        && !!node.multiInstance.collection.trim() && !!node.multiInstance.elementVariable.trim() && !node.multiInstance.sequential,
    },
    { label: '全员完成条件', ready: !!node.multiInstance.completionCondition.trim() },
    {
      label: '同意/拒绝枚举选项',
      ready: voteField?.type === 'enum'
        && voteField.values.some(option => option.id === 'agree')
        && voteField.values.some(option => option.id === 'reject'),
    },
    { label: '投票计数结束监听器', ready: endExpressions.some(listener => listener.expression.includes('agreeCount') && listener.expression.includes('vote')) },
    { label: '参与人数记录结束监听器', ready: endExpressions.some(listener => listener.expression.includes('totalApproverCount') && listener.expression.includes('nrOfInstances')) },
  ]
})
function commitFormValue(field: 'formKey' | 'formRef' | 'formRefBinding' | 'formRefVersion' | 'formBusinessKey') {
  const property = field === 'formBusinessKey' ? 'businessKey' : field
  const value = formDraft[property]
  if (value !== props.node?.camundaForm[property]) {
    formCommitPending.value = true
    emit('update', field, value)
  }
}
function listenerField(action: string, listener: CamundaListenerSnapshot, field?: { index: number }, fieldProperty?: string): NodePropertyField {
  const prefix = listener.kind === 'execution' ? 'executionListener' : 'taskListener'
  if (field && fieldProperty) return `${prefix}${action}:${listener.index}:${field.index}:${fieldProperty}` as NodePropertyField
  if (field) return `${prefix}${action}:${listener.index}:${field.index}` as NodePropertyField
  return `${prefix}${action}:${listener.index}` as NodePropertyField
}

watch(() => props.node, (node) => {
  const selectionChanged = previousNodeId.value !== node?.id
  draft.id = node?.id ?? ''
  draft.name = node?.name ?? ''
  draft.assignee = node?.assignee ?? ''
  draft.candidateUsers = node?.candidateUsers ?? ''
  draft.candidateGroups = node?.candidateGroups ?? ''
  draft.formKey = node?.formKey ?? ''
  draft.conditionExpression = node?.conditionExpression ?? ''
  draft.defaultFlowId = node?.defaultFlowId ?? ''
  if (node && selectionChanged) {
    Object.assign(formDraft, {
      formKey: node.camundaForm.formKey,
      formRef: node.camundaForm.formRef,
      formRefBinding: node.camundaForm.formRefBinding,
      formRefVersion: node.camundaForm.formRefVersion,
      businessKey: node.camundaForm.businessKey,
    })
    formCommitPending.value = false
  } else if (node && formCommitPending.value) {
    if (formDraft.formKey === node.camundaForm.formKey
      && formDraft.formRef === node.camundaForm.formRef
      && formDraft.formRefBinding === node.camundaForm.formRefBinding
      && formDraft.formRefVersion === node.camundaForm.formRefVersion
      && formDraft.businessKey === node.camundaForm.businessKey) {
      formCommitPending.value = false
    }
  } else if (node) {
    Object.assign(formDraft, {
      formKey: node.camundaForm.formKey,
      formRef: node.camundaForm.formRef,
      formRefBinding: node.camundaForm.formRefBinding,
      formRefVersion: node.camundaForm.formRefVersion,
      businessKey: node.camundaForm.businessKey,
    })
  }
  if (node?.camundaForm.formRef) formMode.value = 'reference'
  else if (node?.camundaForm.formKey) formMode.value = 'key'
  else if (selectionChanged) formMode.value = 'embedded'
  previousNodeId.value = node?.id
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
      <ElAlert
        v-if="node.unsupportedConfiguration.length"
        class="unsupported-configuration"
        type="info"
        :closable="false"
        show-icon
      >
        <template #title>此元素包含属性面板暂不支持编辑的配置</template>
        <p class="unsupported-configuration-note">这些配置会保留在 BPMN XML 中。修改其他属性时不会清除它们；如需查看或修改，请打开完整 XML。</p>
        <ul class="unsupported-configuration-list">
          <li v-for="item in node.unsupportedConfiguration" :key="item">{{ item }}</li>
        </ul>
        <ElButton class="unsupported-configuration-action" link type="primary" @click="emit('editXml')">查看或编辑完整 XML</ElButton>
      </ElAlert>
      <div class="property-tabs" role="tablist" aria-label="节点配置">
        <button role="tab" :aria-selected="activeTab === 'basic'" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button role="tab" :aria-selected="activeTab === 'advanced'" :class="{ active: activeTab === 'advanced' }" @click="activeTab = 'advanced'">更多设置</button>
      </div>
      <ElForm label-position="top" :disabled="disabled" class="node-property-form" @submit.prevent>
        <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="property-error" />
        <ElAlert
          v-if="countersignReadiness"
          class="countersign-readiness"
          type="info"
          :closable="false"
          show-icon
        >
          <template #title>会签配置检查</template>
          <ul class="readiness-list">
            <li v-for="item in countersignReadiness" :key="item.label" :class="{ ready: item.ready }">
              {{ item.ready ? '已配置' : '待配置' }}：{{ item.label }}
            </li>
          </ul>
          <p class="readiness-help">此检查只核对配置字段与表达式中的标识，不求值表达式，也不代表 Camunda 已部署或执行。</p>
        </ElAlert>
        <template v-if="activeTab === 'advanced'">
          <h3 class="property-section-title">元素信息</h3>
          <ElFormItem label="标识"><ElInput :model-value="node.id" readonly /></ElFormItem>
          <ElFormItem label="BPMN 类型"><ElInput :model-value="node.type" readonly /></ElFormItem>
          <p class="property-help">名称与业务配置保存在流程文件中。画布外观不会改变节点的 BPMN 类型。</p>
        </template>
        <template v-else>
          <template v-if="node.kind === 'process'">
            <h3 class="property-section-title section-divider">Camunda 流程属性</h3>
            <ElFormItem label="可执行流程"><ElSwitch :model-value="node.isExecutable" @change="value => emit('update', 'processIsExecutable', value ? 'true' : 'false')" /></ElFormItem>
            <ElFormItem label="History Time To Live"><ElInput :model-value="node.processHistoryTimeToLive" @change="value => emit('update', 'processHistoryTimeToLive', String(value))" /></ElFormItem>
            <ElFormItem label="版本标签"><ElInput :model-value="node.processVersionTag" clearable @change="value => emit('update', 'processVersionTag', String(value))" /></ElFormItem>
            <ElFormItem label="作业优先级"><ElInput :model-value="node.jobPriority" clearable @change="value => emit('update', 'jobPriority', String(value))" /></ElFormItem>
            <p class="property-help">部署要求流程启用可执行；导入时缺失的历史保留期按仓库约定补为 30 天，作业优先级按原文保存。</p>
          </template>
        <h3 class="property-section-title">基本信息</h3>
        <ElFormItem v-if="node.kind === 'process'" label="流程标识" for="process-id">
          <ElInput id="process-id" v-model="draft.id" @change="emit('update', 'id', draft.id)" />
        </ElFormItem>
        <ElFormItem :label="node.kind === 'process' ? '流程名称' : node.kind === 'flow' ? '连线名称' : '节点名称'" for="node-name">
          <ElInput id="node-name" v-model="draft.name" :placeholder="node.kind === 'process' ? '填写流程名称' : node.kind === 'flow' ? '填写连线名称' : '填写节点名称'" clearable @change="emit('update', 'name', draft.name)" />
        </ElFormItem>
        <ElFormItem v-if="node.kind === 'node'" label="节点类型"><div class="node-type-readonly"><DiagramIcon :name="presentation.icon" />{{ nodeType }}</div></ElFormItem>
        <template v-if="node.isUserTask">
          <h3 class="property-section-title section-divider">Camunda 人工任务运行属性</h3>
          <ElFormItem label="任务所有者"><ElInput :model-value="node.userTaskRuntime.owner" clearable @change="value => emit('update', 'taskOwner', String(value))" /></ElFormItem>
          <ElFormItem label="任务候选用户"><ElInput :model-value="node.userTaskRuntime.candidateUsers" clearable @change="value => emit('update', 'taskCandidateUsers', String(value))" /></ElFormItem>
          <ElFormItem label="任务候选组"><ElInput :model-value="node.userTaskRuntime.candidateGroups" clearable @change="value => emit('update', 'taskCandidateGroups', String(value))" /></ElFormItem>
          <ElFormItem label="到期时间"><ElInput :model-value="node.userTaskRuntime.dueDate" placeholder="日期时间或 UEL 原文" clearable @change="value => emit('update', 'taskDueDate', String(value))" /></ElFormItem>
          <ElFormItem label="跟进时间"><ElInput :model-value="node.userTaskRuntime.followUpDate" placeholder="日期时间或 UEL 原文" clearable @change="value => emit('update', 'taskFollowUpDate', String(value))" /></ElFormItem>
          <ElFormItem label="任务优先级"><ElInput :model-value="node.userTaskRuntime.priority" placeholder="静态值或 UEL 原文" clearable @change="value => emit('update', 'taskPriority', String(value))" /></ElFormItem>
          <ElFormItem label="任务说明"><ElInput :model-value="node.userTaskRuntime.description" type="textarea" :rows="3" @change="value => emit('update', 'taskDescription', String(value))" /></ElFormItem>
          <p class="property-help">时间、优先级和表达式按原文保存，由 Camunda 在运行时解释。</p>
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
        <section v-if="node.supportsCamundaForm" class="form-editor section-divider" aria-label="Camunda 表单配置">
          <h3 class="property-section-title">Camunda 表单</h3>
          <ElAlert v-if="node.camundaForm.validation.length" class="property-error" type="error" :closable="false" :title="node.camundaForm.validation.join('；')" />
          <ElFormItem label="表单方式">
            <ElSelect v-model="formMode" @change="value => emit('update', value === 'reference' ? 'formRef' : 'formKey', value === 'reference' ? (node?.camundaForm.formRef || '') : value === 'key' ? (node?.camundaForm.formKey || '') : '')">
              <ElOption label="嵌入式表单数据" value="embedded" /><ElOption label="Form key" value="key" /><ElOption label="表单引用" value="reference" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="formMode === 'key'" label="Form key">
            <ElInput v-model="formDraft.formKey" clearable @change="commitFormValue('formKey')" />
          </ElFormItem>
          <template v-if="formMode === 'reference'">
            <ElFormItem label="表单引用"><ElInput v-model="formDraft.formRef" clearable @change="commitFormValue('formRef')" /></ElFormItem>
            <ElFormItem v-if="formDraft.formRef" label="引用绑定"><ElInput v-model="formDraft.formRefBinding" placeholder="latest、deployment 或 version" clearable @change="commitFormValue('formRefBinding')" /></ElFormItem>
            <ElFormItem v-if="formDraft.formRef" label="引用版本"><ElInput v-model="formDraft.formRefVersion" clearable @change="commitFormValue('formRefVersion')" /></ElFormItem>
          </template>
          <template v-if="formMode === 'embedded'">
            <ElFormItem label="Business key"><ElInput v-model="formDraft.businessKey" clearable @change="commitFormValue('formBusinessKey')" /></ElFormItem>
            <article v-for="field in node.camundaForm.fields" :key="field.index" class="form-field-card">
              <header><strong>表单字段 {{ field.index + 1 }}</strong><span><ElButton link :disabled="field.index === 0" @click="emit('update', `formFieldMoveUp:${field.index}`, '')">上移</ElButton><ElButton link :disabled="field.index === node!.camundaForm.fields.length - 1" @click="emit('update', `formFieldMoveDown:${field.index}`, '')">下移</ElButton><ElButton link type="danger" @click="emit('update', `formFieldRemove:${field.index}`, '')">删除</ElButton></span></header>
              <ElFormItem label="字段 ID" required><ElInput :model-value="field.id" @change="value => emit('update', formField(field.index, 'id'), String(value))" /></ElFormItem>
              <ElFormItem label="标签"><ElInput :model-value="field.label" @change="value => emit('update', formField(field.index, 'label'), String(value))" /></ElFormItem>
              <ElFormItem label="类型"><ElSelect :model-value="field.type || 'string'" @change="value => emit('update', formField(field.index, 'type'), String(value))"><ElOption v-for="type in ['string','long','boolean','date','enum']" :key="type" :label="type" :value="type" /></ElSelect></ElFormItem>
              <ElFormItem label="默认值"><ElInput :model-value="field.defaultValue" @change="value => emit('update', formField(field.index, 'default'), String(value))" /></ElFormItem>
              <ElFormItem v-if="field.type === 'date'" label="日期格式"><ElInput :model-value="field.datePattern" placeholder="yyyy-MM-dd" @change="value => emit('update', formField(field.index, 'datePattern'), String(value))" /></ElFormItem>
              <div v-if="field.type === 'enum'" class="form-nested-editor"><strong>枚举选项</strong>
                <div v-for="option in field.values" :key="option.index" class="form-nested-row"><ElInput :model-value="option.id" placeholder="ID" @change="value => emit('update', formOption(field.index, option.index, 'id'), String(value))" /><ElInput :model-value="option.name" placeholder="名称" @change="value => emit('update', formOption(field.index, option.index, 'name'), String(value))" /><span><ElButton link :disabled="option.index === 0" @click="emit('update', `formOptionMoveUp:${field.index}:${option.index}`, '')">上移</ElButton><ElButton link :disabled="option.index === field.values.length - 1" @click="emit('update', `formOptionMoveDown:${field.index}:${option.index}`, '')">下移</ElButton><ElButton link type="danger" @click="emit('update', `formOptionRemove:${field.index}:${option.index}`, '')">删除</ElButton></span></div>
                <ElButton link @click="emit('update', `formOptionAdd:${field.index}`, '')">添加选项</ElButton>
              </div>
              <div class="form-nested-editor"><strong>校验约束</strong>
                <div v-for="constraint in field.constraints" :key="constraint.index" class="form-nested-row"><ElInput :model-value="constraint.name" placeholder="约束名称" @change="value => emit('update', formConstraint(field.index, constraint.index, 'name'), String(value))" /><ElInput :model-value="constraint.config" placeholder="配置" @change="value => emit('update', formConstraint(field.index, constraint.index, 'config'), String(value))" /><ElButton link type="danger" @click="emit('update', `formConstraintRemove:${field.index}:${constraint.index}`, '')">删除</ElButton></div>
                <ElButton link @click="emit('update', `formConstraintAdd:${field.index}`, '')">添加约束</ElButton>
              </div>
              <div class="form-nested-editor"><strong>扩展属性</strong>
                <div v-for="property in field.properties" :key="property.index" class="form-nested-row"><ElInput :model-value="property.id" placeholder="ID" @change="value => emit('update', formProperty(field.index, property.index, 'id'), String(value))" /><ElInput :model-value="property.value" placeholder="值" @change="value => emit('update', formProperty(field.index, property.index, 'value'), String(value))" /><ElButton link type="danger" @click="emit('update', `formPropertyRemove:${field.index}:${property.index}`, '')">删除</ElButton></div>
                <ElButton link @click="emit('update', `formPropertyAdd:${field.index}`, '')">添加属性</ElButton>
              </div>
            </article>
            <ElButton class="listener-add" type="primary" plain @click="emit('update', 'formFieldAdd', '')">添加表单字段</ElButton>
          </template>
          <p class="property-help">表达式、校验器与表单运行时行为按原文保存，由 Camunda 和应用表单运行时验证。</p>
        </section>
        <section v-if="node.kind === 'node' && (node.type.endsWith('Task') || node.type === 'bpmn:CallActivity' || node.type === 'bpmn:SubProcess')" class="section-divider" aria-label="Camunda 异步作业配置">
          <h3 class="property-section-title">Camunda 异步与作业</h3>
          <ElFormItem label="异步前"><ElSwitch :model-value="node.asyncBefore" @change="value => emit('update', 'asyncBefore', value ? 'true' : 'false')" /></ElFormItem>
          <ElFormItem label="异步后"><ElSwitch :model-value="node.asyncAfter" @change="value => emit('update', 'asyncAfter', value ? 'true' : 'false')" /></ElFormItem>
          <ElFormItem v-if="node.asyncBefore || node.asyncAfter" label="排他作业"><ElSwitch :model-value="node.exclusive" @change="value => emit('update', 'exclusive', value ? 'true' : 'false')" /></ElFormItem>
          <ElFormItem label="作业优先级"><ElInput :model-value="node.jobPriority" clearable @change="value => emit('update', 'jobPriority', String(value))" /></ElFormItem>
          <ElFormItem label="失败重试周期"><ElInput :model-value="node.failedJobRetryTimeCycle" placeholder="例如 R3/PT10M" clearable @change="value => emit('update', 'failedJobRetryTimeCycle', String(value))" /></ElFormItem>
          <p class="property-help">重试周期按 Camunda 格式保存；表达式和作业行为由目标引擎验证。</p>
        </section>
        <section class="listener-editor section-divider" aria-label="Camunda 监听器">
          <h3 class="property-section-title">Camunda 监听器和脚本</h3>
          <ElFormItem label="监听器类型" for="listener-kind">
            <ElSelect id="listener-kind" v-model="listenerKind">
              <ElOption label="执行监听器" value="execution" />
              <ElOption v-if="node.isUserTask" label="任务监听器" value="task" />
            </ElSelect>
          </ElFormItem>
          <template v-for="listener in (listenerKind === 'execution' ? node.executionListeners : node.taskListeners)" :key="`${listener.kind}-${listener.index}`">
            <article class="listener-card">
              <header><strong>{{ listenerKind === 'execution' ? '执行监听器' : '任务监听器' }} {{ listener.index + 1 }}</strong><span><ElButton link :disabled="listener.index === 0" @click="emit('update', listenerField('MoveUp', listener), '')">上移</ElButton><ElButton link :disabled="listener.index === (listenerKind === 'execution' ? node.executionListeners.length : node.taskListeners.length) - 1" @click="emit('update', listenerField('MoveDown', listener), '')">下移</ElButton><ElButton link type="danger" @click="emit('update', listenerField('Remove', listener), '')">删除</ElButton></span></header>
              <ElFormItem label="事件" required><ElInput :model-value="listener.event" placeholder="execution：start/end/take；task：create/assignment/complete/delete/timeout/update" @change="value => emit('update', listenerField('Event', listener), String(value))" /></ElFormItem>
              <ElFormItem label="执行方式" required><ElSelect :model-value="listener.implementation" @change="value => emit('update', listenerField('Implementation', listener), String(value))"><ElOption label="Expression" value="expression" /><ElOption label="Java class" value="class" /><ElOption label="Delegate expression" value="delegateExpression" /><ElOption label="Script" value="script" /></ElSelect></ElFormItem>
              <ElFormItem v-if="listener.implementation === 'expression'" label="Expression" required><ElInput :model-value="listener.expression" placeholder="${listener.execute(execution)}" @change="value => emit('update', listenerField('Expression', listener), String(value))" /></ElFormItem>
              <ElFormItem v-else-if="listener.implementation === 'class'" label="Java class" required><ElInput :model-value="listener.className" placeholder="完整类名" @change="value => emit('update', listenerField('ClassName', listener), String(value))" /></ElFormItem>
              <ElFormItem v-else-if="listener.implementation === 'delegateExpression'" label="Delegate expression" required><ElInput :model-value="listener.delegateExpression" placeholder="${listenerDelegate}" @change="value => emit('update', listenerField('DelegateExpression', listener), String(value))" /></ElFormItem>
              <template v-else>
                <ElFormItem label="脚本格式" required><ElInput :model-value="listener.scriptFormat" placeholder="javascript" @change="value => emit('update', listenerField('ScriptFormat', listener), String(value))" /></ElFormItem>
                <ElFormItem label="脚本资源"><ElInput :model-value="listener.scriptResource" placeholder="classpath:/scripts/listener.js（可选）" @change="value => emit('update', listenerField('ScriptResource', listener), String(value))" /></ElFormItem>
                <ElFormItem label="脚本正文"><ElInput :model-value="listener.scriptBody" type="textarea" :rows="5" placeholder="直接填写 JavaScript，或使用脚本资源" @change="value => emit('update', listenerField('ScriptBody', listener), String(value))" /></ElFormItem>
              <ElAlert v-if="listener.implementation === 'script' && (!listener.scriptFormat.trim() || (!listener.scriptResource.trim() && !listener.scriptBody.trim()))" type="error" :closable="false" show-icon title="Script 需要填写格式以及脚本资源或正文" />
              </template>
              <div v-for="field in listener.fields" :key="field.index" class="listener-field">
                <ElFormItem label="Field 名称"><ElInput :model-value="field.name" @change="value => emit('update', listenerField('FieldUpdate', listener, field, 'name'), String(value))" /></ElFormItem>
                <ElFormItem label="Field 类型"><ElSelect :model-value="field.type" @change="value => emit('update', listenerField('FieldUpdate', listener, field, 'type'), String(value))"><ElOption label="字符串" value="string" /><ElOption label="表达式" value="expression" /></ElSelect></ElFormItem>
                <ElFormItem label="Field 值"><ElInput :model-value="field.value" @change="value => emit('update', listenerField('FieldUpdate', listener, field, 'value'), String(value))" /></ElFormItem>
                <ElButton link type="danger" @click="emit('update', listenerField('FieldRemove', listener, field), '')">删除 Field</ElButton>
              </div>
              <ElButton link type="primary" @click="emit('update', listenerField('FieldAdd', listener), '')">添加 Field</ElButton>
              <ElAlert v-if="listener.fields.some(field => !field.name.trim())" type="error" :closable="false" show-icon title="Field 名称必填" />
            </article>
          </template>
          <ElButton class="listener-add" type="primary" plain @click="emit('update', listenerKind === 'execution' ? 'executionListenerAdd' : 'taskListenerAdd', '')">添加{{ listenerKind === 'execution' ? '执行' : '任务' }}监听器</ElButton>
          <p class="property-help">脚本格式、表达式和脚本正文按原文保存，最终由目标 Camunda 环境校验。XML 中已有的扩展元素和其他监听器会在编辑时保留。</p>
        </section>
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
            <ElFormItem label="完成条件" for="multi-instance-completion-condition">
              <ElInput id="multi-instance-completion-condition" :model-value="node.multiInstance.completionCondition" :disabled="!!node.multiInstance.readOnlyReason" type="textarea" :rows="3" placeholder="填写 BPMN 完成条件表达式" @change="value => emit('update', 'multiInstanceCompletionCondition', String(value))" />
            </ElFormItem>
            <p class="property-help">完成条件按原文保存，由 Camunda 在多实例运行时求值。</p>
            <h4 class="property-subsection-title">多实例异步与作业</h4>
            <ElFormItem label="异步前"><ElSwitch :model-value="node.multiInstanceRuntime.asyncBefore" @change="value => emit('update', 'multiInstanceAsyncBefore', value ? 'true' : 'false')" /></ElFormItem>
            <ElFormItem label="异步后"><ElSwitch :model-value="node.multiInstanceRuntime.asyncAfter" @change="value => emit('update', 'multiInstanceAsyncAfter', value ? 'true' : 'false')" /></ElFormItem>
            <ElFormItem v-if="node.multiInstanceRuntime.asyncBefore || node.multiInstanceRuntime.asyncAfter" label="排他作业"><ElSwitch :model-value="node.multiInstanceRuntime.exclusive" @change="value => emit('update', 'multiInstanceExclusive', value ? 'true' : 'false')" /></ElFormItem>
            <ElFormItem label="作业优先级"><ElInput :model-value="node.multiInstanceRuntime.jobPriority" clearable @change="value => emit('update', 'multiInstanceJobPriority', String(value))" /></ElFormItem>
            <ElFormItem label="失败重试周期"><ElInput :model-value="node.multiInstanceRuntime.failedJobRetryTimeCycle" placeholder="例如 R3/PT10M" clearable @change="value => emit('update', 'multiInstanceFailedJobRetryTimeCycle', String(value))" /></ElFormItem>
            <p class="property-help">这些设置作用于多实例循环特征；表达式和重试行为由目标 Camunda 验证。</p>
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
.countersign-readiness { margin-bottom: 16px; }
.readiness-list { margin: 6px 0; padding-left: 18px; line-height: 1.7; }
.readiness-list li.ready { color: #287a54; }
.readiness-help { margin: 7px 0 0; color: #718176; font-size: 11px; line-height: 1.7; }
.unsupported-configuration { margin: 0 20px 16px; }
.unsupported-configuration-note { margin: 6px 0; line-height: 1.7; }
.unsupported-configuration-list { margin: 6px 0; padding-left: 18px; line-height: 1.7; overflow-wrap: anywhere; }
.unsupported-configuration-action { padding: 0; height: auto; }
.listener-editor { padding-top: 20px; }
.listener-card { margin-bottom: 16px; padding: 13px; border: 1px solid #e6ebe8; border-radius: 8px; background: #fafcfb; }
.listener-card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; color: #405449; font-size: 12px; }
.listener-card :deep(.el-form-item) { margin-bottom: 12px; }
.listener-field { margin: 12px 0; padding: 10px; border: 1px dashed #d6e1da; border-radius: 6px; }
.listener-add { width: 100%; }
.form-editor { padding-top: 20px; }
.form-field-card { margin-bottom: 16px; padding: 13px; border: 1px solid #e6ebe8; border-radius: 8px; background: #fafcfb; }
.form-field-card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; color: #405449; font-size: 12px; }
.form-field-card :deep(.el-form-item) { margin-bottom: 12px; }
.form-nested-editor { margin: 12px 0; padding: 10px; border: 1px dashed #d6e1da; border-radius: 6px; color: #52685b; font-size: 12px; }
.form-nested-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 6px; margin: 8px 0; }
.property-help { margin: 10px 0; color: #718176; font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.property-subsection-title { margin: 18px 0 12px; color: #52685b; font-size: 12px; font-weight: 600; }
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
