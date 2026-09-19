import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'
import Modeler from 'bpmn-js/lib/Modeler'
import type { Element, Label } from 'bpmn-js/lib/model/Types'
import { is } from 'bpmn-js/lib/util/ModelUtil'
import workflowDescriptor from '@/bpmn/workflow-moddle.json'
import initialDiagram from '@/bpmn/requirement-process.bpmn?raw'
import { createDiagramThemeOptions } from '@/bpmn/theme'
import type { NodeProperties, NodePropertyField } from '@/bpmn/types'

interface CommandStack {
  canUndo(): boolean
  canRedo(): boolean
  undo(): void
  redo(): void
}

interface ElementRegistry {
  get(id: string): Element | undefined
  getAll(): Element[]
}

interface DiagramBounds { x: number; y: number; width: number; height: number }
interface Canvas {
  viewbox(force?: false): DiagramBounds & { inner: DiagramBounds; outer: { width: number; height: number } }
  viewbox(bounds: DiagramBounds): void
}

const propertyNames: Record<NodePropertyField, string> = {
  name: 'name', assignee: 'wf:assignee', formKey: 'wf:formKey',
}

export function useBpmnDesigner(container: Ref<HTMLDivElement | undefined>) {
  const ready = ref(false)
  const initialized = ref(false)
  const busy = ref(false)
  const error = ref('')
  const warning = ref('')
  const canUndo = ref(false)
  const canRedo = ref(false)
  const selectedNode = shallowRef<NodeProperties | null>(null)
  let modeler: Modeler | undefined
  let activeElement: Element | undefined
  let disposed = false
  let successfulParses = 0

  function syncSelection() {
    if (!activeElement) {
      selectedNode.value = null
      return
    }
    const businessObject = activeElement.businessObject
    const readString = (key: string): string => {
      const value: unknown = businessObject.get(key)
      return typeof value === 'string' ? value : ''
    }
    selectedNode.value = {
      id: activeElement.id,
      type: activeElement.type,
      name: readString('name'),
      assignee: readString('wf:assignee'),
      formKey: readString('wf:formKey'),
      isUserTask: is(activeElement, 'bpmn:UserTask'),
    }
  }

  function syncHistory() {
    const stack = modeler?.get<CommandStack>('commandStack')
    canUndo.value = stack?.canUndo() ?? false
    canRedo.value = stack?.canRedo() ?? false
  }

  function fitViewport() {
    if (!modeler || !container.value) return
    const canvas = modeler.get<Canvas>('canvas')
    const { inner, outer } = canvas.viewbox(false)
    if (!inner.width || !inner.height || !outer.width || !outer.height) return
    const palette = container.value.querySelector('.djs-palette')
    const left = (palette?.getBoundingClientRect().width ?? 0) + 40
    const availableWidth = Math.max(1, outer.width - left - 32)
    const scale = Math.min(1, availableWidth / inner.width, Math.max(1, outer.height - 64) / inner.height)
    // Reserve room for the palette, which otherwise covers the start event.
    canvas.viewbox({
      x: inner.x - (left + (availableWidth - inner.width * scale) / 2) / scale,
      y: inner.y - (outer.height - inner.height * scale) / 2 / scale,
      width: outer.width / scale,
      height: outer.height / scale,
    })
  }

  function selectNode(preferredId?: string) {
    if (!modeler) return
    const registry = modeler.get<ElementRegistry>('elementRegistry')
    const preferred = preferredId ? registry.get(preferredId) : undefined
    const element = preferred ?? registry.getAll().find((item) => is(item, 'bpmn:UserTask'))
    if (element) {
      modeler.get<{ select(element: Element): void }>('selection').select(element)
      modeler.get<{ close(): void }>('contextPad').close()
    }
  }

  async function importXML(xml: string): Promise<boolean> {
    if (!modeler || busy.value || disposed) return false
    busy.value = true
    let previousXML: string | undefined
    const wasReady = ready.value
    const parseRevision = successfulParses
    const previousId = activeElement?.id
    const previousWarning = warning.value
    try {
      if (ready.value) previousXML = (await modeler.saveXML({ format: true })).xml
      if (disposed) return false
      const result = await modeler.importXML(xml)
      if (disposed) return false
      ready.value = true
      error.value = ''
      warning.value = result.warnings.length
        ? `文件有 ${result.warnings.length} 项内容未被完整识别，请确认后再导出。`
        : ''
      fitViewport()
      selectNode()
      syncHistory()
      return true
    } catch (cause) {
      if (disposed) return false
      ready.value = false
      if (wasReady && successfulParses === parseRevision) {
        // Parsing failed before definitions changed: preserve the existing undo stack too.
        ready.value = true
        warning.value = previousWarning
        syncSelection()
      } else if (previousXML) {
        try {
          await modeler.importXML(previousXML)
          if (disposed) return false
          ready.value = true
          warning.value = previousWarning
          fitViewport()
          selectNode(previousId)
        } catch {
          // Keep the original error and leave re-import available.
        }
      }
      const reason = cause instanceof Error ? cause.message : '文件不是有效的 BPMN 流程'
      error.value = `${ready.value ? '导入失败，已保留原流程' : '流程加载失败'}：${reason}`
      syncHistory()
      return false
    } finally {
      if (!disposed) busy.value = false
    }
  }

  function updateProperty(field: NodePropertyField, value: string) {
    if (!modeler || !activeElement || busy.value || !ready.value) return
    if (field !== 'name' && !is(activeElement, 'bpmn:UserTask')) return
    const property = propertyNames[field]
    const nextValue = value.trim() || undefined
    if (activeElement.businessObject.get(property) !== nextValue) {
      modeler.get<{ updateProperties(element: Element, properties: Record<string, unknown>): void }>('modeling')
        .updateProperties(activeElement, { [property]: nextValue })
    }
    syncSelection()
  }

  async function exportXML() {
    if (!modeler || !ready.value || busy.value) return undefined
    const result = await modeler.saveXML({ format: true })
    return disposed ? undefined : result.xml
  }

  function undo() {
    if (!busy.value && canUndo.value) modeler?.get<CommandStack>('commandStack').undo()
  }

  function redo() {
    if (!busy.value && canRedo.value) modeler?.get<CommandStack>('commandStack').redo()
  }

  onMounted(async () => {
    if (!container.value) return
    try {
      modeler = new Modeler({
        container: container.value,
        moddleExtensions: { wf: workflowDescriptor },
        ...createDiagramThemeOptions(),
      })
      initialized.value = true
      modeler.on('import.parse.complete', (event: { error?: unknown }) => {
        if (!event.error) successfulParses += 1
      })
      modeler.on('selection.changed', (event: { newSelection: Element[] }) => {
        const element = event.newSelection.length === 1 ? event.newSelection[0] : undefined
        const labelTarget = (element as Label | undefined)?.labelTarget
        const node = (labelTarget ?? element) as Element | undefined
        activeElement = node && is(node, 'bpmn:FlowNode') ? node : undefined
        syncSelection()
      })
      modeler.on('element.changed', (event: { element: Element }) => {
        if (event.element === activeElement) syncSelection()
      })
      modeler.on('commandStack.changed', syncHistory)
      await importXML(initialDiagram)
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : '画布初始化失败'
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    modeler?.destroy()
    modeler = undefined
    activeElement = undefined
  })

  return {
    ready, initialized, busy, error, warning, selectedNode, canUndo, canRedo,
    fitViewport, importXML, exportXML, updateProperty, undo, redo,
  }
}
