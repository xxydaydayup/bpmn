import ElementFactory from 'bpmn-js/lib/features/modeling/ElementFactory'
import type { ModdleElement } from 'bpmn-js/lib/model/Types'
import { diagramTheme } from './theme'

export default class CardElementFactory extends ElementFactory {
  getDefaultSize(element: ModdleElement, di?: ModdleElement) {
    if (['bpmn:UserTask', 'bpmn:ServiceTask'].includes(element.$type ?? element.type)) {
      return { width: diagramTheme.card.width, height: diagramTheme.card.height }
    }
    return super.getDefaultSize(element, di)
  }
}
