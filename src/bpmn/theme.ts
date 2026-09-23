/**
 * Presentation defaults only. Theme changes never rewrite workflow XML,
 * BPMN DI or the modeling command stack.
 *
 * 调色入口是下方 `themePresets`，颜色支持 #RRGGBB 等合法 CSS 颜色值。
 * 各预设请保持卡片宽高和字体尺寸一致；切换主题只重绘，不会重新计算 DI 几何。
 * 改字体或字号后需检查中文换行和外部标签，已有标签边界不会自动重新布局。
 */
export type ThemeId = 'mist' | 'slate' | 'contrast'

export interface DiagramTheme {
  id: ThemeId
  label: string
  /** 画布外观：背景、网格点阵，以及选中/交互使用的强调色。 */
  canvas: {
    background: string // 画布底色。
    grid: string // 点阵网格颜色。
    accent: string // 选中轮廓、交互高亮及主按钮颜色。
  }
  /**
   * 默认回退颜色，导入 XML 中的显式颜色仍优先。
   * 原生 BpmnRenderer 会缓存初始化颜色；未接管的原生图形/连线暂不完整跟随实时切换。
   */
  renderer: {
    defaultFillColor: string // 业务卡片、结束事件等的默认底色。
    defaultStrokeColor: string // 原生节点/连线的默认描边；业务卡片使用 card.stroke。
    defaultLabelColor: string // 默认文字颜色，业务卡片名称会实时读取。
  }
  /** 画布内文字与外部标签的字体配置，字号单位为 px。 */
  typography: { fontFamily: string; fontSize: number; externalFontSize: number }
  /** 业务任务卡片的外观和尺寸。尺寸会影响新建节点与自动布局。 */
  card: {
    width: number
    height: number
    radius: number
    stroke: string // 人工/服务任务卡片边框颜色。
    strokeWidth: number // 卡片边框粗细，单位 px；选中状态另有 CSS 覆盖。
    iconSize: number
    iconBox: number
    padding: number
    textGap: number
    typeSize: number
    lineHeight: number
  }
  /** 按 BPMN 语义划分的颜色：人工、服务、分支、并行网关和事件。 */
  colors: {
    human: string // 人工任务图标、开始事件图标/描边及对应节点库图标主色。
    humanSoft: string // 人工任务图标底色、开始事件底色及快捷操作悬停背景。
    service: string // 服务任务图标主色。
    serviceSoft: string // 服务任务图标底色。
    branch: string // 排他网关外框及节点库分支图标主色。
    branchSoft: string // 排他网关填充色及分支图标底色。
    parallel: string // 并行网关外框及节点库并行图标主色。
    parallelSoft: string // 并行网关填充色及并行图标底色。
    secondary: string // 卡片中的“人工任务/服务任务”类型文字颜色。
    end: string // 带事件定义的结束事件外框回退色；普通结束事件使用 eventBorder。
    eventBorder: string // 普通开始/结束事件外框及节点库事件图标边框颜色。
    endIcon: string // 普通结束事件的内部图标颜色。
  }
  /** ELK 自动布局使用的间距；主题切换时保持固定。 */
  layout: { nodeGap: number; layerGap: number; edgeGap: number; padding: number }
}

export type ThemeSnapshot = Readonly<DiagramTheme>
export type ThemeListener = (theme: ThemeSnapshot) => void

// 几何参数与颜色 token 分离。调整后需要重新整理布局，才会统一已有图形的尺寸。
const geometry = {
  card: { width: 184, height: 88 },
  layout: { nodeGap: 64, layerGap: 76, edgeGap: 24, padding: 40 },
}

// 三套预设共用的字体基线；可在单个 preset 的 typography 中覆盖。
const font = { fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', fontSize: 14, externalFontSize: 13 }

function createPreset(
  id: ThemeId,
  label: string,
  values: Omit<DiagramTheme, 'id' | 'label' | 'card' | 'layout' | 'typography'> & {
    typography?: Partial<DiagramTheme['typography']>
    card?: Partial<DiagramTheme['card']>
  },
): DiagramTheme {
  return {
    id,
    label,
    ...values,
    typography: { ...font, ...values.typography },
    // card 允许覆盖圆角、描边等外观；预设不要覆盖 width/height，以保持几何基线一致。
    card: { ...geometry.card, radius: 9, stroke: '#d5e0d9', strokeWidth: 1.25, iconSize: 20, iconBox: 34, padding: 14, textGap: 12, typeSize: 11, lineHeight: 18, ...values.card },
    layout: { ...geometry.layout },
  }
}

export const themePresets: Record<ThemeId, DiagramTheme> = {
  // 青雾：当前默认主题，适合常规浅色工作台。
  mist: createPreset('mist', '青雾', {
    canvas: { background: '#f7f9f8', grid: '#dce5df', accent: '#24745e' },
    renderer: { defaultFillColor: '#ffffff', defaultStrokeColor: '#98aaa1', defaultLabelColor: '#293a34' },
    colors: { human: '#24745e', humanSoft: '#edf5f1', service: '#526d9e', serviceSoft: '#edf2fa', branch: '#a67a36', branchSoft: '#faf4e8', parallel: '#7d6d9b', parallelSoft: '#f2eef8', secondary: '#687870', end: '#84978b', eventBorder: '#b7cbbf', endIcon: '#788c7e' },
  }),
  // 石墨：降低绿色倾向，适合偏中性的企业后台界面。
  slate: createPreset('slate', '石墨', {
    canvas: { background: '#f3f5f6', grid: '#d0d7db', accent: '#3d5968' },
    renderer: { defaultFillColor: '#ffffff', defaultStrokeColor: '#7f8e97', defaultLabelColor: '#26343b' },
    colors: { human: '#3d5968', humanSoft: '#e8eef1', service: '#7563a1', serviceSoft: '#efecf7', branch: '#9a6738', branchSoft: '#f7eee7', parallel: '#3d7c78', parallelSoft: '#e6f2f1', secondary: '#64737a', end: '#71818a', eventBorder: '#9eabb1', endIcon: '#52626b' },
    card: { stroke: '#c8d1d5' },
  }),
  // 高对比：提高文字、描边和语义色对比度，适合可读性优先的场景。
  contrast: createPreset('contrast', '高对比', {
    canvas: { background: '#ffffff', grid: '#b5c0bb', accent: '#005a44' },
    renderer: { defaultFillColor: '#ffffff', defaultStrokeColor: '#26352e', defaultLabelColor: '#111817' },
    colors: { human: '#005a44', humanSoft: '#d8eee6', service: '#164e86', serviceSoft: '#dceafa', branch: '#7a4b00', branchSoft: '#f8e8c7', parallel: '#553b82', parallelSoft: '#e9e0f7', secondary: '#34463e', end: '#34463e', eventBorder: '#3c554a', endIcon: '#1d3128' },
    card: { stroke: '#26352e', strokeWidth: 1.5 },
  }),
}

/** Stable object retained for existing renderer imports. It is mutated in place. */
export const diagramTheme: DiagramTheme = cloneTheme(themePresets.mist)
let activeThemeId: ThemeId = 'mist'
const listeners = new Set<ThemeListener>()

function cloneTheme(theme: DiagramTheme): DiagramTheme {
  return {
    ...theme,
    canvas: { ...theme.canvas },
    renderer: { ...theme.renderer },
    typography: { ...theme.typography },
    card: { ...theme.card },
    colors: { ...theme.colors },
    layout: { ...theme.layout },
  }
}

function replaceTheme(target: DiagramTheme, source: DiagramTheme) {
  target.id = source.id
  target.label = source.label
  Object.assign(target.canvas, source.canvas)
  Object.assign(target.renderer, source.renderer)
  Object.assign(target.typography, source.typography)
  Object.assign(target.card, source.card)
  Object.assign(target.colors, source.colors)
  // Geometry remains fixed across runtime theme changes.
  Object.assign(target.layout, geometry.layout)
}

export function getActiveThemeId() { return activeThemeId }

export function getThemeSnapshot(): ThemeSnapshot { return cloneTheme(diagramTheme) }

export interface ThemeStore {
  getSnapshot(): ThemeSnapshot
  setTheme(id: ThemeId): ThemeSnapshot
  subscribe(listener: ThemeListener): () => void
}

export function createThemeStore(initial: ThemeId = activeThemeId): ThemeStore {
  const initialTheme = themePresets[initial]
  if (!initialTheme) throw new Error(`未知的设计器主题：${String(initial)}`)
  if (initial !== activeThemeId) {
    activeThemeId = initial
    replaceTheme(diagramTheme, initialTheme)
  }

  return {
    getSnapshot: getThemeSnapshot,
    setTheme(id) {
      if (id === activeThemeId) return getThemeSnapshot()
      const next = themePresets[id]
      if (!next) throw new Error(`未知的设计器主题：${id}`)
      activeThemeId = id
      replaceTheme(diagramTheme, next)
      const snapshot = getThemeSnapshot()
      for (const listener of listeners) listener(snapshot)
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function diagramCSSVariables(theme: DiagramTheme = diagramTheme) {
  // 这些变量供 DesignerView 和 designer.css 使用；新增 UI 颜色时可在这里补充映射。
  return {
    '--diagram-background': theme.canvas.background,
    '--diagram-grid': theme.canvas.grid,
    '--diagram-accent': theme.canvas.accent,
    '--diagram-accent-soft': theme.colors.humanSoft,
    '--diagram-human': theme.colors.human,
    '--diagram-human-soft': theme.colors.humanSoft,
    '--diagram-event-border': theme.colors.eventBorder,
    '--diagram-end-icon': theme.colors.endIcon,
    '--diagram-service': theme.colors.service,
    '--diagram-service-soft': theme.colors.serviceSoft,
    '--diagram-branch': theme.colors.branch,
    '--diagram-branch-soft': theme.colors.branchSoft,
    '--diagram-parallel': theme.colors.parallel,
    '--diagram-parallel-soft': theme.colors.parallelSoft,
    '--diagram-secondary': theme.colors.secondary,
  }
}
