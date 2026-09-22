<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ElAlert, ElButton, ElCard, ElCheckbox, ElDescriptions, ElDescriptionsItem,
  ElEmpty, ElMessage, ElOption, ElSelect, ElStep, ElSteps, ElTable,
  ElTableColumn, ElTag,
} from 'element-plus'
import { Delete, VideoPlay } from '@element-plus/icons-vue'
import { camundaGateway } from '@/api/camunda/gateway'
import type {
  CamundaHistoricActivity,
  CamundaHistoricProcessInstance,
  CamundaHistoricTask,
  CamundaHistoricVariableInstance,
  CamundaProcessDefinition,
  CamundaTask,
  CamundaVariables,
} from '@/api/camunda/types'
import { workflowTemplates } from '@/bpmn/templates'

type ScenarioId = 'serial' | 'amount'
type ValidationStepKey = 'deploy' | 'start' | 'tasks' | 'history' | 'cleanup'
type StepState = 'wait' | 'process' | 'success' | 'error'
type CaseState = 'pending' | 'running' | 'passed' | 'failed'

interface CasePlan {
  id: string
  label: string
  amount?: number
  inputVariables: CamundaVariables
  expectedTaskKeys: string[]
}

interface AssertionResult {
  label: string
  expected: string
  actual: string
  passed: boolean
}

interface CaseResult extends CasePlan {
  state: CaseState
  instanceId?: string
  actualTaskKeys: string[]
  assertions: AssertionResult[]
  error?: string
  history?: CamundaHistoricProcessInstance
  historicTasks: CamundaHistoricTask[]
  historicActivities: CamundaHistoricActivity[]
  variables: CamundaHistoricVariableInstance[]
}

interface ValidationRun {
  startedAt: string
  deploymentId: string
  deploymentName: string
  definition?: CamundaProcessDefinition
  cases: CaseResult[]
  state: 'running' | 'passed' | 'failed'
  cleanup: 'pending' | 'kept' | 'deleted' | 'failed'
  cleanupError?: string
}

const validationSteps = [
  { key: 'deploy', title: '部署验证', description: '创建唯一测试部署' },
  { key: 'start', title: '启动实例', description: '按场景创建测试实例' },
  { key: 'tasks', title: '任务流转', description: '完成并核对人工任务' },
  { key: 'history', title: '历史核对', description: '确认实例和任务已结束' },
  { key: 'cleanup', title: '清理测试', description: '删除测试部署及实例' },
] as const

const scenarioId = ref<ScenarioId>('serial')
const keepData = ref(false)
const running = ref(false)
const error = ref('')
const stepState = ref<Record<ValidationStepKey, StepState>>({
  deploy: 'wait', start: 'wait', tasks: 'wait', history: 'wait', cleanup: 'wait',
})
const runResult = ref<ValidationRun>()

const selectedTemplate = computed(() => workflowTemplates.find(template => template.id === scenarioId.value) ?? workflowTemplates[0])
const scenarioPlans = computed<CasePlan[]>(() => {
  if (scenarioId.value === 'amount') {
    return [4999, 5000, 5001].map(amount => ({
      id: `amount-${amount}`,
      label: `金额 ${amount}`,
      amount,
      inputVariables: { amount: { value: amount, type: 'Integer' } },
      expectedTaskKeys: ['Task_Expense', amount > 5000 ? 'Task_High' : 'Task_Standard'],
    }))
  }
  return [{
    id: 'serial-default',
    label: '默认串行路径',
    inputVariables: {},
    expectedTaskKeys: ['Task_Apply', 'Task_Manager', 'Task_Finance'],
  }]
})

const activeStepIndex = computed(() => {
  const firstRunning = validationSteps.findIndex(step => stepState.value[step.key] === 'process')
  if (firstRunning >= 0) return firstRunning
  const firstError = validationSteps.findIndex(step => stepState.value[step.key] === 'error')
  if (firstError >= 0) return firstError
  const lastSuccess = validationSteps.reduce((last, step, index) => stepState.value[step.key] === 'success' ? index : last, -1)
  return Math.min(lastSuccess + 1, validationSteps.length - 1)
})

function stepStatus(key: ValidationStepKey): 'wait' | 'process' | 'finish' | 'error' {
  const state = stepState.value[key]
  if (state === 'success') return 'finish'
  if (state === 'error') return 'error'
  return state
}

function resetSteps() {
  stepState.value = { deploy: 'wait', start: 'wait', tasks: 'wait', history: 'wait', cleanup: 'wait' }
}

function setStep(key: ValidationStepKey, state: StepState) {
  stepState.value[key] = state
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

function sleep(milliseconds: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, milliseconds))
}

function validateExecutableBpmn(source: string): string {
  const parsed = new DOMParser().parseFromString(source, 'application/xml')
  if (parsed.querySelector('parsererror')) return '模板 XML 无法解析'
  const processes = [...parsed.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'process')]
  if (processes.length !== 1) return '验证工作台要求模板只包含一个 BPMN 流程'
  if (processes[0]?.getAttribute('isExecutable') !== 'true') return '当前模板未设置 isExecutable="true"，不能启动实例'
  return ''
}

function createCaseResult(plan: CasePlan): CaseResult {
  return {
    ...plan,
    state: 'pending',
    actualTaskKeys: [],
    assertions: [],
    historicTasks: [],
    historicActivities: [],
    variables: [],
  }
}

function sortHistoricTasks(tasks: CamundaHistoricTask[]) {
  return [...tasks].sort((left, right) => String(left.startTime ?? '').localeCompare(String(right.startTime ?? '')))
}

async function waitForTask(processInstanceId: string, expectedTaskKey: string): Promise<CamundaTask> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const tasks = await camundaGateway.listTasks({ processInstanceId, maxResults: 100 })
    const expected = tasks.find(task => task.taskDefinitionKey === expectedTaskKey)
    if (expected) return expected
    if (tasks.length && tasks[0]?.taskDefinitionKey !== expectedTaskKey) {
      throw new Error(`实际出现任务 ${tasks.map(task => task.taskDefinitionKey || task.name || task.id).join('、')}，预期为 ${expectedTaskKey}`)
    }
    await sleep(250)
  }
  throw new Error(`等待任务 ${expectedTaskKey} 超时`)
}

async function waitForFinishedHistory(processInstanceId: string): Promise<CamundaHistoricProcessInstance> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const records = await camundaGateway.listHistoricProcessInstances({ processInstanceId, maxResults: 10 })
    const record = records[0]
    if (record && (Boolean(record.endTime) || record.state === 'COMPLETED')) return record
    await sleep(250)
  }
  throw new Error('流程实例未在限定时间内进入结束状态')
}

async function loadCaseEvidence(result: CaseResult) {
  if (!result.instanceId) return
  result.history = await waitForFinishedHistory(result.instanceId)
  result.historicTasks = sortHistoricTasks(await camundaGateway.listHistoricTasks({ processInstanceId: result.instanceId, maxResults: 100 }))
  try {
    result.historicActivities = await camundaGateway.listHistoricActivities({ processInstanceId: result.instanceId, maxResults: 200 })
  } catch {
    result.historicActivities = []
  }
  try {
    result.variables = await camundaGateway.listHistoricVariables({ processInstanceId: result.instanceId, maxResults: 100 })
  } catch {
    result.variables = []
  }
}

async function runCase(result: CaseResult, definitionId: string) {
  result.state = 'running'
  const instance = await camundaGateway.startById(
    definitionId,
    result.inputVariables,
    `validation-${Date.now()}-${result.id}`,
  )
  result.instanceId = instance.id
  for (const expectedTaskKey of result.expectedTaskKeys) {
    const task = await waitForTask(instance.id, expectedTaskKey)
    result.actualTaskKeys.push(task.taskDefinitionKey || task.name || task.id)
    await camundaGateway.completeTask(task.id)
  }
  await loadCaseEvidence(result)
  const historicKeys = result.historicTasks.map(task => task.taskDefinitionKey || task.name || task.id)
  const ended = Boolean(result.history?.endTime) || result.history?.state === 'COMPLETED'
  const actualTasks = result.actualTaskKeys.join(' → ')
  const expectedTasks = result.expectedTaskKeys.join(' → ')
  result.assertions = [
    {
      label: '任务顺序',
      expected: expectedTasks,
      actual: actualTasks || '—',
      passed: actualTasks === expectedTasks,
    },
    {
      label: '历史任务',
      expected: `${result.expectedTaskKeys.length} 个已完成任务`,
      actual: `${historicKeys.length} 个${historicKeys.length ? `（${historicKeys.join('、')}）` : ''}`,
      passed: historicKeys.length === result.expectedTaskKeys.length && result.historicTasks.every(task => Boolean(task.endTime)),
    },
    {
      label: '流程结束',
      expected: '已结束',
      actual: ended ? '已结束' : '仍运行',
      passed: ended,
    },
  ]
  if (result.variables.length) {
    result.assertions.push({
      label: '金额变量记录',
      expected: result.amount === undefined ? '无需金额变量' : `amount=${result.amount}`,
      actual: result.amount === undefined
        ? '—'
        : (result.variables.find(variable => variable.name === 'amount')?.value === result.amount ? `amount=${result.amount}` : '未找到匹配值'),
      passed: result.amount === undefined || result.variables.find(variable => variable.name === 'amount')?.value === result.amount,
    })
  }
  if (!result.assertions.every(assertion => assertion.passed)) throw new Error('存在未通过的流程断言')
  result.state = 'passed'
}

async function runValidation() {
  if (running.value) return
  const validationError = validateExecutableBpmn(selectedTemplate.value.xml)
  if (validationError) { error.value = validationError; return }
  running.value = true
  error.value = ''
  resetSteps()
  const deploymentName = `BPMN 验证 · ${selectedTemplate.value.name} · ${new Date().toISOString()}`
  const result: ValidationRun = {
    startedAt: new Date().toISOString(),
    deploymentId: '',
    deploymentName,
    cases: scenarioPlans.value.map(createCaseResult),
    state: 'running',
    cleanup: keepData.value ? 'kept' : 'pending',
  }
  runResult.value = result
  let deployed = false
  try {
    setStep('deploy', 'process')
    const deployment = await camundaGateway.deploy(selectedTemplate.value.xml, deploymentName, {
      enableDuplicateFiltering: false,
      deployChangedOnly: false,
    })
    deployed = true
    result.deploymentId = deployment.id
    result.definition = Object.values(deployment.deployedProcessDefinitions ?? {})[0]
    if (!result.definition?.id) {
      result.definition = (await camundaGateway.listDefinitions({ deploymentId: deployment.id, maxResults: 100 }))[0]
    }
    if (!result.definition?.id) throw new Error('部署成功但未返回流程定义 ID')
    setStep('deploy', 'success')

    setStep('start', 'process')
    setStep('tasks', 'process')
    for (const testCase of result.cases) {
      try {
        await runCase(testCase, result.definition?.id || '')
      } catch (cause) {
        testCase.state = 'failed'
        testCase.error = errorMessage(cause, '该用例执行失败')
      }
    }
    setStep('start', result.cases.some(testCase => testCase.instanceId) ? 'success' : 'error')
    setStep('tasks', result.cases.every(testCase => testCase.state === 'passed') ? 'success' : 'error')
    setStep('history', result.cases.every(testCase => testCase.history && testCase.state === 'passed') ? 'success' : 'error')
    result.state = result.cases.every(testCase => testCase.state === 'passed') ? 'passed' : 'failed'
  } catch (cause) {
    error.value = errorMessage(cause, '验证执行失败')
    result.state = 'failed'
    const activeStep = validationSteps.find(step => stepState.value[step.key] === 'process')
    if (activeStep) setStep(activeStep.key, 'error')
  } finally {
    if (!keepData.value && deployed && result.deploymentId) {
      setStep('cleanup', 'process')
      try {
        await camundaGateway.deleteDeployment(result.deploymentId, true)
        result.cleanup = 'deleted'
        setStep('cleanup', 'success')
      } catch (cause) {
        result.cleanup = 'failed'
        result.cleanupError = errorMessage(cause, '测试部署清理失败')
        setStep('cleanup', 'error')
        error.value = result.cleanupError
      }
    } else if (keepData.value) {
      setStep('cleanup', 'success')
    }
    running.value = false
    if (result.state === 'passed' && result.cleanup !== 'failed') ElMessage.success('流程验证完成')
    else if (result.state === 'failed') ElMessage.warning('流程验证完成，但有断言未通过')
  }
}

async function clearResult() {
  if (running.value || !runResult.value?.deploymentId || runResult.value.cleanup !== 'kept') {
    runResult.value = undefined
    error.value = ''
    resetSteps()
    return
  }
  try {
    await camundaGateway.deleteDeployment(runResult.value.deploymentId, true)
    runResult.value.cleanup = 'deleted'
    setStep('cleanup', 'success')
    ElMessage.success('已清理保留的测试部署')
  } catch (cause) {
    error.value = errorMessage(cause, '清理测试部署失败')
  }
}

function caseTagType(state: CaseState) {
  if (state === 'passed') return 'success'
  if (state === 'failed') return 'danger'
  if (state === 'running') return 'warning'
  return 'info'
}

function caseStateLabel(state: CaseState) {
  return { pending: '待运行', running: '运行中', passed: '通过', failed: '失败' }[state]
}

function cleanupLabel(cleanup: ValidationRun['cleanup']) {
  return { pending: '清理中', kept: '已保留', deleted: '已删除', failed: '清理失败' }[cleanup]
}
</script>

<template>
  <section class="validation-page">
    <div class="page-heading">
      <div>
        <h1>流程验证工作台</h1>
        <p>用真实 Camunda 7 REST 执行模板，并把每一步结果展示出来</p>
      </div>
      <ElButton :icon="Delete" :disabled="running" @click="clearResult">清空结果</ElButton>
    </div>

    <ElAlert
      title="这里验证的是引擎执行层：部署、启动、任务顺序、网关分支和流程结束。当前没有业务系统，因此不会验证真实登录、审批权限、业务表单或审批账本。"
      type="info"
      :closable="false"
      show-icon
      class="validation-boundary"
    />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="validation-error" />

    <ElCard shadow="never" class="validation-config">
      <div class="config-grid">
        <div>
          <label class="field-label" for="validation-scenario">验证场景</label>
          <ElSelect id="validation-scenario" v-model="scenarioId" :disabled="running" class="wide-input">
            <ElOption v-for="template in workflowTemplates.filter(item => item.id === 'serial' || item.id === 'amount')" :key="template.id" :label="`${template.name} · ${template.description}`" :value="template.id" />
          </ElSelect>
          <p class="field-note">{{ selectedTemplate.description }}</p>
        </div>
        <div class="config-action">
          <ElCheckbox v-model="keepData" :disabled="running">测试后保留 Camunda 数据</ElCheckbox>
          <ElButton type="primary" :icon="VideoPlay" :loading="running" :disabled="running" @click="runValidation">运行验证</ElButton>
        </div>
      </div>
    </ElCard>

    <ElCard shadow="never" class="step-card">
      <ElSteps :active="activeStepIndex" finish-status="success" process-status="process" align-center>
        <ElStep v-for="step in validationSteps" :key="step.key" :title="step.title" :description="step.description" :status="stepStatus(step.key)" />
      </ElSteps>
    </ElCard>

    <template v-if="runResult">
      <ElCard shadow="never" class="run-card">
        <div class="run-card-heading">
          <div>
            <h2>本次运行</h2>
            <p>{{ runResult.startedAt }} · {{ runResult.deploymentName }}</p>
          </div>
          <ElTag :type="runResult.state === 'passed' ? 'success' : runResult.state === 'failed' ? 'danger' : 'warning'">
            {{ runResult.state === 'passed' ? '验证通过' : runResult.state === 'failed' ? '存在失败' : '运行中' }}
          </ElTag>
        </div>
        <ElDescriptions :column="3" border size="small">
          <ElDescriptionsItem label="部署 ID">{{ runResult.deploymentId || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="流程定义 ID">{{ runResult.definition?.id || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="流程 key">{{ runResult.definition?.key || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="版本">{{ runResult.definition?.version ? `v${runResult.definition.version}` : '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="测试用例">{{ runResult.cases.length }} 个</ElDescriptionsItem>
          <ElDescriptionsItem label="数据清理">{{ cleanupLabel(runResult.cleanup) }}{{ runResult.cleanupError ? `：${runResult.cleanupError}` : '' }}</ElDescriptionsItem>
        </ElDescriptions>
      </ElCard>

      <div class="case-list">
        <ElCard v-for="testCase in runResult.cases" :key="testCase.id" shadow="never" class="case-card">
          <div class="case-heading">
            <div><h2>{{ testCase.label }}</h2><p v-if="testCase.amount !== undefined">启动变量：amount = {{ testCase.amount }}</p></div>
            <ElTag :type="caseTagType(testCase.state)">{{ caseStateLabel(testCase.state) }}</ElTag>
          </div>
          <ElAlert v-if="testCase.error" :title="testCase.error" type="error" :closable="false" show-icon class="case-error" />
          <ElDescriptions :column="2" border size="small" class="case-meta">
            <ElDescriptionsItem label="流程实例 ID">{{ testCase.instanceId || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="预期任务">{{ testCase.expectedTaskKeys.join(' → ') }}</ElDescriptionsItem>
          </ElDescriptions>
          <div class="task-flow">
            <span class="flow-label">实际任务流转</span>
            <template v-if="testCase.actualTaskKeys.length">
              <ElTag v-for="(taskKey, index) in testCase.actualTaskKeys" :key="`${taskKey}-${index}`" type="success">{{ taskKey }}</ElTag>
            </template>
            <span v-else class="muted">尚未产生任务结果</span>
          </div>
          <ElTable :data="testCase.assertions" size="small" empty-text="尚未生成断言" class="assertion-table">
            <ElTableColumn prop="label" label="断言" width="150" />
            <ElTableColumn prop="expected" label="预期" min-width="180" />
            <ElTableColumn prop="actual" label="实际" min-width="180" />
            <ElTableColumn label="结果" width="90">
              <template #default="{ row }"><ElTag :type="row.passed ? 'success' : 'danger'">{{ row.passed ? '通过' : '失败' }}</ElTag></template>
            </ElTableColumn>
          </ElTable>
          <details v-if="testCase.historicActivities.length || testCase.variables.length" class="evidence-details">
            <summary>查看历史证据（{{ testCase.historicActivities.length }} 个活动，{{ testCase.variables.length }} 个变量记录）</summary>
            <div class="evidence-grid">
              <div><strong>活动节点</strong><p>{{ testCase.historicActivities.map(activity => activity.activityId || activity.activityName || activity.id).join('、') || '—' }}</p></div>
              <div><strong>变量记录</strong><p>{{ testCase.variables.map(variable => `${variable.name}=${String(variable.value)}`).join('、') || '—' }}</p></div>
            </div>
          </details>
        </ElCard>
      </div>
    </template>
    <ElEmpty v-else description="选择一个场景后运行验证，结果会显示在这里" class="empty-result" />
  </section>
</template>

<style scoped>
.validation-page { display: flex; flex-direction: column; gap: 16px; }
.validation-page .page-heading { margin-bottom: 0; }
.validation-page .page-heading h1 { margin: 0; color: #243d35; font-size: 22px; font-weight: 620; }
.validation-page .page-heading p { margin: 7px 0 0; color: #798a81; font-size: 12px; }
.validation-boundary, .validation-error { margin: 0; }
.validation-config, .step-card, .run-card, .case-card { border-color: #e3e9e5; }
.config-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 28px; }
.field-label { display: block; margin-bottom: 8px; color: #50635a; font-size: 12px; }
.wide-input { width: 100%; max-width: 720px; }
.field-note { margin: 8px 0 0; color: #7d8c84; font-size: 12px; line-height: 1.6; }
.config-action { display: flex; align-items: center; gap: 18px; padding-bottom: 1px; white-space: nowrap; }
.step-card { padding: 6px 4px; }
.run-card-heading, .case-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.run-card-heading h2, .case-heading h2 { margin: 0; color: #2b4037; font-size: 16px; font-weight: 600; }
.run-card-heading p, .case-heading p { margin: 6px 0 0; color: #7d8c84; font-size: 12px; }
.case-list { display: grid; gap: 16px; }
.case-meta { margin-bottom: 16px; }
.case-error { margin-bottom: 16px; }
.task-flow { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 34px; margin-bottom: 14px; }
.flow-label { margin-right: 4px; color: #63766c; font-size: 12px; }
.muted { color: #9aa7a0; font-size: 12px; }
.assertion-table :deep(.cell) { padding: 0 12px; }
.evidence-details { margin-top: 14px; color: #6f8177; font-size: 12px; }
.evidence-details summary { cursor: pointer; }
.evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; padding: 12px; background: #f7faf8; border-radius: 4px; line-height: 1.7; }
.evidence-grid p { margin: 4px 0 0; word-break: break-word; }
.empty-result { min-height: 280px; border: 1px dashed #dbe5df; border-radius: 8px; background: #fff; }
@media (max-width: 760px) {
  .config-grid { grid-template-columns: 1fr; gap: 16px; }
  .config-action { justify-content: space-between; }
  .step-card { overflow-x: auto; }
  .step-card :deep(.el-steps) { min-width: 620px; }
  .evidence-grid { grid-template-columns: 1fr; }
}
</style>
