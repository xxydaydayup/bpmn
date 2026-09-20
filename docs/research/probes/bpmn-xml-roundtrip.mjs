// Research probe: model serialization only; no browser or process engine is started.
// Run from the repository root: node docs/research/probes/bpmn-xml-roundtrip.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = new URL('../../../', import.meta.url)
const require = createRequire(import.meta.url)
const bpmnRequire = createRequire(require.resolve('bpmn-js/package.json'))
const { BpmnModdle } = await import(pathToFileURL(bpmnRequire.resolve('bpmn-moddle')).href)
const sha256 = text => createHash('sha256').update(text).digest('hex')
const descriptorText = await readFile(new URL('src/bpmn/workflow-moddle.json', root), 'utf8')
const fixturePath = 'docs/research/examples/portable-approval-design.bpmn'
const originalXML = await readFile(new URL(fixturePath, root), 'utf8')
const moddle = new BpmnModdle({ wf: JSON.parse(descriptorText) })
const parsed = await moddle.fromXML(originalXML)
assert.equal(parsed.warnings.length, 0, 'The design fixture must parse without warnings.')

function snapshot(definitions) {
  const process = definitions.rootElements.find(element => element.id === 'Process_PortableApproval')
  const task = process.flowElements.find(element => element.id === 'Task_Approve')
  const plane = definitions.diagrams[0].plane
  const shape = plane.planeElement.find(element => element.bpmnElement?.id === task.id)
  return {
    process: { id: process.id, isExecutable: process.isExecutable },
    task: {
      id: task.id,
      type: task.$type,
      name: task.name,
      assignee: task.get('wf:assignee'),
      formKey: task.get('wf:formKey'),
    },
    elements: process.flowElements.map(element => ({
      id: element.id,
      type: element.$type,
      incoming: (element.incoming ?? []).map(flow => flow.id),
      outgoing: (element.outgoing ?? []).map(flow => flow.id),
      source: element.sourceRef?.id,
      target: element.targetRef?.id,
    })),
    taskBounds: { x: shape.bounds.x, y: shape.bounds.y, width: shape.bounds.width, height: shape.bounds.height },
    diagram: plane.planeElement.map(element => ({
      id: element.id,
      type: element.$type,
      bpmnElement: element.bpmnElement.id,
      bounds: element.bounds && {
        x: element.bounds.x, y: element.bounds.y,
        width: element.bounds.width, height: element.bounds.height,
      },
      waypoints: element.waypoint?.map(point => ({ x: point.x, y: point.y })),
    })),
  }
}

const before = snapshot(parsed.rootElement)
assert.equal(before.task.type, 'bpmn:UserTask')
assert.equal(before.task.assignee, 'manager')
assert.equal(before.task.formKey, 'approval-form')
assert.equal(before.process.isExecutable, false, 'This is a design sample, not a deployment artifact.')
assert.equal(before.taskBounds.width, 220)
const saved = await moddle.toXML(parsed.rootElement, { format: true })
const restored = await moddle.fromXML(saved.xml)
assert.equal(restored.warnings.length, 0)
assert.deepEqual(snapshot(restored.rootElement), before, 'Model properties, references and DI must survive round-trip.')
assert.doesNotMatch(saved.xml, /<svg\b|<path\b|<foreignObject\b|bpmn-icon-/)

const viewerSource = await readFile(bpmnRequire.resolve('./lib/BaseViewer.js'), 'utf8')
const rendererSource = await readFile(bpmnRequire.resolve('./lib/draw/BpmnRenderer.js'), 'utf8')
const result = {
  observedAt: new Date().toISOString(),
  scope: 'BPMN model serialization and local source inspection; no custom renderer, browser, XSD validator, deployment or engine execution was run.',
  versions: {
    node: process.version,
    bpmnJs: bpmnRequire('./package.json').version,
    bpmnModdle: bpmnRequire('bpmn-moddle/package.json').version,
  },
  hashes: {
    fixture: sha256(originalXML),
    descriptor: sha256(descriptorText),
    baseViewer: sha256(viewerSource),
    bpmnRenderer: sha256(rendererSource),
    serializedXML: sha256(saved.xml),
  },
  inputWarnings: parsed.warnings.length,
  outputWarnings: restored.warnings.length,
  roundTripPreserved: true,
  snapshot: before,
}
const output = new URL('output/bpmn-portability/', root)
await mkdir(output, { recursive: true })
await writeFile(new URL('portable-approval-serialized.bpmn', output), saved.xml)
await writeFile(new URL('roundtrip-results.json', output), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
