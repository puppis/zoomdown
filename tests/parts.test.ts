import { describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec } from '../src/markup/ast';

const parse = (styles: string, body: string, children = '') =>
  new MarkupParser().parse(`${styles ? `::: styles\n${styles}\n:::\n` : ''}::: slide {#s}\n${body}\n:::\n${children}`);
const elements = (styles: string, body: string, children = '') =>
  parse(styles, body, children).slides.find((s) => s.id === 's')!.items.filter((item): item is ElementSpec => item instanceof ElementSpec);
const role = (list: ElementSpec[], kind: string) => list.filter((item) => item.kind === kind);

describe('parts take prefixed attributes, blocks name their parts\' classes (rule C)', () => {
  it('pass message_, event_, process_ and lifeline_ attributes to a timeline\'s parts, under the line\'s own', () => {
    const list = elements('', '::: timeline {processes="p q" length=4 message_buff=0.09 event_radius=0.12 process_font_size=20 lifeline_color=GRAY}\np@1 -> q@2\np@2 -> q@3 {buff=0.2}\nq@3\n:::');
    expect(role(list, 'arrow').map((item) => item.attributes.buff)).toEqual(['0.09', '0.2']);
    expect(role(list, 'dot')[0].attributes.radius).toBe('0.12');
    expect(role(list, 'text').map((item) => item.attributes.font_size)).toEqual(['20', '20']);
    expect(role(list, 'line').every((item) => item.attributes.color === 'GRAY')).toBe(true);
  });

  it('pass node_ and edge_ attributes to a graph\'s parts', () => {
    const list = elements('', '::: graph {node_radius=0.2 node_fill_color=WHITE edge_stroke_width=3}\nA (0,0)\nB (1,0) {radius=0.4}\nA -> B\n:::');
    expect(role(list, 'circle').map((item) => item.attributes.radius)).toEqual(['0.2', '0.4']);
    expect(role(list, 'circle')[0].attributes.fill_color).toBe('WHITE');
    expect(role(list, 'arrow')[0].attributes.stroke_width).toBe('3');
  });

  it('give the classes a block names in place of the role\'s style', () => {
    const styles = 'node: color=BLUE\nplace: radius=0.3 color=BLACK\narc: stroke_width=2\nedge: color=RED';
    const list = elements(styles, '::: graph {node=place edge=arc}\np (0,0)\nt (1,0) rectangle {width=0.2 height=0.8}\np -> t\n:::\n\n::: graph\nq (3,0)\n:::');
    const [p, t, q] = list.filter((item) => item.kind === 'circle' || item.kind === 'rectangle');
    expect(p.attributes).toMatchObject({ radius: '0.3', color: 'BLACK' });
    // A class gives each kind what it takes: no radius on the rectangle.
    expect(t.attributes).not.toHaveProperty('radius');
    expect(role(list, 'arrow')[0].attributes).toMatchObject({ stroke_width: '2' });
    expect(role(list, 'arrow')[0].attributes).not.toHaveProperty('color');
    // A block that names no class leaves its parts the role's style.
    expect(q.attributes.color).toBe('BLUE');
  });

  it('pass verdict_ attributes from an include, and from tiles to every verdict', () => {
    const children = '::: slide {#a}\nA\n:::\n::: slide {#b}\nB\n:::';
    const one = elements('note: font_size=20', '[[include: #a x=0 y=0 width=3 verdict="seen" verdict_width=4.4 verdict_at=left:#a.right verdict_class=note]]', children.split('\n').slice(0, 3).join('\n'));
    expect(one[0].attributes).toMatchObject({ width: '4.4', at: 'left:#a.right', font_size: '20' });
    expect(one[0].attributes).not.toHaveProperty('below');
    const tiles = elements('', '::: tiles {width=3 verdict_width=4}\n[[include: #a verdict="x"]]\n[[include: #b verdict="y" verdict_width=5]]\n:::', children);
    expect(tiles.map((item) => item.attributes.width)).toEqual(['4', '5']);
    expect(() => parse('', '[[include: #a verdict_width=4]]', children.split('\n').slice(0, 3).join('\n'))).toThrow(/verdict_width requires a verdict/);
  });

  it('refuse what no part takes', () => {
    expect(() => parse('', '::: graph {vertex_radius=1}\nA (0,0)\n:::')).toThrow(/A graph takes .* not vertex_radius=/);
    expect(() => parse('', '::: timeline {processes="p" length=2 message_radius=1}\np@0 -> p@1\n:::')).toThrow(/Unknown attributes: radius/);
  });
});

