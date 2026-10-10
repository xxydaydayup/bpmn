import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const vueUrl = pathToFileURL(require.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
const axiosUrl = import.meta.resolve('axios')
const source = readFileSync(new URL('../src/composables/useBusinessWorkflow.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
let code = compiled
  .replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
  .replace(/from ['"]axios['"]/g, 'from ' + JSON.stringify(axiosUrl))
  .replace(/import \{ businessWorkflowGateway \} from ['"]@\/api\/workflow\/gateway['"];?/, 'const businessWorkflowGateway = {};')
const { effectScope } = await import(vueUrl)
const { useBusinessWorkflow } = await import(moduleUrl(code))

test('business task actions refresh state and recover from tasks changed elsewhere', async () => {
  const task = { id: 'task-1', name: '合同审批', assignee: 'alice', processInstanceId: 'instance-1' }
  let listCalls = 0
  const gateway = {
    listTasks: async () => {
      listCalls += 1
      if (listCalls === 1) return [task]
      if (listCalls === 2) return [{ ...task, assignee: 'bob' }]
      return []
    },
    reassignTask: async (_taskId, userId) => ({ taskId: task.id, status: 'reassigned', assignee: userId }),
    refuseTask: async () => { throw { isAxiosError: true, response: { status: 404 } } },
  }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow(gateway))

  try {
    await workflow.loadTasks()
    workflow.openReassign(task)
    assert.equal(workflow.reassignUserId.value, 'alice')
    workflow.reassignUserId.value = ' bob '
    await workflow.reassignSelectedTask()
    assert.equal(workflow.tasks.value[0].assignee, 'bob')
    assert.equal(workflow.notice.value, '任务已重派给 bob')
    assert.equal(workflow.reassignTargetTask.value, undefined)

    await workflow.refuseTask(workflow.tasks.value[0])
    assert.equal(workflow.tasks.value.length, 0)
    assert.equal(workflow.error.value, '任务状态已变化，请刷新后重试')
    assert.equal(listCalls, 3)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('refusing a task leaves it pending reassignment until assigned to a user', async () => {
  const task = { id: 'task-2', name: '费用审批', assignee: 'alice', processInstanceId: 'instance-2' }
  let listCalls = 0
  let refused = false
  let assignee = 'alice'
  const gateway = {
    listTasks: async () => {
      listCalls += 1
      return [{ ...task, assignee }]
    },
    refuseTask: async () => {
      refused = true
      assignee = ''
      return { taskId: task.id, status: 'pending_reassign' }
    },
    reassignTask: async (_taskId, userId) => {
      assignee = userId
      return { taskId: task.id, status: 'reassigned', assignee: userId }
    },
  }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow(gateway))

  try {
    await workflow.loadTasks()
    await workflow.refuseTask(task)
    assert.equal(refused, true)
    assert.equal(workflow.tasks.value[0].assignee, '')
    assert.equal(workflow.notice.value, '任务已退回待重派，需要指定新的办理人')

    workflow.openReassign(workflow.tasks.value[0])
    workflow.reassignUserId.value = 'bob'
    await workflow.reassignSelectedTask()
    assert.equal(workflow.tasks.value[0].assignee, 'bob')
    assert.equal(workflow.notice.value, '任务已重派给 bob')
    assert.equal(listCalls, 3)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('template details load by key and deletion updates selection while preserving conflict state', async () => {
  const templates = [
    { taskKey: 'leave', taskName: '请假', version: 2, globalVariables: [] },
    { taskKey: 'expense', taskName: '报销', version: 1, globalVariables: [] },
  ]
  let rejectDeletion = false
  const gateway = {
    listTemplates: async () => templates,
    getTemplate: async taskKey => ({ ...templates.find(item => item.taskKey === taskKey), bpmnXml: '<bpmn />' }),
    deleteTemplate: async taskKey => {
      if (rejectDeletion) throw Object.assign(new Error('active instances'), { isAxiosError: true, response: { status: 409 } })
      templates.splice(templates.findIndex(item => item.taskKey === taskKey), 1)
      return { taskKey, status: 'deleted' }
    },
  }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow(gateway))

  try {
    await workflow.loadTemplates()
    workflow.selectTemplate('leave')
    await workflow.loadTemplateDetail('leave')
    assert.equal(workflow.templateDetail.value.bpmnXml, '<bpmn />')

    assert.equal(await workflow.deleteTemplate('leave'), true)
    assert.deepEqual(workflow.templates.value.map(item => item.taskKey), ['expense'])
    assert.equal(workflow.selectedTemplateKey.value, 'expense')
    assert.equal(workflow.templateDetail.value, undefined)

    rejectDeletion = true
    assert.equal(await workflow.deleteTemplate('expense'), false)
    assert.deepEqual(workflow.templates.value.map(item => item.taskKey), ['expense'])
    assert.equal(workflow.error.value, '该任务模板存在运行中的任务实例，当前无法删除')
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('template deletion blocks duplicate requests until the active delete settles', async () => {
  let finishDelete
  let deleteCalls = 0
  const gateway = {
    listTemplates: async () => [],
    deleteTemplate: async taskKey => {
      deleteCalls += 1
      return new Promise(resolve => { finishDelete = () => resolve({ taskKey, status: 'deleted' }) })
    },
  }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow(gateway))

  try {
    const activeDelete = workflow.deleteTemplate('leave')
    assert.equal(workflow.deletingTemplateKey.value, 'leave')
    assert.equal(await workflow.deleteTemplate('expense'), false)
    assert.equal(deleteCalls, 1)
    finishDelete()
    assert.equal(await activeDelete, true)
    assert.equal(workflow.deletingTemplateKey.value, '')
  } finally {
    workflow.dispose()
    scope.stop()
  }
})
