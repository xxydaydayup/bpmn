import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import CommandStack from 'diagram-js/lib/command/CommandStack.js'
import EventBus from 'diagram-js/lib/core/EventBus.js'
import { createServer } from 'vite'
import { BpmnModdle, camundaFormPatch, descriptor, multiInstancePatch, multiInstanceRetryCyclePatch, readCamundaForm, readMultiInstance, readRuntimeAttributes, retryCyclePatch, runtimeAttributePatch, userTaskRuntimePatch, validateDeploymentProcesses } from './bpmn-test-utils.mjs'

const fixture = new URL('./fixtures/camunda-modeler-rich-config.bpmn', import.meta.url)

async function loadModelingHandlers() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const [{ default: UpdateModdlePropertiesHandler }, { default: UpdatePropertiesHandler }] = await Promise.all([
      server.ssrLoadModule('/node_modules/bpmn-js/lib/features/modeling/cmd/UpdateModdlePropertiesHandler.js'),
      server.ssrLoadModule('/node_modules/bpmn-js/lib/features/modeling/cmd/UpdatePropertiesHandler.js'),
    ])
    return { UpdateModdlePropertiesHandler, UpdatePropertiesHandler }
  } finally {
    await server.close()
  }
}

function registerModelingCommands(stack, moddle, handlers) {
  const elementRegistry = {
    get() { return undefined },
    updateId() {},
  }
  stack.register('element.updateProperties', new handlers.UpdatePropertiesHandler(elementRegistry, moddle, {}, {}))
  stack.register('element.updateModdleProperties', new handlers.UpdateModdlePropertiesHandler(elementRegistry))
}

test('Camunda property updates use real bpmn-js commands and preserve unrelated extension and multi-instance objects', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const process = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const task = process.flowElements.find(item => item.id === 'Task_Review')
  const loop = task.loopCharacteristics
  const loopMarker = moddle.createAny('custom:loopMarker', 'https://example.org/custom', { value: 'preserve-loop-child' })
  loopMarker.$parent = loop
  loop.$children = [loopMarker]
  const extensions = moddle.create('bpmn:ExtensionElements', {})
  extensions.$attrs['custom:preserve'] = 'extension-attribute'
  const listener = moddle.create('camunda:ExecutionListener', { event: 'start', expression: '${audit()}' })
  listener.$attrs['custom:preserve'] = 'listener-attribute'
  listener.$parent = extensions
  extensions.values = [listener]
  extensions.$parent = task
  task.extensionElements = extensions

  const visualElement = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)

  stack.execute('element.updateProperties', {
    element: visualElement,
    properties: runtimeAttributePatch('asyncBefore', 'true'),
  })
  assert.equal(task.get('camunda:asyncBefore'), true)
  assert.equal(task.extensionElements, extensions)
  assert.equal(task.loopCharacteristics, loop)
  assert.deepEqual(task.loopCharacteristics.$children, [loopMarker])
  assert.equal(stack.canUndo(), true)

  stack.undo()
  assert.equal(task.get('camunda:asyncBefore'), false)
  assert.equal(task.extensionElements, extensions)
  assert.equal(task.loopCharacteristics, loop)
  assert.deepEqual(task.loopCharacteristics.$children, [loopMarker])
  assert.equal(stack.canRedo(), true)

  stack.redo()
  assert.equal(task.get('camunda:asyncBefore'), true)
  assert.equal(task.extensionElements, extensions)
  assert.equal(task.loopCharacteristics, loop)
  assert.deepEqual(task.loopCharacteristics.$children, [loopMarker])

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Review')
  assert.equal(restoredTask.get('camunda:asyncBefore'), true)
  assert.equal(readMultiInstance(restoredTask).collection, '${approverList}')
  assert.equal(restoredTask.extensionElements.$attrs['custom:preserve'], 'extension-attribute')
  const restoredListener = restoredTask.extensionElements.values.find(item => item.$type === 'camunda:ExecutionListener')
  assert.equal(restoredListener.expression, '${audit()}')
  assert.equal(restoredListener.$attrs['custom:preserve'], 'listener-attribute')
})

test('multi-instance property updates are undoable and redoable through the real bpmn-js command stack', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Review')
  const originalLoop = task.loopCharacteristics
  const loopMarker = moddle.createAny('custom:loopMarker', 'https://example.org/custom', { value: 'preserve-retry-child' })
  loopMarker.$parent = originalLoop
  originalLoop.$children = [loopMarker]
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)
  const patch = multiInstancePatch(moddle, task, 'multiInstanceCompletionCondition', '${nrOfCompletedInstances > 1}')

  stack.execute('element.updateProperties', { element, properties: patch })
  assert.notEqual(task.loopCharacteristics, originalLoop)
  assert.equal(readMultiInstance(task).completionCondition, '${nrOfCompletedInstances > 1}')
  assert.equal(readMultiInstance(task).collection, '${approverList}')

  stack.undo()
  assert.equal(task.loopCharacteristics, originalLoop)
  assert.equal(readMultiInstance(task).completionCondition, '${nrOfCompletedInstances == nrOfInstances}')

  stack.redo()
  assert.equal(readMultiInstance(task).completionCondition, '${nrOfCompletedInstances > 1}')
  assert.equal(readMultiInstance(task).collection, '${approverList}')

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Review')
  assert.equal(readMultiInstance(restoredTask).completionCondition, '${nrOfCompletedInstances > 1}')
  assert.equal(readMultiInstance(restoredTask).collection, '${approverList}')
})

test('retry-cycle edits are undoable and preserve unknown extension elements and attributes', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const importedFormData = moddle.create('camunda:FormData', { businessKey: 'caseId', fields: [] })
  const importedField = moddle.create('camunda:FormField', { id: 'legacy', type: 'string' })
  const importedUnknown = moddle.createAny('custom:fieldChild', 'https://example.org/custom', { value: 'preserve-nested' })
  importedUnknown.$parent = importedField
  importedField.$children = [importedUnknown]
  importedField.$parent = importedFormData
  importedFormData.fields = [importedField]
  importedFormData.$parent = task.extensionElements
  task.extensionElements.values.push(importedFormData)
  const extensions = task.extensionElements
  const extensionChild = moddle.createAny('custom:extensionChild', 'https://example.org/custom', { value: 'preserve-extension-child' })
  extensionChild.$parent = extensions
  extensions.$children = [extensionChild]
  const listener = extensions.values.find(item => item.$type === 'camunda:ExecutionListener')
  const taskListener = extensions.values.find(item => item.$type === 'camunda:TaskListener')
  const vendor = extensions.values.find(item => item.$type === 'custom:marker')
  extensions.$attrs['custom:extensionHint'] = 'keep-extension'
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)

  stack.execute('element.updateProperties', {
    element,
    properties: retryCyclePatch(moddle, task, 'R3/PT10M'),
  })
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, 'R3/PT10M')
  assert.notEqual(task.extensionElements, extensions)
  assert.ok(task.extensionElements.values.includes(listener))
  assert.ok(task.extensionElements.values.includes(taskListener))
  assert.ok(task.extensionElements.values.includes(vendor))
  assert.equal(task.extensionElements.$attrs['custom:extensionHint'], 'keep-extension')

  stack.undo()
  assert.equal(task.extensionElements, extensions)
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, '')

  stack.redo()
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, 'R3/PT10M')
  assert.ok(task.extensionElements.values.includes(listener))
  assert.ok(task.extensionElements.values.includes(taskListener))
  assert.ok(task.extensionElements.values.includes(vendor))

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  assert.equal(readRuntimeAttributes(restoredTask).failedJobRetryTimeCycle, 'R3/PT10M')
  assert.equal(restoredTask.extensionElements.$attrs['custom:extensionHint'], 'keep-extension')
  assert.equal(restoredTask.extensionElements.values.filter(item => item.$type === 'camunda:ExecutionListener').length, 1)
  assert.equal(restoredTask.extensionElements.values.filter(item => item.$type === 'camunda:TaskListener').length, 1)
  assert.equal(restoredTask.extensionElements.values.filter(item => item.$type === 'custom:marker').length, 1)
})

test('user-task runtime attributes are undoable and round-trip as Camunda fields', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)
  stack.execute('element.updateProperties', {
    element,
    properties: userTaskRuntimePatch('taskDueDate', '${deadline}'),
  })
  assert.equal(task.get('camunda:dueDate'), '${deadline}')
  stack.undo()
  assert.equal(task.get('camunda:dueDate'), '${dueDate}')
  stack.redo()
  assert.equal(task.get('camunda:dueDate'), '${deadline}')

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  assert.equal(restoredTask.get('camunda:dueDate'), '${deadline}')
})

test('process executable and job priority are undoable and round-trip for deployment', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const process = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const element = { businessObject: process }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)
  stack.execute('element.updateProperties', { element, properties: { isExecutable: false } })
  assert.equal(process.isExecutable, false)
  stack.undo()
  assert.equal(process.isExecutable, true)
  stack.redo()
  assert.equal(process.isExecutable, false)

  stack.execute('element.updateProperties', { element, properties: runtimeAttributePatch('jobPriority', '${priority}') })
  assert.equal(process.get('camunda:jobPriority'), '${priority}')
  stack.undo()
  assert.equal(process.get('camunda:jobPriority'), undefined)
  stack.redo()
  assert.equal(process.get('camunda:jobPriority'), '${priority}')

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredProcess = restored.rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  assert.equal(restoredProcess.isExecutable, false)
  assert.equal(restoredProcess.get('camunda:jobPriority'), '${priority}')
  assert.deepEqual(validateDeploymentProcesses([{ id: restoredProcess.id, name: restoredProcess.name, isExecutable: restoredProcess.isExecutable }]), [{
    severity: 'error', code: 'deployment-not-executable', elementId: restoredProcess.id,
    message: '当前流程未声明 isExecutable="true"，仅可作为设计稿。请确认执行配置后在 XML 中启用执行，再应用到画布。',
  }])
  assert.deepEqual(validateDeploymentProcesses([{ id: restoredProcess.id, name: restoredProcess.name, isExecutable: true }]), [])
})

test('Camunda embedded forms and references are undoable and preserve unknown moddle configuration', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const xmlWithUnknownFormChild = readFileSync(fixture, 'utf8').replace(
    '        <camunda:executionListener',
    '        <camunda:formData><camunda:formField id="existing"><custom:fieldChild value="preserve-nested" /></camunda:formField></camunda:formData><camunda:executionListener',
  )
  const { rootElement, warnings } = await moddle.fromXML(xmlWithUnknownFormChild)
  assert.equal(warnings.length, 0)
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const importedField = task.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0]
  assert.equal(importedField.otherElements[0].$type, 'custom:fieldChild')
  assert.equal(importedField.otherElements[0].value, 'preserve-nested')
  const extensions = task.extensionElements
  const vendor = extensions.values.find(item => item.$type === 'custom:marker')
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)

  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formRef', 'approval-form') })
  assert.equal(readCamundaForm(task).formRef, 'approval-form')
  assert.equal(readCamundaForm(task).formKey, '')
  stack.undo()
  assert.equal(readCamundaForm(task).formRef, 'application-form')
  stack.redo()
  assert.equal(readCamundaForm(task).formRef, 'approval-form')
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formKey', 'review-form') })
  assert.equal(readCamundaForm(task).formRef, '')
  assert.equal(readCamundaForm(task).formKey, 'review-form')

  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formFieldSet:0:id', 'decision') })
  task.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].$attrs['custom:preserve'] = 'field-attribute'
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formFieldSet:0:type', 'enum') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formOptionAdd:0', '') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formOptionSet:0:0:id', 'approve') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formOptionSet:0:0:name', 'Approve') })
  assert.equal(task.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].otherElements[0].value, 'preserve-nested')
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formConstraintAdd:0', '') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formConstraintSet:0:0:name', 'required') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formPropertyAdd:0', '') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formPropertySet:0:0:id', 'source') })
  stack.execute('element.updateProperties', { element, properties: camundaFormPatch(moddle, task, 'formPropertySet:0:0:value', 'custom-ui') })
  const formField = task.extensionElements.values.find(item => item.$type === 'camunda:FormData')?.fields[0]
  assert.ok(formField)
  assert.equal(readCamundaForm(task).fields[0].values[0].id, 'approve')
  assert.equal(readCamundaForm(task).fields[0].constraints[0].name, 'required')
  assert.equal(readCamundaForm(task).fields[0].properties[0].value, 'custom-ui')
  assert.ok(task.extensionElements.values.includes(vendor))
  stack.undo()
  assert.equal(readCamundaForm(task).fields[0].properties[0].value, '')
  assert.equal(task.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].otherElements[0].value, 'preserve-nested')
  stack.redo()
  assert.equal(readCamundaForm(task).fields[0].properties[0].value, 'custom-ui')
  assert.equal(task.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].otherElements[0].value, 'preserve-nested')

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const restoredForm = readCamundaForm(restoredTask)
  assert.equal(restoredForm.formKey, 'review-form')
  assert.equal(restoredForm.fields[0].values[0].name, 'Approve')
  assert.equal(restoredForm.fields[0].constraints[0].name, 'required')
  assert.equal(restoredForm.fields[0].properties[0].value, 'custom-ui')
  assert.equal(restoredTask.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].$attrs['custom:preserve'], 'field-attribute')
  assert.equal(restoredTask.extensionElements.values.filter(item => item.$type === 'camunda:FormData').length, 1)
  const restoredChild = restoredTask.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].otherElements?.[0]
  assert.equal(restoredChild?.$type, 'custom:fieldChild')
  assert.equal(restoredChild?.value, 'preserve-nested')
  assert.equal(restoredTask.extensionElements.values.filter(item => item.$type === 'custom:marker').length, 1)
  assert.equal(restoredForm.fields[0].id, 'decision')

  const restoredElement = { businessObject: restoredTask }
  const restoredStack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(restoredStack, moddle, handlers)
  restoredStack.execute('element.updateProperties', { element: restoredElement, properties: camundaFormPatch(moddle, restoredTask, 'formFieldSet:0:label', 'Decision') })
  assert.equal(readCamundaForm(restoredTask).fields[0].label, 'Decision')
  assert.equal(restoredTask.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].$attrs['custom:preserve'], 'field-attribute')
  restoredStack.undo()
  assert.equal(readCamundaForm(restoredTask).fields[0].label, '')
  assert.equal(restoredTask.extensionElements.values.find(item => item.$type === 'camunda:FormData').fields[0].otherElements[0].value, 'preserve-nested')
})

test('multi-instance retry-cycle edits are undoable and preserve loop settings and unknown attributes', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Review')
  const originalLoop = task.loopCharacteristics
  const loopMarker = moddle.createAny('custom:loopMarker', 'https://example.org/custom', { value: 'preserve-retry-child' })
  loopMarker.$parent = originalLoop
  originalLoop.$children = [loopMarker]
  originalLoop.$attrs['custom:loopHint'] = 'preserve-loop'
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)
  const patch = multiInstanceRetryCyclePatch(moddle, task, 'R5/PT30S')

  stack.execute('element.updateProperties', { element, properties: patch })
  assert.notEqual(task.loopCharacteristics, originalLoop)
  assert.equal(readMultiInstance(task).collection, '${approverList}')
  assert.equal(readMultiInstance(task).completionCondition, '${nrOfCompletedInstances == nrOfInstances}')
  assert.equal(readRuntimeAttributes(task.loopCharacteristics).failedJobRetryTimeCycle, 'R5/PT30S')
  assert.equal(task.loopCharacteristics.$attrs['custom:loopHint'], 'preserve-loop')

  stack.undo()
  assert.equal(task.loopCharacteristics, originalLoop)
  assert.equal(readRuntimeAttributes(task.loopCharacteristics).failedJobRetryTimeCycle, '')
  stack.redo()
  assert.equal(readRuntimeAttributes(task.loopCharacteristics).failedJobRetryTimeCycle, 'R5/PT30S')
  assert.equal(readMultiInstance(task).collection, '${approverList}')

  const { xml } = await moddle.toXML(rootElement, { format: true })
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Review')
  assert.equal(readRuntimeAttributes(restoredTask.loopCharacteristics).failedJobRetryTimeCycle, 'R5/PT30S')
  assert.equal(readMultiInstance(restoredTask).completionCondition, '${nrOfCompletedInstances == nrOfInstances}')
  assert.equal(restoredTask.loopCharacteristics.$attrs['custom:loopHint'], 'preserve-loop')
})

test('removing a retry cycle preserves other extensions and supports undo', async () => {
  const handlers = await loadModelingHandlers()
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement, warnings } = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(warnings.length, 0)

  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Apply')
  const extensions = task.extensionElements
  const extensionChild = moddle.createAny('custom:extensionChild', 'https://example.org/custom', { value: 'preserve-extension-child' })
  extensionChild.$parent = extensions
  extensions.$children = [extensionChild]
  const listener = extensions.values.find(item => item.$type === 'camunda:ExecutionListener')
  const taskListener = extensions.values.find(item => item.$type === 'camunda:TaskListener')
  const vendor = extensions.values.find(item => item.$type === 'custom:marker')
  const element = { businessObject: task }
  const stack = new CommandStack(new EventBus(), { instantiate: Handler => new Handler() })
  registerModelingCommands(stack, moddle, handlers)

  stack.execute('element.updateProperties', { element, properties: retryCyclePatch(moddle, task, 'R2/PT5M') })
  const retryExtensions = task.extensionElements
  stack.execute('element.updateProperties', { element, properties: retryCyclePatch(moddle, task, '') })
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, '')
  assert.notEqual(task.extensionElements, retryExtensions)
  assert.deepEqual(task.extensionElements.$children, [extensionChild])
  assert.ok(task.extensionElements.values.includes(listener))
  assert.ok(task.extensionElements.values.includes(taskListener))
  assert.ok(task.extensionElements.values.includes(vendor))

  stack.undo()
  assert.equal(task.extensionElements, retryExtensions)
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, 'R2/PT5M')
  stack.undo()
  assert.equal(task.extensionElements, extensions)
  assert.deepEqual(task.extensionElements.$children, [extensionChild])
  assert.equal(readRuntimeAttributes(task).failedJobRetryTimeCycle, '')
})
