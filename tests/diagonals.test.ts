import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { LayoutConfig } from '../src/markup/renderer';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const { gap, margin } = new LayoutConfig();
const reference = '[[rectangle: #a x=0 y=0 width=4 height=2]]';
const placed = (attrs: string, body = reference) => slide('width=16 height=9', `${body}\n\n[[rectangle: #r width=2 height=1 ${attrs}]]`).then((s) => {
  const r = element(s, 'r');
  return { left: r.getLeft()[0], right: r.getRight()[0], top: r.getTop()[1], bottom: r.getBottom()[1] };
});

describe('the diagonal directions', () => {
  it('put an element beyond a corner of another, buff away along both axes', async () => {
    const aboveRight = await placed('above-right-of=#a buff=0.5');
    expect([aboveRight.left, aboveRight.bottom]).toEqual([expect.closeTo(2.5, 6), expect.closeTo(1.5, 6)]);
    const aboveLeft = await placed('above-left-of=#a buff=0.5');
    expect([aboveLeft.right, aboveLeft.bottom]).toEqual([expect.closeTo(-2.5, 6), expect.closeTo(1.5, 6)]);
    const belowRight = await placed('below-right-of:#a');
    expect([belowRight.left, belowRight.top]).toEqual([expect.closeTo(2 + gap, 6), expect.closeTo(-1 - gap, 6)]);
    const belowLeft = await placed('below-left-of=#a buff=0');
    expect([belowLeft.right, belowLeft.top]).toEqual([expect.closeTo(-2, 6), expect.closeTo(-1, 6)]);
  });

  it('take a negative buff, dx and dy', async () => {
    const over = await placed('above-right-of=#a buff=-0.25');
    expect([over.left, over.bottom]).toEqual([expect.closeTo(1.75, 6), expect.closeTo(0.75, 6)]);
    const moved = await placed('below-left-of=#a buff=0 dx=1 dy=-1');
    expect([moved.right, moved.top]).toEqual([expect.closeTo(-1, 6), expect.closeTo(-2, 6)]);
  });

  it('keep a margin from both sides of the slide diagonally from its corners', async () => {
    const inner = await placed('below-right-of=#TOPLEFT', '');
    expect([inner.left, inner.top]).toEqual([expect.closeTo(-8 + margin, 6), expect.closeTo(4.5 - margin, 6)]);
    const page = await placed('above-left-of=#BOTTOMRIGHT buff=0.3', '');
    expect([page.right, page.bottom]).toEqual([expect.closeTo(7.7, 6), expect.closeTo(-4.2, 6)]);
    const center = await placed('above-right-of=#CENTER buff=0', '');
    expect([center.left, center.bottom]).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6)]);
  });

  it('place a text a line below another and to its right', async () => {
    const s = await slide('width=16 height=9', 'First line {#a x=-6 y=2}\n\nSecond {#b below-right-of=#a buff=0.2}\n\nPlain {#c below=#a buff=0.2}');
    const [a, b, c] = ['a', 'b', 'c'].map((id) => element(s, id));
    expect(b.getLeft()[0]).toBeCloseTo(a.getRight()[0] + 0.2, 6);
    // Vertically as a text below another: a line apart.
    expect(b.getTop()[1]).toBeCloseTo(c.getTop()[1], 6);
  });

  it('reference an include, and place one', async () => {
    const r = await placed('below-right-of=#c buff=0', '[[include: #c x=0 y=0 width=4]]');
    expect([r.left, r.top]).toEqual([expect.closeTo(2, 6), expect.closeTo(-1.125, 6)]);
    expect(() => new MarkupParser().parse(`::: slide {#s}\n${reference}\n\n[[include: #c above-left-of=#a width=3 buff=0.5]]\n:::\n\n::: slide {#c}\n:::`)).not.toThrow();
  });

  it('come from a style only where the element leaves both axes free', () => {
    const items = new MarkupParser().parse(`::: styles\nnote: below-right-of=#a buff=0.2\n:::\n::: slide {#s}\n${reference}\n\n[x]{#n .note}\n\n[y]{#m .note x=1}\n:::`).slides[0].items;
    const attrs = (id: string) => items.find((item) => 'id' in item && item.id === id)!.attributes;
    expect(attrs('n')).toMatchObject({ 'below-right-of': '#a', buff: '0.2' });
    expect(attrs('m')).not.toHaveProperty('below-right-of');
  });

  it('set both coordinates: no other direction, alignment or coordinate goes with them', () => {
    const parse = (attrs: string) => () => new MarkupParser().parse(`::: slide {#s}\n${reference}\n\n[x]{${attrs}}\n:::`);
    expect(parse('below-right-of=#a right-of=#a')).toThrow(/below-right-of and right-of cannot be combined: an element stands in one direction of another/);
    expect(parse('below-right-of=#a left-aligned=#a')).toThrow(/below-right-of and left-aligned cannot be combined: a diagonal direction sets both coordinates\. Keep one of them; dx and dy move an element placed diagonally/);
    expect(parse('above-left-of=#a y=1')).toThrow(/above-left-of and y cannot be combined: a diagonal direction sets both coordinates/);
    expect(parse('below=#a right-of=#a')).toThrow(/below and right-of cannot be combined.*use one diagonal direction, such as below-right-of/);
    expect(parse('above=#a below=#a')).toThrow(/an alignment \(left-aligned, top-aligned, …\) or a coordinate may set the other axis/);
    expect(parse('below-right-of=#a buff=0.3 dx=0.1')).not.toThrow();
    expect(parse('at=#a buff=0.3')).toThrow(/a direction \(below, above, left-of, right-of, below-right-of, …\) keeps/);
  });
});
