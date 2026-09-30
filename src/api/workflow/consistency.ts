import type { WorkflowGateway } from '@/api/camunda/types'
import type { BusinessTaskInstance, BusinessWorkflowGateway, TaskTemplate } from './types'

export type ConsistencyStatus = 'passed' | 'failed' | 'observed'

export interface ConsistencyCheck {
  key: 'definition' | 'instance' | 'tasks' | 'variables' | 'activity' | 'history'
  label: string
  status: ConsistencyStatus
  detail: string
}

export interface WorkflowConsistencyReport {
  ok: boolean
  checkedAt: string
  businessInstanceId: number
  processInstanceId: string
  checks: ConsistencyCheck[]
}

type EngineGateway = Pick<WorkflowGateway,
  'listDefinitions' | 'listProcessInstances' | 'listHistoricProcessInstances' | 'listTasks'
  | 'getProcessInstanceVariables' | 'listHistoricVariables' | 'getActivityInstance' | 'listHistoricActivities'>

export interface ConsistencyDependencies {
  business: Pick<BusinessWorkflowGateway, 'listTasks'>
  engine: EngineGateway
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function exactIds(rows: Array<{ id: string }>) {
  return rows.map(item => item.id).sort()
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined
}

export async function verifyBusinessEngineConsistency(
  instance: BusinessTaskInstance,
  template: TaskTemplate,
  tenantId: string,
  dependencies: ConsistencyDependencies,
): Promise<WorkflowConsistencyReport> {
  const tenantQuery = tenantId ? { tenantIdIn: tenantId } : {}
  const [definitionsResult, liveInstancesResult, historicInstancesResult, businessTasksResult, engineTasksResult,
    liveVariablesResult, historicVariablesResult, activityResult, historicActivitiesResult] = await Promise.allSettled([
    dependencies.engine.listDefinitions({ processDefinitionId: template.processDefinitionId, ...tenantQuery }),
    dependencies.engine.listProcessInstances({ processInstanceIds: instance.processInstanceId, ...tenantQuery }),
    dependencies.engine.listHistoricProcessInstances({ processInstanceId: instance.processInstanceId, maxResults: 10 }),
    dependencies.business.listTasks({ processInstanceId: instance.processInstanceId, maxResults: 100 }),
    dependencies.engine.listTasks({ processInstanceId: instance.processInstanceId, ...tenantQuery, maxResults: 100 }),
    dependencies.engine.getProcessInstanceVariables(instance.processInstanceId, false),
    dependencies.engine.listHistoricVariables({ processInstanceId: instance.processInstanceId, deserializeValues: false, maxResults: 100 }),
    dependencies.engine.getActivityInstance(instance.processInstanceId),
    dependencies.engine.listHistoricActivities({ processInstanceId: instance.processInstanceId, maxResults: 500 }),
  ])

  const definitions = settledValue(definitionsResult) ?? []
  const definition = definitions.find(item => item.id === template.processDefinitionId)
  const definitionMatches = !!definition && definition.deploymentId === template.deploymentId
    && (!tenantId || !definition.tenantId || definition.tenantId === tenantId)

  const liveInstances = settledValue(liveInstancesResult) ?? []
  const historicInstances = settledValue(historicInstancesResult) ?? []
  const liveInstance = liveInstances.find(item => item.id === instance.processInstanceId)
  const historicInstance = historicInstances.find(item => item.id === instance.processInstanceId)
  const liveMatches = !!liveInstance && liveInstance.definitionId === instance.processDefinitionId
    && liveInstance.businessKey === instance.businessKey
    && (!tenantId || !liveInstance.tenantId || liveInstance.tenantId === tenantId)
  const historicMatches = !!historicInstance && historicInstance.processDefinitionId === instance.processDefinitionId
    && historicInstance.businessKey === instance.businessKey

  const businessTasks = settledValue(businessTasksResult) ?? []
  const engineTasks = settledValue(engineTasksResult) ?? []
  const businessTaskIds = exactIds(businessTasks)
  const engineTaskIds = exactIds(engineTasks)
  const tasksMatch = sameValue(businessTaskIds, engineTaskIds)

  const expectedVariables = instance.variables ?? {}
  const liveVariables = settledValue(liveVariablesResult)
  const historicVariables = settledValue(historicVariablesResult) ?? []
  const observedVariables = liveVariables
    ? Object.fromEntries(Object.entries(liveVariables).map(([key, item]) => [key, item.value]))
    : Object.fromEntries(historicVariables.map(item => [item.name ?? '', item.value]).filter(([name]) => !!name))
  const variableKeys = Object.keys(expectedVariables)
  const variablesMatch = variableKeys.every(key => key in observedVariables && sameValue(expectedVariables[key], observedVariables[key]))

  const activity = settledValue(activityResult)
  const historicActivities = settledValue(historicActivitiesResult) ?? []
  const activityObserved = activity?.processInstanceId === instance.processInstanceId || historicActivities.length > 0

  const checks: ConsistencyCheck[] = [
    {
      key: 'definition', label: '部署与流程定义', status: definitionMatches ? 'passed' : 'failed',
      detail: definitionMatches
        ? `业务模板 deploymentId=${template.deploymentId}、definitionId=${template.processDefinitionId} 与引擎一致`
        : `引擎未找到匹配的 deploymentId=${template.deploymentId} 与 definitionId=${template.processDefinitionId}`,
    },
    {
      key: 'instance', label: '业务实例与引擎实例', status: liveMatches || historicMatches ? 'passed' : 'failed',
      detail: liveMatches
        ? `运行实例 ${instance.processInstanceId} 的 businessKey 与流程定义一致`
        : historicMatches
          ? `运行实例已结束；历史实例 ${instance.processInstanceId} 的 businessKey 与流程定义一致`
          : `引擎运行态和历史态均未找到匹配实例 ${instance.processInstanceId}`,
    },
    {
      key: 'tasks', label: '当前人工任务', status: tasksMatch ? 'passed' : 'failed',
      detail: tasksMatch
        ? `业务接口与引擎任务 ID 一致：${businessTaskIds.join(', ') || '当前无活动任务'}`
        : `业务接口任务 [${businessTaskIds.join(', ')}] 与引擎任务 [${engineTaskIds.join(', ')}] 不一致`,
    },
    {
      key: 'variables', label: '流程变量',
      status: variableKeys.length === 0 ? 'observed' : variablesMatch ? 'passed' : 'failed',
      detail: variableKeys.length === 0
        ? `业务实例未返回启动变量；引擎已观察到 ${Object.keys(observedVariables).length} 个变量`
        : variablesMatch
          ? `业务实例返回的 ${variableKeys.length} 个变量在引擎中值一致`
          : `业务变量与引擎变量不一致，核对键：${variableKeys.join(', ')}`,
    },
    {
      key: 'activity', label: '活动树或历史活动', status: activityObserved ? 'passed' : 'failed',
      detail: activity?.processInstanceId === instance.processInstanceId
        ? `引擎活动树可读取，当前子活动 ${activity.childActivityInstances?.length ?? 0} 个`
        : historicActivities.length > 0
          ? `实例已结束或活动树不可用；已读取 ${historicActivities.length} 条历史活动`
          : '活动树与历史活动均不可用',
    },
    {
      key: 'history', label: '流程历史', status: historicMatches ? 'passed' : 'failed',
      detail: historicMatches
        ? `历史实例 ${instance.processInstanceId} 已记录，状态 ${historicInstance?.state ?? '未知'}`
        : `未找到 businessKey=${instance.businessKey} 的匹配历史实例`,
    },
  ]

  return {
    ok: checks.every(item => item.status !== 'failed'),
    checkedAt: new Date().toISOString(),
    businessInstanceId: instance.id,
    processInstanceId: instance.processInstanceId,
    checks,
  }
}
