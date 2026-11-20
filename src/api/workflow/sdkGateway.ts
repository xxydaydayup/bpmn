import { workflowClient, workflowRequest } from './client'
import { createBusinessWorkflowGateway } from './gateway'
import type { CompleteInput, StartInput, TaskReference, TemplateSnapshot, WorkflowClient, WorkflowRequester } from '@workflow/sdk/client'
import type { BusinessTaskInstance, BusinessUserTask, BusinessWorkflowGateway, TaskTemplateDetail } from './types'

/** Operations without an SDK equivalent remain on the compatibility gateway. */
export function createSdkBusinessWorkflowGateway(
  client: WorkflowClient = workflowClient,
  legacy: BusinessWorkflowGateway = createBusinessWorkflowGateway(),
  request: WorkflowRequester = workflowRequest,
): BusinessWorkflowGateway {
  function taskReference(taskId: string, task?: BusinessUserTask): TaskReference {
    if (!task || task.id !== taskId || !task.processInstanceId || !task.processDefinitionId || !task.taskDefinitionKey) {
      throw new Error('任务缺少实例、定义版本或节点标识，请刷新任务列表后重试。')
    }
    return { ...task, processInstanceId: task.processInstanceId, processDefinitionId: task.processDefinitionId, taskDefinitionKey: task.taskDefinitionKey }
  }
  async function snapshotForTask(task: TaskReference): Promise<TemplateSnapshot> {
    // Task IDs are opaque. Match an actual definition ID, never the latest model.
    const templates = []
    for (let offset = 0; ; offset += 100) {
      const page = await legacy.listTemplates({ firstResult: offset, maxResults: 100 })
      templates.push(...page)
      if (page.length < 100) break
    }
    const current = templates.find(row => row.processDefinitionId === task.processDefinitionId)
    let match: { taskKey: string; version: number } | undefined = current
    if (!match) {
      for (const row of templates) {
        const response = await request({ method: 'GET', path: `/template/${encodeURIComponent(row.taskKey)}/history` })
        const body = response.body as { data?: unknown }
        if (response.status < 200 || response.status >= 300 || !Array.isArray(body?.data)) {
          throw new Error('无法读取任务所属模板历史，未提交办理。')
        }
        const history = body.data.find((item: unknown) => item && typeof item === 'object'
          && (item as Record<string, unknown>).processDefinitionId === task.processDefinitionId) as { version?: number } | undefined
        if (history && Number.isInteger(history.version) && history.version! > 0) {
          match = { taskKey: row.taskKey, version: history.version! }
          break
        }
      }
    }
    if (!match) throw new Error('找不到任务所属定义版本的模板快照，未提交办理。')
    const snapshot = await client.getTemplateVersion(match.taskKey, match.version)
    if (snapshot.processDefinitionId !== task.processDefinitionId) {
      throw new Error('模板快照与任务定义版本不一致，未提交办理。')
    }
    return snapshot
  }
  return {
    ...legacy,
    async getTemplate(key, signal) {
      const value = await client.getTemplate(key, { signal })
      return { ...value, taskKey: value.templateKey, taskName: value.templateName,
        version: value.templateVersion, startable: value.startable ?? true,
        bpmnXml: value.bpmnXml ?? '' } as unknown as TaskTemplateDetail
    },
    async listTasks(query = {}, signal) {
      const { firstResult, maxResults, ...filters } = query
      const page = await client.listTasks({ ...filters, offset: firstResult, limit: maxResults }, { signal })
      return page.items.map(task => ({ ...task, assignee: task.assignee ?? undefined, owner: task.owner ?? undefined }))
    },
    async startWithSdk(taskKey: string, input: StartInput) {
      const value = await client.start(taskKey, input)
      return { ...value, taskKey: value.templateKey, taskName: value.templateName,
        taskTemplateId: value.templateId } as unknown as BusinessTaskInstance
    },
    async completeWithSdk(task: BusinessUserTask, input: CompleteInput) {
      const reference = taskReference(task.id, task)
      const templateSnapshot = await snapshotForTask(reference)
      return client.complete(reference, input, { templateSnapshot })
    },
    async refuseTask(taskId, task) {
      return client.returnForReassignment(taskReference(taskId, task))
    },
    async reassignTask(taskId, userId, task) {
      const result = await client.reassign(taskReference(taskId, task), userId)
      return { ...result, assignee: result.assignee ?? userId }
    },
  }
}

export const businessWorkflowGateway = createSdkBusinessWorkflowGateway()
