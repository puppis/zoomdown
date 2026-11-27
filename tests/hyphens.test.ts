import { describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, hyphenatedNames, normalizeStyles, type SlideItem } from '../src/markup/ast';

const parse = (body: string, styles = '') => new MarkupParser().parse(`${styles ? `::: styles\n${styles}\n:::\n` : ''}::: slide {#s}\n${body}\n:::`);
const byId = (items: SlideItem[], id: string) => items.find((item): item is ElementSpec => item instanceof ElementSpec && item.id === id)!;

describe('attribute names with hyphens', () => {
  it('read as the same names with underscores, everywhere', () => {
    const body = (name: (words: string) => string) => [
      `[[circle: #c x=0 y=0 radius=1 ${name('fill_color')}=RED ${name('fill_opacity')}=0.5 ${name('stroke_width')}=2]]`,
      `[[arrow: #c -> #t, label="x", ${name('label_pos')}=0.3, ${name('tip_length')}=0.2]]`,
      `Text {#t ${name('font_size')}=20 ${name('line_height')}=1.2 right-of=#c}`,
    ].join('\n\n');
    const hyphens = parse(body((words) => words.replace(/_/g, '-')));
    const underscores = parse(body((words) => words));
    expect(JSON.stringify(hyphens)).toBe(JSON.stringify(underscores));
    expect(byId(hyphens.slides[0].items, 'c').attributes).toMatchObject({ fill_color: 'RED', fill_opacity: '0.5', stroke_width: '2' });
    // The relative placements keep their hyphens.
    expect(byId(hyphens.slides[0].items, 't').attributes).toMatchObject({ font_size: '20', 'right-of': '#c' });
  });

  it('in styles, written in the deck or in YAML, and for the deck\'s own directives', () => {
    const styled = parse('[[circle: #c x=0 y=0 radius=1 .ring]]', 'ring: stroke-width=3 fill-color=BLUE');
    expect(byId(styled.slides[0].items, 'c').attributes).toMatchObject({ stroke_width: '3', fill_color: 'BLUE' });
    expect(normalizeStyles({ ring: { 'stroke-width': 3, 'fill-opacity': 0.4 } })).toEqual({ ring: { stroke_width: '3', fill_opacity: '0.4' } });
    // A directive module reads its attributes with underscores.
    expect(byId(parse('[[gauge: #g, fill-color=RED, max-level=3]]').slides[0].items, 'g').attributes).toMatchObject({ fill_color: 'RED', max_level: '3' });
  });

  it('are what messages write; values and what a message quotes keep their underscores', () => {
    expect(() => parse('[[circle: #c x=0 y=0 radius=1 fill_style=plaid]]')).toThrow(/fill-style must be one of/);
    expect(() => parse('Text {font-size=2 font_size=3}')).toThrow(/Duplicate attribute "font-size"/);
    expect(() => parse('Text {font-sise=2}')).toThrow(/Unknown attributes: font-sise/);
    expect(hyphenatedNames('fill_color, then rate=rush_into or [[move_along: …]]; not "my_text", #my_id, .my_class, \\my_macro or images/my_pic.png'))
      .toBe('fill-color, then rate=rush_into or [[move_along: …]]; not "my_text", #my_id, .my_class, \\my_macro or images/my_pic.png');
  });
});
