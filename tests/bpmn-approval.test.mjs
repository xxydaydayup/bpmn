import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { template, descriptor, BpmnModdle, multiInstancePatch, readMultiInstance, serviceTaskPatch, readServiceTask, apply, validateWorkflow, graph, ensureHistoryTimeToLive, DEFAULT_HISTORY_TIME_TO_LIVE } from './bpmn-test-utils.mjs'

test('all deployable BPMN process declarations define history TTL for Camunda cleanup', async () => {
  const files = [
    'src/bpmn/requirement-process.bpmn',
    'src/bpmn/templates/serial-approval.bpmn',
    'src/bpmn/templates/amount-approval.bpmn',
    'src/bpmn/templates/parallel-approval.bpmn',
    'src/bpmn/templates/countersign-approval.bpmn',
    'src/bpmn/templates/any-sign-approval.bpmn',
    'src/bpmn/templates/rework-approval.bpmn',
  ]
  const moddle = new BpmnModdle({ camunda: descriptor })
  for (const file of files) {
    const { rootElement, warnings } = await moddle.fromXML(readFileSync(file, 'utf8'))
    assert.equal(warnings.length, 0, `${file} should parse without warnings`)
    const process = rootElement.rootElements.find(item => item.$type === 'bpmn:Process')
    assert.ok(process, `${file} should contain a BPMN process`)
    assert.equal(process.get('camunda:historyTimeToLive'), '30', `${file} should define a 30-day history TTL`)
  }
})

test('an imported process without history TTL receives the Camunda default before export', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const { rootElement } = await moddle.fromXML(`<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="urn:test">
      <bpmn:process id="Process_1" isExecutable="true" />
    </bpmn:definitions>`)
  const process = rootElement.rootElements[0]
  assert.equal(ensureHistoryTimeToLive(process), true)
  assert.equal(process.get('camunda:historyTimeToLive'), DEFAULT_HISTORY_TIME_TO_LIVE)
  assert.equal(ensureHistoryTimeToLive(process), false)
  assert.match((await moddle.toXML(rootElement)).xml, /camunda:historyTimeToLive="30"/)
})

test('Camunda 7 assignments round-trip without the experimental wf namespace', async () => {
  const { moddle, rootElement } = await template('serial-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Manager')
  assert.equal(task.get('camunda:assignee'), 'manager')
  task.set('camunda:assignee', undefined)
  task.set('camunda:candidateUsers', 'alice,bob')
  task.set('camunda:candidateGroups', 'approvers')
  const { xml } = await moddle.toXML(rootElement, { format: true })
  assert.match(xml, /camunda:candidateUsers="alice,bob"/)
  assert.match(xml, /camunda:candidateGroups="approvers"/)
  assert.doesNotMatch(xml, /wf:/)
  const restored = await moddle.fromXML(xml)
  assert.equal(restored.warnings.length, 0)
  const restoredTask = restored.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Manager')
  assert.equal(restoredTask.get('camunda:assignee'), undefined)
  assert.equal(restoredTask.get('camunda:candidateUsers'), 'alice,bob')
})

test('Camunda multi-instance collection and element variable are preserved', async () => {
  const { moddle, rootElement } = await template('countersign-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  const loop = task.loopCharacteristics
  assert.equal(loop.$type, 'bpmn:MultiInstanceLoopCharacteristics')
  assert.equal(loop.get('camunda:collection'), '${reviewers}')
  assert.equal(loop.get('camunda:elementVariable'), 'reviewer')
  assert.equal(loop.loopCardinality.body, '3')
  const { xml } = await moddle.toXML(rootElement, { format: true })
  const parsed = await moddle.fromXML(xml)
  assert.equal(parsed.warnings.length, 0)
  const parsedTask = parsed.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_MultiReview')
  assert.equal(parsedTask.loopCharacteristics.get('camunda:collection'), '${reviewers}')
})

test('Camunda moddle can create standard external task attributes', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const parsed = await moddle.fromXML(`<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="urn:test">
      <bpmn:process id="Process_1" isExecutable="true">
        <bpmn:startEvent id="Start_1" />
        <bpmn:serviceTask id="Task_1" camunda:type="external" camunda:topic="billing" />
        <bpmn:endEvent id="End_1" />
      </bpmn:process>
    </bpmn:definitions>`)
  const task = parsed.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_1')
  assert.equal(task.get('camunda:type'), 'external')
  assert.equal(task.get('camunda:topic'), 'billing')
})

test('custom panel multi-instance patches switch between collection and cardinality atomically', async () => {
  const { moddle, rootElement } = await template('serial-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Manager')
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceEnabled', 'true'))
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceCollection', '${reviewers}'))
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceElementVariable', 'reviewer'))
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceOrder', 'sequential'))
  task.set('camunda:assignee', '${reviewer}')
  let snapshot = readMultiInstance(task)
  assert.deepEqual([snapshot.enabled, snapshot.mode, snapshot.sequential, snapshot.collection, snapshot.elementVariable], [true, 'collection', true, '${reviewers}', 'reviewer'])
  let xml = (await moddle.toXML(rootElement, { format: true })).xml
  assert.match(xml, /camunda:collection="\$\{reviewers\}"/)
  assert.match(xml, /camunda:elementVariable="reviewer"/)
  assert.doesNotMatch(xml, /wf:/)

  apply(task, multiInstancePatch(moddle, task, 'multiInstanceMode', 'cardinality'))
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceCardinality', '${reviewCount}'))
  snapshot = readMultiInstance(task)
  assert.deepEqual([snapshot.mode, snapshot.cardinality, snapshot.collection, snapshot.elementVariable], ['cardinality', '${reviewCount}', '', ''])
  xml = (await moddle.toXML(rootElement, { format: true })).xml
  assert.match(xml, /<bpmn:loopCardinality[^>]*>\$\{reviewCount\}<\/bpmn:loopCardinality>/)
  assert.doesNotMatch(xml, /camunda:collection=/)
})

test('unconfigured multi-instance sources block deployment validation; advanced loop data is read-only', async () => {
  const { moddle, rootElement } = await template('serial-approval')
  const task = rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_Manager')
  apply(task, multiInstancePatch(moddle, task, 'multiInstanceEnabled', 'true'))
  assert.ok(validateWorkflow(graph(rootElement)).some(issue => issue.code === 'missing-multi-instance-collection'))
  task.loopCharacteristics.completionCondition = moddle.create('bpmn:FormalExpression', { body: '${done}' })
  assert.match(readMultiInstance(task).readOnlyReason, /完成条件/)
  assert.throws(() => multiInstancePatch(moddle, task, 'multiInstanceEnabled', 'false'), /完成条件/)
})

test('custom panel configures Camunda External Task and blocks a missing topic', async () => {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const parsed = await moddle.fromXML(`<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="urn:test">
      <bpmn:process id="Process_1" isExecutable="true"><bpmn:startEvent id="Start_1" />
        <bpmn:serviceTask id="Task_1" /><bpmn:endEvent id="End_1" />
      </bpmn:process></bpmn:definitions>`)
  const task = parsed.rootElement.rootElements[0].flowElements.find(item => item.id === 'Task_1')
  apply(task, serviceTaskPatch(task, 'serviceImplementation', 'external'))
  assert.ok(validateWorkflow(graph(parsed.rootElement)).some(issue => issue.code === 'missing-external-topic'))
  apply(task, serviceTaskPatch(task, 'serviceTopic', 'billing'))
  assert.equal(readServiceTask(task).implementation, 'external')
  assert.equal(readServiceTask(task).topic, 'billing')
  assert.doesNotMatch((await moddle.toXML(parsed.rootElement)).xml, /missing/)
})
