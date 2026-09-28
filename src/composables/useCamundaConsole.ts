import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toRaw,
  type ComputedRef,
  type Ref,
} from 'vue'

import { camundaGateway } from '@/api/camunda/gateway'
import type {
  CamundaHistoricActivity,
  CamundaHistoricProcessInstance,
  CamundaHistoricTask,
  CamundaHistoricVariableInstance,
  CamundaIncident,
  CamundaJob,
  CamundaMetric,
  CamundaProcessDefinition,
  CamundaProcessInstance,
  CamundaTask,
  CamundaVersion,
  HistoricActivityQuery,
  HistoricProcessInstanceQuery,
  HistoricTaskQuery,
  HistoricVariableQuery,
  IncidentQuery,
  JobQuery,
  ProcessDefinitionQuery,
  ProcessInstanceQuery,
  TaskQuery,
  WorkflowGateway,
} from '@/api/camunda/types'

/** 查询 Camunda metrics 接口时允许使用的筛选条件。 */
export type CamundaMetricsQuery = NonNullable<Parameters<WorkflowGateway['listMetrics']>[0]>

export interface CamundaConsoleHistoryQueries {
  processInstances?: HistoricProcessInstanceQuery
  tasks?: HistoricTaskQuery
  activities?: HistoricActivityQuery
  variables?: HistoricVariableQuery
}

export interface CamundaConsoleQueries {
  definitions?: ProcessDefinitionQuery
  instances?: ProcessInstanceQuery
  tasks?: TaskQuery
  incidents?: IncidentQuery
  jobs?: JobQuery
  history?: CamundaConsoleHistoryQueries
  metrics?: CamundaMetricsQuery
}

export interface UseCamundaConsoleOptions {
  /** 便于测试或在多个 Camunda 环境间切换；默认使用项目的 camundaGateway。 */
  gateway?: WorkflowGateway
  initialQueries?: CamundaConsoleQueries
  /** 与 useTable 保持一致，默认在组件挂载后自动查询。 */
  immediate?: boolean
}

export interface CamundaConsoleCollectionState<T, Q extends object> {
  /** 当前查询结果。 */
  data: Ref<T[]>
  /** data 的语义别名，方便列表页面使用。 */
  items: Ref<T[]>
  query: Ref<Q>
  loading: Ref<boolean>
  error: Ref<Error | null>
  lastUpdated: Ref<Date | null>
  refresh(nextQuery?: Partial<Q>): Promise<T[]>
  reset(): Promise<T[]>
  dispose(): void
}

export interface CamundaConsoleValueState<T, Q extends object = Record<string, never>> {
  data: Ref<T | null>
  query: Ref<Q>
  loading: Ref<boolean>
  error: Ref<Error | null>
  lastUpdated: Ref<Date | null>
  refresh(nextQuery?: Partial<Q>): Promise<T | null>
  reset(): Promise<T | null>
  dispose(): void
}

interface HistoryState {
  processInstances: CamundaConsoleCollectionState<CamundaHistoricProcessInstance, HistoricProcessInstanceQuery>
  tasks: CamundaConsoleCollectionState<CamundaHistoricTask, HistoricTaskQuery>
  activities: CamundaConsoleCollectionState<CamundaHistoricActivity, HistoricActivityQuery>
  variables: CamundaConsoleCollectionState<CamundaHistoricVariableInstance, HistoricVariableQuery>
  loading: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  refresh(): Promise<void>
}

interface EngineState {
  version: CamundaConsoleValueState<CamundaVersion>
  metrics: CamundaConsoleCollectionState<CamundaMetric, CamundaMetricsQuery>
  loading: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  refresh(): Promise<void>
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

function clone<T>(value: T): T {
  return structuredClone(toRaw(value)) as T
}

function firstError(states: Array<{ error: { readonly value: Error | null } }>): Error | null {
  return states.map((state) => state.error.value).find((error): error is Error => Boolean(error)) ?? null
}

function createCollectionState<T, Q extends object>(
  initialQuery: Q,
  fetcher: (query: Q) => Promise<T[]>,
): CamundaConsoleCollectionState<T, Q> {
  const initial = clone(initialQuery)
  const items = shallowRef<T[]>([])
  const query = ref(clone(initial)) as Ref<Q>
  const loading = ref(false)
  const error = shallowRef<Error | null>(null)
  const lastUpdated = shallowRef<Date | null>(null)
  let requestId = 0
  let disposed = false

  async function refresh(nextQuery?: Partial<Q>): Promise<T[]> {
    if (nextQuery) query.value = { ...clone(query.value), ...clone(nextQuery) } as Q

    const currentRequestId = ++requestId
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(clone(query.value))
      if (currentRequestId === requestId && !disposed) {
        items.value = Array.isArray(result) ? result : []
        lastUpdated.value = new Date()
      }
      return Array.isArray(result) ? result : []
    } catch (cause: unknown) {
      if (currentRequestId === requestId && !disposed) error.value = asError(cause)
      return []
    } finally {
      if (currentRequestId === requestId) loading.value = false
    }
  }

  function reset(): Promise<T[]> {
    query.value = clone(initial)
    return refresh()
  }

  function dispose(): void {
    disposed = true
    requestId += 1
    loading.value = false
  }

  return { data: items, items, query, loading, error, lastUpdated, refresh, reset, dispose }
}

function createValueState<T, Q extends object>(
  initialQuery: Q,
  fetcher: (query: Q) => Promise<T>,
): CamundaConsoleValueState<T, Q> {
  const initial = clone(initialQuery)
  const data = shallowRef<T | null>(null)
  const query = ref(clone(initial)) as Ref<Q>
  const loading = ref(false)
  const error = shallowRef<Error | null>(null)
  const lastUpdated = shallowRef<Date | null>(null)
  let requestId = 0
  let disposed = false

  async function refresh(nextQuery?: Partial<Q>): Promise<T | null> {
    if (nextQuery) query.value = { ...clone(query.value), ...clone(nextQuery) } as Q

    const currentRequestId = ++requestId
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(clone(query.value))
      if (currentRequestId === requestId && !disposed) {
        data.value = result
        lastUpdated.value = new Date()
      }
      return result
    } catch (cause: unknown) {
      if (currentRequestId === requestId && !disposed) error.value = asError(cause)
      return null
    } finally {
      if (currentRequestId === requestId) loading.value = false
    }
  }

  function reset(): Promise<T | null> {
    query.value = clone(initial)
    return refresh()
  }

  function dispose(): void {
    disposed = true
    requestId += 1
    loading.value = false
  }

  return { data, query, loading, error, lastUpdated, refresh, reset, dispose }
}

/**
 * Camunda 管理工作台的查询状态。
 *
 * 该 composable 只负责查询状态、刷新和旧请求隔离，写操作仍由 gateway 的命令方法负责。
 * history 下的四个查询分别请求，页面可以只刷新当前需要的历史维度。
 */
export function useCamundaConsole(options: UseCamundaConsoleOptions = {}) {
  const gateway = options.gateway ?? camundaGateway
  const initialQueries = options.initialQueries ?? {}

  const definitions = createCollectionState<CamundaProcessDefinition, ProcessDefinitionQuery>(
    initialQueries.definitions ?? {},
    (query) => gateway.listDefinitions(query),
  )
  const instances = createCollectionState<CamundaProcessInstance, ProcessInstanceQuery>(
    initialQueries.instances ?? {},
    (query) => gateway.listProcessInstances(query),
  )
  const tasks = createCollectionState<CamundaTask, TaskQuery>(
    initialQueries.tasks ?? {},
    (query) => gateway.listTasks(query),
  )
  const incidents = createCollectionState<CamundaIncident, IncidentQuery>(
    initialQueries.incidents ?? {},
    (query) => gateway.listIncidents(query),
  )
  const jobs = createCollectionState<CamundaJob, JobQuery>(
    initialQueries.jobs ?? {},
    (query) => gateway.listJobs(query),
  )

  const history: HistoryState = {
    processInstances: createCollectionState<CamundaHistoricProcessInstance, HistoricProcessInstanceQuery>(
      initialQueries.history?.processInstances ?? {},
      (query) => gateway.listHistoricProcessInstances(query),
    ),
    tasks: createCollectionState<CamundaHistoricTask, HistoricTaskQuery>(
      initialQueries.history?.tasks ?? {},
      (query) => gateway.listHistoricTasks(query),
    ),
    activities: createCollectionState<CamundaHistoricActivity, HistoricActivityQuery>(
      initialQueries.history?.activities ?? {},
      (query) => gateway.listHistoricActivities(query),
    ),
    variables: createCollectionState<CamundaHistoricVariableInstance, HistoricVariableQuery>(
      initialQueries.history?.variables ?? {},
      (query) => gateway.listHistoricVariables(query),
    ),
    loading: computed(() => [
      history.processInstances.loading.value,
      history.tasks.loading.value,
      history.activities.loading.value,
      history.variables.loading.value,
    ].some(Boolean)),
    error: computed(() => firstError([
      history.processInstances,
      history.tasks,
      history.activities,
      history.variables,
    ])),
    async refresh() {
      await Promise.all([
        history.processInstances.refresh(),
        history.tasks.refresh(),
        history.activities.refresh(),
        history.variables.refresh(),
      ])
    },
  }

  const engineVersion = createValueState<CamundaVersion, Record<string, never>>(
    {},
    () => gateway.getVersion(),
  )
  const metrics = createCollectionState<CamundaMetric, CamundaMetricsQuery>(
    initialQueries.metrics ?? {},
    (query) => gateway.listMetrics(query),
  )
  const engine: EngineState = {
    version: engineVersion,
    metrics,
    loading: computed(() => engineVersion.loading.value || metrics.loading.value),
    error: computed(() => firstError([engineVersion, metrics])),
    async refresh() {
      await Promise.all([engineVersion.refresh(), metrics.refresh()])
    },
  }

  const collections = [definitions, instances, tasks, incidents, jobs]
  const loading = computed(() => [
    ...collections.map((state) => state.loading.value),
    history.loading.value,
    engine.loading.value,
  ].some(Boolean))
  const error = computed(() => firstError([
    ...collections,
    history,
    engine,
  ]))

  async function refreshAll(): Promise<void> {
    await Promise.all([
      definitions.refresh(),
      instances.refresh(),
      tasks.refresh(),
      incidents.refresh(),
      jobs.refresh(),
      history.refresh(),
      engine.refresh(),
    ])
  }

  async function refresh(name: 'definitions' | 'instances' | 'tasks' | 'incidents' | 'jobs' | 'history' | 'engine' | 'all' = 'all'): Promise<void> {
    if (name === 'all') return refreshAll()
    if (name === 'history') return history.refresh()
    if (name === 'engine') return engine.refresh()
    await ({ definitions, instances, tasks, incidents, jobs }[name]).refresh()
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      if (options.immediate !== false) void refreshAll()
    })
    onBeforeUnmount(() => {
      collections.forEach((state) => state.dispose())
      history.processInstances.dispose()
      history.tasks.dispose()
      history.activities.dispose()
      history.variables.dispose()
      engineVersion.dispose()
      metrics.dispose()
    })
  } else if (options.immediate !== false) {
    void refreshAll()
  }

  return {
    definitions,
    instances,
    tasks,
    incidents,
    jobs,
    history,
    engine,
    engineVersion,
    metrics,
    loading,
    error,
    refresh,
    refreshAll,
  }
}
