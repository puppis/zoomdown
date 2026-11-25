import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder } from '../src/markup/slide';
import { Presenter, PresenterConfig, type SlideContext } from '../src/runtime';
import { Slide, walk } from '../src/slides';
import { installFakeCanvas } from './helpers/slides';

beforeAll(installFakeCanvas);

/** A tree `a` → `b`, `c`; `b` → `d`, `e`; `d` → `f`, the attributes of each slide given by its id. */
function deck(attrs: Partial<Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f', string>>, extra = ''): string {
  const include = (id: string, x: number) => `[[include: #${id} x=${x} y=-1 width=4]]`;
  const slide = (id: keyof typeof attrs, body = '') => `::: slide {#${id} ${attrs[id] ?? ''}}\n# ${id.toUpperCase()}\n\n${body}\n:::\n`;
  return [slide('a', `${include('b', -4)}\n\n${include('c', 4)}`), slide('b', `${include('d', -4)}\n\n${include('e', 4)}${extra}`), slide('c'), slide('d', include('f', 0)), slide('e'), slide('f')].join('\n');
}

const STYLE = '::: styles\nslide: debug\n:::\n\n';

/** What is drawn of each slide: `content`, `frame`, `dots`, in that order; and the stops of the deck. */
async function drawn(source: string, config: ConstructorParameters<typeof PresenterConfig>[0] = {}) {
  const root = new SlideBuilder().build(new MarkupParser().parse(source));
  const presenter = new Presenter({ config: new PresenterConfig(config) });
  await presenter.play(root);
  const looks: Record<string, string> = {};
  for (const slide of walk(root)) {
    const ctx = presenter.contexts.get(slide) as SlideContext;
    const children = slide.children.map((child) => child.viewport as unknown);
    const parts = [
      ctx.mobjects.some((mob) => !children.includes(mob)) ? 'content' : '',
      ctx.display.overlays.length ? 'frame' : '',
      ctx.display.guides?.dots ? 'dots' : '',
    ];
    looks[slide.name] = parts.filter(Boolean).join(' ');
  }
  const { clips, slides } = presenter.navigation();
  return { looks, presenter, stops: clips.map((clip) => slides.find((slide) => slide.id === clip.slide)?.name) };
}

describe('a partial rendering (only-this)', () => {
  it('draws the selected slide and the frames of its children, and nothing else', async () => {
    const { looks, stops } = await drawn(deck({ b: 'only-this' }));
    expect(looks).toEqual({ A: '', B: 'content', C: '', D: 'frame', E: 'frame', F: '' });
    expect(stops).toEqual(['B']);
  });

  it('draws the guides of the selected slides only, in debug', async () => {
    const { looks } = await drawn(STYLE + deck({ b: 'only-this' }));
    expect(looks).toEqual({ A: '', B: 'content frame dots', C: '', D: 'frame', E: 'frame', F: '' });
    expect((await drawn(STYLE + deck({ d: 'only-this' }))).looks).toEqual({ A: '', B: '', C: '', D: 'content frame dots', E: '', F: 'frame' });
  });

  it('draws several slides, whether or not one is the parent of another', async () => {
    const family = await drawn(deck({ b: 'only-this', d: 'only-this' }));
    expect(family.looks).toEqual({ A: '', B: 'content', C: '', D: 'content', E: 'frame', F: 'frame' });
    const apart = await drawn(deck({ c: 'only-this', d: 'only-this' }));
    expect(apart.looks).toEqual({ A: '', B: '', C: 'content', D: 'content', E: '', F: 'frame' });
    expect(apart.stops).toEqual(['D', 'C']);
  });

  it('keeps one frame around a child, whatever else draws frames', async () => {
    const { looks, presenter } = await drawn(STYLE + deck({ b: 'only-this' }), { showSlideBorders: true, showSlideGrid: true });
    expect(looks).toEqual({ A: '', B: 'content frame dots', C: '', D: 'frame', E: 'frame', F: '' });
    for (const ctx of presenter.contexts.values()) expect(ctx.display.overlays.length).toBeLessThanOrEqual(1);
    for (const ctx of presenter.contexts.values()) if (ctx.slide.name !== 'B') expect(ctx.display.backgrounds).toEqual([]);
  });

  it('shows the frames of the children as guides, which exports leave out', async () => {
    const { presenter } = await drawn(deck({ b: 'only-this' }));
    const child = [...presenter.contexts.values()].find((ctx) => ctx.slide.name === 'D') as SlideContext;
    const render = () => {
      presenter.prepareRender(800, 450, { min: [-100, -100, 0], max: [100, 100, 0] }, presenter.camera.width);
      return child.display.guides?.frame.getThreeObject().visible;
    };
    expect(render()).toBe(true);
    presenter.guides = false;
    expect(render()).toBe(false);
  });

  it('still says which child of a selected slide is not defined', async () => {
    const { looks } = await drawn(deck({ b: 'only-this' }, '\n\n[[include: #missing x=0 y=3 width=2]]'));
    expect(looks.missing).toBe('content');
    expect((await drawn(deck({ c: 'only-this' }, '\n\n[[include: #missing x=0 y=3 width=2]]'))).looks.missing).toBe('');
  });

  it('draws everything without it', async () => {
    const { looks, stops } = await drawn(deck({}));
    expect(new Set(Object.values(looks))).toEqual(new Set(['content']));
    expect(stops.length).toBeGreaterThan(6);
  });

  it('leaves out slides chosen while the deck is built, after they were drawn', async () => {
    const late = new Slide('Late', { build: () => undefined });
    const root = new Slide('Root', {
      build: (ctx) => { ctx.slide.addChild(late, { width: 4 }); late.onlyThis = true; },
    });
    const presenter = new Presenter({ config: new PresenterConfig({ showSlideBorders: true }) });
    await presenter.play(root);
    expect((presenter.contexts.get(root) as SlideContext).display.overlays).toEqual([]);
    expect((presenter.contexts.get(late) as SlideContext).display.overlays.length).toBe(1);
  });
});
