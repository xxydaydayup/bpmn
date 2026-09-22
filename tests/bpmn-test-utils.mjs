import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Compile dependency-free TS modules with the existing compiler, including on Node 20.
export async function load(name) {
  const source = readFileSync(new URL(`../src/bpmn/${name}.ts`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(`${compiled}\n//# sourceURL=${name}.ts`).toString('base64')}`)
}
export const { validateWorkflow, isValidBpmnId } = await load('validation')
export const { readMultiInstance, multiInstancePatch } = await load('multiInstance')
export const { readServiceTask, serviceTaskPatch } = await load('serviceTask')
export const { DEFAULT_HISTORY_TIME_TO_LIVE, ensureHistoryTimeToLive } = await load('processDefaults')
const require = createRequire(import.meta.url)
const bpmnRequire = createRequire(require.resolve('bpmn-js/package.json'))
export const { BpmnModdle } = await import(pathToFileURL(bpmnRequire.resolve('bpmn-moddle')).href)
export const descriptor = JSON.parse(readFileSync(bpmnRequire.resolve('camunda-bpmn-moddle/resources/camunda.json'), 'utf8'))
export const graph = definitions => definitions.rootElements.filter(item => item.$type === 'bpmn:Process').map(process => ({
  id: process.id,
  nodes: (process.flowElements ?? []).filter(item => item.$instanceOf('bpmn:FlowNode')).map(item => ({
    id: item.id, type: item.$type, assignee: item.get('camunda:assignee'),
    candidateUsers: item.get('camunda:candidateUsers'), candidateGroups: item.get('camunda:candidateGroups'),
    multiInstance: readMultiInstance(item),
    serviceImplementation: item.$type === 'bpmn:ServiceTask' ? readServiceTask(item).implementation : undefined,
    serviceTopic: item.$type === 'bpmn:ServiceTask' ? readServiceTask(item).topic : undefined,
    serviceClass: item.$type === 'bpmn:ServiceTask' ? readServiceTask(item).className : undefined,
    serviceDelegateExpression: item.$type === 'bpmn:ServiceTask' ? readServiceTask(item).delegateExpression : undefined,
    serviceExpression: item.$type === 'bpmn:ServiceTask' ? readServiceTask(item).expression : undefined,
    defaultFlowId: item.default?.id,
    advanced: !!(item.eventDefinitions?.length || item.isForCompensation
      || (item.loopCharacteristics && item.loopCharacteristics.$type !== 'bpmn:MultiInstanceLoopCharacteristics')),
  })),
  flows: (process.flowElements ?? []).filter(item => item.$type === 'bpmn:SequenceFlow').map(item => ({ id: item.id, sourceId: item.sourceRef?.id, targetId: item.targetRef?.id, condition: item.conditionExpression?.body })),
}))
export async function template(filename) {
  const moddle = new BpmnModdle({ camunda: descriptor })
  const xml = readFileSync(new URL(`../src/bpmn/templates/${filename}.bpmn`, import.meta.url), 'utf8')
  const parsed = await moddle.fromXML(xml)
  return { moddle, xml, ...parsed }
}
export function apply(task, patch) {
  for (const [key, value] of Object.entries(patch)) task.set(key, value)
}
