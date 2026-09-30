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
} from '@/api/workflow/types'

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
  const selectedTemplateKey = ref('')
  const tasks = ref<BusinessUserTask[]>([])
  const lastInstance = ref<BusinessTaskInstance>()
  const selectedTask = ref<BusinessUserTask>()
  const businessKey = ref('')
  const startedBy = ref('')
  const startVariablesText = ref('{}')
  const completeVariablesText = ref('{}')
  const error = ref('')
  const templateLoading = ref(false)
  const starting = ref(false)
  const taskLoading = ref(false)
  const completing = ref(false)
  const taskFilter = reactive({ assignee: '', candidateUser: '', candidateGroup: '', processInstanceId: '', processDefinitionKey: '' })
  let disposed = false
  let templateRevision = 0
  let taskRevision = 0
  let templateController: AbortController | undefined
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
      if (disposed || revision !== templateRevision) return
      templates.value = rows
      if (!selectedTemplate.value) selectTemplate(rows[0]?.taskKey ?? '')
    } catch (cause) {
      if (!disposed && revision === templateRevision && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        error.value = errorMessage(cause, '任务模板加载失败')
      }
    } finally {
      if (!disposed && revision === templateRevision) templateLoading.value = false
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
    const revision = ++taskRevision
    taskController?.abort()
    taskController = new AbortController()
    taskLoading.value = true
    error.value = ''
    try {
      const rows = await gateway.listTasks(taskQuery(), taskController.signal)
      if (!disposed && revision === taskRevision) tasks.value = rows
    } catch (cause) {
      if (!disposed && revision === taskRevision && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        error.value = errorMessage(cause, '人工任务加载失败')
      }
    } finally {
      if (!disposed && revision === taskRevision) taskLoading.value = false
    }
  }

  function openComplete(task: BusinessUserTask) {
    selectedTask.value = task
    completeVariablesText.value = '{}'
    error.value = ''
  }

  async function completeSelectedTask() {
    if (!selectedTask.value || completing.value) return
    let variables: BusinessVariables
    try { variables = parseObject(completeVariablesText.value, '完成变量') } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '完成变量格式错误'; return
    }
    completing.value = true
    error.value = ''
    try {
      await gateway.completeTask(selectedTask.value.id, variables)
      selectedTask.value = undefined
      await loadTasks()
    } catch (cause) {
      error.value = errorMessage(cause, '任务完成失败')
    } finally {
      completing.value = false
    }
  }

  function resetTaskFilters() {
    Object.assign(taskFilter, { assignee: '', candidateUser: '', candidateGroup: '', processInstanceId: '', processDefinitionKey: '' })
    void loadTasks()
  }

  function dispose() {
    disposed = true
    templateController?.abort()
    taskController?.abort()
  }

  return { templates, selectedTemplateKey, selectedTemplate, tasks, lastInstance, selectedTask, businessKey, startedBy,
    startVariablesText, completeVariablesText, error, templateLoading, starting, taskLoading, completing, taskFilter,
    canStart, selectTemplate, loadTemplates, startSelectedTemplate, loadTasks, openComplete, completeSelectedTask,
    resetTaskFilters, dispose }
}
