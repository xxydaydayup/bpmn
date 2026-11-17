export function validateServiceUrl(node: import('../types').WorkflowNodeRecord) {
  if (typeof node.serviceUrl !== 'string' || !node.serviceUrl.trim()) return []
  try {
    const url = new URL(node.serviceUrl)
    if (['http:', 'https:'].includes(url.protocol)) return []
  } catch {
    // Invalid URLs use the same issue as unsupported schemes.
  }
  return [{ code: 'service-url', message: '服务地址必须是有效的 HTTP 或 HTTPS URL。', nodeId: node.id }]
}

