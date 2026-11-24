import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser, ASTTransformer } from '../src/markup/parser';
import { MarkupSlide } from '../src/markup/slide';
import { LayoutConfig } from '../src/markup/renderer';
import { ElementSpec, IncludeSpec, type SlideItem } from '../src/markup/ast';
import { textLines } from '../src/markup/text';
import { built, element, installFakeCanvas } from './helpers/slides';

beforeAll(installFakeCanvas);

const children = (ids: string[]) => ids.map((id) => `::: slide {#${id}}\n# ${id.toUpperCase()} {#${id}-cap step=-1}\n\nbody {#${id}-body}\n:::`).join('\n');
const CHILDREN = children(['a', 'b', 'c', 'd']);
const parse = (body: string, options: { steps?: 'explicit' | 'sequential'; styles?: string } = {}) =>
  new MarkupParser().parse(`${options.styles ? `::: styles\n${options.styles}\n:::\n` : ''}::: slide {#r}\n${body}\n:::\n${CHILDREN}`, { steps: options.steps });
const items = (body: string, options?: Parameters<typeof parse>[1]) => parse(body, options).slides.find((s) => s.id === 'r')!.items;
const include = (list: SlideItem[], target: string) => list.find((item): item is IncludeSpec => item instanceof IncludeSpec && item.target === target)!;
const verdict = (list: SlideItem[], target: string) => list.find((item): item is ElementSpec => item instanceof ElementSpec && item.verdictOf === target)!;
const placement = (item: IncludeSpec | ElementSpec) => {
  const { step, ...rest } = item.attributes;
  void step;
  return rest;
};

describe('a row of tiles', () => {
  it('puts an include without a position right of the include before it, top-aligned and as wide', () => {
    const list = items('[[include: #a x=-6 y=2 width=3]]\n\n[[include: #b]]\n\n[[include: #c buff=0.8]]\n\n[[include: #d height=2]]');
    expect(placement(include(list, 'b'))).toEqual({ 'right-of': '#a', 'top-aligned': '#a', width: '3' });
    expect(placement(include(list, 'c'))).toEqual({ 'right-of': '#b', 'top-aligned': '#b', width: '3', buff: '0.8' });
    // A size of its own stays.
    expect(placement(include(list, 'd'))).toEqual({ 'right-of': '#c', 'top-aligned': '#c', height: '2' });
  });

  it('starts no row after text, nor for an include placed by itself', () => {
    const list = items('[[include: #a x=-6 y=2 width=3]]\n\nbetween\n\n[[include: #b]]\n\n[[include: #c y=-2]]\n\n[[include: #d below:#b]]');
    expect(placement(include(list, 'b'))).toEqual({});
    expect(placement(include(list, 'c'))).toEqual({ y: '-2' });
    expect(placement(include(list, 'd'))).toEqual({ below: '#b' });
    // Directives and arrows between two includes do not break the row.
    const kept = items('[[include: #a x=-6 y=2 width=3 step=1]]\n\n[[arrow: (0,0) -> (1,1)]]\n\n[[next: step=1]]\n\n[[include: #b]]');
    expect(include(kept, 'b').attributes['right-of']).toBe('#a');
  });

  it('passes over what does not flow, as a label placed over the tiles (rule E)', () => {
    const list = items('[[include: #a x=-6 y=2 width=3]]\n\n[Phase 1]{#p1 x=-6 y=3}\n\n[[circle: #c x=0 y=0 radius=0.2]]\n\n[mark]{#m at=bottom:#a.top}\n\n[[include: #b]]\n\n::: graph\nA (5,5)\n:::\n\n[[include: #c]]');
    expect(include(list, 'b').attributes['right-of']).toBe('#a');
    expect(include(list, 'c').attributes['right-of']).toBe('#b');
  });

  it('places the tiles side by side, layout.gap apart unless buff says otherwise', async () => {
    const root = await built(`::: slide {#r}\n[[include: #a x=-4 y=2 width=3]]\n\n[[include: #b]]\n\n[[include: #c buff=1]]\n:::\n${children(['a', 'b', 'c'])}`);
    const tile = (id: string) => (root.components.get([...root.components.keys()].find((key) => key.endsWith(id))!) as MarkupSlide).viewport as Mobject;
    expect(tile('b').getWidth()).toBeCloseTo(3, 9);
    expect(tile('b').getLeft()[0] - tile('a').getRight()[0]).toBeCloseTo(0.35, 9);
    expect(tile('c').getLeft()[0] - tile('b').getRight()[0]).toBeCloseTo(1, 9);
    expect(tile('c').getTop()[1]).toBeCloseTo(tile('a').getTop()[1], 9);
  });
});

describe('a grid of tiles', () => {
  it('fills rows of cols tiles, each row under the first tile of the row before', () => {
    const list = items('::: tiles {cols=2 x=-6 y=3 width=3 buff=0.5}\n[[include: #a verdict="first"]]\n[[include: #b]]\n[[include: #c]]\n[[include: #d width=2]]\n:::');
    expect(placement(include(list, 'a'))).toEqual({ x: '-6', y: '3', width: '3' });
    expect(placement(include(list, 'b'))).toEqual({ 'right-of': '#a', 'top-aligned': '#a', width: '3', buff: '0.5' });
    // Below the first tile's verdict, at the first tile's left edge.
    expect(placement(include(list, 'c'))).toEqual({ below: '#a-verdict', 'left-aligned': '#a', width: '3', buff: '0.5' });
    expect(placement(include(list, 'd'))).toEqual({ 'right-of': '#c', 'top-aligned': '#c', width: '2', buff: '0.5' });
    // Without cols, one row.
    const row = items('::: tiles {width=2}\n[[include: #a]]\n[[include: #b]]\n[[include: #c]]\n:::');
    expect(include(row, 'c').attributes['right-of']).toBe('#b');
  });

  it('holds includes only, placed by the container', () => {
    expect(() => parse('::: tiles {cols=2}\n[[include: #a x=1]]\n:::')).toThrow(/give the position \(x=\) to the tiles container/);
    expect(() => parse('::: tiles\n[[include: #a]]\ntext\n:::')).toThrow(/Tiles contain includes only/);
    expect(() => parse('::: tiles {cols=0}\n[[include: #a]]\n:::')).toThrow(/cols must be a positive integer/);
    expect(() => parse('::: tiles {color=RED}\n[[include: #a]]\n:::')).toThrow(/Tiles take cols, buff, width, height, step, hide, a position and their verdicts' attributes \(verdict_…\), not color=/);
    expect(() => parse('::: tiles\n:::')).toThrow(/at least one include/);
  });
});

describe('a column of tiles', () => {
  it('steps evenly whatever the verdicts\' letters reach (bug 5)', async () => {
    const root = await built(`::: slide {#r}\n::: tiles {cols=1 x=-4 y=5.5 anchor=top-left width=4 buff=0.3}\n[[include: #a verdict="not the actual run"]]\n[[include: #b verdict="no money lost"]]\n[[include: #c verdict="none"]]\n[[include: #d verdict="x"]]\n:::\n:::\n${children(['a', 'b', 'c', 'd'])}`);
    const tops = ['a', 'b', 'c', 'd'].map((id) => ((root.components.get([...root.components.keys()].find((key) => key.endsWith(id))!) as MarkupSlide).viewport as Mobject).getTop()[1]);
    const steps = tops.slice(1).map((top, i) => tops[i] - top);
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 9);
    // The rule itself: a tile's top is buff under the text's line box (last baseline less descent).
    const placed = await built(`::: slide {#r}\n[money]{#t x=-4 y=3}\n\n[[include: #a below:#t buff=0.3 width=4]]\n:::\n${children(['a'])}`);
    const lines = textLines(element(placed, 't'))!;
    const tile = ((placed.components.values().next().value as MarkupSlide).viewport as Mobject);
    expect(tile.getTop()[1]).toBeCloseTo(lines.last - lines.descent - 0.3, 9);
  });
});

describe('the verdict of a tile', () => {
  it('is a text under the tile, shown at the click after its visit', () => {
    const list = items('[[include: #a x=0 y=0 width=3 step=1 verdict="a *public* ledger"]]');
    const line = verdict(list, 'a');
    expect(line.id).toBe('a-verdict');
    expect(line.spans.map((s) => [s.content, s.italic])).toEqual([['a ', false], ['public', true], [' ledger', false]]);
    expect(line.attributes).toEqual({ below: '#a', step: '2' });
    expect('verdict' in include(list, 'a').attributes).toBe(false);
  });

  it('numbers the visits without a step first, as the plan does, so the verdicts do not move them', () => {
    const slide = parse('[t]{#t step=1}\n\n[[include: #a x=-4 y=0 width=3 verdict="x"]]\n\n[[include: #b verdict="y"]]').slides.find((s) => s.id === 'r')!;
    expect(include(slide.items, 'a').attributes.step).toBe('2');
    expect(include(slide.items, 'b').attributes.step).toBe('3');
    expect(verdict(slide.items, 'a').attributes.step).toBe('3');
    expect(verdict(slide.items, 'b').attributes.step).toBe('4');
    const plan = new ASTTransformer().plan(slide);
    expect(plan.map((step) => [step.number, step.visits.length, step.changes.map((change) => change.target)])).toEqual([
      [1, 0, ['t']], [2, 1, []], [3, 1, ['a-verdict']], [4, 0, ['b-verdict']],
    ]);
  });

  it('stands outside the count of sequential steps and of #LAST', () => {
    const list = items('[[include: #a x=-4 y=0 width=3 verdict="x"]]\n\n[[include: #b verdict="y"]]\n\n[after]{#after step=+ below:#LAST}', { steps: 'sequential' });
    expect([include(list, 'a').attributes.step, include(list, 'b').attributes.step]).toEqual(['1', '2']);
    expect([verdict(list, 'a').attributes.step, verdict(list, 'b').attributes.step]).toEqual(['2', '3']);
    const after = list.find((item): item is ElementSpec => item instanceof ElementSpec && item.id === 'after')!;
    expect(after.attributes.step).toBe('3');
    expect(after.attributes.below).toBe('#b');
  });

  it('takes the verdict style, which may place it', () => {
    const styled = items('[[include: #a x=0 y=0 width=3 verdict="x"]]', { styles: 'verdict: color=#1e7d32 font_size=20' });
    expect(verdict(styled, 'a').attributes).toEqual({ below: '#a', color: '#1e7d32', font_size: '20', step: '2' });
    const placed = items('[[include: #a x=0 y=0 width=3 verdict="x"]]', { styles: 'verdict: at=top:#LAST.bottom dy=-0.2' });
    expect(verdict(placed, 'a').attributes).toEqual({ at: 'top:#a.bottom', dy: '-0.2', step: '2' });
  });

  it('is for includes only', () => {
    expect(() => parse('[[subslide: Orbit verdict="x"]]')).toThrow(/verdict/);
  });

  it('wraps at the tile\'s width, centered under it', async () => {
    const root = await built(`::: slide {#r}\n[[include: #a x=0 y=1 width=2 verdict="a line long enough to wrap under the tile"]]\n:::\n${children(['a'])}`);
    const tile = (root.components.values().next().value as MarkupSlide).viewport as Mobject;
    const line = element(root, 'a-verdict');
    expect(line.getWidth()).toBeLessThanOrEqual(2 + 1e-9);
    expect((textLines(line)!.first - textLines(line)!.last) / textLines(line)!.interline).toBeGreaterThanOrEqual(1);
    expect(line.getCenter()[0]).toBeCloseTo(tile.getCenter()[0], 9);
    expect(line.getTop()[1]).toBeLessThan(tile.getBottom()[1]);
  });
});

describe('the size of a caption', () => {
  const deck = (caption: string, styles = '') => `${styles ? `::: styles\n${styles}\n:::\n` : ''}::: slide {#r}\n[[include: #a x=-4 y=0 width=4]]\n\n[[include: #b x=4 y=0 width=2]]\n:::\n`
    + `::: slide {#a}\n${caption.replace('ID', 'a')}\n:::\n::: slide {#b}\n${caption.replace('ID', 'b')}\n:::`;
  // The reach of the caption's font above its baseline: its size, measured exactly.
  const height = (root: MarkupSlide, id: string) => {
    for (const child of root.components.values()) {
      const found = (child as MarkupSlide).elements.get(id);
      if (found) return textLines(found)!.ascent;
    }
    throw new Error(id);
  };

  it('follows the tile with layout.captionSize: that many points of the parent', async () => {
    const sized = await built(deck('# Caption {#ID-cap step=-1}'), new LayoutConfig({ captionSize: 26 }));
    // A tile half as wide holds a caption twice as large, both 26 points on the parent.
    expect(height(sized, 'b-cap') / height(sized, 'a-cap')).toBeCloseTo(2, 6);
    const explicit = await built(deck('# Caption {#ID-cap step=-1 font_size=104}'));
    // The 16-wide child in a tile 4 wide: 26 × 16 / 4 = 104 points of its own.
    expect(height(sized, 'a-cap')).toBeCloseTo(height(explicit, 'a-cap'), 9);
  });

  it('gives way to a size of the caption or of its class, not to the style of its role', async () => {
    const layout = new LayoutConfig({ captionSize: 26 });
    const own = await built(deck('# Caption {#ID-cap step=-1 font_size=50}'), layout);
    expect(height(own, 'b-cap') / height(own, 'a-cap')).toBeCloseTo(1, 9);
    const classed = await built(deck('# Caption {#ID-cap .big step=-1}', 'big: font_size=50'), layout);
    expect(height(classed, 'b-cap') / height(classed, 'a-cap')).toBeCloseTo(1, 9);
    const role = await built(deck('# Caption {#ID-cap step=-1}', 'h1: font_size=50'), layout);
    expect(height(role, 'b-cap') / height(role, 'a-cap')).toBeCloseTo(2, 6);
  });

  it('is left alone without captionSize, and for text that is no caption', async () => {
    const plain = await built(deck('# Caption {#ID-cap step=-1}'));
    expect(height(plain, 'b-cap') / height(plain, 'a-cap')).toBeCloseTo(1, 9);
    const body = await built(deck('# Caption {#ID-cap}'), new LayoutConfig({ captionSize: 26 }));
    expect(height(body, 'b-cap') / height(body, 'a-cap')).toBeCloseTo(1, 9);
    expect(() => new LayoutConfig({ captionSize: 0 })).toThrow(/captionSize must be finite and positive/);
  });
});
