import { beforeAll, describe, expect, it } from 'vitest';
import { cameraNearness, designPoints, dotSpacing } from '../src/guides';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder } from '../src/markup/slide';
import { Presenter, PresenterConfig, type SlideContext } from '../src/runtime';
import { Slide, walk } from '../src/slides';
import { installFakeCanvas } from './helpers/slides';

beforeAll(installFakeCanvas);

/** The slides of a deck by name, with their contexts, as prepared for playing. */
async function prepared(source: string, options: { namespace?: Record<string, unknown>; styles?: Record<string, Record<string, string>>; config?: ConstructorParameters<typeof PresenterConfig>[0] } = {}) {
  const document = new MarkupParser().parse(source, { styles: options.styles ?? {} });
  const root = new SlideBuilder().build(document, { namespace: options.namespace as never });
  const presenter = new Presenter({ config: new PresenterConfig(options.config ?? {}), foreground: '#123456' });
  await presenter.prepare(root);
  const contexts = new Map<string, SlideContext>();
  for (const slide of walk(root)) contexts.set(slide.name, presenter.contexts.get(slide) as SlideContext);
  return { presenter, contexts, guided: [...contexts].filter(([, ctx]) => ctx.display.guides !== null).map(([name]) => name) };
}

const DECK = (a = '', b = '', include = '') => `::: slide {#a ${a}}\n# A\n\n[[include: #b x=0 y=0 width=4 ${include}]]\n:::\n\n::: slide {#b ${b}}\n# B\n:::`;
const STYLE = '::: styles\nslide: debug\n:::\n\n';

describe('a slide drawn for its design (debug)', () => {
  it('is the slide that says so, and not its children', async () => {
    expect((await prepared(DECK())).guided).toEqual([]);
    expect((await prepared(DECK('debug'))).guided).toEqual(['A']);
    expect((await prepared(DECK('', 'debug=true'))).guided).toEqual(['B']);
    expect((await prepared(DECK('', '', 'debug'))).guided).toEqual(['B']);
  });

  it('is every slide by the slide style, but for those that say no', async () => {
    expect((await prepared(STYLE + DECK())).guided).toEqual(['A', 'B']);
    expect((await prepared(STYLE + DECK('', 'debug=false'))).guided).toEqual(['A']);
    expect((await prepared(STYLE + DECK('', '', 'debug=false'))).guided).toEqual(['A']);
    // From the front matter, where a style is a map or a string.
    expect((await prepared(DECK(), { styles: { slide: { debug: 'true' } } })).guided).toEqual(['A', 'B']);
  });

  it('reaches code-authored subslides through the style, their own children after them, and not placeholders', async () => {
    class Inner extends Slide {}
    class Code extends Slide {
      override declare(): void { this.addChild(new Inner('Inner'), { width: 2 }); }
    }
    const source = '::: slide {#a}\n# A\n\n[[subslide: Code x=0 y=0 width=4]]\n\n[[include: #missing x=4 y=0 width=2]]\n:::';
    expect((await prepared(STYLE + source, { namespace: { Code } })).guided).toEqual(['A', 'Code', 'Inner']);
    expect((await prepared(source.replace('{#a}', '{#a debug}'), { namespace: { Code } })).guided).toEqual(['A']);
    expect((await prepared(STYLE + source.replace('width=4', 'width=4 debug=false'), { namespace: { Code } })).guided).toEqual(['A']);
  });

  it('refuses a value that is not a flag', () => {
    expect(() => new MarkupParser().parse('::: slide {#a debug=maybe}\nA\n:::')).toThrow(/debug must be true or false/);
  });

  it('has one frame, in the border style of the presenter, and dots in the text color', async () => {
    const { contexts } = await prepared(DECK('debug'), { config: { showSlideBorders: true, slideBorderColor: '#00FF00' } });
    const display = (contexts.get('A') as SlideContext).display;
    expect(display.overlays).toEqual([display.guides?.frame]);
    expect(display.guides?.frame.color.toString().toLowerCase()).toBe('#00ff00');
    expect(display.guides?.dots?.material.color.getHexString()).toBe('123456');
    expect((contexts.get('B') as SlideContext).display.overlays.length).toBe(1);
  });

  it('shows its dots, its frame and its children\'s frames while the camera is on it, and no others', async () => {
    // A over B and D, side by side; B over C.
    const source = '::: slide {#a}\n# A\n\n[[include: #b x=-4 y=0 width=6]]\n\n[[include: #d x=4 y=0 width=6]]\n:::\n\n::: slide {#b}\n# B\n\n[[include: #c x=0 y=0 width=6]]\n:::\n\n::: slide {#c}\n# C\n:::\n\n::: slide {#d}\n# D\n:::';
    const { presenter, contexts } = await prepared(STYLE + source);
    const seen = () => {
      presenter.prepareRender(800, 450, { min: [-100, -100, 0], max: [100, 100, 0] }, presenter.camera.width);
      return [...contexts].map(([name, ctx]) => {
        const guides = ctx.display.guides;
        return `${name}${guides?.frame.getThreeObject().visible ? ' frame' : ''}${guides?.dots?.visible ? ' dots' : ''}`;
      });
    };
    const look = (name: string) => {
      presenter.camera = { ...presenter.cameraTarget(contexts.get(name) as SlideContext) };
      return seen();
    };
    expect(look('A')).toEqual(['A frame dots', 'B frame', 'C', 'D frame']);
    expect(look('B')).toEqual(['A', 'B frame dots', 'C frame', 'D']);
    expect(look('C')).toEqual(['A', 'B', 'C frame dots', 'D']);
    // On its way, the camera sees the guides of one slide at a time, fading with the distance.
    const dots = (name: string) => (contexts.get(name) as SlideContext).display.guides?.dots;
    const full = (look('A'), dots('A')?.material.opacity as number);
    const a = presenter.cameraTarget(contexts.get('A') as SlideContext);
    presenter.camera = { center: a.center, width: a.width * 0.85 };
    expect(seen()[0]).toBe('A frame dots');
    expect(dots('A')?.material.opacity).toBeGreaterThan(0);
    expect(dots('A')?.material.opacity).toBeLessThan(full);
    presenter.camera = { center: a.center, width: a.width * 5 };
    expect(seen()).toEqual(['A', 'B', 'C', 'D']);
    look('A');
    presenter.guides = false;
    expect(seen()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('gives way to the inner of two slides that fill the view alike', async () => {
    const { presenter, contexts } = await prepared(STYLE + DECK().replace('width=4', 'width=16'));
    presenter.camera = { ...presenter.cameraTarget(contexts.get('A') as SlideContext) };
    presenter.prepareRender(800, 450, { min: [-100, -100, 0], max: [100, 100, 0] }, presenter.camera.width);
    expect([...contexts.values()].map((ctx) => ctx.display.guides?.dots?.visible)).toEqual([false, true]);
  });
});

describe('the dots of a slide', () => {
  it('stand at whole coordinates around the origin, larger on the axes and every five', () => {
    const points = designPoints(16, 9);
    expect(points.length).toBe(17 * 9);
    const size = (x: number, y: number) => points.find((point) => point.x === x && point.y === y)?.size;
    expect([size(0, 0), size(5, 0), size(-5, 0), size(3, 0), size(0, 2), size(3, 2), size(8, 4), size(9, 0)]).toEqual([2, 2, 2, 1.5, 1.5, 1, 1, undefined]);
  });

  it('are further apart on a large canvas', () => {
    expect([dotSpacing(16, 9), dotSpacing(64, 36), dotSpacing(100, 50), dotSpacing(300, 10), dotSpacing(9, 700)]).toEqual([1, 1, 2, 5, 20]);
    expect(designPoints(100, 50).every((point) => point.x % 2 === 0)).toBe(true);
  });

  it('fade with the distance of the camera', () => {
    const target = { center: [2, 1, 0], width: 4 };
    expect(cameraNearness(target, target)).toBe(1);
    expect(cameraNearness(target, { center: [0, 0, 0], width: 16 })).toBe(0);
    const half = cameraNearness(target, { center: [2, 1, 0], width: 5 });
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(cameraNearness(target, { center: [7, 1, 0], width: 4 })).toBe(0);
  });
});

describe('the slide style', () => {
  const size = async (style: string, attrs = '') => {
    const { contexts } = await prepared(`::: styles\nslide: ${style}\n:::\n\n::: slide {#a ${attrs}}\n# A\n:::`);
    const { slide } = contexts.get('A') as SlideContext;
    return [slide.width, slide.height, slide.preview, slide.transition];
  };

  it('gives a slide what it does not write, its size as a whole', async () => {
    expect(await size('width=20 height=10 preview transition=cut')).toEqual([20, 10, true, 'cut']);
    expect(await size('width=20 height=10', 'width=32')).toEqual([32, 18, false, null]);
    expect(await size('preview transition=cut', 'preview=false transition=zoom')).toEqual([16, 9, false, 'zoom']);
  });

  it('leaves out what does not fit a slide', async () => {
    expect(await size('font_size=20 step=3 color=red')).toEqual([16, 9, false, null]);
  });
});
