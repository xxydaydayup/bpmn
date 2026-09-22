const BPMN_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const CAMUNDA_NAMESPACE = 'http://camunda.org/schema/1.0/bpmn'
const DEFAULT_HISTORY_TIME_TO_LIVE = '30'

/** Ensure raw deployment XML also satisfies Camunda history cleanup requirements. */
export function ensureDeploymentHistoryTimeToLive(xml: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return xml

  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) return xml

  let changed = false
  for (const process of Array.from(document.getElementsByTagNameNS(BPMN_NAMESPACE, 'process'))) {
    if (!process.getAttributeNS(CAMUNDA_NAMESPACE, 'historyTimeToLive')?.trim()) {
      process.setAttributeNS(CAMUNDA_NAMESPACE, 'camunda:historyTimeToLive', DEFAULT_HISTORY_TIME_TO_LIVE)
      changed = true
    }
  }
  if (!changed) return xml

  if (!document.documentElement.getAttribute('xmlns:camunda')) {
    document.documentElement.setAttribute('xmlns:camunda', CAMUNDA_NAMESPACE)
  }
  return new XMLSerializer().serializeToString(document)
}
