import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, IncludeSpec, type SlideItem } from '../src/markup/ast';
import { textLines } from '../src/markup/text';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const parse = (body: string, options: { styles?: Record<string, string>; block?: string } = {}) =>
  new MarkupParser().parse(`${options.block ? `::: styles\n${options.block}\n:::\n` : ''}::: slide {#s}\n${body}\n:::\n::: slide {#a}\nA\n:::\n::: slide {#b}\nB\n:::`, {
    steps: 'sequential',
    styles: Object.fromEntries(Object.entries(options.styles ?? {}).map(([name, value]) => [name, MarkupParser.parseStyles(`x: ${value}`).x])),
  });
const items = (body: string, options?: Parameters<typeof parse>[1]) => parse(body, options).slides.find((s) => s.id === 's')!.items;
const byId = (list: SlideItem[], id: string) => list.find((item): item is ElementSpec => item instanceof ElementSpec && item.id === id)!;

describe('a style built on others (9)', () => {
  it('takes the classes it names, and its own definition before it when it names itself', () => {
    const list = items('[x]{#x .verdict}\n\n[y]{#y .note}', { styles: { verdict: 'color=GREEN buff=0.15', smallsep: 'buff=0.1' }, block: 'verdict: .verdict width=4\nnote: .smallsep color=GRAY' });
    expect(byId(list, 'x').attributes).toMatchObject({ color: 'GREEN', buff: '0.15', width: '4' });
    expect(byId(list, 'y').attributes).toMatchObject({ buff: '0.1', color: 'GRAY' });
    expect(() => items('[x]{.v}', { block: 'v: .v width=4' })).toThrow(/names itself, but no style v comes before it/);
    expect(() => items('[x]{.v}', { block: 'v: .nothing' })).toThrow(/names an unknown style .nothing/);
  });
});

describe('a timeline\'s names, tips, parts, events and lengths (10–14)', () => {
  it('shows no names with names=false, or none for a process whose line gives none', () => {
    expect(items('::: timeline {#t processes="p q" length=4 names=false}\n:::').filter((item) => item instanceof ElementSpec && item.kind === 'text')).toEqual([]);
    const some = items('::: timeline {#t processes="p q" length=4}\np:\n:::');
    expect(byId(some, 't.p-name')).toBeUndefined();
    expect(byId(some, 't.q-name')).toBeDefined();
  });

  it('ends its lifelines in a tip with lifeline_tip', () => {
    const list = items('::: timeline {#t processes="p" length=4 lifeline_tip=true}\n:::');
    expect(byId(list, 't.p')).toMatchObject({ kind: 'arrow' });
    expect(byId(list, 't.p').attributes).toMatchObject({ buff: '0' });
    expect(byId(items('::: timeline {#t processes="p" length=4 lifeline_tip=open}\n:::'), 't.p').attributes.tip).toBe('open');
  });

  it('draws a part of a lifeline its own way, the lifeline in pieces', () => {
    const list = items('::: timeline {#t processes="p" length=6}\np@2 .. p@4 {dashed=true}\n:::');
    expect(['t.p', 't.p-2', 't.p-3'].map((id) => [byId(list, id).attributes.from, byId(list, id).attributes.to, byId(list, id).attributes.dashed])).toEqual([
      ['(0,0)', '(2,0)', undefined], ['(2,0)', '(4,0)', 'true'], ['(4,0)', '(6,0)', undefined],
    ]);
    expect(() => items('::: timeline {processes="p q" length=6}\np@2 .. q@4\n:::')).toThrow(/joins two times of one process/);
  });

  it('ends a lifeline where its process\'s line says', () => {
    const list = items('::: timeline {#t processes="p q" length=10}\np: $p_{1}$ {length=9}\n:::');
    expect(byId(list, 't.p').attributes.to).toBe('(9,0)');
    expect(byId(list, 't.q').attributes.to).toBe('(10,-1)');
    expect(byId(list, 't.p-name').spans[0].content).toBe('p_{1}');
  });

  it('writes an event without its dot, its label wrapping at sublabel_width', async () => {
    const list = items('::: timeline {#t processes="p" length=4}\np@1 "a statement" {#e dot=false}\n:::');
    expect(byId(list, 't.e').attributes).toMatchObject({ fill_opacity: '0', stroke_width: '0' });
    expect(byId(items('::: timeline {#t processes="p" length=4 event_dot=false}\np@1 {#e}\n:::'), 't.e').attributes.stroke_width).toBe('0');
    const built = await slide('', '[[dot: #d x=0 y=0 sublabel="a statement long enough to wrap" sublabel_width=2]]');
    const label = (element(built, 'd') as unknown as { markupParts: unknown[] }).markupParts[1];
    expect(textLines(label as never)!.first).toBeGreaterThan(textLines(label as never)!.last);
  });
});

describe('tiles with classes (15)', () => {
  it('take from a class what tiles take, under what they write', () => {
    const list = items('::: tiles {cols=2 x=0 y=0 width=3 .medsep .note}\n[[include: #a]]\n[[include: #b]]\n:::', { styles: { medsep: 'buff=0.4', note: 'color=GRAY' } });
    const b = list.find((item): item is IncludeSpec => item instanceof IncludeSpec && item.target === 'b')!;
    expect(b.attributes.buff).toBe('0.4');
    expect(b.attributes).not.toHaveProperty('color');
    expect(() => items('::: tiles {.nothing}\n[[include: #a]]\n:::')).toThrow(/Unknown style class .nothing/);
  });
});

describe('the revision round\'s fixes', () => {
  it('reads a {…} stuck to a span\'s ] as the span\'s own, on a process\'s line (bug 1)', () => {
    const list = items('::: timeline {#t processes="P Q R S" length=10}\nP: [proposer]{color=RED}\nQ: [acceptor]{color=RED} {length=9}\nR: {length=8}\nS: name {length=7}\n:::');
    expect(byId(list, 't.P-name').spans[0]).toMatchObject({ content: 'proposer', color: 'RED' });
    expect([byId(list, 't.Q').attributes.to, byId(list, 't.R').attributes.to, byId(list, 't.S').attributes.to]).toEqual(['(9,-1)', '(8,-2)', '(7,-3)']);
    expect(byId(list, 't.R-name')).toBeUndefined();
  });

  it('hangs a verdict from its first line box, so a row\'s verdicts share a baseline (bug 2)', async () => {
    const root = await (await import('./helpers/slides')).built('::: slide {#r}\n[[include: #a x=-4 y=0 width=3 verdict="Dickson"]]\n\n[[include: #b verdict="xxxx"]]\n:::\n::: slide {#a}\nA\n:::\n::: slide {#b}\nB\n:::');
    const [a, b] = ['a-verdict', 'b-verdict'].map((id) => textLines(element(root, id))!);
    expect(a.first).toBeCloseTo(b.first, 9);
    const tile = (root.components.values().next().value as { viewport: { getBottom(): number[] } }).viewport;
    expect(a.first + a.ascent).toBeCloseTo(tile.getBottom()[1] - 0.35, 9);
  });

  it('sizes a lifeline\'s tip from the whole lifeline, with a line\'s width (bugs 3, 4)', async () => {
    const list = items('::: timeline {#t processes="p" direction=down width=6.3 lifeline_tip=true}\np@1 .. p@6.2 {dashed=true}\n:::');
    const last = byId(list, 't.p-3');
    expect([last.kind, last.lifeline]).toEqual(['arrow', 6.3]);
    const built = await slide('', '::: timeline {#t processes="p" direction=down width=6.3 lifeline_tip=true}\np@1 .. p@6.2 {dashed=true}\n:::\n\n::: timeline {#u processes="p" x=3 direction=down width=6.3 lifeline_tip=true}\n:::');
    // The stub's tip is a whole lifeline's, longer than the 0.1 stub, not a quarter of it.
    expect(element(built, 't.p-3').getHeight()).toBeGreaterThan(0.15);
    expect(element(built, 'u.p').getHeight()).toBeCloseTo(6.3, 6);
  });

  it('gives a timeline and a graph the deck\'s timeline and graph styles and the classes they name', () => {
    const list = items('::: timeline {#t processes="p" length=4 .waits}\np@1 {#e}\n:::\n\n::: graph {#g}\nA (0,0)\n:::', { styles: { waits: 'event_dot=false lifeline_tip=true', graph: 'node_radius=0.5' } });
    expect(byId(list, 't.p').kind).toBe('arrow');
    expect(byId(list, 't.e').attributes.stroke_width).toBe('0');
    expect(byId(list, 'g.A').attributes.radius).toBe('0.5');
  });
});
