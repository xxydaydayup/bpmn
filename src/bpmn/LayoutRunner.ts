import ELK from 'elkjs/lib/elk-api'
import workerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { ElkNode, ELK as ElkEngine } from 'elkjs/lib/elk-api'

/** A disposable worker keeps importing/layout cancellable when the designer unmounts. */
export default class LayoutRunner {
  private engine?: ElkEngine
  private cancel?: (reason: Error) => void

  async run(graph: ElkNode): Promise<ElkNode> {
    this.engine ??= new ELK({ workerFactory: () => new Worker(workerUrl) })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.engine.layout(graph),
        new Promise<never>((_, reject) => {
          this.cancel = reject
          timer = setTimeout(() => { this.cancel = undefined; this.destroy(); reject(new Error('布局计算超时，已保留原图')) }, 20000)
        }),
      ])
    } finally {
      clearTimeout(timer)
      this.cancel = undefined
    }
  }

  destroy() {
    this.engine?.terminateWorker()
    this.engine = undefined
    this.cancel?.(new Error('布局计算已取消'))
  }
}
