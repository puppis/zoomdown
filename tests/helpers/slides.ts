/** Building markup slides in tests, with text measured without a browser. */
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../../src/markup/parser';
import { MarkupSlide, SlideBuilder } from '../../src/markup/slide';
import { Presenter, PresenterConfig } from '../../src/runtime';

/**
 * A canvas for text layout without a browser: every glyph is half the font size wide, and the
 * font reaches 0.8 of its size above the baseline and 0.2 below.
 */
export function installFakeCanvas(): void {
  const state: Record<string, unknown> = { font: '10px serif' };
  const measureText = (text: string) => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(state.font as string)?.[1] ?? 10);
    const width = 0.5 * px * text.length;
    return {
      width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width,
      fontBoundingBoxAscent: 0.8 * px, fontBoundingBoxDescent: 0.2 * px, actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.1 * px,
    };
  };
  const context = new Proxy(state, {
    get: (target, key) => (key === 'measureText' ? measureText : key in target ? target[key as string] : () => undefined),
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
}

/** The deck's first slide, built and played. */
export async function built(source: string): Promise<MarkupSlide> {
  const root = new SlideBuilder().build(new MarkupParser().parse(source)) as MarkupSlide;
  await new Presenter({ config: new PresenterConfig({}) }).play(root);
  return root;
}

/** A slide `#s` with these attributes and this body, built. */
export const slide = (attributes: string, body: string) => built(`::: slide {#s ${attributes}}\n${body}\n:::`);

/** An element of a built slide. */
export const element = (from: MarkupSlide, id: string) => from.elements.get(id) as Mobject;
