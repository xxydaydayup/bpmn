import LabelTextRenderer from './LabelTextRenderer'
import BusinessRenderer from './BusinessRenderer'
import BusinessContextPad from './BusinessContextPad'
import CardElementFactory from './CardElementFactory'
import CardConnectionDocking from './CardConnectionDocking'
import { diagramTheme } from './theme'

const translations: Record<string, string> = {
  'User task': '人工任务', 'Service task': '服务任务', 'Task': '通用任务',
  'Start event': '开始事件', 'End event': '结束事件', 'Exclusive gateway': '条件分支',
  'Parallel gateway': '并行分支', 'Intermediate throw event': '中间抛出事件',
  'Append user task': '添加人工任务', 'Append task': '添加任务', 'Append end event': '添加结束事件',
  'Change type': '替换类型', 'Delete': '删除', 'Connect using Sequence/MessageFlow or Association': '连接节点',
  'Search': '搜索', 'Create': '创建', 'Replace': '替换',
  'Change element': '替换节点类型', 'Send task': '发送任务', 'Receive task': '接收任务',
  'Manual task': '手工任务', 'Business rule task': '业务规则任务', 'Script task': '脚本任务',
  'Call activity': '调用活动', 'Sub-process (collapsed)': '子流程（折叠）', 'Sub-process (expanded)': '子流程（展开）',
  'Ad-hoc sub-process (collapsed)': '即席子流程（折叠）', 'Ad-hoc sub-process (expanded)': '即席子流程（展开）',
  'Parallel multi-instance': '并行多实例', 'Sequential multi-instance': '顺序多实例', 'Loop': '循环',
}

export function createDiagramThemeOptions() {
  return {
    additionalModules: [{
      __init__: ['businessRenderer', 'businessContextPad'],
      businessRenderer: ['type', BusinessRenderer],
      businessContextPad: ['type', BusinessContextPad],
      elementFactory: ['type', CardElementFactory],
      connectionDocking: ['type', CardConnectionDocking],
      textRenderer: ['type', LabelTextRenderer],
      // The Vue library owns creation; disable the built-in palette service.
      paletteProvider: ['value', null],
      translate: ['value', (template: string, replacements: Record<string, string> = {}) => (translations[template] ?? template).replace(/\{([^}]+)\}/g, (match, key: string) => replacements[key] ?? match)],
    }],
    bpmnRenderer: { ...diagramTheme.renderer },
    textRenderer: {
      defaultStyle: { fontFamily: diagramTheme.typography.fontFamily, fontSize: diagramTheme.typography.fontSize },
      externalStyle: { fontFamily: diagramTheme.typography.fontFamily, fontSize: diagramTheme.typography.externalFontSize },
    },
  }
}
