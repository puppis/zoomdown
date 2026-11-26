import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, IncludeSpec, type SlideItem } from '../src/markup/ast';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const parse = (styles: string, body: string) => new MarkupParser().parse(`::: styles\n${styles}\n:::\n::: slide {#s}\n${body}\n:::`);
const byId = (items: SlideItem[], id: string) => items.find((item): item is ElementSpec => item instanceof ElementSpec && item.id === id)!;

describe('styles fill in only what fits (rule A)', () => {
  it('ignore a style\'s buff on a line placed by at=', async () => {
    const styles = 'v: color=green buff=0.1';
    const body = 'First block {x=-7 y=4}\n\nA line placed by a point {#l .v at=(0,0)}';
    expect(byId(parse(styles, body).slides[0].items, 'l').attributes).toEqual({ id: 'l', color: 'green', at: '(0,0)' });
    const built = await slide('', body.replace('.v ', ''));
    expect(element(built, 'l').getCenter()[0]).toBeCloseTo(0, 9);
    // The same style spaces a block that flows.
    expect(byId(parse(styles, 'First {#a}\n\nSecond {#b .v}').slides[0].items, 'b').attributes.buff).toBe('0.1');
  });

  it('give each kind only what it takes, from classes as from roles', () => {
    const styles = 'big: radius=0.3 width=0.4 height=0.4 font_size=30';
    const items = parse(styles, '::: graph {#g}\np (0,0) big\nq (2,0) rectangle big\np -> q\n:::\n\n[[dot: #d x=4 y=0 .big]]\n\nText {#t .big}').slides[0].items;
    expect(byId(items, 'g.p').attributes).toMatchObject({ radius: '0.3' });
    expect(byId(items, 'g.p').attributes).not.toHaveProperty('width');
    expect(byId(items, 'g.q').attributes).toMatchObject({ width: '0.4', height: '0.4' });
    expect(byId(items, 'g.q').attributes).not.toHaveProperty('radius');
    expect(byId(items, 'd').attributes).toMatchObject({ radius: '0.3' });
    expect(byId(items, 'd').attributes).not.toHaveProperty('height');
    expect(byId(items, 't').attributes).toMatchObject({ font_size: '30' });
    expect(byId(items, 't').attributes).not.toHaveProperty('radius');
    // An anchor the kind has not: a baseline on a shape.
    expect(byId(parse('base: anchor=left-baseline', '[[circle: #c x=0 y=0 radius=1 .base]]').slides[0].items, 'c').attributes).not.toHaveProperty('anchor');
  });

  it('let the element\'s own placement win, then its classes, then its roles', () => {
    const items = parse('placed: x=3 y=2\nhung: at=center:#LAST\nshifted: dy=-0.1\nbody: y=-4', [
      'Head {#h x=0 y=0}',
      '',
      '[a]{#a .placed below:#h}',
      '',
      '[b]{#b .hung x=1}',
      '',
      '[c]{#c .placed .hung}',
      '',
      '[d]{#d .shifted}',
      '',
      '[e]{#e x=2}',
    ].join('\n')).slides[0].items;
    // A direction places it: the style's coordinates are dropped.
    expect(byId(items, 'a').attributes).toEqual({ id: 'a', below: '#h' });
    // A coordinate of its own: the style's at= is dropped, the role's y fills the free axis.
    expect(byId(items, 'b').attributes).toEqual({ id: 'b', x: '1', y: '-4' });
    // Two classes: at= places it entirely, so the coordinates give way.
    expect(byId(items, 'c').attributes).toEqual({ id: 'c', at: 'center:#b' });
    // dy needs something that places the element; the role's y does.
    expect(byId(items, 'd').attributes).toEqual({ id: 'd', y: '-4', dy: '-0.1' });
    expect(byId(items, 'e').attributes).toEqual({ id: 'e', x: '2', y: '-4' });
  });

  it('keep the conflicts written on the element itself an error', () => {
    expect(() => parse('v: color=green', '[x]{.v at=(0,0) buff=0.1}')).toThrow(/at= cannot be combined with buff: buff is the distance that a direction \(below, .* use dx and dy$/);
    expect(() => parse('v: color=green', 'A {#a}\n\n[x]{y=1 below:#a}')).toThrow(/below and y cannot be combined: each sets the vertical position\. Keep one of them$/);
  });

  it('fit includes as elements', () => {
    const document = new MarkupParser().parse('::: styles\ntile: width=3 buff=0.4 radius=2\n:::\n::: slide {#s}\n[[include: #a at=(0,0) .tile]]\n:::\n::: slide {#a}\nA\n:::');
    const tile = document.slides.find((s) => s.id === 's')!.items.find((item): item is IncludeSpec => item instanceof IncludeSpec)!;
    expect(tile.attributes).toEqual({ at: '(0,0)', width: '3' });
  });
});
