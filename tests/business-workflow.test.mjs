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
let formHelpersCode = ts.transpileModule(readFileSync(new URL('../src/api/workflow/nodeForms.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from ['"]\.\/types['"];?/, '')
const formHelpersModuleUrl = moduleUrl(formHelpersCode)
let code = compiled
  .replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
  .replace(/from ['"]axios['"]/g, 'from ' + JSON.stringify(axiosUrl))
  .replace(/import \{[^}]+\} from ['"]@\/api\/workflow\/nodeForms['"];?/, 'const { buildNodeFormConfigs, compileStartFormVariables, formSuggestionPreview, formValueKey, initialFormValues, startVariableName, validateFormValues, variablesWithEngineValues } = await import(' + JSON.stringify(formHelpersModuleUrl) + ');')
  .replace(/import \{ businessWorkflowGateway \} from ['"]@\/api\/workflow\/gateway['"];?/, 'const businessWorkflowGateway = {};')
const { effectScope } = await import(vueUrl)
const { useBusinessWorkflow } = await import(moduleUrl(code))
const { buildNodeFormConfigs, compileStartFormVariables, formSuggestionPreview, formValueKey, initialFormValues, startVariableName, validateFormValues } = await import(formHelpersModuleUrl)

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

test('template details load by key and deletion updates selection while surfacing backend errors', async () => {
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
    assert.equal(workflow.error.value, 'active instances')
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

test('template defaults include only start variables and instance start has no unsupported actor field', async () => {
  const template = {
    taskKey: 'leave', taskName: '请假', startable: true, suspended: false,
    displayJson: { nodes: [] },
    globalVariables: [
      { name: 'applicant', type: 'String', value: 'alice', source: 'start', required: true },
      { name: 'vote', type: 'String', value: '', source: 'complete', required: true },
      { name: 'reminder', type: 'String', value: 'PT10M', source: 'engine', required: false },
    ],
  }
  let started
  const gateway = {
    listTemplates: async () => [template],
    startTaskInstance: async input => {
      started = input
      return { id: 5, taskKey: 'leave', businessKey: input.businessKey, processInstanceId: 'instance-5' }
    },
  }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow(gateway))

  try {
    await workflow.loadTemplates()
    assert.deepEqual(JSON.parse(workflow.startVariablesText.value), { applicant: 'alice' })
    assert.deepEqual(workflow.startFormValues.value, {})
    workflow.businessKey.value = 'leave-5'
    await workflow.startSelectedTemplate()
    assert.deepEqual(started, { taskKey: 'leave', businessKey: 'leave-5', variables: { applicant: 'alice' } })
    assert.equal(workflow.lastInstance.value.processInstanceId, 'instance-5')
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('node type and stage build the form contract without backend variable-name rules', () => {
  const nodes = [
    { id: 'apply', type: 'approval', name: '立项审批' },
    { id: 'reviewers', type: 'countersign', name: '评审组' },
    { id: 'single', type: 'service', name: '单次库存检查', serviceName: 'stock-check', serviceUrl: 'https://example.test/single', countersign: false },
    { id: 'multi', type: 'service', name: '多次库存检查', countersign: true },
    { id: 'branch', type: 'condition', name: '审批结果' },
    { id: 'finish', type: 'end', name: '结束' },
  ]
  const start = buildNodeFormConfigs(nodes, 'start')
  assert.deepEqual(start.map(config => [config.nodeId, config.fields.map(field => field.key)]), [
    ['apply', ['assignee']], ['reviewers', ['approverList']],
    ['single', ['serviceName', 'serviceUrl']], ['multi', ['serviceList']],
  ])
  const complete = buildNodeFormConfigs(nodes, 'complete')
  assert.deepEqual(complete.map(config => [config.nodeId, config.fields.map(field => field.key)]), [
    ['apply', ['approved']], ['reviewers', ['vote']],
  ])
  assert.deepEqual(initialFormValues(start, nodes), {
    'single.serviceName': 'stock-check',
    'single.serviceUrl': 'https://example.test/single',
  })
  assert.deepEqual(validateFormValues(start, {}), {
    'apply.assignee': '审批人为必填项',
    'reviewers.approverList': '审批参与人为必填项',
    'multi.serviceList': '服务列表为必填项',
  })
})

test('wait node startup fields map to backend variables and validate timer formats', () => {
  const nodes = [
    { id: 'receive-1', type: 'receive', name: '等待回执' },
    { id: 'timer-1', type: 'timer', name: '等待冷静期', timerType: 'duration' },
    { id: 'fixed-timer', type: 'timer', name: '固定间隔', timerType: 'duration', timerValue: 'PT30M' },
  ]
  const configs = buildNodeFormConfigs(nodes, 'start')
  assert.deepEqual(configs.map(config => [config.nodeId, config.fields.map(field => [field.key, field.variableName, field.required])]), [
    ['receive-1', [['messageName', 'receive-1_messageName', false]]],
    ['timer-1', [['timerValue', 'timer-1_timerValue', true]]],
  ])
  const values = { [formValueKey('receive-1', 'messageName')]: 'invoice.ready', [formValueKey('timer-1', 'timerValue')]: 'PT45M' }
  assert.deepEqual(compileStartFormVariables(configs, values, { applicant: 'alice' }), {
    applicant: 'alice', 'receive-1_messageName': 'invoice.ready', 'timer-1_timerValue': 'PT45M',
  })
  assert.equal(startVariableName(configs[0], configs[0].fields[0]), 'receive-1_messageName')
  assert.deepEqual(validateFormValues(configs, {}, nodes), { 'timer-1.timerValue': '定时时间为必填项' })
  assert.deepEqual(validateFormValues(configs, { 'timer-1.timerValue': 'tomorrow' }, nodes), { 'timer-1.timerValue': '请输入 ISO-8601 时长，例如 PT30M 或 P1D' })
  const dateNodes = [{ ...nodes[1], timerType: 'date' }]
  assert.deepEqual(validateFormValues(buildNodeFormConfigs(dateNodes, 'start'), { 'timer-1.timerValue': '2026-12-31T23:59:59' }, dateNodes), {})
  const fixedConfigs = buildNodeFormConfigs([nodes[2]], 'start')
  assert.deepEqual(fixedConfigs, [])
})

test('service forms and business variable JSON remain independent', async () => {
  const template = {
    taskKey: 'service-variants', taskName: '服务调用变体', startable: true, suspended: false,
    displayJson: { nodes: [
      { id: 'single', type: 'service', name: '单次库存检查', serviceName: 'stock-check', serviceUrl: 'https://example.test/single', countersign: false },
      { id: 'multi', type: 'service', name: '多次库存检查', serviceName: 'warehouse', serviceUrl: '', countersign: true },
    ] },
    globalVariables: [],
  }
  let started
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    startTaskInstance: async input => { started = input; return { id: 1, processInstanceId: 'instance-1', ...input } },
  }))
  try {
    await workflow.loadTemplates()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(workflow.startFormConfigs.value.map(config => [config.nodeId, config.fields.map(field => field.key)]), [
      ['single', ['serviceName', 'serviceUrl']], ['multi', ['serviceList']],
    ])
    assert.deepEqual(workflow.startFormValues.value, {
      'single.serviceName': 'stock-check',
      'single.serviceUrl': 'https://example.test/single',
      'multi.serviceList': [{ serviceName: 'warehouse', serviceUrl: '' }],
    })
    const actualJson = '{"single_serviceName":"json-service","single_serviceUrl":"https://example.test/json","single_serviceList":[{"serviceName":"single-json-list","serviceUrl":""}],"multi_serviceName":"json-multi-name","multi_serviceUrl":"https://example.test/unused","multi_serviceList":[{"serviceName":"warehouse-a","serviceUrl":""},{"serviceName":"warehouse-b","serviceUrl":"https://example.test/b"}],"unmapped":"keep"}'
    workflow.setStartVariablesText(actualJson)
    assert.equal(workflow.startFormValues.value['single.serviceName'], 'stock-check')
    workflow.setStartFormValues({
      ...workflow.startFormValues.value,
      'single.serviceName': 'stock-check-final',
      'multi.serviceList': [{ serviceName: 'warehouse-c', serviceUrl: '' }],
    })
    assert.equal(workflow.startVariablesText.value, actualJson)
    const suggestion = JSON.parse(workflow.startFormSuggestionPreview())
    assert.deepEqual(suggestion.nodes.map(node => [node.nodeId, node.nodeType]), [['single', 'service'], ['multi', 'service']])
    assert.deepEqual(suggestion.nodes[0], {
      nodeId: 'single', nodeType: 'service', fields: { serviceName: 'stock-check-final', serviceUrl: 'https://example.test/single' },
    })
    assert.deepEqual(JSON.parse(workflow.startRequestPreview()).variables, JSON.parse(actualJson))
    workflow.businessKey.value = 'service-variants-1'
    await workflow.startSelectedTemplate()
    assert.deepEqual(started.variables, {
      single_serviceName: 'json-service',
      single_serviceUrl: 'https://example.test/json',
      single_serviceList: [{ serviceName: 'single-json-list', serviceUrl: '' }],
      multi_serviceName: 'json-multi-name',
      multi_serviceUrl: 'https://example.test/unused',
      multi_serviceList: [{ serviceName: 'warehouse-a', serviceUrl: '' }, { serviceName: 'warehouse-b', serviceUrl: 'https://example.test/b' }],
      unmapped: 'keep',
    })
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('wait-node form and JSON synchronize bidirectionally and startup submits mapped event variables', async () => {
  const template = {
    taskKey: 'event-waits', taskName: '等待事件', startable: true, suspended: false,
    displayJson: { nodes: [
      { id: 'receive-1', type: 'receive', name: '等待回执' },
      { id: 'timer-1', type: 'timer', name: '等待冷静期', timerType: 'duration' },
      { id: 'fixed-message', type: 'receive', name: '固定消息', messageName: 'invoice.ready' },
    ] },
    globalVariables: [],
  }
  let started
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    startTaskInstance: async input => { started = input; return { id: 10, processInstanceId: 'instance-10', ...input } },
  }))
  try {
    await workflow.loadTemplates()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(workflow.startFormConfigs.value.map(config => config.nodeId), ['receive-1', 'timer-1'])
    workflow.businessKey.value = 'events-10'
    workflow.setStartFormValues({ 'receive-1.messageName': 'invoice.ready', 'timer-1.timerValue': 'PT15M' })
    assert.deepEqual(JSON.parse(workflow.startVariablesText.value), { 'receive-1_messageName': 'invoice.ready', 'timer-1_timerValue': 'PT15M' })
    workflow.setStartVariablesText('{"receive-1_messageName":"parcel.arrived","timer-1_timerValue":"P1D"}')
    assert.equal(workflow.startFormValues.value['receive-1.messageName'], 'parcel.arrived')
    assert.equal(workflow.startFormValues.value['timer-1.timerValue'], 'P1D')
    assert.equal(workflow.canStart.value, true)
    await workflow.startSelectedTemplate()
    assert.deepEqual(started.variables, { 'receive-1_messageName': 'parcel.arrived', 'timer-1_timerValue': 'P1D' })
    workflow.setStartVariablesText('{"receive-1_messageName":"parcel.arrived"}')
    assert.equal(workflow.canStart.value, false)
    assert.equal(started.variables['timer-1_timerValue'], 'P1D')
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('start form and variable JSON are independent and startup submits JSON even when form validation fails', async () => {
  const template = {
    taskKey: 'dynamic', taskName: '动态表单', startable: true, suspended: false,
    displayJson: { nodes: [{ id: 'approval-1', type: 'approval', name: '部门审批' }] },
    globalVariables: [
      { name: 'approval_1_assignee', nodeId: 'approval-1', nodeName: '部门审批', nodeType: 'approval', type: 'String', required: true, source: 'start' },
      { name: 'engine_state', nodeId: 'approval-1', nodeType: 'approval', type: 'String', source: 'engine' },
    ],
  }
  let started
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    getTemplate: async () => template,
    startTaskInstance: async input => { started = input; return { id: 9, processInstanceId: 'instance-9', ...input } },
  }))
  try {
    await workflow.loadTemplates()
    await new Promise(resolve => setTimeout(resolve, 0))
    workflow.businessKey.value = 'dynamic-9'
    assert.deepEqual(workflow.startFormConfigs.value.map(config => config.fields.map(field => field.key)), [['assignee']])
    workflow.setStartVariablesText('{"approval_1_assignee":"bob","extra":"keep","engine_state":"running"}')
    assert.equal(workflow.startFormValues.value['approval-1.assignee'], undefined)
    assert.deepEqual(JSON.parse(workflow.startVariablesText.value), { approval_1_assignee: 'bob', extra: 'keep', engine_state: 'running' })
    assert.deepEqual(workflow.startUnknownVariableNames.value, ['extra'])
    assert.deepEqual(workflow.startEngineWarning.value, ['engine_state'])
    assert.deepEqual(JSON.parse(workflow.startFormSuggestionPreview()), { stage: 'start', nodes: [{ nodeId: 'approval-1', nodeType: 'approval', fields: { assignee: null } }] })
    workflow.setStartFormValues({})
    assert.ok(workflow.startFieldErrors.value['approval-1.assignee'])
    assert.equal(workflow.canStart.value, true)
    assert.deepEqual(JSON.parse(workflow.startVariablesText.value), { approval_1_assignee: 'bob', extra: 'keep', engine_state: 'running' })
    await workflow.startSelectedTemplate()
    assert.deepEqual(started.variables, { approval_1_assignee: 'bob', extra: 'keep', engine_state: 'running' })
    workflow.setStartVariablesText('{broken')
    assert.deepEqual(workflow.startUnknownVariableNames.value, [])
    assert.equal(workflow.startEngineWarning.value.length, 0)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('invalid start JSON blocks submission and keeps the draft for correction', async () => {
  let startCalls = 0
  const template = { taskKey: 'json', taskName: 'JSON', startable: true, suspended: false, globalVariables: [] }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    startTaskInstance: async () => { startCalls += 1; throw new Error('should not start') },
  }))
  try {
    await workflow.loadTemplates()
    workflow.businessKey.value = 'json-1'
    workflow.setStartVariablesText('{bad json')
    await workflow.startSelectedTemplate()
    assert.equal(startCalls, 0)
    assert.equal(workflow.startVariablesText.value, '{bad json')
    assert.match(workflow.startJsonError.value, /格式错误/)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('invalid completion JSON blocks the task request but retains both independent drafts', async () => {
  let completeCalls = 0
  const template = {
    taskKey: 'approval-flow', taskName: '审批流程', processDefinitionKey: 'approval-flow', processDefinitionId: 'approval-flow:1:abc', startable: true, suspended: false,
    globalVariables: [{ name: 'approval-1_approved', nodeId: 'approval-1', nodeName: '部门审批', nodeType: 'approval', type: 'Boolean', required: true, source: 'complete' }],
    displayJson: { nodes: [{ id: 'approval-1', name: '部门审批', type: 'approval' }] },
  }
  const task = { id: 'task-invalid-json', name: '部门审批', assignee: 'alice', taskDefinitionKey: 'approval-1', processDefinitionKey: 'approval-flow', processDefinitionId: template.processDefinitionId, processInstanceId: 'instance-1' }
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    completeTask: async () => { completeCalls += 1 },
  }))
  try {
    await workflow.loadTemplates()
    workflow.openComplete(task)
    workflow.setCompleteFormValues({ 'approval-1.approved': true })
    workflow.setCompleteVariablesText('{invalid')
    assert.deepEqual(workflow.completeUnknownVariableNames.value, [])
    assert.equal(workflow.completeEngineWarning.value.length, 0)
    await workflow.completeSelectedTask()
    assert.equal(completeCalls, 0)
    assert.equal(workflow.completeVariablesText.value, '{invalid')
    assert.equal(workflow.completeFormValues.value['approval-1.approved'], true)
    assert.match(workflow.completeJsonError.value, /格式错误/)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('completion form and JSON are independent, and completion submits only JSON after API rejection', async () => {
  const rules = [
    { name: 'approval-1_approved', nodeId: 'approval-1', nodeName: '部门审批', nodeType: 'approval', type: 'Boolean', required: true, source: 'complete' },
    { name: 'approval-2_approved', nodeId: 'approval-2', nodeName: '复核', nodeType: 'approval', type: 'Boolean', required: true, source: 'complete' },
  ]
  const template = { taskKey: 'approval-flow', taskName: '审批流程', processDefinitionKey: 'approval-flow', processDefinitionId: 'approval-flow:1:abc', startable: true, suspended: false, globalVariables: rules, displayJson: { nodes: [{ id: 'approval-1', type: 'approval' }, { id: 'approval-2', type: 'approval' }] } }
  const task = { id: 'task-1', name: '部门审批', assignee: 'alice', taskDefinitionKey: 'approval-1', processDefinitionKey: 'approval-flow', processDefinitionId: template.processDefinitionId, processInstanceId: 'instance-1' }
  const scope = effectScope()
  let completedVariables
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    listTasks: async () => [task],
    completeTask: async (_taskId, variables) => { completedVariables = variables; throw new Error('backend rejected') },
  }))
  try {
    await workflow.loadTemplates()
    workflow.openComplete(task)
    assert.deepEqual(workflow.completeFormConfigs.value.map(config => config.nodeId), ['approval-1'])
    workflow.setCompleteVariablesText('{"approval-1_approved":true,"extra":"retained"}')
    assert.equal(workflow.completeFormValues.value['approval-1.approved'], undefined)
    assert.deepEqual(JSON.parse(workflow.completeRequestVariablesPreview()), { variables: { 'approval-1_approved': true, extra: 'retained' } })
    workflow.setCompleteFormValues({})
    assert.ok(workflow.completeFieldErrors.value['approval-1.approved'])
    assert.deepEqual(JSON.parse(workflow.completeVariablesText.value), { 'approval-1_approved': true, extra: 'retained' })
    assert.deepEqual(JSON.parse(workflow.completeFormSuggestionPreview()), { stage: 'complete', nodes: [{ nodeId: 'approval-1', nodeType: 'approval', fields: { approved: null } }] })
    await workflow.completeSelectedTask()
    assert.deepEqual(completedVariables, { 'approval-1_approved': true, extra: 'retained' })
    assert.equal(workflow.selectedTask.value.id, 'task-1')
    assert.deepEqual(JSON.parse(workflow.completeVariablesText.value), { 'approval-1_approved': true, extra: 'retained' })
    assert.equal(workflow.error.value, 'backend rejected')
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('node-mapped startup submits node fields while legacy startup keeps its variables contract', async () => {
  const template = {
    taskKey: 'node-start', taskName: '按节点启动', startable: true, suspended: false,
    displayJson: { nodes: [
      { id: 'approval-1', type: 'approval', name: '部门审批' },
      { id: 'approval-2', type: 'approval', name: '复核' },
    ] },
    globalVariables: [],
  }
  const nodeStarts = []
  const legacyStarts = []
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    startTaskInstanceByNode: async input => { nodeStarts.push(input); return { id: 11, processInstanceId: 'node-instance', ...input } },
    startTaskInstance: async input => { legacyStarts.push(input); return { id: 12, processInstanceId: 'legacy-instance', ...input } },
  }))
  try {
    await workflow.loadTemplates()
    workflow.businessKey.value = 'node-start-1'
    workflow.setStartVariablesText('{"unmapped":"keep","approval-1_assignee":"explicit"}')
    workflow.setStartFormValues({ 'approval-1.assignee': 'alice', 'approval-2.assignee': 'bob' })
    assert.deepEqual(JSON.parse(workflow.startNodeRequestPreview()), {
      templateKey: 'node-start', businessKey: 'node-start-1',
      variables: { unmapped: 'keep', 'approval-1_assignee': 'explicit' },
      nodes: [
        { nodeId: 'approval-1', nodeType: 'approval', fields: { assignee: 'alice' } },
        { nodeId: 'approval-2', nodeType: 'approval', fields: { assignee: 'bob' } },
      ],
    })
    await workflow.startSelectedTemplateByNode()
    assert.equal(nodeStarts.length, 1)
    assert.deepEqual(nodeStarts[0].nodes, [
      { nodeId: 'approval-1', nodeType: 'approval', fields: { assignee: 'alice' } },
      { nodeId: 'approval-2', nodeType: 'approval', fields: { assignee: 'bob' } },
    ])
    assert.deepEqual(nodeStarts[0].variables, { unmapped: 'keep', 'approval-1_assignee': 'explicit' })
    assert.equal(workflow.lastInstance.value.processInstanceId, 'node-instance')
    assert.equal(workflow.taskFilter.processInstanceId, 'node-instance')

    await workflow.startSelectedTemplate()
    assert.equal(legacyStarts.length, 1)
    assert.deepEqual(legacyStarts[0].variables, { unmapped: 'keep', 'approval-1_assignee': 'explicit' })
  } finally {
    workflow.dispose()
    scope.stop()
  }
})

test('node-mapped completion submits only the current task node and keeps its draft on failure', async () => {
  const template = {
    taskKey: 'node-complete', taskName: '按节点完成', processDefinitionKey: 'node-complete', processDefinitionId: 'node-complete:1:abc', startable: true, suspended: false,
    globalVariables: [],
    displayJson: { nodes: [
      { id: 'approval-1', name: '部门审批', type: 'approval' },
      { id: 'approval-2', name: '复核', type: 'approval' },
    ] },
  }
  const task = { id: 'task-node-1', name: '部门审批', assignee: 'alice', taskDefinitionKey: 'approval-1', processDefinitionKey: 'node-complete', processDefinitionId: template.processDefinitionId, processInstanceId: 'instance-1' }
  const nodeCompletions = []
  const legacyCompletions = []
  let taskListCalls = 0
  const scope = effectScope()
  const workflow = scope.run(() => useBusinessWorkflow({
    listTemplates: async () => [template],
    listTasks: async () => { taskListCalls += 1; return [task] },
    completeTaskByNode: async (taskId, input) => {
      nodeCompletions.push({ taskId, input })
      if (nodeCompletions.length === 1) throw new Error('node endpoint rejected')
      return { taskId, status: 'completed' }
    },
    completeTask: async (taskId, variables) => { legacyCompletions.push({ taskId, variables }) },
  }))
  try {
    await workflow.loadTemplates()
    workflow.openComplete(task)
    workflow.setCompleteFormValues({ 'approval-1.approved': true, 'approval-2.approved': false })
    workflow.setCompleteVariablesText('{broken')
    assert.deepEqual(JSON.parse(workflow.completeNodeRequestPreview()), {
      nodes: [{ nodeId: 'approval-1', nodeType: 'approval', fields: { approved: true } }],
    })
    await workflow.completeSelectedTaskByNode()
    assert.deepEqual(nodeCompletions, [{
      taskId: 'task-node-1',
      input: { nodes: [{ nodeId: 'approval-1', nodeType: 'approval', fields: { approved: true } }] },
    }])
    assert.equal(legacyCompletions.length, 0)
    assert.equal(workflow.selectedTask.value.id, 'task-node-1')
    assert.equal(workflow.completeFormValues.value['approval-1.approved'], true)
    assert.equal(workflow.completeVariablesText.value, '{broken')
    assert.equal(workflow.error.value, 'node endpoint rejected')

    await workflow.completeSelectedTaskByNode()
    assert.equal(workflow.selectedTask.value, undefined)
    assert.equal(workflow.notice.value, '任务已完成')
    assert.equal(taskListCalls, 1)
    assert.equal(legacyCompletions.length, 0)
  } finally {
    workflow.dispose()
    scope.stop()
  }
})
