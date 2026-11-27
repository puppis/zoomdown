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

  it('is flow-top below the top edge and flow-left right of the left edge, the paragraphs spaced as before', async () => {
    const plain = await slide('', PROSE);
    const moved = await slide('flow-top=6.27 flow-left=0.11', PROSE);
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
    const page = await slide('width=16 height=12 flow-top=6.27 flow-left=0.11', PROSE);
    expect(top(element(page, 'a'))).toBeCloseTo(6 - 6.27, 9);
    expect(left(element(page, 'a'))).toBeCloseTo(-8 + 0.11, 9);
    const small = await slide('width=4 height=3 flow-top=0.5 flow-left=0.25', 'Hello {#h}');
    expect(top(element(small, 'h'))).toBeCloseTo(1.5 - 0.5, 9);
    expect(left(element(small, 'h'))).toBeCloseTo(-2 + 0.25, 9);
  });

  it('wraps paragraphs between flow-left and the right margin', async () => {
    const wide = await slide('', LONG);
    const narrow = await slide('flow-left=8', LONG);
    const paragraph = element(narrow, 'p');
    expect(left(paragraph)).toBeCloseTo(0, 9);
    expect(paragraph.getRight()[0]).toBeLessThanOrEqual(8 - 0.65 + 1e-9);
    expect(lineCount(paragraph)).toBeGreaterThan(lineCount(element(wide, 'p')));
  });

  it('goes on after a block placed with an explicit y, which keeps flow-left and the slide\'s coordinates', async () => {
    const plain = await slide('flow-top=3 flow-left=2', 'First {#a}\n\nSecond {#b}');
    const mixed = await slide('flow-top=3 flow-left=2', 'First {#a}\n\nPlaced {#p y=-3}\n\nSecond {#b}\n\n[[rectangle: #r x=1 y=-2 width=1 height=1]]');
    // The placed text lands on its y in the slide's coordinates, its left edge the flow's.
    const placed = element(mixed, 'p');
    expect(anchorPoint(placed, 'left-baseline')[1]).toBeCloseTo(-3, 9);
    expect(left(placed)).toBeCloseTo(-8 + 2, 9);
    expect(element(mixed, 'r').getCenter()).toEqual([1, -2, 0]);
    expect(top(element(mixed, 'a'))).toBeCloseTo(4.5 - 3, 9);
    // The flow goes on after the placed block: the second paragraph follows it as it follows the first one alone.
    const baseline = (from: MarkupSlide, id: string) => anchorPoint(element(from, id), 'left-baseline')[1];
    expect(baseline(mixed, 'p') - baseline(mixed, 'b')).toBeCloseTo(baseline(plain, 'a') - baseline(plain, 'b'), 9);
    expect(left(element(mixed, 'b'))).toBeCloseTo(left(placed), 9);
  });

  it('leaves text with only x, early captions and the flow inside groups as they were', async () => {
    const body = 'Caption {#cap step=-1}\n\nShifted {#x x=1}\n\n::: {.group #g}\nOne {#g1}\n\nTwo {#g2}\n:::';
    const plain = await slide('', body);
    const moved = await slide('flow-top=2 flow-left=1', body);
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
    expect(() => parse('flow-top=-1')).toThrow(/flow-top must be nonnegative/);
    expect(() => parse('flow-left=wide')).toThrow(/flow-left must be a number/);
    expect(() => parse('flow-top=0 flow-left=0')).not.toThrow();
    const build = (attributes: string) => new SlideBuilder().build(parse(attributes));
    expect(() => build('flow-top=9')).toThrow(/flow-top must be nonnegative and less than the slide's height, 9/);
    expect(() => build('width=4 flow-left=4')).toThrow(/flow-left must be nonnegative and less than the slide's width, 4/);
    expect(() => build('height=12 flow-top=11.5')).not.toThrow();
    // Written with underscores, as before, they still read; the messages write them with hyphens.
    expect(() => parse('flow_top=-1')).toThrow(/flow-top must be nonnegative/);
    expect(() => build('width=4 flow_left=4')).toThrow(/flow-left must be nonnegative and less than the slide's width, 4/);
    expect(() => parse('flow_top=2 flow-top=3')).toThrow(/Duplicate attribute "flow-top"/);
    await expect(slide('flow-left=15.5', 'Hello')).rejects.toThrow(/flow-left must leave room before the right margin/);
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

describe('the text of a list item as a reference, #id.text', () => {
  const column = (obj: Mobject) => (obj as ListItemMobject).markupTextColumn as number;

  it('starts past the bullet, while #id still starts at it', async () => {
    const s = await slide('', '- Each node sends its identifier {#item}\n\nUnder its text {#t below:#LAST left-aligned:#item.text}\n\nUnder its bullet {#b below:#LAST left-aligned:#item}');
    const text = left(element(s, 'item')) + column(element(s, 'item'));
    expect(left(element(s, 't'))).toBeCloseTo(text, 6);
    expect(left(element(s, 'b'))).toBeCloseTo(left(element(s, 'item')), 6);
  });

  it('works with at=, #LAST and a wide number, and is the element itself on anything else', async () => {
    const s = await slide('', '10. ten {#ten}\n\n[[dot: #d at=#LAST.text.left radius=0.05]]\n\n[P]{#p x=0 y=-2}\n\n[Q]{#q below:#p left-aligned:#p.text}');
    const text = left(element(s, 'ten')) + column(element(s, 'ten'));
    expect(column(element(s, 'ten'))).toBeGreaterThan(0.6);
    expect(element(s, 'd').getCenter()[0]).toBeCloseTo(text, 6);
    expect(left(element(s, 'q'))).toBeCloseTo(left(element(s, 'p')), 6);
  });
});

describe('the flow after a placed element', () => {
  const baseline = (from: MarkupSlide, id: string) => anchorPoint(element(from, id), 'left-baseline')[1];
  const column = (obj: Mobject) => (obj as ListItemMobject).markupTextColumn as number;
  /** How far apart the baselines of two paragraphs of the flow are. */
  const spacing = async () => {
    const plain = await slide('', 'First {#a}\n\nSecond {#b}');
    return baseline(plain, 'a') - baseline(plain, 'b');
  };

  it('starts under the block before, at its left edge, wherever that one is placed', async () => {
    const s = await slide('', 'Placed {#p x=2 y=1}\n\nAfter it {#n}\n\n[[rectangle: #r x=-4 y=-2 width=2 height=1]]\n\nNot under the box {#u}');
    expect(left(element(s, 'n'))).toBeCloseTo(left(element(s, 'p')), 9);
    expect(baseline(s, 'p') - baseline(s, 'n')).toBeCloseTo(await spacing(), 9);
    // A drawing placed out of the flow stands beside it: the flow goes on past it, after #n.
    expect(left(element(s, 'u'))).toBeCloseTo(left(element(s, 'n')), 9);
    expect(baseline(s, 'n') - baseline(s, 'u')).toBeCloseTo(await spacing(), 9);
  });

  it('goes on past a block placed by its right end or its middle, a corner link or a centered label', async () => {
    const plain = await slide('', 'Heading {#h}');
    const s = await slide('', '[Documentation]{#docs x=7.35 y=4 anchor=right-baseline}\n\n[label]{#l at=center:(3,0)}\n\nHeading {#h}');
    expect(top(element(s, 'h'))).toBeCloseTo(top(element(plain, 'h')), 9);
    expect(left(element(s, 'h'))).toBeCloseTo(left(element(plain, 'h')), 9);
  });

  it('goes on past a picture or a background placed out of the flow', async () => {
    const plain = await slide('', 'First {#a}\n\nSecond {#b}');
    const s = await slide('', 'First {#a}\n\n[[rectangle: #sheet x=0 y=0 width=8 height=4.5]]\n\n[[dot: #d x=6 y=3]]\n\nSecond {#b}');
    for (const id of ['a', 'b']) expect(top(element(s, id))).toBeCloseTo(top(element(plain, id)), 9);
    expect(left(element(s, 'b'))).toBeCloseTo(left(element(plain, 'b')), 9);
  });

  it('keeps a list a list: items under one another, nested ones indented, item blocks under their text', async () => {
    const s = await slide('', 'Placed {#p x=-3 y=2}\n\n- one {#i1}\n\n  more of one {#m}\n\n- two {#i2}\n  - nested {#n}');
    const one = element(s, 'i1');
    expect(left(one)).toBeCloseTo(left(element(s, 'p')), 9);
    expect(left(element(s, 'i2'))).toBeCloseTo(left(one), 9);
    expect(left(element(s, 'm'))).toBeCloseTo(left(one) + column(one), 9);
    expect(left(element(s, 'n'))).toBeCloseTo(left(one) + 0.6, 9);
  });

  it('keeps a block aligned with an item\'s text under the item, and the next blocks with it', async () => {
    const s = await slide('', '- one {#i}\n\nUnder its text {#t left-aligned:#LAST.text}\n\nAnd on {#n}');
    const item = element(s, 'i');
    const text = left(item) + column(item);
    expect(left(element(s, 't'))).toBeCloseTo(text, 9);
    expect(baseline(s, 'i') - baseline(s, 't')).toBeCloseTo(await spacing(), 9);
    expect(left(element(s, 'n'))).toBeCloseTo(text, 9);
    expect(baseline(s, 't') - baseline(s, 'n')).toBeCloseTo(await spacing(), 9);
  });

  it('takes from the flow only the axes no option sets, and a direction keeps centering', async () => {
    const s = await slide('', 'Placed {#p x=-3 y=2}\n\nOwn x {#a x=1}\n\n[Reference]{#q x=4 y=-3}\n\nAligned {#b left-aligned:#p}\n\nCentered under {#c below:#b}');
    // An x of its own right of the block placed just before starts a column beside it, at its top.
    expect(anchorPoint(element(s, 'a'), 'left-baseline')[0]).toBeCloseTo(1, 9);
    expect(top(element(s, 'a'))).toBeCloseTo(top(element(s, 'p')), 9);
    // Left of it, the x makes a column the flow fills from where it is, not under #p.
    const plain = await slide('', 'Own x {#a x=-7}');
    const leftOf = await slide('', 'Placed {#p x=-3 y=2}\n\nOwn x {#a x=-7}');
    expect(top(element(leftOf, 'a'))).toBeCloseTo(top(element(plain, 'a')), 9);
    // Aligned with #p, under #q, the element before it.
    expect(left(element(s, 'b'))).toBeCloseTo(left(element(s, 'p')), 9);
    expect(baseline(s, 'q') - baseline(s, 'b')).toBeCloseTo(await spacing(), 9);
    // below: alone sets both axes, centered as before.
    expect(element(s, 'c').getCenter()[0]).toBeCloseTo(element(s, 'b').getCenter()[0], 9);
    // An element whose height is set follows nothing: it keeps the flow's left edge.
    const pinned = await slide('', 'Placed {#p x=2 y=2}\n\nAt its own height {#h y=-2}\n\n[[dot: #d x=5 y=0]]\n\nAligned on a baseline {#k baseline-aligned:#h}');
    expect(left(element(pinned, 'h'))).toBeCloseTo(-8 + 0.65, 9);
    expect(left(element(pinned, 'k'))).toBeCloseTo(-8 + 0.65, 9);
  });

  it('starts a column beside a block placed by a point, at its top, with a text that sets its x alone', async () => {
    const s = await slide('', [
      '**proposer**: picks a number {#a y=1 anchor=top-left width=3}',
      '',
      '**acceptor**: promises it {#b x=-4 width=3}',
      '',
      '**proposer** again {#c x=0 width=3}',
      '',
      'Under the last column {#d}',
    ].join('\n'));
    expect(top(element(s, 'b'))).toBeCloseTo(top(element(s, 'a')), 9);
    // A column so started heads the next one.
    expect(top(element(s, 'c'))).toBeCloseTo(top(element(s, 'a')), 9);
    // The block after it flows on in its column.
    expect(left(element(s, 'd'))).toBeCloseTo(left(element(s, 'c')), 9);
    expect(top(element(s, 'd'))).toBeLessThan(element(s, 'c').getBottom()[1]);
  });

  it('starts no column beside a block that a drawing, a caption of a picture or the start of the slide separates from it', async () => {
    const plain = await slide('', 'Own x {#b x=4}');
    const flowTop = top(element(plain, 'b'));
    const after = async (before: string) => top(element(await slide('', `${before}\n\nOwn x {#b x=4}`), 'b'));
    expect(await after('Placed {#a y=1 width=3}\n\n[[line: (0,0) -> (1,1)]]')).toBeCloseTo(flowTop, 9);
    expect(await after('[[dot: #d x=-6 y=0]]\n\n[a caption]{#a at=left:#d.right}')).toBeCloseTo(flowTop, 9);
    expect(await after('Caption {#a x=-7 y=1 step=-1}')).toBeCloseTo(flowTop, 9);
    expect(await after('[corner]{#a x=-4 y=1 anchor=right-baseline}')).toBeCloseTo(flowTop, 9);
    // Nor beside a block that flows: it goes on under it.
    const flowing = await slide('', 'Flowing {#a width=3}\n\nOwn x {#b x=4}');
    expect(top(element(flowing, 'b'))).toBeLessThan(element(flowing, 'a').getBottom()[1]);
  });

  it('passes over a caption of the parent\'s view and an overlay written before what it marks', async () => {
    const plain = await slide('', 'Body {#b}');
    const s = await slide('', 'Caption {#cap x=-7 y=4 font_size=60 step=-1}\n\n[[rectangle: #hl at=center:#b width=1 height=0.5]]\n\nBody {#b}');
    expect(top(element(s, 'b'))).toBeCloseTo(top(element(plain, 'b')), 9);
    expect(left(element(s, 'b'))).toBeCloseTo(left(element(plain, 'b')), 9);
    expect(element(s, 'hl').getCenter()[0]).toBeCloseTo(element(s, 'b').getCenter()[0], 9);
  });

  it('wraps text at the width its column\'s first block gives, or at the flow\'s', async () => {
    const long = 'every concerned node sends a request to the pivot and waits for its answer before going on with the next round';
    const s = await slide('', `Placed {#p x=2 y=2 width=5}\n\n${long} {#w}\n\n${long} {#v}`);
    for (const id of ['w', 'v']) {
      expect(left(element(s, id))).toBeCloseTo(left(element(s, 'p')), 9);
      expect(element(s, id).getRight()[0]).toBeLessThanOrEqual(left(element(s, 'p')) + 5 + 1e-6);
    }
    // With no width, the column wraps as the flow does, as a chain of below:#LAST left-aligned:#LAST did.
    const own = await slide('', `Placed {#p x=2 y=2}\n\n${long} {#w buff=0.3}`);
    const chained = await slide('', `Placed {#p x=2 y=2}\n\n${long} {#w below:#LAST left-aligned:#LAST buff=0.3}`);
    expect(element(own, 'w').getWidth()).toBeCloseTo(element(chained, 'w').getWidth(), 9);
  });
});

describe('a buff of its own on a block that flows', () => {
  const bounds = (obj: Mobject) => [obj.getLeft()[0], obj.getBottom()[1], obj.getRight()[0], obj.getTop()[1]];

  it('is the space after the block before, as below:#LAST left-aligned:#LAST buff= gives it', async () => {
    for (const [after, buff] of [['Next paragraph {#n BUFF}', '0.6'], ['```text {#n BUFF}\ncode\n```', '0.4'], ['- an item {#n BUFF}', '0.15']]) {
      const head = 'The head {#h x=-3 y=2 width=6}\n\n';
      const own = await slide('', head + after.replace('BUFF', `buff=${buff}`));
      const chained = await slide('', head + after.replace('BUFF', `below:#LAST left-aligned:#LAST buff=${buff}`));
      const [a, b] = [bounds(element(own, 'n')), bounds(element(chained, 'n'))];
      a.forEach((value, k) => expect(value).toBeCloseTo(b[k], 9));
    }
  });

  it('does nothing at the start of the flow', async () => {
    const plain = await slide('', 'First {#a}');
    const spaced = await slide('', 'First {#a buff=1}');
    expect(top(element(spaced, 'a'))).toBeCloseTo(top(element(plain, 'a')), 9);
  });

  it('needs an element that flows down', () => {
    const parse = (body: string) => new MarkupParser().parse(`::: slide {#s}\n${body}\n:::`);
    expect(() => parse('Text {buff=0.3}')).not.toThrow();
    expect(() => parse('Text {x=1 buff=0.3}')).not.toThrow();
    expect(() => parse('Text {y=1 buff=0.3}')).toThrow(/buff requires a relative direction, or an element that flows down/);
    expect(() => parse('Text {#a x=0 y=0}\n\nMore {baseline-aligned:#a buff=0.3}')).toThrow(/buff requires/);
    expect(() => parse('[[rectangle: x=1 width=1 height=1 buff=0.3]]')).toThrow(/buff requires/);
  });
});
