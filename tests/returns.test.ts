import { describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder } from '../src/markup/slide';
import { Presenter, PresenterConfig, type SlideContext } from '../src/runtime';
import { Slide } from '../src/slides';

/** The clips a deck records, as slide:kind:operations, in order. */
async function clips(root: Slide): Promise<string[]> {
  const presenter = new Presenter({ config: new PresenterConfig({}) });
  await presenter.play(root);
  return presenter.history.clips.map((clip) => `${clip.slide?.name ?? '?'}:${clip.kind}:${clip.ops.map((op) => op.constructor.name).join('+')}`);
}

const markup = (parent: string, a = '', b = '') => new SlideBuilder().build(new MarkupParser().parse(
  `::: slide {#p}\n${parent}\n:::\n::: slide {#a ${a}}\n[[dot: #a1 x=0 y=0]]\n[[dot: #a2 x=1 y=0 step=1]]\n:::\n::: slide {#b ${b}}\n[[dot: #b1 x=0 y=0]]\n:::`,
));

describe('leaving a child', () => {
  it('zooms back to the parent when the parent has a step of its own before the next child', async () => {
    const deck = markup('[[include: #a step=3]]\n[[dot: #mid x=0 y=-2 step=4]]\n[[include: #b step=6]]');
    expect(await clips(deck)).toEqual([
      'p:entry:', 'a:entry:FocusOp', 'a:program:PlayOp',
      // Back on the parent for its step 4, then on to the next child.
      'p:return:FocusOp', 'p:program:PlayOp', 'b:entry:FocusOp', 'p:return:FocusOp',
    ]);
  });

  it('goes straight on to the next child when nothing happens in between', async () => {
    for (const steps of ['[[include: #a step=3]]\n[[include: #b step=4]]', '[[include: #a step=3]]\n[[include: #b step=3]]']) {
      expect(await clips(markup(steps))).toEqual(['p:entry:', 'a:entry:FocusOp', 'a:program:PlayOp', 'b:entry:FocusOp', 'p:return:FocusOp']);
    }
  });

  it('stays on the child the author told to skip its return', async () => {
    const deck = markup('[[include: #a step=3]]\n[[dot: #mid x=0 y=-2 step=4]]\n[[include: #b step=6]]', 'skip_return');
    expect(await clips(deck)).toEqual(['p:entry:', 'a:entry:FocusOp', 'a:program:PlayOp', 'p:program:PlayOp', 'b:entry:FocusOp', 'p:return:FocusOp']);
  });

  it('zooms back before the next child\'s early members appear on the parent', async () => {
    const deck = new SlideBuilder().build(new MarkupParser().parse(
      '::: slide {#p}\n[[include: #a step=3]]\n[[include: #b step=4]]\n:::\n::: slide {#a}\n[[dot: #a1 x=0 y=0]]\n:::\n::: slide {#b}\n[[dot: #b0 x=1 y=1 step=-1]]\n[[dot: #b1 x=0 y=0]]\n:::',
    ));
    const recorded = await clips(deck);
    const early = recorded.findIndex((clip) => clip.startsWith('p:program:RevealOp'));
    expect(early).toBeGreaterThan(0);
    expect(recorded[early - 1]).toBe('p:return:FocusOp');
    expect(recorded[early + 1]).toBe('b:entry:FocusOp');
  });

  it('comes back as soon as a construct program plays between two children', async () => {
    const build = (between: (ctx: SlideContext) => Promise<unknown>) => {
      const a = new Slide('a');
      const b = new Slide('b');
      const parent = new Slide('p', {
        async *program(ctx) {
          yield ctx.visit(a);
          await between(ctx);
          yield ctx.visit(b);
        },
      });
      parent.addChild(a, { center: [-3, 0, 0], width: 4 });
      parent.addChild(b, { center: [3, 0, 0], width: 4 });
      return parent;
    };
    expect(await clips(build((ctx) => ctx.wait(0.5)))).toEqual(['p:entry:', 'a:entry:FocusOp', 'p:return:FocusOp', 'p:program:WaitOp', 'b:entry:FocusOp', 'p:return:FocusOp']);
    expect(await clips(build(async () => undefined))).toEqual(['p:entry:', 'a:entry:FocusOp', 'b:entry:FocusOp', 'p:return:FocusOp']);
  });
});
