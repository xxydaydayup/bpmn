import TextRenderer, { type TextRendererConfig } from 'bpmn-js/lib/draw/TextRenderer'

export default class LabelTextRenderer extends TextRenderer {
  static $inject = ['config.textRenderer']

  constructor(config?: TextRendererConfig) {
    super(config)
    const getBounds = this.getExternalLabelBounds

    this.getExternalLabelBounds = (bounds, text) => {
      const measured = getBounds(bounds, text)
      // diagram-js uses a strict width comparison. Allow for exact integer
      // glyph widths (common in Chinese) so labels do not wrap on redraw.
      return text ? { ...measured, x: measured.x - 1, width: measured.width + 2 } : measured
    }
  }
}
