import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { isAxiosError } from 'axios'
import { camundaGateway } from '@/api/camunda/gateway'
import type { CamundaDeployment } from '@/api/camunda/types'
import type { DesignerDeploymentSnapshot } from '@/bpmn/deployment'

export interface DesignerDeploymentResult {
  deployment: CamundaDeployment
  processName: string
  processId: string
  deploymentName: string
}

export function useDesignerDeployment(prepare: () => Promise<DesignerDeploymentSnapshot | undefined>) {
  const visible = ref(false)
  const preparing = ref(false)
  const submitting = ref(false)
  const snapshot = shallowRef<DesignerDeploymentSnapshot>()
  const deploymentName = ref('')
  const error = ref('')
  const uncertain = ref(false)
  const checkedOutcome = ref(false)
  const result = shallowRef<DesignerDeploymentResult>()
  const lastResult = shallowRef<DesignerDeploymentResult>()
  let disposed = false
  const pending = computed(() => preparing.value || submitting.value)
  const blockingIssues = computed(() => snapshot.value?.issues.filter(issue => issue.severity === 'error') ?? [])
  const warnings = computed(() => snapshot.value?.issues.filter(issue => issue.severity === 'warning') ?? [])
  const canSubmit = computed(() => !!snapshot.value?.xml && !blockingIssues.value.length
    && !!deploymentName.value.trim() && !pending.value && !result.value
    && (!uncertain.value || checkedOutcome.value))

  async function open() {
    if (disposed || pending.value) return
    // An uncertain POST must be reconciled even if the dialog was closed.
    if (uncertain.value) { visible.value = true; return }
    preparing.value = true
    visible.value = true
    snapshot.value = undefined
    result.value = undefined
    error.value = ''
    checkedOutcome.value = false
    try {
      const captured = await prepare()
      if (disposed) return
      if (!captured) throw new Error('当前画布尚未准备好，请稍后重新打开部署。')
      snapshot.value = captured
      deploymentName.value = (captured.processes[0]?.name || captured.processes[0]?.id || '流程设计稿').slice(0, 120)
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : '读取流程失败，请重新打开部署。'
    } finally {
      if (!disposed) preparing.value = false
    }
  }

  async function submit() {
    if (disposed || !canSubmit.value || !snapshot.value) return
    const captured = snapshot.value
    const name = deploymentName.value.trim()
    submitting.value = true
    error.value = ''
    uncertain.value = false
    checkedOutcome.value = false
    try {
      const deployment = await camundaGateway.deploy(captured.xml, name, { source: 'workflow-designer' })
      if (disposed) return
      result.value = { deployment, processName: captured.processes[0]!.name, processId: captured.processes[0]!.id, deploymentName: name }
      lastResult.value = result.value
    } catch (cause) {
      if (disposed) return
      const status = isAxiosError(cause) ? cause.response?.status : undefined
      uncertain.value = !status || status >= 500 || status === 408
      const body: unknown = isAxiosError(cause) ? cause.response?.data : undefined
      const reason = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message : cause instanceof Error ? cause.message : '部署请求失败'
      error.value = uncertain.value
        ? `${reason}。部署结果尚未确认，请先到管理台核对本次部署名称与流程定义，再决定是否重试。`
        : reason
    } finally {
      if (!disposed) submitting.value = false
    }
  }

  function showLastResult() {
    if (disposed || pending.value || uncertain.value || !lastResult.value) return
    result.value = lastResult.value
    error.value = ''
    visible.value = true
  }

  function releaseUncertainAttempt() {
    if (pending.value || !checkedOutcome.value) return
    uncertain.value = false
    visible.value = false
  }

  onBeforeUnmount(() => { disposed = true })
  return { visible, preparing, submitting, pending, snapshot, deploymentName, error, uncertain, checkedOutcome,
    result, lastResult, blockingIssues, warnings, canSubmit, open, submit, showLastResult, releaseUncertainAttempt }
}
