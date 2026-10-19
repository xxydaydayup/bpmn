import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BpmnModdle, descriptor, multiInstancePatch, readUnsupportedConfiguration } from './bpmn-test-utils.mjs'

const fixture = new URL('./fixtures/camunda-modeler-rich-config.bpmn', import.meta.url)

test('Camunda Modeler configuration survives an edit and XML round-trip', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const imported = await moddle.fromXML(readFileSync(fixture, 'utf8'))
  assert.equal(imported.warnings.length, 0)

  const process = imported.rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const apply = process.flowElements.find(item => item.id === 'Task_Apply')
  const review = process.flowElements.find(item => item.id === 'Task_Review')
  const service = process.flowElements.find(item => item.id === 'Task_Notify')
  assert.deepEqual(readUnsupportedConfiguration(process), [
    'Camunda 属性：historyTimeToLive',
    '扩展属性：custom:deploymentHint',
  ])
  assert.equal(apply.get('camunda:assignee'), '${requester}')
  assert.equal(apply.get('camunda:formRef'), 'application-form')
  assert.equal(apply.get('camunda:dueDate'), '${dueDate}')
  assert.equal(review.loopCharacteristics.get('camunda:collection'), '${approverList}')
  assert.equal(review.loopCharacteristics.completionCondition.body, '${nrOfCompletedInstances == nrOfInstances}')
  assert.equal(service.get('camunda:type'), 'external')
  assert.equal(service.get('camunda:topic'), 'notifications')
  assert.deepEqual(
    readUnsupportedConfiguration(apply, ['assignee', 'formKey']),
    ['Camunda 属性：formRef、formRefBinding、dueDate、priority', 'Camunda 扩展：执行监听器、任务监听器', '其他扩展：custom:marker', '扩展属性：custom:taskHint、custom:listenerHint'],
  )
  assert.deepEqual(readUnsupportedConfiguration(review, ['assignee'], [], ['collection', 'elementVariable'], [], [], ['camunda:FailedJobRetryTimeCycle']), [
    '多实例：完成条件',
  ])
  review.loopCharacteristics.set('camunda:asyncBefore', true)
  review.loopCharacteristics.set('camunda:jobPriority', '${miPriority}')
  const retry = imported.rootElement.$model.create('camunda:FailedJobRetryTimeCycle', { body: 'R2/PT1M' })
  const marker = imported.rootElement.$model.createAny('custom:loopMarker', 'https://example.org/custom', { value: 'keep-loop-child' })
  review.loopCharacteristics.extensionElements = imported.rootElement.$model.create('bpmn:ExtensionElements', { values: [retry, marker] })
  retry.$parent = review.loopCharacteristics.extensionElements
  marker.$parent = review.loopCharacteristics.extensionElements
  review.loopCharacteristics.extensionElements.$parent = review.loopCharacteristics
  assert.deepEqual(readUnsupportedConfiguration(review, ['assignee'], [], ['collection', 'elementVariable', 'asyncBefore', 'jobPriority'], ['completionCondition'], [], ['camunda:FailedJobRetryTimeCycle']), [
    '多实例扩展：custom:loopMarker',
  ])
  const properties = multiInstancePatch(imported.rootElement.$model, review, 'multiInstanceCompletionCondition', '${completed}')
  Object.assign(review, properties)
  assert.equal(review.loopCharacteristics.get('camunda:asyncBefore'), true)
  assert.equal(review.loopCharacteristics.get('camunda:jobPriority'), '${miPriority}')
  assert.equal(review.loopCharacteristics.extensionElements.values[0].body, 'R2/PT1M')
  assert.deepEqual(readUnsupportedConfiguration(review, ['assignee'], [], ['collection', 'elementVariable', 'asyncBefore', 'jobPriority'], ['completionCondition'], [], ['camunda:FailedJobRetryTimeCycle']), [
    '多实例扩展：custom:loopMarker',
  ])
  const updatedXml = (await imported.rootElement.$model.toXML(imported.rootElement)).xml
  assert.match(updatedXml, /custom:loopMarker value="keep-loop-child"/)

  const applyListeners = apply.extensionElements.values.filter(item => item.$type === 'camunda:ExecutionListener')
  assert.equal(applyListeners.length, 1)
  assert.equal(applyListeners[0].event, 'end')
  assert.equal(applyListeners[0].script.scriptFormat, 'javascript')
  assert.match(applyListeners[0].script.value, /execution\.setVariable/)

  // Simulate a supported property edit while leaving every extension object intact.
  apply.set('camunda:assignee', '${requesterV2}')
  const saved = await moddle.toXML(imported.rootElement, { format: true })
  const restored = await moddle.fromXML(saved.xml)
  assert.equal(restored.warnings.length, 0)

  const restoredProcess = restored.rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
  const restoredApply = restoredProcess.flowElements.find(item => item.id === 'Task_Apply')
  const restoredReview = restoredProcess.flowElements.find(item => item.id === 'Task_Review')
  const restoredService = restoredProcess.flowElements.find(item => item.id === 'Task_Notify')
  assert.equal(restoredReview.loopCharacteristics.get('camunda:asyncBefore'), true)
  assert.equal(restoredReview.loopCharacteristics.get('camunda:jobPriority'), '${miPriority}')
  assert.equal(restoredReview.loopCharacteristics.extensionElements.values[0].body, 'R2/PT1M')
  assert.equal(restoredReview.loopCharacteristics.extensionElements.values[1].$type, 'custom:loopMarker')
  assert.equal(restoredReview.loopCharacteristics.extensionElements.values[1].value, 'keep-loop-child')
  assert.equal(restoredApply.get('camunda:assignee'), '${requesterV2}')
  assert.equal(restoredApply.get('camunda:formRef'), 'application-form')
  assert.equal(restoredApply.get('camunda:dueDate'), '${dueDate}')
  assert.equal(restoredApply.extensionElements.values.filter(item => item.$type === 'camunda:ExecutionListener').length, 1)
  assert.equal(restoredReview.loopCharacteristics.completionCondition.body, '${completed}')
  assert.equal(restoredService.get('camunda:topic'), 'notifications')
  assert.equal(restoredProcess.flowElements.filter(item => item.$type === 'bpmn:SequenceFlow').length, 4)

  const diagram = restored.rootElement.diagrams[0]
  assert.equal(diagram.plane.planeElement.filter(item => item.$type === 'bpmndi:BPMNShape').length, 5)
  assert.equal(diagram.plane.planeElement.filter(item => item.$type === 'bpmndi:BPMNEdge').length, 4)
})
