/** 每个查询通道只允许最新请求提交结果，离开页面时统一取消。 */
export function createLatestQueryScope() {
  const channels = new Map<string, AbortController>()
  let disposed = false

  function cancel(key: string) {
    channels.get(key)?.abort()
    channels.delete(key)
  }

  function begin(key: string) {
    cancel(key)
    const controller = new AbortController()
    if (disposed) controller.abort()
    else channels.set(key, controller)
    return {
      signal: controller.signal,
      isCurrent: () => !disposed && !controller.signal.aborted && channels.get(key) === controller,
      finish: () => {
        if (channels.get(key) === controller) channels.delete(key)
      },
    }
  }

  function dispose() {
    disposed = true
    channels.forEach(controller => controller.abort())
    channels.clear()
  }

  return { begin, cancel, dispose }
}
