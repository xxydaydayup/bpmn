import type { ModdleElement } from 'bpmn-js/lib/model/Types'

export type MultiInstanceMode = 'collection' | 'cardinality'

export interface MultiInstanceSnapshot {
  enabled: boolean
  mode: MultiInstanceMode
  sequential: boolean
  collection: string
  elementVariable: string
  cardinality: string
  readOnlyReason: string
}

interface ModdleFactory { create(type: string, properties: Record<string, unknown>): ModdleElement }

export function readMultiInstance(activity: ModdleElement): MultiInstanceSnapshot {
  const loop = activity.loopCharacteristics
  const enabled = loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
  const collection = enabled ? String(loop.get('camunda:collection') ?? '') : ''
  const cardinality = enabled ? String(loop.loopCardinality?.body ?? '') : ''
  let readOnlyReason = ''
  if (loop && !enabled) readOnlyReason = '现有循环类型不是 Camunda 多实例；本面板不会覆盖该配置'
  else if (enabled && (loop.completionCondition || loop.inputDataItem || loop.outputDataItem || Object.keys(loop.$attrs ?? {}).length)) {
    readOnlyReason = '多实例包含完成条件、输入/输出项或未知扩展；请使用 XML 编辑以保留原语义'
  } else if (enabled && collection.trim() && cardinality.trim()) {
    readOnlyReason = '集合绑定和循环次数同时存在；请在 XML 中确认引擎执行语义'
  }
  return {
    enabled: !!enabled,
    mode: collection.trim() || !loop?.loopCardinality ? 'collection' : 'cardinality',
    sequential: !!loop?.isSequential,
    collection,
    elementVariable: enabled ? String(loop.get('camunda:elementVariable') ?? '') : '',
    cardinality,
    readOnlyReason,
  }
}

function copiedProperties(loop: ModdleElement): Record<string, unknown> {
  return Object.fromEntries(Object.entries(loop).filter(([key, value]) => !key.startsWith('$') && value !== undefined))
}

export function multiInstancePatch(
  moddle: ModdleFactory,
  activity: ModdleElement,
  field: string,
  value: string,
): Record<string, unknown> {
  const previous = readMultiInstance(activity)
  if (previous.readOnlyReason) throw new Error(previous.readOnlyReason)
  if (field === 'multiInstanceEnabled' && value !== 'true') return { loopCharacteristics: undefined }

  const existing = activity.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
    ? activity.loopCharacteristics : undefined
  const mode = field === 'multiInstanceMode' ? value as MultiInstanceMode
    : field === 'multiInstanceEnabled' && value === 'true' ? 'collection' : previous.mode
  if (mode !== 'collection' && mode !== 'cardinality') throw new Error('多实例来源必须是集合或循环次数')

  const properties = existing ? copiedProperties(existing) : {}
  delete properties.completionCondition
  delete properties.inputDataItem
  delete properties.outputDataItem
  const sequential = field === 'multiInstanceOrder' ? value === 'sequential' : previous.sequential
  properties.isSequential = sequential

  if (mode === 'collection') {
    delete properties.loopCardinality
    properties.collection = field === 'multiInstanceCollection' ? value.trim() || undefined : previous.collection || undefined
    properties.elementVariable = field === 'multiInstanceElementVariable' ? value.trim() || undefined : previous.elementVariable || undefined
  } else {
    delete properties.collection
    delete properties.elementVariable
    const body = field === 'multiInstanceCardinality' ? value.trim() : previous.cardinality
    properties.loopCardinality = moddle.create('bpmn:FormalExpression', {
      ...(existing?.loopCardinality ? Object.fromEntries(Object.entries(existing.loopCardinality).filter(([key, item]) => !key.startsWith('$') && item !== undefined)) : {}),
      ...(existing?.loopCardinality?.$attrs ?? {}),
      body: body ?? '',
    })
  }

  const loop = moddle.create('bpmn:MultiInstanceLoopCharacteristics', properties)
  loop.$parent = activity
  if (loop.loopCardinality) loop.loopCardinality.$parent = loop
  return { loopCharacteristics: loop }
}
