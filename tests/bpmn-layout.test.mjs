import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ELK from 'elkjs/lib/elk.bundled.js'
import { load, BpmnModdle, descriptor, template } from './bpmn-test-utils.mjs'

const { assessLayout, createLayoutGraph, readLayoutPlan } = await load('layout')
const { default: LayoutCommand } = await load('LayoutCommand')
const settings = { width: 184, height: 88, nodeGap: 64, layerGap: 76, edgeGap: 24, padding: 40 }
const elk = new ELK()

// Use real moddle objects and imported DI to exercise serialization, including labels.
function diagram(definitions) {
  const plane = definitions.diagrams[0].plane
  const registry = new Map()
  const snapshot = { id: plane.bpmnElement.id, nodes: [], edges: [], unsupported: [] }
  for (const di of plane.planeElement) {
    const bo = di.bpmnElement
    const element = { id: bo.id, type: bo.$type, businessObject: bo, di }
    registry.set(element.id, element)
    let label
    if (di.label?.bounds && bo.name) {
      label = { id: bo.id + '_label', text: bo.name, width: di.label.bounds.width, height: di.label.bounds.height }
      registry.set(label.id, { id: label.id, di, labelTarget: element, ...di.label.bounds })
    }
    if (di.bounds) {
      Object.assign(element, di.bounds)
      snapshot.nodes.push({ id: bo.id, type: bo.$type, ...di.bounds, label })
    } else {
      element.waypoints = di.waypoint.map(({ x, y }) => ({ x, y }))
      snapshot.edges.push({ id: bo.id, source: bo.sourceRef.id, target: bo.targetRef.id, label })
    }
  }
  return { snapshot, registry }
}

const businessXML = xml => xml.replace(/\s*<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/g, '')
const samples = ['serial-approval', 'amount-approval', 'parallel-approval', 'countersign-approval', 'any-sign-approval', 'rework-approval']
for (const name of [...samples, 'default', 'service']) {
  test(`${name}: layout routes real XML, preserves semantics and reverses in one command`, async () => {
    const parsed = samples.includes(name) ? await template(name) : await (async () => {
      const moddle = new BpmnModdle({ wf: descriptor })
      let xml = readFileSync(new URL('../src/bpmn/requirement-process.bpmn', import.meta.url), 'utf8')
      if (name === 'service') xml = xml.replaceAll('bpmn:userTask', 'bpmn:serviceTask').replace(/ wf:(?:assignee|formKey)="[^"]*"/g, '')
      return { moddle, ...await moddle.fromXML(xml) }
    })()
    const { moddle, rootElement: definitions } = parsed
    const before = (await moddle.toXML(definitions, { format: true })).xml
    const { snapshot, registry } = diagram(definitions)
    assert.equal(assessLayout(snapshot, settings).needsResize, true)
    const plan = readLayoutPlan(await elk.layout(createLayoutGraph(snapshot, settings)), snapshot)
    const nodes = plan.shapes.filter(shape => registry.get(shape.id).businessObject)
    const start = nodes.find(node => registry.get(node.id).type === 'bpmn:StartEvent')
    assert.ok(nodes.every(node => node.x >= start.x), 'start remains at the left even with return loops')
    for (const node of nodes) {
      if (registry.get(node.id).type.endsWith('Task')) assert.deepEqual([node.width, node.height], [184, 88])
      for (const other of nodes.filter(item => item.id !== node.id)) {
        assert.ok(node.x + node.width <= other.x || other.x + other.width <= node.x || node.y + node.height <= other.y || other.y + other.height <= node.y, `${node.id} overlaps ${other.id}`)
      }
    }
    assert.equal(plan.connections.length, snapshot.edges.length)
    for (const edge of plan.connections) {
      for (let index = 1; index < edge.waypoints.length; index++) {
        const a = edge.waypoints[index - 1], b = edge.waypoints[index]
        assert.ok(a.x === b.x || a.y === b.y, `${edge.id} is not orthogonal`)
      }
    }
    const command = new LayoutCommand(registry, moddle), context = { plan }
    command.execute(context)
    const after = (await moddle.toXML(definitions, { format: true })).xml
    assert.equal(businessXML(after), businessXML(before))
    const reimported = await moddle.fromXML(after)
    assert.equal(reimported.warnings.length, 0)
    const importedSnapshot = diagram(reimported.rootElement).snapshot
    assert.equal(assessLayout(importedSnapshot, settings).needsResize, false)
    for (const node of importedSnapshot.nodes) {
      const expected = nodes.find(item => item.id === node.id)
      assert.deepEqual([node.x, node.y, node.width, node.height], [expected.x, expected.y, expected.width, expected.height])
    }
    command.revert(context)
    assert.equal((await moddle.toXML(definitions, { format: true })).xml, before)
    command.execute(context)
    assert.equal((await moddle.toXML(definitions, { format: true })).xml, after)
  })
}

test('unsupported shapes and incomplete routing are rejected before mutation', async () => {
  const { moddle, rootElement } = await template('parallel-approval')
  const { snapshot, registry } = diagram(rootElement)
  const before = (await moddle.toXML(rootElement)).xml
  assert.equal(assessLayout({ ...snapshot, unsupported: ['泳道'] }, settings).supported, false)
  assert.equal(assessLayout({ ...snapshot, edges: [{ id: 'bad', source: 'missing', target: 'missing' }] }, settings).supported, false)
  const result = await elk.layout(createLayoutGraph(snapshot, settings))
  result.edges[0].sections = []
  assert.throws(() => readLayoutPlan(result, snapshot), /路由不完整/)
  const plan = { shapes: [{ ...snapshot.nodes[0], x: 500 }], connections: [{ id: 'missing', waypoints: [] }] }
  assert.throws(() => new LayoutCommand(registry, moddle).execute({ plan }), /已变化/)
  assert.equal((await moddle.toXML(rootElement)).xml, before)
})
