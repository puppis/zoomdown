import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder, type MarkupSlide } from '../src/markup/slide';
import { PlayOp, Presenter, PresenterConfig } from '../src/runtime';
import { element, installFakeCanvas } from './helpers/slides';

beforeAll(installFakeCanvas);

const STYLES = '::: styles\nband: stroke_width=12 color=#c0392b opacity=0.2\n:::\n\n';

/** A deck of one slide with this body, recorded to its last step. */
async function recorded(body: string): Promise<{ s: MarkupSlide; presenter: Presenter }> {
  const s = new SlideBuilder().build(new MarkupParser().parse(`${STYLES}::: slide {#s}\n${body}\n:::`)) as MarkupSlide;
  const presenter = new Presenter({ config: new PresenterConfig({}) });
  await presenter.play(s);
  return { s, presenter };
}

/** The opacity each part of an object draws with (a hand-drawn fill's hatching draws at a fraction of its own). */
const drawn = (obj: Mobject) => obj.getFamily().map((member) => [(member as unknown as { _opacity: number })._opacity, member.fillOpacity]);

/** Elements whose parts have opacities of their own, written once with `#id` and once with `#id` plus a suffix. */
const PARTS = (suffix: string, extra: string) => [
  `::: {.group #group${suffix} ${extra}}\n[[line: (-4,2) -> (4,2), #member${suffix} opacity=0.2]]\n[[circle: #round${suffix} x=0 y=2 radius=0.3]]\n:::`,
  `[[rectangle: #hatched${suffix} x=-3 y=-2 width=2 height=1 sketch=true fill_color=BLUE fill_opacity=0.6 ${extra}]]`,
  `[[rectangle: #filled${suffix} x=3 y=-2 width=2 height=1 fill_color=BLUE fill_opacity=0.5 opacity=0.4 ${extra}]]`,
  `[[arrow: (-4,-3) -> (4,-3), #labeled${suffix} label="x" opacity=0.3 ${extra}]]`,
  `[Some text]{#text${suffix} x=0 y=0 opacity=0.5 ${extra}}`,
].join('\n\n');
const IDS = ['group', 'hatched', 'filled', 'labeled', 'text'];

describe('an element faded in', () => {
  it('ends at the opacity of its style or attribute', async () => {
    const { s } = await recorded('[[line: (-4,1) -> (4,1), #a .band]]\n\n[[line: (-4,0) -> (4,0), #b .band, step=1]]\n\n[[line: (-4,-1) -> (4,-1), #c opacity=0.2, step=1]]');
    for (const id of ['a', 'b', 'c']) expect(element(s, id).opacity).toBeCloseTo(0.2, 9);
  });

  it('ends with each part at its own opacity, as if it had been there from the start', async () => {
    const { s } = await recorded(`${PARTS('', '')}\n\n${PARTS('1', 'step=1')}`);
    for (const id of IDS) expect(drawn(element(s, `${id}1`)), id).toEqual(drawn(element(s, id)));
    // Members of a group keep their opacities apart.
    expect(element(s, 'member1').opacity).toBeCloseTo(0.2, 9);
    expect(element(s, 'round1').opacity).toBe(1);
  });

  it('is shown again by a show directive as it was, and keeps its opacities while hidden', async () => {
    const { s, presenter } = await recorded([
      `${PARTS('', '')}\n\n${PARTS('1', 'step=1')}`,
      ...IDS.map((id) => `[[hide: #${id}1 step=2]]\n[[show: #${id}1 step=3]]`),
      '[[line: (-4,0) -> (4,0), #gone .band, step=1]]\n[[hide: #gone step=2]]',
    ].join('\n\n'));
    for (const id of IDS) expect(drawn(element(s, `${id}1`)), id).toEqual(drawn(element(s, id)));
    const gone = element(s, 'gone');
    expect(presenter.contexts.get(s)?.mobjects.includes(gone)).toBe(false);
    expect(gone.opacity).toBeCloseTo(0.2, 9);
  });

  it('fades the same way when its stop is played again after an interrupted replay, forwards or backwards', async () => {
    const { s, presenter } = await recorded(`${PARTS('', '')}\n\n${PARTS('1', 'step=1')}`);
    const group = element(s, 'group1');
    const index = presenter.history.clips.findIndex((clip) => clip.ops.some((op) => op instanceof PlayOp && op.touched().includes(group)));
    const op = presenter.history.clips[index].ops.find((candidate) => candidate instanceof PlayOp) as PlayOp;
    const play = (alpha: number) => {
      presenter.history.restore(index - 1);
      op.reset();
      op.begin();
      op.interpolate(alpha);
    };
    // Half way (a smooth rate is at a half there too), then interrupted and played again.
    play(0.5);
    play(0.5);
    for (const id of IDS) {
      expect(drawn(element(s, `${id}1`)).map(([opacity]) => opacity), id).toEqual(drawn(element(s, id)).map(([opacity]) => opacity / 2));
    }
    // Backwards from its end.
    play(1);
    for (const id of IDS) expect(drawn(element(s, `${id}1`)), id).toEqual(drawn(element(s, id)));
    op.finish();
    op.cleanUp();
    for (const id of IDS) expect(drawn(element(s, `${id}1`)), id).toEqual(drawn(element(s, id)));
  });
});
