import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { LayoutConfig } from '../src/markup/renderer';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const margin = new LayoutConfig().margin;
const box = (body: string, attrs = 'width=16 height=9') => slide(attrs, body).then((s) => {
  const obj = element(s, 'r');
  return { left: obj.getLeft()[0], right: obj.getRight()[0], top: obj.getTop()[1], bottom: obj.getBottom()[1], center: obj.getCenter() };
});
const rect = (attrs: string) => `[[rectangle: #r width=2 height=1 ${attrs}]]`;

describe('the edges of the slide', () => {
  it('place an element beside them, a margin away, centered along them', async () => {
    const above = await box(rect('above=#BOTTOM'));
    expect(above.bottom).toBeCloseTo(-4.5 + margin, 6);
    expect(above.center[0]).toBeCloseTo(0, 6);
    expect((await box(rect('below=#TOP'))).top).toBeCloseTo(4.5 - margin, 6);
    const right = await box(rect('right-of=#LEFTMOST'));
    expect(right.left).toBeCloseTo(-8 + margin, 6);
    expect(right.center[1]).toBeCloseTo(0, 6);
    expect((await box(rect('left-of=#RIGHTMOST buff=0.2'))).right).toBeCloseTo(8 - 0.2, 6);
  });

  it('align an element with them, and take it to their corners and center', async () => {
    const corner = await box(rect('right-of=#LEFTMOST bottom-aligned=#BOTTOM buff=0'));
    expect([corner.left, corner.bottom]).toEqual([expect.closeTo(-8, 6), expect.closeTo(-4.5, 6)]);
    const flush = await box(rect('left-aligned=#LEFTMOST top-aligned=#TOP'));
    expect([flush.left, flush.top]).toEqual([expect.closeTo(-8, 6), expect.closeTo(4.5, 6)]);
    expect((await box(rect('at=#CENTER'))).center.slice(0, 2)).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6)]);
    const topRight = await box(rect('at=top-right:#RIGHTMOST.top dx=-0.5 dy=-0.5'));
    expect([topRight.right, topRight.top]).toEqual([expect.closeTo(7.5, 6), expect.closeTo(4, 6)]);
    expect((await box(rect('at=top:#TOP'))).top).toBeCloseTo(4.5, 6);
  });

  it('follow the size of the slide', async () => {
    const wide = await box(rect('above=#BOTTOM left-aligned=#LEFTMOST buff=0'), 'width=20 height=12');
    expect([wide.left, wide.bottom]).toEqual([expect.closeTo(-10, 6), expect.closeTo(-6, 6)]);
  });

  it('place a text, an include and elements placed after it', async () => {
    const s = await slide('width=16 height=9', '[A footer]{#f above=#BOTTOM}\n\n[Next to it]{#n right-of:#f}\n\n[[include: #c below=#TOP width=4]]');
    expect(element(s, 'f').getBottom()[1]).toBeCloseTo(-4.5 + margin, 6);
    expect(element(s, 'n').getLeft()[0]).toBeGreaterThan(element(s, 'f').getRight()[0]);
  });

  it('are reserved, refused inside groups, and no text to share a baseline with', () => {
    const parse = (body: string) => () => new MarkupParser().parse(`::: slide {#s}\n${body}\n:::`);
    expect(parse('[x]{#TOP}')).toThrow(/TOP is reserved: #TOP names the slide's top edge/);
    expect(parse('[x]{#LEFTMOST}')).toThrow(/#LEFTMOST names the slide's left edge/);
    expect(parse('[x]{#CENTER}')).toThrow(/#CENTER names the slide's center/);
    expect(() => new MarkupParser().parse('::: slide {#BOTTOM}\nx\n:::')).toThrow(/BOTTOM is reserved/);
    expect(parse('::: {.group #g}\n[x]{above=#BOTTOM}\n:::')).toThrow(/#BOTTOM names an edge of the slide, which an element inside a group cannot reference: place the group instead/);
    expect(parse('::: {.group #g above=#BOTTOM}\nx\n:::')).not.toThrow();
    expect(parse('[x]{baseline-aligned:#TOP}')).toThrow(/baseline-aligned must reference text, math or code, not an edge of the slide/);
    expect(parse('[x]{at=left-baseline:#TOP.baseline}')).toThrow(/#TOP takes a box anchor/);
    expect(parse('[x]{at=#TOP.left above=#BOTTOM}')).toThrow(/at= cannot be combined with above/);
  });
});

describe('a negative buff', () => {
  it('overlaps what an element is placed against, by an edge or another element', async () => {
    const s = await slide('width=16 height=9', '[[rectangle: #a x=0 y=0 width=4 height=2]]\n\n[[rectangle: #r width=2 height=1 above=#a buff=-0.5]]\n\n[[rectangle: #b width=1 height=1 right-of=#LEFTMOST buff=-0.25]]\n\nFirst {#t1 x=-7 y=-2}\n\nSecond {#t2 buff=-0.1}');
    expect(element(s, 'r').getBottom()[1]).toBeCloseTo(1 - 0.5, 6);
    expect(element(s, 'b').getLeft()[0]).toBeCloseTo(-8 - 0.25, 6);
    const plain = await slide('width=16 height=9', 'First {#t1 x=-7 y=-2}\n\nSecond {#t2 buff=0}');
    expect(element(s, 't2').getCenter()[1] - element(plain, 't2').getCenter()[1]).toBeCloseTo(0.1, 6);
  });

  it('is refused where it is no placement: the ends of an arrow, an attachment', () => {
    const parse = (body: string) => () => new MarkupParser().parse(`::: slide {#s}\n[[circle: #a x=0 y=0 radius=1]]\n\n[[circle: #b x=4 y=0 radius=1]]\n\n${body}\n:::`);
    expect(parse('[[arrow: #a -> #b, buff=-0.2]]')).toThrow(/buff must be nonnegative on an arrow or a line/);
    expect(parse('[[box: #a, buff=-0.1]]')).toThrow(/buff must be nonnegative on a brace, a box or a blob/);
    expect(parse('[[rectangle: #r width=1 height=1 below=#a buff=-2]]')).not.toThrow();
  });
});
