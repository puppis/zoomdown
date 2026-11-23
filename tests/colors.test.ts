import { afterEach, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, deckColor, gradientColor, parseColor, setDeckColors } from '../src/markup/ast';
import { preprocessLatex } from '../src/markup/latex';
import { markupDeck, parseTheme } from '../src/markup/deck';
import { parseSettings } from '../src/markup/frontmatter.mjs';
import type { MarkupSlide } from '../src/markup/slide';

afterEach(() => setDeckColors(undefined));

describe('named colors', () => {
  it('are what color attributes, inline spans and gradients name, before the engine\'s names', () => {
    setDeckColors({ ok: '#1e7d32', bad: 'rgb(192, 57, 43)', red: '#ff0000', ink: 'BLUE_E', faded: 'ok' });
    expect(parseColor('ok')).toBe('#1E7D32');
    expect(parseColor(' OK ')).toBe('#1E7D32');
    expect(parseColor('bad')).toBe(parseColor('#c0392b'));
    // A deck's name wins over the engine's, and may name the engine's or an earlier one of its own.
    expect(parseColor('red')).toBe('#FF0000');
    expect(parseColor('ink')).toBe(parseColor('BLUE_E'));
    expect(parseColor('faded')).toBe('#1E7D32');
    expect(gradientColor('ok').color).toBe('#1E7D32');
    const document = new MarkupParser().parse('::: slide {#s}\n[x]{#x color=ok}\n\nsome [y]{color=bad} {#t}\n\n[[circle: #c x=0 y=0 radius=1 fill_color=faded label="[z]{color=ok}"]]\n:::');
    const text = document.slides[0].items.find((item) => item instanceof ElementSpec && item.id === 't') as ElementSpec;
    expect(text.spans.find((span) => span.content === 'y')?.color).toBe('bad');
  });

  it('are what formulas name in \\textcolor and \\color', () => {
    setDeckColors({ ok: '#1e7d32' });
    expect(preprocessLatex('\\textcolor{ok}{x}')).toContain('1E7D32');
    expect(preprocessLatex('{\\color{ok} y}')).toContain('1E7D32');
  });

  it('are checked, and replaced by those of the next deck', () => {
    expect(() => setDeckColors({ '1st': '#000000' })).toThrow(/A color's name/);
    expect(() => setDeckColors({ ok: 'not a color' })).toThrow(/The color ok is not a color/);
    setDeckColors({ ok: '#1e7d32' });
    setDeckColors({ bad: '#c0392b' });
    expect(deckColor('ok')).toBeUndefined();
    expect(() => new MarkupParser().parse('::: slide {#s}\n[x]{color=ok}\n:::')).toThrow(/color/i);
  });

  it('come from the front matter, a theme, or the options', async () => {
    expect(parseSettings("colors: { ok: '#1e7d32' }", 'x').colors).toEqual({ ok: '#1e7d32' });
    expect(() => parseSettings('colors: { ok: 3 }', 'x')).toThrow(/colors maps names to colors/);
    expect(parseTheme('colors: ok=#1e7d32 bad=#c0392b\nnote: color=ok').colors).toEqual({ ok: '#1e7d32', bad: '#c0392b' });
    const source = "---\ncolors: { ok: '#1e7d32' }\n---\n::: slide {#a}\n[x]{#x color=ok}\n\n$\\textcolor{ok}{y}$ {#y}\n:::";
    const slide = (await markupDeck({ source }).deck()) as MarkupSlide;
    // Validated with the deck's colors: an unknown color would have stopped the deck.
    expect(slide.spec.items.some((item) => item instanceof ElementSpec && item.attributes.color === 'ok')).toBe(true);
    expect(deckColor('ok')).toBe('#1E7D32');
  });
});
