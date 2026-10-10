import { ref, watch, type Ref } from 'vue'
import type { BusinessWorkflowGateway } from '@/api/workflow/types'

type ImportXML = (xml: string) => Promise<boolean>
type ResetDiagram = () => Promise<boolean>

function waitForIdle(busy: Ref<boolean>, signal: AbortSignal) {
  if (!busy.value || signal.aborted) return Promise.resolve()
  return new Promise<void>(resolve => {
    const stop = watch(busy, value => {
      if (!value || signal.aborted) finish()
    }, { flush: 'post' })
    const finish = () => {
      stop()
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

export function useCurrentTaskTemplate(
  taskKey: Ref<string | undefined>,
  ready: Ref<boolean>,
  busy: Ref<boolean>,
  importXML: ImportXML,
  gateway: BusinessWorkflowGateway,
  resetDiagram: ResetDiagram,
) {
  const loading = ref(false)
  const error = ref('')
  let importQueue = Promise.resolve()

  watch([taskKey, ready], ([key, designerReady], _previous, onCleanup) => {
    error.value = ''
    if (!designerReady || !key) {
      loading.value = false
      return
    }

    const controller = new AbortController()
    loading.value = true
    onCleanup(() => {
      controller.abort()
      loading.value = false
    })

    void (async () => {
      try {
        const detail = await gateway.getTemplate(key, controller.signal)
        if (controller.signal.aborted) return
        if (!detail.bpmnXml?.trim()) throw new Error('当前任务模板没有可编辑的 BPMN 流程 XML')
        await waitForIdle(busy, controller.signal)
        if (controller.signal.aborted || taskKey.value !== key) return
        let releaseImport!: () => void
        const previousImport = importQueue
        importQueue = new Promise<void>(resolve => { releaseImport = resolve })
        await previousImport
        if (controller.signal.aborted || taskKey.value !== key) {
          releaseImport()
          return
        }
        const imported = await importXML(detail.bpmnXml)
        releaseImport()
        if (controller.signal.aborted || taskKey.value !== key) {
          if (!taskKey.value && imported) await resetDiagram()
          return
        }
        if (!imported) throw new Error('任务模板载入失败，请稍后重试')
      } catch (cause) {
        if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : '读取当前任务模板失败'
      } finally {
        if (!controller.signal.aborted) loading.value = false
      }
    })()
  }, { immediate: true })

  return { loading, error }
}
