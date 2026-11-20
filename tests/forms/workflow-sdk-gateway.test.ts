import { expect, it, vi } from 'vitest'
import { createSdkBusinessWorkflowGateway } from '@/api/workflow/sdkGateway'
import type { WorkflowClient } from '@workflow/sdk/client'
import type { BusinessWorkflowGateway } from '@/api/workflow/types'

const snapshot = { templateKey: 'leave', templateVersion: 1, processDefinitionId: 'old-definition' }
const template = { taskKey: 'leave', version: 1, processDefinitionId: 'old-definition' }
const task = { id: 'task/1', processInstanceId: 'instance', processDefinitionId: 'old-definition', taskDefinitionKey: 'review' }
it('migrates runtime operations while retaining all explicit compatibility endpoints', async () => {
  const client = {
    getTemplateVersion: vi.fn().mockResolvedValue(snapshot),
    getTemplate: vi.fn().mockResolvedValue({ templateKey: 'leave', templateVersion: 2, templateName: '请假', processDefinitionId: 'new-definition', bpmnXml: '<xml/>' }),
    listTasks: vi.fn().mockResolvedValue({ items: [task], offset: 20, limit: 10 }),
    start: vi.fn().mockResolvedValue({ templateKey: 'leave', templateId: 3, processDefinitionId: 'new-definition', processInstanceId: 'instance' }),
    complete: vi.fn().mockResolvedValue({ taskId: task.id, status: 'completed' }),
    returnForReassignment: vi.fn().mockResolvedValue({ taskId: task.id, status: 'refused' }),
    reassign: vi.fn().mockResolvedValue({ taskId: task.id, status: 'reassigned', assignee: 'bob' }),
  }
  const legacy = { startTaskInstance: vi.fn(), startTaskInstanceByNode: vi.fn(), completeTask: vi.fn(), completeTaskByNode: vi.fn(), publishTemplate: vi.fn(), listTemplates: vi.fn().mockResolvedValue([template]), deleteTemplate: vi.fn() }
  const gateway = createSdkBusinessWorkflowGateway(client as unknown as WorkflowClient, legacy as unknown as BusinessWorkflowGateway)
  const signal = new AbortController().signal
  expect(await gateway.getTemplate('leave', signal)).toMatchObject({ taskKey: 'leave', taskName: '请假', version: 2, startable: true, processDefinitionId: 'new-definition' })
  expect(await gateway.listTasks({ firstResult: 20, maxResults: 10, active: false, assignee: 'alice' }, signal)).toEqual([task])
  expect(client.listTasks).toHaveBeenCalledWith({ offset: 20, limit: 10, active: false, assignee: 'alice' }, { signal })
  expect(await gateway.startWithSdk!('leave', { businessKey: 'business', variables: { flag: false, count: 0 } })).toMatchObject({ taskKey: 'leave', taskTemplateId: 3 })
  await gateway.completeWithSdk!(task, { decision: 'reject', fields: { flag: false, count: 0 } })
  expect(client.getTemplateVersion).toHaveBeenCalledWith('leave', 1)
  expect(client.complete).toHaveBeenCalledWith(task, { decision: 'reject', fields: { flag: false, count: 0 } }, { templateSnapshot: snapshot })
  await gateway.refuseTask(task.id, task)
  await gateway.reassignTask(task.id, 'bob', task)
  expect(client.returnForReassignment).toHaveBeenCalledWith(task)
  expect(client.reassign).toHaveBeenCalledWith(task, 'bob')
  expect(gateway.startTaskInstance).toBe(legacy.startTaskInstance)
  expect(gateway.startTaskInstanceByNode).toBe(legacy.startTaskInstanceByNode)
  expect(gateway.completeTask).toBe(legacy.completeTask)
  expect(gateway.completeTaskByNode).toBe(legacy.completeTaskByNode)
  expect(gateway.publishTemplate).toBe(legacy.publishTemplate)
  expect(gateway.deleteTemplate).toBe(legacy.deleteTemplate)
})

it('never invents a version or sends reassignment for an incomplete task reference', async () => {
  const client = { reassign: vi.fn() }
  const gateway = createSdkBusinessWorkflowGateway(client as unknown as WorkflowClient, {} as BusinessWorkflowGateway)
  await expect(gateway.reassignTask('task/1', 'bob', { id: 'task/1' })).rejects.toThrow('刷新任务列表')
  expect(client.reassign).not.toHaveBeenCalled()
})

it('passes SDK status, write effect and errors through without retrying', async () => {
  const failure = Object.assign(new Error('conflict'), { httpStatus: 409, effect: 'unknown' })
  const client = { getTemplateVersion: vi.fn().mockResolvedValue(snapshot), complete: vi.fn().mockRejectedValue(failure) }
  const gateway = createSdkBusinessWorkflowGateway(client as unknown as WorkflowClient, { listTemplates: vi.fn().mockResolvedValue([template]) } as unknown as BusinessWorkflowGateway)
  await expect(gateway.completeWithSdk!(task, { decision: 'agree' })).rejects.toBe(failure)
  expect(client.complete).toHaveBeenCalledTimes(1)
})


it('resolves an old task through template history, never the latest snapshot', async () => {
  const client = { getTemplateVersion: vi.fn().mockResolvedValue(snapshot), complete: vi.fn().mockResolvedValue({ status: 'completed' }) }
  const legacy = { listTemplates: vi.fn().mockResolvedValue([{ ...template, version: 2, processDefinitionId: 'new-definition' }]) }
  const request = vi.fn().mockResolvedValue({ status: 200, body: { data: [{ version: 1, processDefinitionId: task.processDefinitionId }] } })
  const gateway = createSdkBusinessWorkflowGateway(client as unknown as WorkflowClient, legacy as unknown as BusinessWorkflowGateway, request)
  await gateway.completeWithSdk!(task, { decision: 'agree' })
  expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/template/leave/history' })
  expect(client.getTemplateVersion).toHaveBeenCalledWith('leave', 1)
  expect(client.complete).toHaveBeenCalledWith(task, { decision: 'agree' }, { templateSnapshot: snapshot })
  client.getTemplateVersion.mockResolvedValue({ ...snapshot, processDefinitionId: 'wrong' })
  await expect(gateway.completeWithSdk!(task, { decision: 'agree' })).rejects.toThrow('版本不一致')
  expect(client.complete).toHaveBeenCalledTimes(1)
})

it('does not write when definition history is missing or inaccessible', async () => {
  const client = { complete: vi.fn() }
  const legacy = { listTemplates: vi.fn().mockResolvedValue([{ ...template, processDefinitionId: 'new' }]) }
  const request = vi.fn().mockResolvedValue({ status: 200, body: { data: [] } })
  const gateway = createSdkBusinessWorkflowGateway(client as unknown as WorkflowClient, legacy as unknown as BusinessWorkflowGateway, request)
  await expect(gateway.completeWithSdk!(task, { decision: 'agree' })).rejects.toThrow('找不到')
  request.mockResolvedValue({ status: 403, body: {} })
  await expect(gateway.completeWithSdk!(task, { decision: 'agree' })).rejects.toThrow('无法读取')
  expect(client.complete).not.toHaveBeenCalled()
})
