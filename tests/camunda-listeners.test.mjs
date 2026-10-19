import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BpmnModdle, descriptor, readCamundaListeners, createCamundaListener, createListenerField, listenerFieldPatch, validateCamundaListener } from './bpmn-test-utils.mjs'
import CommandStack from 'diagram-js/lib/command/CommandStack.js'
import EventBus from 'diagram-js/lib/core/EventBus.js'

const fixture = new URL('./fixtures/camunda-modeler-rich-config.bpmn', import.meta.url)

test('imports Camunda execution and task listeners with script and field values', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const process = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const task = process.flowElements.find(item => item.id === 'Task_Apply')
  const execution = readCamundaListeners(task, 'execution')
  assert.equal(execution.length, 1)
  assert.deepEqual(execution[0], {
    kind: 'execution', index: 0, event: 'end', implementation: 'script', expression: '',
    className: '', delegateExpression: '', scriptFormat: 'javascript', scriptResource: '',
    scriptBody: "execution.setVariable('submitted', true);",
    fields: [{ index: 0, name: 'auditKey', type: 'string', value: 'request-audit' }],
  })
  assert.equal(task.extensionElements.values.find(item => item.$type === 'camunda:ExecutionListener').$attrs['custom:listenerHint'], 'preserve-listener-attr')

  const userTaskListeners = readCamundaListeners(task, 'task')
  assert.equal(userTaskListeners.length, 1)
  assert.equal(userTaskListeners[0].event, 'assignment')
  assert.equal(userTaskListeners[0].implementation, 'expression')
  assert.equal(userTaskListeners[0].expression, '${audit.assignment(execution)}')
  assert.deepEqual(userTaskListeners[0].fields, [])
  const flow = process.flowElements.find(item => item.id === 'Flow_4')
  assert.equal(readCamundaListeners(flow, 'execution')[0].event, 'take')
  assert.equal(readCamundaListeners(flow, 'execution')[0].expression, '${audit.flow(execution)}')
})

test('new execution and task listener moddle elements serialize with Camunda execution options', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  const process = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const task = process.flowElements.find(item => item.id === 'Task_Apply')
  const extensions = task.extensionElements
  const execution = createCamundaListener(moddle, 'execution')
  execution.event = 'start'
  execution.delegateExpression = '${listeners.execution}'
  execution.fields.push(createListenerField(moddle, {
    type: 'string',
    name: 'auditKey',
    value: 'request-audit',
  }))
  const taskListener = createCamundaListener(moddle, 'task')
  taskListener.event = 'complete'
  taskListener.script = moddle.create('camunda:Script', {
    scriptFormat: 'javascript',
    value: "task.setVariable('completed', true);",
  })
  extensions.values.push(execution, taskListener)

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const executionListeners = restoredTask.extensionElements.values.filter(item => item.$type === 'camunda:ExecutionListener')
  const taskListeners = restoredTask.extensionElements.values.filter(item => item.$type === 'camunda:TaskListener')
  assert.equal(executionListeners.length, 2)
  assert.equal(executionListeners[1].delegateExpression, '${listeners.execution}')
  assert.equal(executionListeners[1].fields[0].string, 'request-audit')
  assert.equal(readCamundaListeners(restoredTask, 'execution').length, 2)
  const editedExecutionListener = executionListeners[1]
  const originalExecutionListener = executionListeners[0]
  const field = editedExecutionListener.fields[0]
  const originalFieldName = field.name
  const originalExtensionValues = [...restoredTask.extensionElements.values]
  field.name = 'temporary-audit-key'
  field.name = originalFieldName
  assert.deepEqual(restoredTask.extensionElements.values, originalExtensionValues)
  assert.equal(editedExecutionListener.fields.length, 1)
  assert.notEqual(editedExecutionListener, originalExecutionListener)
  assert.equal(taskListeners.length, 2)
  assert.equal(taskListeners[1].script.value, "task.setVariable('completed', true);")
  assert.equal(executionListeners[0].$attrs['custom:listenerHint'], 'preserve-listener-attr')
  assert.ok(xml.includes('custom:listenerHint="preserve-listener-attr"'))
  const validation = await moddle.fromXML(xml.replace('camunda:field name="auditKey"', 'camunda:field name="auditKey" custom:fieldHint="retain-field-attribute"'))
  const validationTask = validation.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const existingField = validationTask.extensionElements.values.find(item => item.$type === 'camunda:ExecutionListener').fields[0]
  existingField.$attrs['custom:fieldHint'] = 'retain-field-attribute'
  Object.assign(existingField, listenerFieldPatch(existingField, { name: 'auditKey', type: 'expression', value: '${audit.key}' }))
  const afterFieldEdit = (await moddle.toXML(validation.rootElement)).xml
  assert.match(afterFieldEdit, /custom:fieldHint="retain-field-attribute"/)
  assert.match(afterFieldEdit, /<camunda:expression>\$\{audit.key\}<\/camunda:expression>/)
})

test('Camunda listener edits use the bpmn-js command stack and can be undone and redone', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const execution = task.extensionElements.values.find(item => item.$type === 'camunda:ExecutionListener')
  const eventBus = new EventBus()
  const stack = new CommandStack(eventBus, { instantiate: Handler => new Handler() })
  stack.register('element.updateModdleProperties', {
    execute(context) {
      context.oldEvent = context.moddleElement.event
      context.moddleElement.set('event', context.event)
      return [context.element]
    },
    revert(context) {
      context.moddleElement.set('event', context.oldEvent)
      return [context.element]
    },
  })
  const visualElement = { businessObject: task }
  const rename = (event) => stack.execute('element.updateModdleProperties', {
    element: visualElement, moddleElement: execution, event,
  })

  rename('start')
  assert.equal(execution.event, 'start')
  assert.equal(stack.canUndo(), true)
  stack.undo()
  assert.equal(execution.event, 'end')
  assert.equal(stack.canRedo(), true)
  stack.redo()
  assert.equal(execution.event, 'start')
  const { xml } = await moddle.toXML(rootElement, { format: true })
  assert.match(xml, /<camunda:executionListener event="start"/)
})

test('listener validation checks structural event and implementation requirements without parsing script text', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const listener = readCamundaListeners(task, 'execution')[0]
  assert.deepEqual(validateCamundaListener(listener), [])
  assert.deepEqual(validateCamundaListener({ ...listener, event: 'invalid' }), ['监听器事件不属于 Camunda 支持的事件类型'])
  assert.deepEqual(validateCamundaListener({ ...listener, scriptFormat: '', scriptBody: '' }), [
    'Script 执行方式需要填写脚本格式',
    'Script 执行方式需要填写脚本资源或脚本正文',
  ])
  assert.deepEqual(validateCamundaListener({ ...listener, scriptBody: 'function broken( {' }), [])
})
