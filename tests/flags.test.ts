import { beforeAll, describe, expect, it } from 'vitest';
import { BARE_FLAGS, flagName, normalizeStyles, parseAttributes } from '../src/markup/ast';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder } from '../src/markup/slide';
import { Presenter, PresenterConfig } from '../src/runtime';
import { installFakeCanvas } from './helpers/slides';

beforeAll(installFakeCanvas);

describe('flags of several words', () => {
  it('are written with hyphens or underscores alike', () => {
    for (const flag of BARE_FLAGS) {
      const hyphens = flag.replace(/_/g, '-');
      expect(parseAttributes(`{${hyphens}}`, 1)).toEqual({ [flag]: 'true' });
      expect(parseAttributes(`{${hyphens}=false}`, 1)).toEqual({ [flag]: 'false' });
      expect(parseAttributes(`{${flag}}`, 1)).toEqual({ [flag]: 'true' });
    }
    expect(flagName('left-aligned')).toBe('left-aligned');
    expect(normalizeStyles({ deco: { 'focus-only': true } })).toEqual({ deco: { focus_only: 'true' } });
  });

  it('are one flag in either spelling', () => {
    expect(() => parseAttributes('{only-this only_this=false}', 1)).toThrow(/Duplicate attribute "only-this"/);
  });

  it('reach slides and includes', () => {
    const document = new MarkupParser().parse('::: slide {#a}\n# A\n\n[[include: #b x=0 y=0 width=4 only-this, start-here, skip-return]]\n:::\n\n::: slide {#b preview}\n# B\n:::');
    const [a, b] = document.slides;
    expect((a.items[1] as { attributes: Record<string, string> }).attributes).toMatchObject({ only_this: 'true', start_here: 'true', skip_return: 'true' });
    expect(b.attributes.preview).toBe('true');
  });

  it('that say how a child is left go on its include, not on the slide', () => {
    const deck = (attrs: string) => () => new MarkupParser().parse(`::: slide {#a}\n[[include: #b]]\n:::\n\n::: slide {#b ${attrs}}\n# B\n:::`);
    expect(deck('skip-return')).toThrow(/^Line 5: skip-return goes on the include that places this slide, as in \[\[include: #b skip-return\]\], not on the slide itself$/);
    expect(deck('force_return=false')).toThrow(/force-return goes on the include that places this slide, as in \[\[include: #b force-return\]\]/);
    const subslide = new MarkupParser().parse('::: slide {#a}\n[[subslide: Orbit x=0 y=0 width=4 force-return]]\n:::');
    expect((subslide.slides[0].items[0] as { attributes: Record<string, string> }).attributes.force_return).toBe('true');
  });

  it('say where they go when they are written on an element', () => {
    const deck = (body: string) => () => new MarkupParser().parse(`::: slide {#a}\n${body}\n:::`);
    expect(deck('# Title {step=-1 only-this}')).toThrow(/^Line 2: Unknown attributes: only-this \(only-this goes on a slide, as in ::: slide \{#id only-this\}, or on the include or subslide that places it\)$/);
    expect(deck('Some text {#t skip_return nonsense=2}')).toThrow(/Unknown attributes: nonsense, skip-return \(skip-return goes on the include or subslide that places a slide, as in \[\[include: #id skip-return\]\]\)$/);
    expect(deck('Some text {#t nonsense=2}')).toThrow(/^Line 2: Unknown attributes: nonsense$/);
    expect(deck('[[include: #b x=0 y=0 width=3 focus-only]]')).toThrow(/Unknown attributes: focus-only$/);
  });

  it('are named with hyphens by every message, in whichever spelling they are written', async () => {
    const slide = (body: string, attrs = '') => `::: slide {#a ${attrs}}\n${body}\n:::`;
    const pair = (a: string, b: string) => `::: slide {#a ${a}}\nA\n\n[[include: #b x=0 y=0 width=3]]\n:::\n\n::: slide {#b ${b}}\nB\n:::`;
    const spellings = ['only_this', 'start_here', 'skip_return', 'force_return', 'focus_only'].flatMap((flag) => [flag, flag.replace(/_/g, '-')]);
    const sources = spellings.flatMap((flag) => [
      slide(`Text {#t ${flag} ${flag}}`), slide(`Text {#t ${flag}=maybe}`), slide('Text', `${flag}=maybe`), slide(`[[circle: #c ${flag}=maybe radius=1]]`),
      slide(`::: {.group #g}\nText {${flag}}\n:::`), slide(`::: align {${flag}}\na && b\n:::`), slide(`::: timeline {${flag} processes="p q"}\np@0 -> q@1\n:::`),
      slide(`::: graph {${flag}}\nA (0,0)\n:::`), slide(`::: timeline {processes="p q"}\np: name {${flag}}\n:::`), slide(`::: notes {${flag}}\nsay\n:::`),
      `${slide(`::: tiles {${flag}}\n[[include: #b]]\n:::`)}\n\n::: slide {#b}\nB\n:::`, slide(`[[animate: #t x=2 step=1 ${flag}]]\n\nText {#t}`),
    ]);
    sources.push(slide('Text', 'skip_return force_return'), pair('start_here', 'start_here'), slide('Text {#t focus_only step=1}'));
    let refused = 0;
    for (const source of sources) {
      try {
        new MarkupParser().parse(source);
      } catch (error) {
        refused += 1;
        expect((error as Error).message, source).not.toMatch(/start_here|only_this|skip_return|force_return|focus_only/);
      }
    }
    expect(refused).toBeGreaterThan(80);
    // What is found when the deck is built names them too.
    const root = new SlideBuilder().build(new MarkupParser().parse(pair('only_this', 'start_here')));
    await expect(new Presenter({ config: new PresenterConfig({}) }).prepare(root)).rejects.toThrow(/The starting slide .* \(start-here; startHere in code\) is left out by only-this/);
  });

  it('leave the arguments of a snippet as they are written', () => {
    expect(parseAttributes('only-this=yes', 1, { css: false })).toEqual({ 'only-this': 'yes' });
  });
});
