/** Presentation defaults: changing the theme does not rewrite workflow XML. */
export const diagramTheme = {
  canvas: { background: '#f7f9f8', grid: '#dce5df', accent: '#24745e' },
  renderer: {
    defaultFillColor: '#ffffff',
    defaultStrokeColor: '#98aaa1',
    defaultLabelColor: '#293a34',
  },
  typography: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 14,
  },
  card: { width: 184, height: 88, radius: 9, stroke: '#d5e0d9', strokeWidth: 1.25, iconSize: 20, iconBox: 34, padding: 14, textGap: 12, typeSize: 11, lineHeight: 18 },
  colors: { human: '#24745e', humanSoft: '#edf5f1', service: '#526d9e', serviceSoft: '#edf2fa', branch: '#a67a36', branchSoft: '#faf4e8', parallel: '#7d6d9b', parallelSoft: '#f2eef8', secondary: '#687870', end: '#84978b', eventBorder: '#b7cbbf', endIcon: '#788c7e' },
  layout: { nodeGap: 64, layerGap: 76, edgeGap: 24, padding: 40 },
}

export function diagramCSSVariables() {
  return {
    '--diagram-background': diagramTheme.canvas.background,
    '--diagram-grid': diagramTheme.canvas.grid,
    '--diagram-accent': diagramTheme.canvas.accent,
    '--diagram-accent-soft': diagramTheme.colors.humanSoft,
    '--diagram-human': diagramTheme.colors.human,
    '--diagram-human-soft': diagramTheme.colors.humanSoft,
    '--diagram-event-border': diagramTheme.colors.eventBorder,
    '--diagram-end-icon': diagramTheme.colors.endIcon,
    '--diagram-service': diagramTheme.colors.service,
    '--diagram-service-soft': diagramTheme.colors.serviceSoft,
    '--diagram-branch': diagramTheme.colors.branch,
    '--diagram-branch-soft': diagramTheme.colors.branchSoft,
    '--diagram-parallel': diagramTheme.colors.parallel,
    '--diagram-parallel-soft': diagramTheme.colors.parallelSoft,
    '--diagram-secondary': diagramTheme.colors.secondary,
  }
}
