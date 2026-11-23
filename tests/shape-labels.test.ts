import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { anchorPoint, type PartsMobject } from '../src/markup/renderer';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const parse = (body: string, styles = '') => new MarkupParser().parse(`${styles ? `::: styles\n${styles}\n:::\n` : ''}::: slide {#s}\n${body}\n:::`);
const parts = (obj: Mobject) => (obj as PartsMobject).markupParts as Mobject[];
const near = (a: number[], b: number[]) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};

describe('labels on shapes', () => {
  it('put a label in the middle and a sublabel below, where the texts placed against the shape stood', async () => {
    const before = await slide('', [
      '[[circle: #A x=1 y=0.5 radius=0.34 color=#1f3d7a]]',
      '',
      '[A]{#letter at=center:#LAST color=#1f3d7a}',
      '',
      '[Alice]{#who at=top:#A.bottom dy=-0.08 font_size=20}',
    ].join('\n'));
    const after = await slide('', '[[circle: #N x=1 y=0.5 radius=0.34 color=#1f3d7a label="A" sublabel="Alice" sublabel_buff=0.08 sublabel_font_size=20 sublabel_color=#000000]]');
    const [circle, letter, who] = parts(element(after, 'N'));
    near(circle.getCenter(), element(before, 'A').getCenter());
    near(letter.getCenter(), element(before, 'letter').getCenter());
    near([who.getCenter()[0], who.getTop()[1]], [element(before, 'who').getCenter()[0], element(before, 'who').getTop()[1]]);
    expect(who.getHeight()).toBeCloseTo(element(before, 'who').getHeight(), 9);
  });

  it('place the shape by its own anchors, whatever the labels add to its box', async () => {
    const built = await slide('', '[[rectangle: #R x=-2 y=1 width=2 height=1 anchor=top-left sublabel="a long name under the box"]]\n\n[[dot: #D at=center:#R]]');
    const box = element(built, 'R');
    near(anchorPoint(box, 'top-left'), [-2, 1]);
    near(element(built, 'D').getCenter(), [-1, 0.5]);
    // The box of the whole holds the sublabel, under the rectangle.
    expect(box.getBottom()[1]).toBeLessThan(0 - 0.1);
  });

  it('put labels on any side, and arrows still reach the shape', async () => {
    const built = await slide('', [
      '[[circle: #P x=-3 y=0 radius=0.5 label="p" label_side=left label_buff=0.2 sublabel="q" sublabel_side=above]]',
      '',
      '[[circle: #Q x=3 y=0 radius=0.5]]',
      '',
      '[[arrow: #P -> #Q, #pq buff=0]]',
    ].join('\n'));
    const [circle, left, above] = parts(element(built, 'P'));
    expect(circle.getLeft()[0] - left.getRight()[0]).toBeCloseTo(0.2, 9);
    expect(above.getBottom()[1]).toBeGreaterThan(circle.getTop()[1]);
    // The arrow starts on the circle's outline, not on the label's box.
    expect(element(built, 'pq').getLeft()[0]).toBeCloseTo(-2.5, 6);
  });

  it('take their look from the shape\'s style, and are checked', () => {
    // A class may set how sublabels look for shapes that have none.
    expect(() => parse('[[circle: .node x=0 y=0 label="A"]]', 'node: radius=0.34 label_color=#1f3d7a sublabel_font_size=20')).not.toThrow();
    expect(() => parse('[[circle: x=0 y=0 radius=1 label="A" label_side=inside]]')).toThrow(/label_side must be center, below, above, left or right/);
    expect(() => parse('[[circle: x=0 y=0 radius=1 sublabel_color=#ff0000]]')).toThrow(/sublabel_color requires a sublabel/);
    expect(() => parse('[[circle: x=0 y=0 radius=1 label="A" sublabel_buff=-1 sublabel="B"]]')).toThrow(/sublabel_buff must be nonnegative/);
    expect(() => parse('[[circle: x=0 y=0 radius=1 label="[x]{color=nocolor}"]]')).toThrow(/color/);
  });
});
