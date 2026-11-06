import { computed, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { businessWorkflowGateway } from '@/api/workflow/gateway'
import { buildNodeFormConfigs, compileStartFormVariables, formSuggestionPreview, formValueKey, initialFormValues, startVariableName, validateFormValues, variablesWithEngineValues, type WorkflowNodeSnapshot } from '@/api/workflow/nodeForms'
import type {
  BusinessTaskInstance,
  BusinessTaskQuery,
  BusinessUserTask,
  BusinessVariables,
  BusinessWorkflowGateway,
  TaskTemplate,
  TaskTemplateDetail,
} from '@/api/workflow/types'

type TaskAction = 'complete' | 'refuse' | 'reassign'

function parseObject(text: string, label: string): BusinessVariables {
  const value: unknown = text.trim() ? JSON.parse(text) : {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + '必须是 JSON 对象')
  return value as BusinessVariables
}

function errorMessage(cause: unknown, fallback: string) {
  const body: unknown = isAxiosError(cause) ? cause.response?.data : undefined
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message
  return cause instanceof Error ? cause.message : fallback
}

export function useBusinessWorkflow(gateway: BusinessWorkflowGateway = businessWorkflowGateway) {
  const templates = ref<TaskTemplate[]>([])
  const templateDetail = ref<TaskTemplateDetail>()
  const templateDetailKey = ref('')
  const templateDetailError = ref('')
  const selectedTemplateKey = ref('')
  const tasks = ref<BusinessUserTask[]>([])
  const lastInstance = ref<BusinessTaskInstance>()
  const selectedTask = ref<BusinessUserTask>()
  const reassignTargetTask = ref<BusinessUserTask>()
  const businessKey = ref('')
  const startVariablesText = ref('{}')
  const completeVariablesText = ref('{}')
  const startJsonError = ref('')
  const completeJsonError = ref('')
  const startFormValues = ref<BusinessVariables>({})
  const completeFormValues = ref<BusinessVariables>({})
  const startRawVariables = ref<BusinessVariables>({})
  const startJsonEdited = ref(false)
  const completeRawVariables = ref<BusinessVariables>({})
  const startFieldErrors = ref<Record<string, string>>({})
  const completeFieldErrors = ref<Record<string, string>>({})
  const reassignUserId = ref('')
  const error = ref('')
  const notice = ref('')
  const templateLoading = ref(false)
  const templateDetailLoading = ref(false)
  const templateMetadataLoading = ref(false)
  const deletingTemplateKey = ref('')
  const starting = ref(false)
  const taskLoading = ref(false)
  const completing = ref(false)
  const reassigning = ref(false)
  const taskFilter = reactive({ assignee: '', candidateUser: '', candidateGroup: '', processInstanceId: '', processDefinitionKey: '' })
  const actionTaskIds = reactive(new Set<string>())
  const actionTypes = reactive(new Map<string, TaskAction>())
  let disposed = false
  let templateRevision = 0
  let templateMetadataRevision = 0
  let taskRevision = 0
  let templateController: AbortController | undefined
  let detailController: AbortController | undefined
  let taskController: AbortController | undefined

  const selectedTemplate = computed(() => templates.value.find(item => item.taskKey === selectedTemplateKey.value))
  const templateDisplayNodes = computed(() => {
    const nodes = selectedTemplate.value?.displayJson?.nodes
    return Array.isArray(nodes) ? nodes as WorkflowNodeSnapshot[] : []
  })
  const selectedTemplateRules = computed(() => selectedTemplate.value?.globalVariables ?? [])
  const startFormConfigs = computed(() => buildNodeFormConfigs(templateDisplayNodes.value, 'start'))
  const startEventFieldErrors = computed<Record<string, string>>(() => Object.fromEntries(Object.entries(startFieldErrors.value).filter(([key]) => {
    const [nodeId, fieldKey] = key.split('.')
    const config = startFormConfigs.value.find(item => item.nodeId === nodeId)
    return config?.nodeType === 'timer' && config.fields.find(field => field.key === fieldKey)?.required
  })) as Record<string, string>)
  const startUnknownVariableNames = computed(() => startJsonError.value ? [] : Object.keys(startRawVariables.value).filter(name =>
    !selectedTemplateRules.value.some(rule => rule.name === name),
  ))
  const startEngineVariableNames = computed(() => variablesWithEngineValues(selectedTemplateRules.value, startRawVariables.value))
  const startEngineWarning = ref<string[]>([])
  const selectedTaskTemplate = computed(() => {
    const task = selectedTask.value
    if (!task) return undefined
    return templates.value.find(item => task.processDefinitionId && item.processDefinitionId === task.processDefinitionId)
      || templates.value.find(item => task.processDefinitionKey && item.processDefinitionKey === task.processDefinitionKey)
      || templates.value.find(item => task.processDefinitionKey && item.taskKey === task.processDefinitionKey)
  })
  const completeNodes = computed(() => {
    const nodes = selectedTaskTemplate.value?.displayJson?.nodes
    if (!Array.isArray(nodes) || !selectedTask.value?.taskDefinitionKey) return []
    const nodeId = selectedTask.value.taskDefinitionKey
    const node = (nodes as WorkflowNodeSnapshot[]).find(item => item.id === nodeId)
    return node ? [node] : []
  })
  const completeFormConfigs = computed(() => buildNodeFormConfigs(completeNodes.value, 'complete', selectedTask.value?.taskDefinitionKey))
  const completeUnknownVariableNames = computed(() => completeJsonError.value ? [] : Object.keys(completeRawVariables.value).filter(name =>
    !(selectedTaskTemplate.value?.globalVariables ?? []).some(rule => rule.name === name),
  ))
  const completeEngineVariableNames = computed(() => variablesWithEngineValues(selectedTaskTemplate.value?.globalVariables ?? [], completeRawVariables.value))
  const completeEngineWarning = ref<string[]>([])
  const canStart = computed(() => !!selectedTemplate.value && selectedTemplate.value.startable
    && !selectedTemplate.value.suspended && !!businessKey.value.trim() && !starting.value
    && !startJsonError.value && !Object.keys(startEventFieldErrors.value).length)

  function startRequestPreview() {
    const template = selectedTemplate.value
    if (!template) return '{}'
    let variables: BusinessVariables
    try { variables = parseObject(startVariablesText.value, '启动变量') } catch {
      return JSON.stringify({ templateKey: template.taskKey, businessKey: businessKey.value.trim(), variables: null, error: startJsonError.value }, null, 2)
    }
    return JSON.stringify({
      templateKey: template.taskKey,
      businessKey: businessKey.value.trim(),
      variables,
    }, null, 2)
  }

  function startFormSuggestionPreview() {
    return formSuggestionPreview('start', startFormConfigs.value, startFormValues.value)
  }

  function completeFormSuggestionPreview() {
    return formSuggestionPreview('complete', completeFormConfigs.value, completeFormValues.value)
  }

  function completeRequestVariablesPreview() {
    try {
      return JSON.stringify({ variables: parseObject(completeVariablesText.value, '完成变量') }, null, 2)
    } catch {
      return JSON.stringify({ variables: null, error: completeJsonError.value }, null, 2)
    }
  }

  function defaultStartVariables() {
    const defaults: BusinessVariables = {}
    for (const rule of selectedTemplateRules.value) {
      const source = (rule.source || 'start').toLowerCase()
      const value = rule.defaultValue !== undefined ? rule.defaultValue : rule.value
      if (source !== 'complete' && source !== 'engine' && value !== undefined && value !== null && value !== '') defaults[rule.name] = value
    }
    return defaults
  }

  function applyTemplateDefaults() {
    const raw = startJsonEdited.value ? startRawVariables.value : defaultStartVariables()
    startFormValues.value = initialFormValues(startFormConfigs.value, templateDisplayNodes.value)
    for (const config of startFormConfigs.value) {
      for (const field of config.fields.filter(item => item.variableName)) {
        const variableName = startVariableName(config, field)
        if (Object.prototype.hasOwnProperty.call(raw, variableName)) startFormValues.value[formValueKey(config.nodeId, field.key)] = raw[variableName]
      }
    }
    startFieldErrors.value = validateFormValues(startFormConfigs.value, startFormValues.value, templateDisplayNodes.value)
    if (!startJsonEdited.value) {
      startVariablesText.value = JSON.stringify(raw, null, 2)
      startRawVariables.value = raw
      startJsonError.value = ''
      startEngineWarning.value = variablesWithEngineValues(selectedTemplateRules.value, raw)
    }
  }

  function setStartFormValues(values: BusinessVariables) {
    startFormValues.value = values
    startFieldErrors.value = validateFormValues(startFormConfigs.value, values, templateDisplayNodes.value)
    if (startFormConfigs.value.some(config => config.fields.some(field => field.variableName))) {
      startJsonEdited.value = true
      const variables = compileStartFormVariables(startFormConfigs.value, values, startRawVariables.value)
      startRawVariables.value = variables
      startVariablesText.value = JSON.stringify(variables, null, 2)
      startJsonError.value = ''
      startEngineWarning.value = variablesWithEngineValues(selectedTemplateRules.value, variables)
    }
  }

  function setCompleteFormValues(values: BusinessVariables) {
    completeFormValues.value = values
    completeFieldErrors.value = validateFormValues(completeFormConfigs.value, values)
  }

  function setStartVariablesText(text: string) {
    startVariablesText.value = text
    startJsonEdited.value = true
    startEngineWarning.value = []
    let variables: BusinessVariables
    try { variables = parseObject(text, '启动变量') } catch (cause) {
      startJsonError.value = cause instanceof SyntaxError ? '变量 JSON 格式错误，请输入有效 JSON 对象' : cause instanceof Error ? cause.message : '启动变量格式错误'
      return
    }
    startRawVariables.value = variables
    for (const config of startFormConfigs.value) {
      for (const field of config.fields.filter(item => item.variableName)) {
        const variableName = startVariableName(config, field)
        startFormValues.value[formValueKey(config.nodeId, field.key)] = variables[variableName]
      }
    }
    startFieldErrors.value = validateFormValues(startFormConfigs.value, startFormValues.value, templateDisplayNodes.value)
    startEngineWarning.value = variablesWithEngineValues(selectedTemplateRules.value, variables)
    startJsonError.value = ''
  }

  function setCompleteVariablesText(text: string) {
    completeVariablesText.value = text
    completeEngineWarning.value = []
    let variables: BusinessVariables
    try { variables = parseObject(text, '完成变量') } catch (cause) {
      completeJsonError.value = cause instanceof SyntaxError ? '变量 JSON 格式错误，请输入有效 JSON 对象' : cause instanceof Error ? cause.message : '完成变量格式错误'
      return
    }
    completeRawVariables.value = variables
    completeEngineWarning.value = variablesWithEngineValues(selectedTaskTemplate.value?.globalVariables ?? [], variables)
    completeJsonError.value = ''
  }

  function initializeCompleteForm() {
    completeFormValues.value = initialFormValues(completeFormConfigs.value, completeNodes.value)
    completeFieldErrors.value = validateFormValues(completeFormConfigs.value, completeFormValues.value)
  }

  function selectTemplate(taskKey: string) {
    selectedTemplateKey.value = taskKey
    startJsonEdited.value = false
    applyTemplateDefaults()
    const template = selectedTemplate.value
    if (template && (!template.displayJson?.nodes || template.globalVariables === undefined)) void loadTemplateMetadata(taskKey)
  }

  async function loadTemplateMetadata(taskKey: string) {
    const revision = ++templateMetadataRevision
    templateMetadataLoading.value = true
    try {
      const detail = await gateway.getTemplate(taskKey)
      if (disposed || revision !== templateMetadataRevision) return
      const index = templates.value.findIndex(item => item.taskKey === taskKey)
      if (index >= 0) templates.value[index] = {
        ...templates.value[index],
        globalVariables: detail.globalVariables ?? templates.value[index]?.globalVariables ?? [],
        displayJson: detail.displayJson ?? templates.value[index]?.displayJson,
      }
      if (selectedTemplateKey.value === taskKey) applyTemplateDefaults()
      const task = selectedTask.value
      if (task && (task.processDefinitionKey === taskKey || task.processDefinitionId?.startsWith(taskKey + ':'))) initializeCompleteForm()
    } catch (cause) {
      if (!disposed && revision === templateMetadataRevision) error.value = errorMessage(cause, '流程模板信息加载失败')
    } finally {
      if (!disposed && revision === templateMetadataRevision) templateMetadataLoading.value = false
    }
  }

  async function loadTemplates() {
    const revision = ++templateRevision
    templateController?.abort()
    templateController = new AbortController()
    templateLoading.value = true
    error.value = ''
    try {
      const rows = await gateway.listTemplates({ maxResults: 100 }, templateController.signal)
      if (disposed || revision !== templateRevision) return false
      templates.value = rows
      if (!selectedTemplate.value) selectTemplate(rows[0]?.taskKey ?? '')
      return true
    } catch (cause) {
      if (!disposed && revision === templateRevision && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        error.value = errorMessage(cause, '任务模板加载失败')
      }
      return false
    } finally {
      if (!disposed && revision === templateRevision) templateLoading.value = false
    }
  }

  async function loadTemplateDetail(taskKey: string) {
    detailController?.abort()
    detailController = new AbortController()
    const controller = detailController
    templateDetailKey.value = taskKey
    templateDetail.value = undefined
    templateDetailError.value = ''
    templateDetailLoading.value = true
    try {
      const detail = await gateway.getTemplate(taskKey, controller.signal)
      if (disposed || controller !== detailController) return
      const rules = detail.globalVariables ?? []
      const normalizedDetail = { ...detail, globalVariables: rules }
      templateDetail.value = normalizedDetail
      const templateIndex = templates.value.findIndex(item => item.taskKey === taskKey)
      if (templateIndex >= 0) templates.value[templateIndex] = { ...templates.value[templateIndex], globalVariables: rules, displayJson: detail.displayJson }
      if (selectedTemplateKey.value === taskKey) applyTemplateDefaults()
    } catch (cause) {
      if (!disposed && controller === detailController && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        templateDetailError.value = errorMessage(cause, '任务模板详情加载失败')
      }
    } finally {
      if (!disposed && controller === detailController) templateDetailLoading.value = false
    }
  }

  function clearTemplateDetail() {
    detailController?.abort()
    detailController = undefined
    templateDetailKey.value = ''
    templateDetail.value = undefined
    templateDetailError.value = ''
    templateDetailLoading.value = false
  }

  async function deleteTemplate(taskKey: string) {
    if (deletingTemplateKey.value) return false
    deletingTemplateKey.value = taskKey
    error.value = ''
    notice.value = ''
    try {
      await gateway.deleteTemplate(taskKey)
      templates.value = templates.value.filter(item => item.taskKey !== taskKey)
      if (selectedTemplateKey.value === taskKey) selectTemplate(templates.value[0]?.taskKey ?? '')
      if (templateDetailKey.value === taskKey) clearTemplateDetail()
      notice.value = `任务模板 ${taskKey} 已删除，历史版本和引擎部署已保留`
      await loadTemplates()
      return true
    } catch (cause) {
      error.value = errorMessage(cause, '任务模板删除失败')
      return false
    } finally {
      deletingTemplateKey.value = ''
    }
  }

  async function startSelectedTemplate() {
    const template = selectedTemplate.value
    error.value = ''
    if (!template) { error.value = '请先选择任务模板'; return }
    if (!template.startable || template.suspended) { error.value = '当前任务模板不可发起'; return }
    if (!businessKey.value.trim()) { error.value = '请输入唯一业务键'; return }
    let variables: BusinessVariables
    try { variables = parseObject(startVariablesText.value, '启动变量') } catch (cause) {
      const message = cause instanceof SyntaxError ? '变量 JSON 格式错误，请输入有效 JSON 对象' : cause instanceof Error ? cause.message : '启动变量格式错误'
      startJsonError.value = message
      error.value = message
      return
    }
    startFieldErrors.value = validateFormValues(startFormConfigs.value, startFormValues.value, templateDisplayNodes.value)
    if (Object.keys(startEventFieldErrors.value).length) {
      error.value = Object.values(startEventFieldErrors.value)[0]
      return
    }
    variables = compileStartFormVariables(startFormConfigs.value, startFormValues.value, variables)
    starting.value = true
    try {
      const input = {
        taskKey: template.taskKey,
        businessKey: businessKey.value.trim(),
        variables,
      }
      lastInstance.value = await gateway.startTaskInstance(input)
      taskFilter.processInstanceId = lastInstance.value.processInstanceId
    } catch (cause) {
      error.value = errorMessage(cause, '业务任务实例启动失败')
    } finally {
      starting.value = false
    }
  }

  function taskQuery(): BusinessTaskQuery {
    return {
      ...(taskFilter.assignee.trim() ? { assignee: taskFilter.assignee.trim() } : {}),
      ...(taskFilter.candidateUser.trim() ? { candidateUser: taskFilter.candidateUser.trim() } : {}),
      ...(taskFilter.candidateGroup.trim() ? { candidateGroup: taskFilter.candidateGroup.trim() } : {}),
      ...(taskFilter.processInstanceId.trim() ? { processInstanceId: taskFilter.processInstanceId.trim() } : {}),
      ...(taskFilter.processDefinitionKey.trim() ? { processDefinitionKey: taskFilter.processDefinitionKey.trim() } : {}),
      maxResults: 100,
    }
  }

  async function loadTasks() {
    if (disposed) return false
    const revision = ++taskRevision
    taskController?.abort()
    taskController = new AbortController()
    taskLoading.value = true
    error.value = ''
    notice.value = ''
    let loaded = false
    try {
      const rows = await gateway.listTasks(taskQuery(), taskController.signal)
      if (!disposed && revision === taskRevision) {
        tasks.value = rows
        loaded = true
      }
    } catch (cause) {
      if (!disposed && revision === taskRevision && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        error.value = errorMessage(cause, '人工任务加载失败')
      }
    } finally {
      if (!disposed && revision === taskRevision) taskLoading.value = false
    }
    return loaded
  }

  function openComplete(task: BusinessUserTask) {
    if (taskBusy(task.id)) return
    selectedTask.value = task
    completeVariablesText.value = '{}'
    completeRawVariables.value = {}
    completeJsonError.value = ''
    completeEngineWarning.value = []
    const template = selectedTaskTemplate.value
    if (template && (!template.displayJson?.nodes || template.globalVariables === undefined)) void loadTemplateMetadata(template.taskKey)
    initializeCompleteForm()
    error.value = ''
    notice.value = ''
  }

  async function handleTaskActionFailure(cause: unknown, fallback: string, taskId: string, preserveCompletionInput = false) {
    const status = isAxiosError(cause) ? cause.response?.status : undefined
    if (status === 404 || status === 409) {
      if (!preserveCompletionInput && selectedTask.value?.id === taskId) selectedTask.value = undefined
      if (reassignTargetTask.value?.id === taskId) {
        reassignTargetTask.value = undefined
        reassignUserId.value = ''
      }
      const loaded = await loadTasks()
      error.value = loaded
        ? '任务状态已变化，请刷新后重试'
        : '任务状态已变化，刷新任务列表失败，请稍后重试'
      return
    }
    error.value = errorMessage(cause, fallback)
  }

  async function completeSelectedTask() {
    const task = selectedTask.value
    if (!task || completing.value || taskBusy(task.id)) return
    let variables: BusinessVariables
    try { variables = parseObject(completeVariablesText.value, '完成变量') } catch (cause) {
      const message = cause instanceof SyntaxError ? '变量 JSON 格式错误，请输入有效 JSON 对象' : cause instanceof Error ? cause.message : '完成变量格式错误'
      completeJsonError.value = message
      error.value = message
      return
    }
    const taskId = task.id
    beginTaskAction(taskId, 'complete')
    completing.value = true
    error.value = ''
    notice.value = ''
    try {
      await gateway.completeTask(taskId, variables)
      selectedTask.value = undefined
      const loaded = await loadTasks()
      notice.value = loaded ? '任务已完成' : '任务已完成，但任务列表刷新失败，请手动刷新'
    } catch (cause) {
      await handleTaskActionFailure(cause, '任务完成失败', taskId, true)
    } finally {
      completing.value = false
      endTaskAction(taskId)
    }
  }

  function openReassign(task: BusinessUserTask) {
    if (taskBusy(task.id)) return
    reassignTargetTask.value = task
    reassignUserId.value = task.assignee?.trim() ?? ''
    error.value = ''
    notice.value = ''
  }

  function closeReassign() {
    if (reassigning.value) return
    reassignTargetTask.value = undefined
    reassignUserId.value = ''
  }

  async function reassignSelectedTask() {
    const task = reassignTargetTask.value
    if (!task || reassigning.value || taskBusy(task.id)) return
    const userId = reassignUserId.value.trim()
    if (!userId) {
      error.value = '请输入新的办理人 userId'
      return
    }
    const taskId = task.id
    beginTaskAction(taskId, 'reassign')
    reassigning.value = true
    error.value = ''
    notice.value = ''
    try {
      const result = await gateway.reassignTask(taskId, userId)
      reassignTargetTask.value = undefined
      reassignUserId.value = ''
      const loaded = await loadTasks()
      const assignee = result.assignee || userId
      notice.value = loaded ? `任务已重派给 ${assignee}` : `任务已重派给 ${assignee}，但任务列表刷新失败，请手动刷新`
    } catch (cause) {
      await handleTaskActionFailure(cause, '任务重派失败', taskId)
    } finally {
      reassigning.value = false
      endTaskAction(taskId)
    }
  }

  async function refuseTask(task: BusinessUserTask) {
    if (taskBusy(task.id)) return
    const taskId = task.id
    beginTaskAction(taskId, 'refuse')
    error.value = ''
    notice.value = ''
    try {
      await gateway.refuseTask(taskId)
      const loaded = await loadTasks()
      notice.value = loaded ? '任务已退回待重派，需要指定新的办理人' : '任务已退回待重派，但任务列表刷新失败，请手动刷新'
    } catch (cause) {
      await handleTaskActionFailure(cause, '任务退回待重派失败', taskId)
    } finally {
      endTaskAction(taskId)
    }
  }

  function taskBusy(taskId: string) {
    return actionTaskIds.has(taskId)
  }

  function taskActionLoading(taskId: string, action: TaskAction) {
    return actionTypes.get(taskId) === action
  }

  function beginTaskAction(taskId: string, action: TaskAction) {
    actionTaskIds.add(taskId)
    actionTypes.set(taskId, action)
  }

  function endTaskAction(taskId: string) {
    actionTaskIds.delete(taskId)
    actionTypes.delete(taskId)
  }

  function resetTaskFilters() {
    Object.assign(taskFilter, { assignee: '', candidateUser: '', candidateGroup: '', processInstanceId: '', processDefinitionKey: '' })
    void loadTasks()
  }

  function dispose() {
    disposed = true
    templateController?.abort()
    detailController?.abort()
    taskController?.abort()
  }

  return { templates, selectedTemplateKey, selectedTemplate, tasks, lastInstance, selectedTask, reassignTargetTask,
    businessKey, startVariablesText, completeVariablesText, startJsonError, completeJsonError, startFormValues, completeFormValues, startUnknownVariableNames, completeUnknownVariableNames, startEngineVariableNames, completeEngineVariableNames, startEngineWarning, completeEngineWarning,
    startFieldErrors, startEventFieldErrors, completeFieldErrors, startFormConfigs, completeFormConfigs, selectedTaskTemplate,
    reassignUserId, error, notice,
    templateLoading, templateDetailLoading, templateMetadataLoading, templateDetail, templateDetailKey, templateDetailError, deletingTemplateKey, starting, taskLoading, completing, reassigning, taskFilter,
    completeNodes, canStart, startRequestPreview, startFormSuggestionPreview, completeFormSuggestionPreview, completeRequestVariablesPreview, selectTemplate, loadTemplates, loadTemplateDetail, clearTemplateDetail, deleteTemplate, startSelectedTemplate, setStartFormValues, setStartVariablesText,
    loadTasks, openComplete, completeSelectedTask, setCompleteFormValues, setCompleteVariablesText,
    openReassign, closeReassign, reassignSelectedTask, refuseTask, taskBusy, taskActionLoading, resetTaskFilters, dispose }
}
