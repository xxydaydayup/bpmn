/** Host adapter; baseUrl includes the version root, for example a same-origin /api/v1. */
export function createFetchRequest(baseUrl, { headers: hostHeaders = {}, fetch: send = globalThis.fetch } = {}) {
  return async ({ method, path, query, headers, body, signal }) => {
    const root = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const url = new URL(root + path, globalThis.location?.href)
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value))
    const multipart = body instanceof FormData
    const response = await send(url, { method, signal, headers: { ...hostHeaders, ...headers, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) })
    const text = await response.text()
    let result
    try { result = text ? JSON.parse(text) : null } catch { result = text }
    return { status: response.status, body: result }
  }
}
