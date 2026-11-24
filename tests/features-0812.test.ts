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
