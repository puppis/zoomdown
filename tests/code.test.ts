import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { ElementSpec, MarkupError } from '../src/markup/ast';
import { UnclosedFormula, codeFormulas, codeThemeFor, DARK_CODE_THEME, LIGHT_CODE_THEME, languageFor, tokenizeCode } from '../src/markup/code';
import { languageMath, registerLanguage } from '../src/markup/tokens';
import { StyledLine, textLines } from '../src/markup/text';
import { CANVAS_CALLS, element, installFakeCanvas, slide } from './helpers/slides';

const classes = (line: { text: string; cls: string }[]) => line.filter((t) => t.text.trim()).map((t) => `${t.cls}:${t.text.trim()}`);

describe('code fences in markup', () => {
  it('parses the language and attributes of a fence', () => {
    const source = '::: slide {#a}\n```python {#listing x=-7 y=3 step=2 font_size=20}\ndef f(x):\n    return x  # done\n```\n:::';
    const document = new MarkupParser().parse(source);
    const element = document.slides[0].items[0] as ElementSpec;
    expect(element.kind).toBe('code');
    expect(element.attributes).toEqual({ lang: 'python', id: 'listing', x: '-7', y: '3', step: '2', font_size: '20' });
    expect(element.source).toBe('def f(x):\n    return x  # done');
  });

  it('keeps directives and containers inside fences verbatim', () => {
    const source = '::: slide {#a}\n```markdown\n::: slide {#b}\n[[include: #c]]\n:::\n```\n\nAfter. {#after}\n:::';
    const document = new MarkupParser().parse(source);
    expect(document.slides).toHaveLength(1);
    const [code, text] = document.slides[0].items as ElementSpec[];
    expect(code.kind).toBe('code');
    expect(code.source).toBe('::: slide {#b}\n[[include: #c]]\n:::');
    expect(text.id).toBe('after');
  });

  it('accepts code inside .element containers and rejects stray fence info', () => {
    const wrapped = '::: slide {#a}\n::: {.element #w step=1}\n```json\n{"a": 1}\n```\n:::\n:::';
    const element = new MarkupParser().parse(wrapped).slides[0].items[0] as ElementSpec;
    expect(element.kind).toBe('code');
    expect(element.attributes).toEqual({ lang: 'json', id: 'w', step: '1' });
    expect(() => new MarkupParser().parse('::: slide {#a}\n```python oops\nx\n```\n:::')).toThrow(MarkupError);
    expect(() => new MarkupParser().parse('::: slide {#a}\n```python {play=loop}\nx\n```\n:::')).toThrow(/Unknown attributes/);
  });
});

describe('tokenizeCode', () => {
  it('classifies Python comments, strings, keywords and numbers', () => {
    const [line] = tokenizeCode('return "a#b"  # 3 items', 'py');
    expect(classes(line)).toEqual(['keyword:return', 'string:"a#b"', 'comment:# 3 items']);
    const [, second] = tokenizeCode('x = 1\nif x: pass', 'python');
    expect(classes(second)).toEqual(['keyword:if', 'plain:x:', 'keyword:pass']);
  });

  it('spans block comments and template strings across lines', () => {
    const lines = tokenizeCode('/* one\ntwo */ const n = 0x1F;', 'ts');
    expect(lines[0][0].cls).toBe('comment');
    expect(lines[1][0].cls).toBe('comment');
    expect(classes(lines[1])).toContain('keyword:const');
    expect(classes(lines[1])).toContain('number:0x1F');
  });

  it('highlights the slide dialect', () => {
    const lines = tokenizeCode('::: slide {#id width=20}\n[[arrow: #a -> #b, label="x", step=2]]\n# Title {y=3}\nSee $x$ and `code`.', 'markdown');
    expect(classes(lines[0])).toEqual(['directive:::: slide', 'attribute:{#id width=', 'number:20', 'attribute:}']);
    expect(lines[1][0]).toEqual({ text: '[[arrow:', cls: 'directive' });
    expect(classes(lines[1])).toContain('string:"x"');
    expect(lines[2][0].bold).toBe(true);
    expect(classes(lines[3])).toEqual(['plain:See', 'string:$x$', 'plain:and', 'type:`code`', 'plain:.']);
  });

  it('handles JSON keys, shell flags, TeX commands and tags', () => {
    expect(classes(tokenizeCode('{"markup": "slides.md", "n": 2}', 'json')[0])).toEqual(['plain:{', 'attribute:"markup"', 'plain::', 'string:"slides.md"', 'plain:,', 'attribute:"n"', 'plain::', 'number:2', 'plain:}']);
    expect(classes(tokenizeCode('node bin/x.mjs build slides.md -o out --one-file', 'bash')[0])).toContain('attribute:--one-file');
    expect(classes(tokenizeCode('\\frac{a}{b} % half', 'latex')[0])).toEqual(['keyword:\\frac', 'plain:{a}{b}', 'comment:% half']);
    expect(classes(tokenizeCode('<svg width="10"/>', 'svg')[0])).toEqual(['keyword:<svg', 'attribute:width', 'plain:=', 'string:"10"', 'keyword:/>']);
    expect(languageFor('C++')).toBe('clike');
    expect(languageFor('whatever')).toBe('text');
    expect(tokenizeCode('a b', 'text')[0].every((t) => t.cls === 'plain')).toBe(true);
  });

  it('chooses a theme from the text color', () => {
    expect(codeThemeFor('#FFFFFF')).toBe(DARK_CODE_THEME);
    expect(codeThemeFor('#000000')).toBe(LIGHT_CODE_THEME);
  });
});

describe('formulas in a listing', () => {
  beforeAll(() => {
    installFakeCanvas();
    registerLanguage('pseudo-math', { keywords: ['while', 'do', 'in'], lineComment: ['//'], math: true });
  });
  beforeEach(() => {
    CANVAS_CALLS.length = 0;
  });
  const options = { defaultColor: '#000000', theme: LIGHT_CODE_THEME };
  /** The text a listing draws, line by line pieces in the order drawn. */
  const drawnText = () => CANVAS_CALLS.filter((call) => call.method === 'fillText').map((call) => call.args[0] as string);

  it('are on in a profile with math and off elsewhere', () => {
    expect(languageMath('pseudo-math')).toBe(true);
    expect(languageMath('python')).toBe(false);
    expect(languageMath('')).toBe(false);
  });

  it('are each $…$ of a line, in the color of the code it starts in, a comment\'s in a comment', () => {
    const source = 'while $i < n$ do  // $O(n)$ steps\n  pay \\$5 and $$ more\n  x := $\\$y$ and again $i < n$';
    expect(codeFormulas(source, 'pseudo-math', options)).toEqual([
      { latex: 'i < n', color: '#000000' },
      { latex: 'O(n)', color: LIGHT_CODE_THEME.comment },
      { latex: '\\$y', color: '#000000' },
    ]);
  });

  it('need their $ closed on the line', () => {
    expect(() => codeFormulas('x := 1\nx := $a + 1', 'pseudo-math', options)).toThrow(UnclosedFormula);
    try {
      codeFormulas('x := 1\nx := $a + 1', 'pseudo-math', options);
    } catch (error) {
      expect((error as UnclosedFormula).lineIndex).toBe(1);
    }
  });

  it('take math=true or math=false on a fence', () => {
    const parse = (info: string) => new MarkupParser().parse(`::: slide {#a}\n\`\`\`${info}\nx\n\`\`\`\n:::`);
    expect(() => parse('python {math=true}')).not.toThrow();
    expect(() => parse('python {math=maybe}')).toThrow(/math must be true or false/);
  });

  it('are typeset between the runs of code, and a dollar escaped is one', async () => {
    await slide('', '```pseudo-math {#p}\nwhile $i < n$ do\n  pay \\$5\n```');
    const drawn = drawnText();
    expect(drawn).toContain('while');
    expect(drawn).toContain('do');
    expect(drawn.some((text) => text.includes('$5'))).toBe(true);
    expect(drawn.some((text) => text.includes('i < n') || text.includes('$i'))).toBe(false);
  });

  it('set the code after a formula past it', async () => {
    const s = await slide('', '```pseudo-math {#p}\nwhile $i < n$ do\n```');
    const line = (element(s, 'p') as Mobject).children[0] as Mobject;
    const [before, formula, after] = line.children as [StyledLine, Mobject, StyledLine];
    expect(before).toBeInstanceOf(StyledLine);
    expect(after).toBeInstanceOf(StyledLine);
    // Every character is half an em wide in the fake font, and a line's canvas has two pixels of padding.
    const call = CANVAS_CALLS.find((c) => c.method === 'fillText' && c.args[0] === 'while');
    const em = Number(/(\d+(?:\.\d+)?)px/.exec(call?.font ?? '')?.[1]) / (96 * 2);
    const padding = 2 / (96 * 2);
    expect(formula.getLeft()[0] - line.getLeft()[0]).toBeCloseTo('while '.length * 0.5 * em + padding, 2);
    expect(line.getRight()[0] - formula.getRight()[0]).toBeCloseTo(' do'.length * 0.5 * em + padding, 2);
  });

  it('keep the pitch of the lines when they fit the font', async () => {
    const pitch = async (code: string) => textLines(element(await slide('', `\`\`\`pseudo-math {#p}\n${code}\n\`\`\``), 'p'))?.interline;
    expect(await pitch('x := $x$\nz := 1')).toBeCloseTo(await pitch('x := x\nz := 1') as number, 6);
  });

  it('stay code with math=false, and come with math=true in any language', async () => {
    await slide('', '```pseudo-math {#p math=false}\nwhile $i < n$ do\n```');
    expect(drawnText().some((text) => text.includes('$i'))).toBe(true);
    CANVAS_CALLS.length = 0;
    await slide('', '```python {#p math=true}\nfor i in range($n$):\n```');
    expect(drawnText().some((text) => text.includes('$'))).toBe(false);
  });

  it('set ~…~ and ^…^ as a subscript and a superscript, as in text', async () => {
    await slide('', '```pseudo-math {#p}\nx~i~ := y^2^ + a ^ b\nwait ~5 ms, \\~a~ and \\^b^\n```');
    const font = (text: string) => {
      const call = CANVAS_CALLS.find((c) => c.method === 'fillText' && c.args[0] === text);
      if (!call) throw new Error(`${text} was not drawn`);
      return { px: Number(/(\d+(?:\.\d+)?)px/.exec(call.font)?.[1]), baseline: call.args[2] as number };
    };
    const x = font('x');
    expect(font('i').px).toBeCloseTo(0.7 * x.px, 6);
    expect(font('i').baseline - x.baseline).toBeCloseTo(0.15 * x.px, 6);
    expect(x.baseline - font('2').baseline).toBeCloseTo(0.363 * x.px, 6);
    // An operator with spaces around it, a tilde before a space and escaped markers stay code.
    const drawn = drawnText().join('');
    expect(drawn).toContain('^');
    expect(drawn).toContain('~5');
    expect(drawn).toContain('~a~');
    expect(drawn).toContain('^b^');
  });

  it('leave ~ and ^ as code with math=false', async () => {
    await slide('', '```pseudo-math {#p math=false}\nx~i~ := y^2^\n```');
    const drawn = drawnText().join('');
    expect(drawn).toContain('x~i~');
    expect(drawn).toContain('y^2^');
  });

  it('report a $ left open with the line of the listing it is on', async () => {
    await expect(slide('', '```pseudo-math {#p}\nx := 1\nx := $a + 1\n```')).rejects.toThrow(/Line 4: A \$ opens a formula/);
  });
});
