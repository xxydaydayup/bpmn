export type CamundaAccessMode = 'direct' | 'backend-proxy'

export interface WorkflowRuntimeInfo {
  engineMode: CamundaAccessMode
  engineLabel: string
  tenantId: string
  businessEnabled: boolean
  developerToolsEnabled: boolean
}

type RuntimeEnvironment = Record<string, unknown>

function enabled(value: unknown, fallback: boolean) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function resolveWorkflowRuntime(env: RuntimeEnvironment): WorkflowRuntimeInfo {
  const engineMode: CamundaAccessMode = env.VITE_CAMUNDA_ACCESS_MODE === 'backend-proxy'
    ? 'backend-proxy'
    : 'direct'

  return {
    engineMode,
    engineLabel: engineMode === 'backend-proxy'
      ? '后端 Camunda 代理'
      : 'Camunda 官方 REST（开发直连）',
    tenantId: typeof env.VITE_CAMUNDA_TENANT === 'string' ? env.VITE_CAMUNDA_TENANT.trim() : '',
    businessEnabled: enabled(env.VITE_BUSINESS_WORKFLOW_ENABLED, false),
    developerToolsEnabled: enabled(env.VITE_WORKFLOW_DEVTOOLS, true),
  }
}
