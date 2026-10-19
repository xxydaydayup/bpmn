declare module 'bpmn-js-properties-panel' {
  export const BpmnPropertiesPanelModule: Record<string, unknown>
  export const BpmnPropertiesProviderModule: Record<string, unknown>
  export const CamundaPlatformPropertiesProviderModule: Record<string, unknown>
}

declare module 'bpmn-js-element-templates' {
  export const ElementTemplatesPropertiesProviderModule: Record<string, unknown>
}

declare module '@bpmn-io/element-template-chooser' {
  const module: Record<string, unknown>
  export default module
}
