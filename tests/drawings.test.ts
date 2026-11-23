import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, GroupSpec, type SlideItem } from '../src/markup/ast';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const parse = (body: string, options: { steps?: 'explicit' | 'sequential'; styles?: string } = {}) =>
  new MarkupParser().parse(`${options.styles ? `::: styles\n${options.styles}\n:::\n` : ''}::: slide {#s}\n${body}\n:::`, { steps: options.steps });
const items = (body: string, options?: Parameters<typeof parse>[1]) => parse(body, options).slides[0].items.filter((item): item is ElementSpec => item instanceof ElementSpec);
const byId = (list: SlideItem[], id: string) => list.find((item): item is ElementSpec => item instanceof ElementSpec && item.id === id)!;
const own = (item: ElementSpec) => {
  const attrs = { ...item.attributes };
  return attrs;
};

const TIMELINE = [
  '::: timeline {#t processes="p q" x=-5 y=1 width=10 length=5 spacing=2}',
  'q: server',
  'p@1 -> q@3 "m1"',
  'q@2 "(0,1)" snap',
  'p@4 -- q@4.5 {color=RED}',
  '[x]{#cross at=center:p@2}',
  '[[line: p@0 -> p@2, #past]]',
  ':::',
].join('\n');

describe('a timeline', () => {
  it('draws a lifeline for each process, its name at its left', () => {
    const list = items(TIMELINE, { styles: 'snap: color=#c0392b' });
    expect(own(byId(list, 't-p'))).toEqual({ from: '(-5,1)', to: '(5,1)' });
    expect(own(byId(list, 't-q'))).toEqual({ from: '(-5,-1)', to: '(5,-1)' });
    expect(byId(list, 't-p-name').spans.map((s) => s.content)).toEqual(['p']);
    expect(byId(list, 't-p-name').spans[0].kind).toBe('math');
    expect(byId(list, 't-q-name').spans.map((s) => s.content)).toEqual(['server']);
    expect(own(byId(list, 't-q-name'))).toEqual({ at: 'right:(-5.2,-1)' });
    expect([byId(list, 't-p').role, byId(list, 't-p-name').role]).toEqual(['lifeline', 'process']);
  });

  it('turns messages and events into arrows, lines and dots at the points of the processes', () => {
    const list = items(TIMELINE, { styles: 'snap: color=#c0392b' });
    // Line 3 of the block's source: the message.
    const sent = list.find((item) => item.role === 'message' && item.kind === 'arrow')!;
    expect(own(sent)).toEqual({ from: '(-3,1)', to: '(1,-1)', label: 'm1' });
    const line = list.find((item) => item.role === 'message' && item.kind === 'line')!;
    expect(own(line)).toEqual({ from: '(3,1)', to: '(4,-1)', color: 'RED' });
    const dot = list.find((item) => item.role === 'event')!;
    expect(own(dot)).toEqual({ x: '-1', y: '-1', sublabel: '(0,1)', color: '#c0392b' });
  });

  it('lets any element name the point of a process at a time', () => {
    const list = items(TIMELINE, { styles: 'snap: color=#c0392b' });
    expect(byId(list, 'cross').attributes.at).toBe('center:(-1,1)');
    expect(own(byId(list, 'past'))).toMatchObject({ from: '(-5,1)', to: '(-1,1)' });
  });

  it('takes the deck\'s styles of its parts', () => {
    const list = items(TIMELINE, { styles: 'snap: color=#c0392b\nlifeline: stroke_width=1 color=#9a9a9a\nmessage: tip_length=0.16\nprocess: font_size=20' });
    expect(byId(list, 't-p').attributes).toMatchObject({ stroke_width: '1', color: '#9a9a9a' });
    expect(list.find((item) => item.role === 'message' && item.kind === 'arrow')!.attributes.tip_length).toBe('0.16');
    expect(byId(list, 't-q-name').attributes.font_size).toBe('20');
  });

  it('follows the steps of the source, line by line', () => {
    const body = '::: timeline {#t processes="p q" length=4 step=+}\np@1 -> q@2 "a"\np@2 -> q@3 "b" {step=+}\nq@3\n:::';
    const list = items(body, { steps: 'sequential' });
    expect(list.map((item) => item.attributes.step ?? '0')).toEqual(['1', '1', '1', '1', '1', '2', '2']);
    // Numbered steps: the block's step for every part without its own.
    const numbered = items('::: timeline {processes="p" length=4 step=2}\np@1 -> p@2 {step=3}\np@3\n:::');
    expect(numbered.map((item) => item.attributes.step)).toEqual(['2', '2', '3', '2']);
  });

  it('is drawn where it says', async () => {
    const built = await slide('', '::: timeline {#t processes="p q" x=-4 y=1 length=8 spacing=2}\np@2 -> q@6 {#m buff=0}\nq@6 {#e}\n:::');
    const lifeline = element(built, 't-q') as Mobject;
    expect(lifeline.getLeft()[0]).toBeCloseTo(-4, 6);
    expect(lifeline.getRight()[0]).toBeCloseTo(4, 6);
    expect(lifeline.getCenter()[1]).toBeCloseTo(-1, 6);
    expect(element(built, 'e').getCenter()).toEqual(expect.arrayContaining([expect.closeTo(2, 6), expect.closeTo(-1, 6)]));
    expect(element(built, 't-p-name').getRight()[0]).toBeCloseTo(-4.2, 6);
  });

  it('is checked', () => {
    expect(() => parse('::: timeline {length=3}\n:::')).toThrow(/needs its processes/);
    expect(() => parse('::: timeline {processes="p p" length=3}\n:::')).toThrow(/named twice/);
    expect(() => parse('::: timeline {processes="p"}\n:::')).toThrow(/length \(in units of time\) or its width/);
    expect(() => parse('::: timeline {processes="p" length=3 color=RED}\n:::')).toThrow(/A timeline takes .*not color=/);
    expect(() => parse('::: timeline {processes="p" length=3}\np@1 -> p@2 "x" 3rd\n:::')).toThrow(/Unexpected "3rd"/);
    expect(() => parse('::: timeline {processes="p" length=3 hide=+}\n:::')).toThrow(/give the timeline hide=N/);
  });

  it('may stand in a group, its parts the group\'s members', () => {
    const group = parse('::: {.group #g x=1 y=1 step=2}\n::: timeline {#t processes="p" length=3}\np@1\n:::\n:::').slides[0].items[0] as GroupSpec;
    expect(group.items.map((member) => member.id)).toEqual(['g.t-p', 'g.t-p-name', 'g.t-1']);
  });
});

describe('a graph', () => {
  const GRAPH = [
    '::: graph {#n x=1 y=-1 scale=2}',
    'A (0,0)',
    'B (1,0.5) "Bob" big',
    't (2,0) rectangle {width=0.2 height=0.8}',
    'A -> B "3" {bend=20}',
    'B -- t',
    '[[circle: #around at=center:#A radius=0.6]]',
    ':::',
  ].join('\n');

  it('places nodes, sized as their style says or by default, and joins them by edges', () => {
    const list = items(GRAPH, { styles: 'big: radius=0.5' });
    expect([byId(list, 'A').kind, own(byId(list, 'A'))]).toEqual(['circle', { x: '1', y: '-1', radius: '0.3' }]);
    expect(own(byId(list, 'B'))).toEqual({ x: '3', y: '0', label: 'Bob', radius: '0.5' });
    expect([byId(list, 't').kind, own(byId(list, 't'))]).toEqual(['rectangle', { x: '5', y: '-1', width: '0.2', height: '0.8' }]);
    const edges = list.filter((item) => item.role === 'edge');
    expect(edges.map((item) => [item.kind, own(item)])).toEqual([
      ['arrow', { from: '#A', to: '#B', label: '3', bend: '20' }],
      ['line', { from: '#B', to: '#t' }],
    ]);
    expect(byId(list, 'around').attributes.at).toBe('center:#A');
  });

  it('labels its nodes by their names with labels=true, and takes the node and edge styles', () => {
    const list = items('::: graph {labels=true}\nA (0,0)\nB (1,0) ""\nA -> B\n:::', { styles: 'node: radius=0.4 fill_color=WHITE\nedge: stroke_width=3' });
    expect(byId(list, 'A').attributes).toMatchObject({ label: 'A', radius: '0.4', fill_color: 'WHITE' });
    expect('label' in byId(list, 'B').attributes).toBe(false);
    expect(list.find((item) => item.role === 'edge')!.attributes.stroke_width).toBe('3');
    // A node style made for circles gives a rectangle what it takes, and no radius.
    const mixed = items('::: graph\nA (0,0)\nt (1,0) rectangle\n:::', { styles: 'node: radius=0.4 color=#111111' });
    expect(byId(mixed, 't').attributes).toEqual({ x: '1', y: '0', color: '#111111', width: '0.6', height: '0.6' });
    expect(byId(mixed, 'A').attributes.radius).toBe('0.4');
  });

  it('is checked', () => {
    expect(() => parse('::: graph {labels=yes}\n:::')).toThrow(/labels must be true or false/);
    expect(() => parse('::: graph\nA (0,0)\nA -> Z\n:::')).toThrow(/Unknown arrow endpoint #Z/);
    expect(() => parse('::: graph\nA (0,0)\nA (1,1)\n:::')).toThrow(/duplicate element ID "A"/);
  });
});
