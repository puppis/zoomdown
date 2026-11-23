import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { MarkupSlide, SlideBuilder } from '../src/markup/slide';
import { anchorPoint, type ListItemMobject } from '../src/markup/renderer';
import type { ElementSpec } from '../src/markup/ast';
import { textLines } from '../src/markup/text';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const top = (obj: Mobject) => obj.getTop()[1];
const left = (obj: Mobject) => obj.getLeft()[0];
const lineCount = (obj: Mobject) => {
  const lines = textLines(obj) as NonNullable<ReturnType<typeof textLines>>;
  return Math.round((lines.first - lines.last) / lines.interline) + 1;
};

const PROSE = 'Round with pivot r {#a}\n\n- every concerned node sends a request {#b}\n\n- upon receiving the pivot\'s table {#c}';
const LONG = 'every concerned node sends a request to the pivot and waits for its answer before going on {#p}';

describe('the start of a slide\'s flow', () => {
  it('is the layout margin from the top and the left edge by default', async () => {
    const plain = await slide('', PROSE);
    expect(plain.flowTop).toBe(0.65);
    expect(plain.flowLeft).toBe(0.65);
    // A 16 × 9 slide, centered on the origin.
    expect(top(element(plain, 'a'))).toBeCloseTo(4.5 - 0.65, 9);
    expect(left(element(plain, 'a'))).toBeCloseTo(-8 + 0.65, 9);
  });

  it('is flow_top below the top edge and flow_left right of the left edge, the paragraphs spaced as before', async () => {
    const plain = await slide('', PROSE);
    const moved = await slide('flow_top=6.27 flow_left=0.11', PROSE);
    expect(top(element(moved, 'a'))).toBeCloseTo(4.5 - 6.27, 9);
    expect(left(element(moved, 'a'))).toBeCloseTo(-8 + 0.11, 9);
    // Every block moves by the same amount: the spacing of paragraphs and list items is unchanged.
    const shift = [left(element(moved, 'a')) - left(element(plain, 'a')), top(element(moved, 'a')) - top(element(plain, 'a'))];
    for (const id of ['b', 'c']) {
      expect(left(element(moved, id)) - left(element(plain, id))).toBeCloseTo(shift[0], 9);
      expect(top(element(moved, id)) - top(element(plain, id))).toBeCloseTo(shift[1], 9);
    }
  });

  it('is measured from the edges of a slide of any size', async () => {
    const page = await slide('width=16 height=12 flow_top=6.27 flow_left=0.11', PROSE);
    expect(top(element(page, 'a'))).toBeCloseTo(6 - 6.27, 9);
    expect(left(element(page, 'a'))).toBeCloseTo(-8 + 0.11, 9);
    const small = await slide('width=4 height=3 flow_top=0.5 flow_left=0.25', 'Hello {#h}');
    expect(top(element(small, 'h'))).toBeCloseTo(1.5 - 0.5, 9);
    expect(left(element(small, 'h'))).toBeCloseTo(-2 + 0.25, 9);
  });

  it('wraps paragraphs between flow_left and the right margin', async () => {
    const wide = await slide('', LONG);
    const narrow = await slide('flow_left=8', LONG);
    const paragraph = element(narrow, 'p');
    expect(left(paragraph)).toBeCloseTo(0, 9);
    expect(paragraph.getRight()[0]).toBeLessThanOrEqual(8 - 0.65 + 1e-9);
    expect(lineCount(paragraph)).toBeGreaterThan(lineCount(element(wide, 'p')));
  });

  it('goes on past a block placed with an explicit y, which keeps flow_left and the slide\'s coordinates', async () => {
    const plain = await slide('flow_top=3 flow_left=2', 'First {#a}\n\nSecond {#b}');
    const mixed = await slide('flow_top=3 flow_left=2', 'First {#a}\n\nPlaced {#p y=-3}\n\nSecond {#b}\n\n[[rectangle: #r x=1 y=-2 width=1 height=1]]');
    // The placed text lands on its y in the slide's coordinates, its left edge the flow's.
    const placed = element(mixed, 'p');
    expect(anchorPoint(placed, 'left-baseline')[1]).toBeCloseTo(-3, 9);
    expect(left(placed)).toBeCloseTo(-8 + 2, 9);
    expect(element(mixed, 'r').getCenter()).toEqual([1, -2, 0]);
    // The flow does not restart: the second paragraph follows the first as if nothing were between.
    for (const id of ['a', 'b']) expect(top(element(mixed, id))).toBeCloseTo(top(element(plain, id)), 9);
    expect(top(element(mixed, 'a'))).toBeCloseTo(4.5 - 3, 9);
  });

  it('leaves text with only x, early captions and the flow inside groups as they were', async () => {
    const body = 'Caption {#cap step=-1}\n\nShifted {#x x=1}\n\n::: {.group #g}\nOne {#g1}\n\nTwo {#g2}\n:::';
    const plain = await slide('', body);
    const moved = await slide('flow_top=2 flow_left=1', body);
    // The caption flows first, at the flow's start.
    expect(top(element(moved, 'cap'))).toBeCloseTo(4.5 - 2, 9);
    expect(left(element(moved, 'cap'))).toBeCloseTo(-8 + 1, 9);
    // Text with only x keeps its own left edge and its place in the flow.
    expect(left(element(moved, 'x'))).toBeCloseTo(left(element(plain, 'x')), 9);
    expect(top(element(moved, 'x')) - top(element(plain, 'x'))).toBeCloseTo(0.65 - 2, 9);
    // A group's members keep their places relative to one another.
    const gap = (from: MarkupSlide) => top(element(from, 'g1')) - top(element(from, 'g2'));
    expect(gap(moved)).toBeCloseTo(gap(plain), 9);
  });

  it('is nonnegative and inside the slide, with room before the right margin', async () => {
    const parse = (attributes: string) => new MarkupParser().parse(`::: slide {#s ${attributes}}\nHello\n:::`);
    expect(() => parse('flow_top=-1')).toThrow(/flow_top must be nonnegative/);
    expect(() => parse('flow_left=wide')).toThrow(/flow_left must be a number/);
    expect(() => parse('flow_top=0 flow_left=0')).not.toThrow();
    const build = (attributes: string) => new SlideBuilder().build(parse(attributes));
    expect(() => build('flow_top=9')).toThrow(/flow_top must be nonnegative and less than the slide's height, 9/);
    expect(() => build('width=4 flow_left=4')).toThrow(/flow_left must be nonnegative and less than the slide's width, 4/);
    expect(() => build('height=12 flow_top=11.5')).not.toThrow();
    await expect(slide('flow_left=15.5', 'Hello')).rejects.toThrow(/flow_left must leave room before the right margin/);
  });
});

describe('the blocks that continue a list item', () => {
  const ITEM = [
    '- one {#one}', '', '  more of one {#more}', '', '  $$ x^2 $$ {#m}', '', '  $$', '  \\sum_i i', '  $$', '',
    '  ```text {#code}', '  code', '  ```', '', '  | a | b |', '  | --- | --- |', '  | 1 | 2 |', '', '- two {#two}',
  ].join('\n');
  /** Where an item's text starts, right of its marker's left edge. */
  const column = (obj: Mobject) => (obj as ListItemMobject).markupTextColumn as number;

  it('belong to it, display math and tables too', () => {
    const items = new MarkupParser().parse(`::: slide {#s}\n${ITEM}\n:::`).slides[0].items as ElementSpec[];
    expect(items.map((item) => `${item.kind}:${item.list?.depth}:${item.list?.marker}`)).toEqual([
      'text:0:•', 'text:0:', 'math:0:', 'math:0:', 'code:0:', 'table:0:', 'text:0:•',
    ]);
    expect(items[2].id).toBe('m');
    expect(items[2].source).toBe('x^2');
    expect(items[3].source).toBe('\\sum_i i');
    // Display math not indented under an item still ends the list.
    const after = new MarkupParser().parse('::: slide {#s}\n- one\n\n$$ x $$\n:::').slides[0].items as ElementSpec[];
    expect(after.map((item) => `${item.kind}:${item.list?.marker ?? null}`)).toEqual(['text:•', 'math:null']);
  });

  it('flow under its text, past the bullet, whatever kind they are', async () => {
    const s = await slide('', ITEM);
    const text = left(element(s, 'one')) + column(element(s, 'one'));
    expect(column(element(s, 'one'))).toBeGreaterThan(0.5);
    for (const id of ['more', 'm', 'code']) expect(left(element(s, id))).toBeCloseTo(text, 6);
    // The next item starts at the bullet again.
    expect(left(element(s, 'two'))).toBeCloseTo(left(element(s, 'one')), 6);
  });

  it('flow under the text of a wide number, and of a nested item', async () => {
    const s = await slide('', '10. ten {#ten}\n\n    more of ten {#more}\n\n    - nested {#n}\n\n      more of nested {#nm}');
    const ten = element(s, 'ten');
    expect(column(ten)).toBeGreaterThan(0.6);
    expect(left(element(s, 'more'))).toBeCloseTo(left(ten) + column(ten), 6);
    expect(left(element(s, 'nm'))).toBeCloseTo(left(element(s, 'n')) + column(element(s, 'n')), 6);
  });
});
