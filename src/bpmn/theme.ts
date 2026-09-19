import LabelTextRenderer from './LabelTextRenderer'

/** Presentation defaults: changing the theme does not rewrite workflow XML. */
export const diagramTheme = {
  canvas: { background: '#fafcfb', grid: '#dce5df', accent: '#24745e' },
  renderer: {
    defaultFillColor: '#ffffff',
    defaultStrokeColor: '#45675b',
    defaultLabelColor: '#243c36',
  },
  typography: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 14,
  },
}

export function createDiagramThemeOptions() {
  return {
    additionalModules: [{ textRenderer: ['type', LabelTextRenderer] }],
    bpmnRenderer: { ...diagramTheme.renderer },
    textRenderer: {
      defaultStyle: { ...diagramTheme.typography },
      externalStyle: { ...diagramTheme.typography, fontSize: 13 },
    },
  }
}
