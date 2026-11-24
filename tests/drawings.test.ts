import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, GroupSpec, IncludeSpec, type SlideItem } from '../src/markup/ast';
import { built, element, installFakeCanvas, slide } from './helpers/slides';
import type { MarkupSlide } from '../src/markup/slide';

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

describe('a block stepped as a whole, line by line (rule B)', () => {
  const steps = (body: string, mode: 'explicit' | 'sequential') => Object.fromEntries(items(body, { steps: mode })
    .map((item) => [item.id, `${item.attributes.step ?? ''}/${item.attributes.hide ?? ''}`]));

  it('gives every line its step and hide with numbered steps, a plain element as a node', () => {
    const got = steps('Start {#start}\n\n::: graph {#g step=1 hide=2}\nA (0,0)\nB (2,0)\nA -> B\n[x]{#x at=(1,1)}\n:::', 'explicit');
    expect(got).toMatchObject({ start: '/', A: '1/2', B: '1/2', 'g-3': '1/2', x: '1/2' });
  });

  it('starts its first line at its step with sequential steps, whatever that line is, and hides every line', () => {
    const last = steps('Start {#start}\n\n::: graph {#g step=1 hide=2}\nA (0,0)\nB (2,0)\nA -> B\n[x]{#x at=(1,1)}\n:::', 'sequential');
    expect(last).toMatchObject({ start: '/', A: '1/2', B: '1/2', 'g-3': '1/2', x: '1/2' });
    const first = steps('Start {#start}\n\n::: graph {#g step=1 hide=2}\n[x]{#x at=(1,1)}\nA (0,0)\nB (2,0)\nA -> B\n:::', 'sequential');
    expect(first).toMatchObject({ start: '/', x: '1/2', A: '1/2', B: '1/2', 'g-4': '1/2' });
    // A first line with a step of its own keeps it; the lines after follow it.
    const own = steps('::: timeline {#t processes="p" length=4 step=+}\n[note]{#n at=p@1 step=3}\np@2\n:::', 'sequential');
    expect(own).toMatchObject({ 't-p': '1/', 't-p-name': '1/', n: '3/', 't-2': '3/' });
  });

  it('steps tiles as other blocks', () => {
    const document = new MarkupParser().parse('::: slide {#r}\n[t]{#t step=+}\n\n::: tiles {step=4 hide=6}\n[[include: #a verdict="x"]]\n[[include: #b]]\n:::\n:::\n::: slide {#a}\nA\n:::\n::: slide {#b}\nB\n:::', { steps: 'sequential' });
    const r = document.slides.find((s) => s.id === 'r')!.items;
    const visit = (target: string) => (r.find((item) => item instanceof IncludeSpec && item.target === target) as IncludeSpec).attributes.step;
    expect([visit('a'), visit('b')]).toEqual(['4', '5']);
    // The verdict comes the click after its tile's visit, and goes with the block.
    expect(byId(r, 'a-verdict').attributes).toMatchObject({ step: '5', hide: '6' });
    expect(() => new MarkupParser().parse('::: slide {#r}\n::: tiles {step=+}\n[[include: #a]]\n:::\n:::\n::: slide {#a}\nA\n:::')).toThrow(/steps: sequential/);
  });
});

describe('a point where an event stands', () => {
  const styled = (body: string) => built(`::: styles\nevent: radius=0.15\n:::\n::: slide {#s}\n${body}\n:::`);

  it('names the event, so that a message stops at its border as an arrow between circles does', async () => {
    const timeline = await styled('::: timeline {#t processes="p q" length=4 x=-4 y=1 width=8}\np@1 "e"\nq@3 "f"\np@1 -> q@3 {#m}\n:::');
    const circles = await styled('[[circle: #c1 x=-2 y=1 radius=0.15]]\n\n[[circle: #c2 x=2 y=0 radius=0.15]]\n\n[[arrow: #c1 -> #c2, #m]]');
    const box = (slide: MarkupSlide) => [element(slide, 'm').getLeft()[0], element(slide, 'm').getRight()[0], element(slide, 'm').getTop()[1], element(slide, 'm').getBottom()[1]];
    box(timeline).forEach((value, i) => expect(value).toBeCloseTo(box(circles)[i], 6));
    expect(element(timeline, 'm').getLeft()[0]).toBeGreaterThan(-2 + 0.15);
  });

  it('is named with an anchor, and stays a point without an event', () => {
    const list = items('::: timeline {#t processes="p q" length=4}\np@1\n[a]{#a at=bottom:p@1.top}\n[b]{#b at=center:q@2}\np@1 -> q@2\n:::');
    expect(byId(list, 'a').attributes.at).toBe('bottom:#t-1.top');
    expect(byId(list, 'b').attributes.at).toBe('center:(2,-1)');
    expect(list.find((item) => item.role === 'message')!.attributes).toMatchObject({ from: '#t-1', to: '(2,-1)' });
    expect(() => items('::: timeline {processes="p" length=4}\n[a]{at=p@2.top}\n:::')).toThrow(/p@2 names no event, so it has no .top/);
  });

  it('is reached at its border in a graph too', async () => {
    const graph = await styled('::: graph\nA (-2,1) {radius=0.15}\nB (2,0) {radius=0.15}\nA -> B {#m}\n:::');
    const circles = await styled('[[circle: #c1 x=-2 y=1 radius=0.15]]\n\n[[circle: #c2 x=2 y=0 radius=0.15]]\n\n[[arrow: #c1 -> #c2, #m]]');
    expect(element(graph, 'm').getLeft()[0]).toBeCloseTo(element(circles, 'm').getLeft()[0], 6);
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
