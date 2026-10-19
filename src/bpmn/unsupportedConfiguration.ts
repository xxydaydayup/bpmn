import type { ModdleElement } from 'bpmn-js/lib/model/Types'

const camundaExtensionLabels: Record<string, string> = {
  ExecutionListener: '执行监听器',
  TaskListener: '任务监听器',
  FormData: '表单数据',
  FormProperty: '旧版表单属性',
  Connector: '连接器',
  FailedJobRetryTimeCycle: '失败重试周期',
}

/** Summarize Camunda and vendor XML that the current property panel cannot edit. */
export function readUnsupportedConfiguration(
  element: ModdleElement,
  supportedCamundaProperties: readonly string[] = [],
  supportedExtensionTypes: readonly string[] = [],
  supportedLoopCamundaProperties: readonly string[] = [],
  supportedLoopElements: readonly string[] = [],
  supportedLoopAttributes: readonly string[] = [],
  supportedLoopExtensionTypes: readonly string[] = [],
): string[] {
  const supportedProperties = new Set(supportedCamundaProperties)
  const hasRecognizedMultiInstance = element.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
  if (hasRecognizedMultiInstance) {
    for (const property of ['collection', 'elementVariable']) supportedProperties.add(property)
  }

  const unsupportedCamundaProperties = Object.keys(element)
    .filter(key => !key.startsWith('$') && key !== 'extensionElements' && element[key] !== undefined)
    .filter(key => element.$descriptor.propertiesByName[key]?.ns?.prefix === 'camunda' && !supportedProperties.has(key))

  const lines: string[] = []
  if (unsupportedCamundaProperties.length) {
    lines.push('Camunda 属性：' + unsupportedCamundaProperties.join('、'))
  }

  const loop = element.loopCharacteristics
  if (loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics' && loop.completionCondition && !supportedLoopElements.includes('completionCondition')) {
    lines.push('多实例：完成条件')
  }
  if (loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics' && (loop.inputDataItem || loop.outputDataItem)) {
    lines.push('多实例：输入/输出数据项（本面板保留配置，不提供数据项编辑）')
  }
  if (loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
    const unsupportedAttributes = Object.keys(loop.$attrs ?? {}).filter(key => !supportedLoopAttributes.includes(key))
    if (unsupportedAttributes.length) lines.push('多实例扩展属性：' + unsupportedAttributes.join('、'))
    const loopCamundaProperties = Object.keys(loop)
      .filter(key => !key.startsWith('$') && loop[key] !== undefined)
      .filter(key => loop.$descriptor.propertiesByName[key]?.ns?.prefix === 'camunda' && !supportedLoopCamundaProperties.includes(key))
    if (loopCamundaProperties.length) {
      lines.push('多实例 Camunda 属性：' + loopCamundaProperties.join('、'))
    }
    const loopExtensions = (loop.extensionElements?.values ?? []) as ModdleElement[]
    const unsupportedCamundaLoopExtensions = loopExtensions
      .filter(extension => extension.$type.startsWith('camunda:') && !supportedLoopExtensionTypes.includes(extension.$type))
      .map(extension => {
        const localName = extension.$type.slice('camunda:'.length)
        return camundaExtensionLabels[localName] ?? localName
      })
    if (unsupportedCamundaLoopExtensions.length) {
      lines.push('多实例 Camunda 扩展：' + [...new Set(unsupportedCamundaLoopExtensions)].join('、'))
    }
    const otherLoopExtensions = loopExtensions
      .filter(extension => !extension.$type.startsWith('camunda:') && !supportedLoopExtensionTypes.includes(extension.$type))
      .map(extension => extension.$type)
    if (otherLoopExtensions.length) {
      lines.push('多实例扩展：' + [...new Set(otherLoopExtensions)].join('、'))
    }
  }

  const extensions = (element.extensionElements?.values ?? []) as ModdleElement[]
  const unsupportedCamundaExtensions = extensions
    .filter(extension => extension.$type.startsWith('camunda:') && !supportedExtensionTypes.includes(extension.$type))
    .map(extension => {
      const localName = extension.$type.slice('camunda:'.length)
      return camundaExtensionLabels[localName] ?? localName
    })
  if (unsupportedCamundaExtensions.length) {
    lines.push('Camunda 扩展：' + [...new Set(unsupportedCamundaExtensions)].join('、'))
  }

  const otherExtensions = extensions
    .filter(extension => !extension.$type.startsWith('camunda:') && !supportedExtensionTypes.includes(extension.$type))
    .map(extension => extension.$type)
  if (otherExtensions.length) {
    lines.push('其他扩展：' + [...new Set(otherExtensions)].join('、'))
  }

  const otherAttributes = [
    ...Object.keys(element.$attrs ?? {}),
    ...extensions.flatMap(extension => Object.keys(extension.$attrs ?? {})),
  ]
  if (otherAttributes.length) {
    lines.push('扩展属性：' + otherAttributes.join('、'))
  }

  return lines
}
