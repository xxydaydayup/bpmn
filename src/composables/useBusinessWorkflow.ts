import { computed, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { businessWorkflowGateway } from '@/api/workflow/gateway'
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
  const startedBy = ref('')
  const startVariablesText = ref('{}')
  const completeVariablesText = ref('{}')
  const reassignUserId = ref('')
  const error = ref('')
  const notice = ref('')
  const templateLoading = ref(false)
  const templateDetailLoading = ref(false)
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
  let taskRevision = 0
  let templateController: AbortController | undefined
  let detailController: AbortController | undefined
  let taskController: AbortController | undefined

  const selectedTemplate = computed(() => templates.value.find(item => item.taskKey === selectedTemplateKey.value))
  const canStart = computed(() => !!selectedTemplate.value && selectedTemplate.value.startable
    && !selectedTemplate.value.suspended && !!businessKey.value.trim() && !starting.value)

  function applyTemplateDefaults() {
    const defaults: BusinessVariables = {}
    for (const item of selectedTemplate.value?.globalVariables ?? []) {
      if (item.defaultValue !== undefined && item.defaultValue !== null) defaults[item.name] = item.defaultValue
    }
    startVariablesText.value = JSON.stringify(defaults, null, 2)
  }

  function selectTemplate(taskKey: string) {
    selectedTemplateKey.value = taskKey
    applyTemplateDefaults()
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
      templateDetail.value = detail
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
      notice.value = `任务模板 ${taskKey} 及其流程定义版本已删除`
      await loadTemplates()
      return true
    } catch (cause) {
      const status = isAxiosError(cause) ? cause.response?.status : undefined
      error.value = status === 409
        ? '该任务模板存在运行中的任务实例，当前无法删除'
        : errorMessage(cause, '任务模板删除失败')
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
      error.value = cause instanceof Error ? cause.message : '启动变量格式错误'; return
    }
    starting.value = true
    try {
      const input = {
        taskKey: template.taskKey,
        businessKey: businessKey.value.trim(),
        ...(startedBy.value.trim() ? { startedBy: startedBy.value.trim() } : {}),
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
    error.value = ''
    notice.value = ''
  }

  async function handleTaskActionFailure(cause: unknown, fallback: string, taskId: string) {
    const status = isAxiosError(cause) ? cause.response?.status : undefined
    if (status === 404 || status === 409) {
      if (selectedTask.value?.id === taskId) selectedTask.value = undefined
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
      error.value = cause instanceof Error ? cause.message : '完成变量格式错误'; return
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
      await handleTaskActionFailure(cause, '任务完成失败', taskId)
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
    businessKey, startedBy, startVariablesText, completeVariablesText, reassignUserId, error, notice,
    templateLoading, templateDetailLoading, templateDetail, templateDetailKey, templateDetailError, deletingTemplateKey, starting, taskLoading, completing, reassigning, taskFilter,
    canStart, selectTemplate, loadTemplates, loadTemplateDetail, clearTemplateDetail, deleteTemplate, startSelectedTemplate, loadTasks, openComplete, completeSelectedTask,
    openReassign, closeReassign, reassignSelectedTask, refuseTask, taskBusy, taskActionLoading, resetTaskFilters, dispose }
}
