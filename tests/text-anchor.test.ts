import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { LayoutConfig, anchorPoint } from '../src/markup/renderer';
import { markupDeck } from '../src/markup/deck';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const TOP = new LayoutConfig({ textAnchor: 'top-left' });
const near = (point: number[], x: number, y: number) => {
  expect(point[0]).toBeCloseTo(x, 9);
  expect(point[1]).toBeCloseTo(y, 9);
};

describe('layout.textAnchor: top-left', () => {
  it('places text, formulas and listings by their top-left corner', async () => {
    const built = await slide('', 'A paragraph {#t x=-3 y=2}\n\n$$x^2$$\n\n```js {#c x=1 y=-1}\nlet a = 1;\n```\n\n::: {.element #m x=-6 y=-2}\n$$y^2$$\n:::', TOP);
    near(anchorPoint(element(built, 't'), 'top-left'), -3, 2);
    near(anchorPoint(element(built, 'c'), 'top-left'), 1, -1);
    near(anchorPoint(element(built, 'm'), 'top-left'), -6, -2);
  });

  it('is the corner at= puts on a point, unless at= names another', async () => {
    const built = await slide('', '[here]{#a at=(2,1)}\n\n[there]{#b at=center:(2,-1)}', TOP);
    near(anchorPoint(element(built, 'a'), 'top-left'), 2, 1);
    near(element(built, 'b').getCenter(), 2, -1);
  });

  it('keeps a text that sets one axis on the flow for the other, by its top on y', async () => {
    const built = await slide('', 'First {#a}\n\n[second]{#b x=3}\n\n[third]{#c y=-1}', TOP);
    const plain = await slide('', 'First {#a}\n\n[second]{#b x=3}\n\n[third]{#c y=-1}');
    // x is the left edge either way; the flow's y is the same.
    expect(element(built, 'b').getLeft()[0]).toBeCloseTo(3, 9);
    expect(element(built, 'b').getTop()[1]).toBeCloseTo(element(plain, 'b').getTop()[1], 9);
    // y is the top, not the baseline.
    expect(element(built, 'c').getTop()[1]).toBeCloseTo(-1, 9);
    expect(element(plain, 'c').getTop()[1]).toBeGreaterThan(-1);
  });

  it('leaves images, shapes, groups and anchors written on the element alone', async () => {
    const built = await slide('', '[[circle: #o x=1 y=1 radius=0.5]]\n\n::: {.group #g x=-2 y=0}\n[[dot: #d x=0 y=0]]\n:::\n\n[t]{#t x=0 y=-2 anchor=left-baseline}', TOP);
    near(element(built, 'o').getCenter(), 1, 1);
    near(element(built, 'g').getCenter(), -2, 0);
    near(anchorPoint(element(built, 't'), 'left-baseline'), 0, -2);
  });

  it('is what [[animate]] moves a text by', async () => {
    const built = await slide('', '[t]{#t x=0 y=0}\n\n[[animate: #t step=1 x=2 y=1]]', TOP);
    const t = element(built, 't') as Mobject;
    // Played to its end, the animation leaves the corner on the target.
    near(anchorPoint(t, 'top-left'), 2, 1);
  });

  it('comes from the front matter', async () => {
    const deck = markupDeck({ source: '---\nlayout: { textAnchor: top-left }\n---\n::: slide {#a}\n[x]{#x x=1 y=1}\n:::' });
    expect(deck).toBeTruthy();
    expect(() => new LayoutConfig({ textAnchor: 'middle' as 'center' })).toThrow(/textAnchor must be an anchor/);
    expect(new LayoutConfig({ textAnchor: 'bottom-left' as 'center' }).textAnchor).toBe('bottom-left');
  });
});
