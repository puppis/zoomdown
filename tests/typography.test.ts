import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Rectangle, VMobject, renderLatexToSVG, type Group, type Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { GroupSpec, type ElementSpec, type InlineSpan } from '../src/markup/ast';
import { LayoutConfig, MarkupRenderer } from '../src/markup/renderer';
import { buildTable } from '../src/markup/table';
import { StyledLine, inlineRows, inlineWords, layoutParagraph, textLines, textResolutionScale, type MathPiece } from '../src/markup/text';
import { CANVAS_CALLS, element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);
beforeEach(() => {
  CANVAS_CALLS.length = 0;
});

const parse = (body: string) => new MarkupParser().parse(`::: slide {#s}\n${body}\n:::`);
const items = (body: string) => parse(body).slides[0].items as ElementSpec[];
/** How many lines a laid-out text has. */
const lineCount = (obj: Mobject) => {
  const lines = textLines(obj) as NonNullable<ReturnType<typeof textLines>>;
  return Math.round((lines.first - lines.last) / lines.interline) + 1;
};
/** The text of a connection with a label. */
const labelOf = (obj: Mobject) => (obj as Group).children[1] as Mobject;
/** One em of prose `points` large, in logical units. */
const em = (points: number) => points / 72;

describe('the label of a connection', () => {
  const GET = 'label="GET wiki/Distributed_computing"';

  it('wraps at label_width', async () => {
    const s = await slide('', `[[arrow: (0.45,-2.32) -> (1.2,-2.32), #a, ${GET}, slanted=true, label_width=6]]\n\n[[arrow: (0.45,-1) -> (1.2,-1), #b, ${GET}, label_width=1.5]]`);
    expect(lineCount(labelOf(element(s, 'a')))).toBe(1);
    // GET, and the address, an unbreakable word shrunk to the width.
    expect(lineCount(labelOf(element(s, 'b')))).toBe(2);
    expect(labelOf(element(s, 'b')).getWidth()).toBeLessThan(1.6);
  });

  it('wraps no sooner than the connection is long, nor than four units', async () => {
    // The label is about 4.7 units long: one line along the 5.5-unit arrow, two along a short one.
    const s = await slide('', `[[arrow: (0.45,-2.32) -> (5.86,-3.27), #long, ${GET}, slanted=true]]\n\n[[arrow: (0,1) -> (1,1), #short, ${GET}]]`);
    expect(lineCount(labelOf(element(s, 'long')))).toBe(1);
    expect(lineCount(labelOf(element(s, 'short')))).toBe(2);
  });

  it('takes label_width only with a label, and positive', () => {
    expect(() => parse('[[arrow: (0,0) -> (1,1), #a, label_width=3]]')).toThrow(/label_width requires a label/);
    expect(() => parse('[[arrow: (0,0) -> (1,1), #a, label=x, label_width=0]]')).toThrow(/label_width must be positive/);
  });
});

describe('the line height', () => {
  const PROSE = 'one two three four five six seven eight {#p width=2}\n\nnext {#q}';

  it('is the font\'s reach plus the line gap by default', async () => {
    const lines = textLines(element(await slide('', PROSE), 'p')) as NonNullable<ReturnType<typeof textLines>>;
    // The fake font reaches 0.8 em above the baseline and 0.2 below.
    expect(lines.interline).toBeCloseTo(em(28) + 0.12, 9);
  });

  it('is layout.lineHeight ems from baseline to baseline when set, paragraphs keeping their spacing in it', async () => {
    const s = await slide('', PROSE, new LayoutConfig({ lineHeight: 0.9 }));
    const p = textLines(element(s, 'p')) as NonNullable<ReturnType<typeof textLines>>;
    expect(lineCount(element(s, 'p'))).toBeGreaterThan(1);
    expect(p.interline).toBeCloseTo(0.9 * em(28), 9);
    // Lines reach their share of it, as in CSS.
    expect(p.ascent + p.descent).toBeCloseTo(p.interline, 9);
    const q = textLines(element(s, 'q')) as NonNullable<ReturnType<typeof textLines>>;
    expect(p.last - q.first).toBeCloseTo(1.5 * p.interline, 6);
  });

  it('is line_height ems for one text, over the layout\'s', async () => {
    const s = await slide('', 'one two three four five six {#p width=2 line_height=1.25}', new LayoutConfig({ lineHeight: 0.9 }));
    expect((textLines(element(s, 'p')) as NonNullable<ReturnType<typeof textLines>>).interline).toBeCloseTo(1.25 * em(28), 9);
  });

  it('is positive, and set on text', () => {
    expect(() => new LayoutConfig({ lineHeight: 0 })).toThrow(/lineHeight must be finite and positive/);
    expect(() => parse('Text {line_height=-1}')).toThrow(/line_height must be positive/);
    expect(() => parse('[[rectangle: #r x=0 y=0 width=1 height=1 line_height=1]]')).toThrow(/Unknown attributes: line_height/);
  });
});

describe('a group\'s font_size, font, color and line_height', () => {
  const GROUP = '::: {.group #g font_size=22.5 font=Mono color=RED line_height=1.1}\nPlain {#a}\n\nOwn {#b font_size=30}\n\n[[rectangle: #r x=0 y=-1 width=1 height=1]]\n\n::: {.group #inner}\nDeep {#c}\n:::\n:::';

  it('pass to the members that take them and do not set their own', () => {
    const group = items(GROUP)[0] as GroupSpec;
    const [a, b, r, inner] = group.items as ElementSpec[];
    expect(a.attributes).toMatchObject({ font_size: '22.5', font: 'Mono', color: 'RED', line_height: '1.1' });
    expect(b.attributes.font_size).toBe('30');
    // A shape takes the color, not the size or line height of text.
    expect(r.attributes.color).toBe('RED');
    expect(r.attributes).not.toHaveProperty('font_size');
    expect(r.attributes).not.toHaveProperty('line_height');
    // And a nested group passes them on.
    expect(((inner as GroupSpec).items[0] as ElementSpec).attributes.font_size).toBe('22.5');
  });

  it('size the members\' text', async () => {
    const s = await slide('', GROUP.replace(' font=Mono', ''));
    const size = (id: string) => (textLines(element(s, id)) as NonNullable<ReturnType<typeof textLines>>).ascent;
    expect(size('b') / size('a')).toBeCloseTo(30 / 22.5, 2);
  });
});

describe('font sizes in a table', () => {
  const rows = [['Header', 'H2', 'H3'], ['Title', 'Some', 'Text']].map((row) => row.map((text): InlineSpan[] => [{ content: text, kind: 'text', bold: false, italic: false, color: null }]));

  it('are the header\'s, else the column\'s, else the table\'s', async () => {
    const sizes = new Map<string, number>();
    await buildTable(rows, { fontSize: 16, color: '#000000', headerFontSize: 20, columnFontSizes: [18, 14, null] }, async (spans, fontSize) => {
      sizes.set(spans.map((s) => s.content).join(''), fontSize);
      const { Rectangle } = await import('manim-web');
      return new Rectangle({ width: 1, height: 0.3 });
    });
    expect(Object.fromEntries(sizes)).toMatchObject({ Header: 20, H2: 20, H3: 20, Title: 18, Some: 14, Text: 16 });
  });

  it('are positive, one for all columns or one each', () => {
    const table = '| a | b |\n| --- | --- |\n| c | d |';
    expect(() => parse(`::: {.element #t header_font_size=20 col_font_size="18 auto"}\n${table}\n:::`)).not.toThrow();
    expect(() => parse(`::: {.element #t col_font_size="18 14 14"}\n${table}\n:::`)).toThrow(/col_font_size gives 3 sizes for 2 columns/);
    expect(() => parse(`::: {.element #t col_font_size=0}\n${table}\n:::`)).toThrow(/col_font_size must be positive sizes or auto/);
    expect(() => parse(`::: {.element #t header_font_size=-2}\n${table}\n:::`)).toThrow(/header_font_size must be positive/);
  });
});

describe('struck and underlined text', () => {
  /** The drawing of a run's text, and the rules drawn at its x. */
  const drawing = (text: string) => {
    const call = CANVAS_CALLS.find((c) => c.method === 'fillText' && c.args[0] === text);
    if (!call) throw new Error(`${text} was not drawn`);
    const [, x, baseline] = call.args as [string, number, number];
    // A line may be drawn more than once (at each density); its rules are the distinct ones.
    const rules = [...new Set(CANVAS_CALLS.filter((c) => c.method === 'fillRect' && Math.abs((c.args[0] as number) - x) < 1e-9).map((c) => JSON.stringify(c.args)))]
      .map((rule) => JSON.parse(rule) as number[]);
    return { baseline, rules, px: Number(/(\d+(?:\.\d+)?)px/.exec(call.font)?.[1]) };
  };

  it('strikes ~~text~~ through the middle of its lowercase letters, spaces between its words too', async () => {
    const spans = new MarkupParser().parseInlineSpans('a ~~read-after-write consistency~~ b', 1);
    expect(spans.filter((s) => s.strike).map((s) => s.content).join('')).toBe('read-after-write consistency');
    await slide('', 'a ~~read-after-write consistency~~ b');
    const { baseline, rules, px } = drawing('read-after-write consistency');
    expect(rules).toHaveLength(1);
    const [, y, width, height] = rules[0];
    // The fake font's x is 0.7 em tall.
    expect(y + height / 2).toBeCloseTo(baseline - 0.35 * px, 6);
    expect(width).toBeCloseTo(0.5 * px * 'read-after-write consistency'.length, 6);
  });

  it('underlines [text]{underline=true} inside a paragraph, which is no link', async () => {
    const spans = new MarkupParser().parseInlineSpans('uses [Erlang and XMPP]{underline=true color=BLUE} today', 1);
    expect(spans.filter((s) => s.underline).map((s) => s.content).join('')).toBe('Erlang and XMPP');
    expect(spans.every((s) => !s.href)).toBe(true);
    await slide('', 'uses [Erlang and XMPP]{underline=true} today');
    const { baseline, rules } = drawing('Erlang and XMPP');
    expect(rules).toHaveLength(1);
    expect(rules[0][1]).toBeGreaterThan(baseline);
  });

  it('takes underline as true or false, and other attributes only on a block of its own', () => {
    expect(() => parse('uses [this]{underline=maybe} today')).toThrow(/underline must be true or false/);
    expect(() => parse('uses [this]{underline=true step=2} today')).toThrow(/other than color and underline must be a block of its own/);
  });
});

describe('spaces written as entities', () => {
  it('keep their width: a no-break space joins words, runs of them do not collapse', () => {
    const words = inlineWords(new MarkupParser().parseInlineSpans('WWW,&nbsp;&nbsp;Wikipedia,&emsp;Google search', 1))[0];
    expect(words.map((word) => word.map((atom) => atom.content).join(''))).toEqual(['WWW,  Wikipedia, Google', ' search']);
  });

  it('widen the text by their own width', async () => {
    const s = await slide('', 'a b {#one}\n\na&nbsp;&nbsp;b {#two}\n\na&nbsp;&nbsp;&nbsp; b {#three}');
    const width = (id: string) => element(s, id).getWidth();
    // Each space is half the font size wide in the fake font; a line's width is whole canvas pixels.
    const pixel = 1 / 96;
    const space = width('two') - width('one');
    expect(space).toBeGreaterThan(0.1);
    expect(Math.abs(width('three') - width('two') - 2 * space)).toBeLessThanOrEqual(2 * pixel);
  });
});

describe('spaces that start a line after a break', () => {
  const indents = (source: string) => new MarkupParser().parseInlineSpans(source, 1).filter((s) => s.content === '\n').map((s) => s.indent ?? 0);
  /** The left edges of a text's lines, from the first. */
  const lefts = (obj: Mobject) => (obj as Group).children.map((line) => (line as Mobject).getLeft()[0]);
  /** One plain space of the fake font at 28 points: half an em. */
  const space = 0.5 * ((28 * 4) / 3 / 96);

  it('are counted after \\\\, a tab to the next multiple of four, and not after a plain line end', () => {
    expect(indents('a \\\\\n    b \\\\\nc \\\\\n\td \\\\\n  \te \\\\\n     \tf')).toEqual([4, 0, 4, 4, 8]);
    const soft = new MarkupParser().parseInlineSpans('a\n    b', 1);
    expect(inlineWords(soft)).toHaveLength(1);
  });

  it('indent the line by as many spaces of the font, and leading &nbsp; keep their width too', async () => {
    const s = await slide('', 'Upon m: \\\\\n    if new: \\\\\n        forward m {#p}\n\nUpon: \\\\\n    if new: {#a}\n\nUpon: \\\\\n&nbsp;&nbsp;&nbsp;&nbsp;if new: {#q}');
    const [first, second, third] = lefts(element(s, 'p'));
    expect(second - first).toBeCloseTo(4 * space, 2);
    expect(third - first).toBeCloseTo(8 * space, 2);
    // No-break spaces have no ink, and the line keeps them: in the fake font they are as wide as spaces.
    expect(Math.abs(element(s, 'a').getWidth() - element(s, 'q').getWidth())).toBeLessThanOrEqual(2 / 96);
  });

  it('keep the lines the indented one wraps to at its indent, within the rest of the width', async () => {
    const s = await slide('', 'First \\\\\n    one two three four five six seven eight {#p width=3}');
    const all = lefts(element(s, 'p'));
    expect(all.length).toBeGreaterThan(2);
    for (const left of all.slice(1)) expect(left - all[0]).toBeCloseTo(4 * space, 2);
    expect(element(s, 'p').getWidth()).toBeLessThanOrEqual(3 + 1e-6);
  });

  it('leave a quarter of the width at least', async () => {
    const s = await slide('', `First \\\\\n${' '.repeat(60)}one two three {#p width=3}`);
    const [first, second] = lefts(element(s, 'p'));
    expect(second - first).toBeCloseTo(0.75 * 3, 6);
  });

  it('are free in a block with && columns, and counted from the text of a list item', () => {
    expect(inlineRows(new MarkupParser().parseInlineSpans('a && b \\\\\n      && c', 1)).map((row) => row.indent)).toEqual([0, 0]);
    const [plain, deeper] = items('- item \\\\\n  next\n- item \\\\\n      deeper') as ElementSpec[];
    expect(plain.spans.find((s) => s.content === '\n')?.indent).toBeUndefined();
    expect(deeper.spans.find((s) => s.content === '\n')?.indent).toBe(4);
  });
});

describe('no-break spaces before a formula at the start of a line', () => {
  /** A stand-in for a formula: a box one unit wide, a third tall, its left at 0 and its bottom on the baseline. */
  const formula = async (): Promise<MathPiece> => {
    const box = new Rectangle({ width: 1, height: 1 / 3 });
    box.shift([0.5, 1 / 6, 0]);
    return { mobject: box, advance: 1, ascent: 1 / 3, descent: 0 };
  };
  const layout = (source: string) => layoutParagraph(new MarkupParser().parseInlineSpans(source, 1), {
    fontSize: 28, maxWidth: 20, defaultColor: '#000000', fontFamily: 'serif', lineGap: 0.12,
  }, formula);
  /**
   * The left of the formula on each line, from the first line's: formulas are measured, as the
   * engine reports where a box is at once (a line of text, only after the tree is drawn).
   */
  const formulas = (obj: Mobject) => {
    const lefts = ((obj as Group).children as Group[]).map((line) => ((line.children as Mobject[]).find((part) => !(part instanceof StyledLine)) as Mobject).getLeft()[0]);
    return lefts.map((left) => left - lefts[0]);
  };
  const lead = 4 * 0.5 * ((28 * 4) / 3 / 96);

  it('indent it as far as before text', async () => {
    const nbsp = '&nbsp;'.repeat(4);
    const indented = formulas(await layout(`$n$ **Notify**: \\\\\n${nbsp}$x \\leftarrow 1$ \\\\\n${nbsp}for all $w$`));
    const plain = formulas(await layout('$n$ **Notify**: \\\\\n$x \\leftarrow 1$ \\\\\nfor all $w$'));
    // Both lines move in by the width of the spaces (those of the fake font are half an em), so
    // a formula starts where the text of the line below does.
    expect(indented[1] - plain[1]).toBeCloseTo(lead, 6);
    expect(indented[2] - plain[2]).toBeCloseTo(lead, 6);
  });

  it('add to an indent by spaces, before a formula as before text', async () => {
    const indented = formulas(await layout('$n$ \\\\\n    &nbsp;$x$ \\\\\n    &nbsp;for $w$'));
    const plain = formulas(await layout('$n$ \\\\\n$x$ \\\\\nfor $w$'));
    const space = 0.5 * ((28 * 4) / 3 / 96);
    expect(indented[1] - plain[1]).toBeCloseTo(5 * space, 6);
    expect(indented[2] - plain[2]).toBeCloseTo(5 * space, 6);
  });
});

describe('space that keeps its width at the start of a list item or a paragraph', () => {
  /** One em of prose `points` large, in logical units, and a character of the fake font, spaces of every kind too: half of it. */
  const emOf = (points: number) => ((points * 4) / 3) / 96;
  /**
   * Where a text starts to draw: the left of its lines of text with ink and of its formulas, in
   * the slide (a line of text reports its edges in its group otherwise, until it is drawn).
   */
  const inkLeft = (obj: Mobject) => Math.min(...obj.getFamily()
    .filter((part) => (part instanceof StyledLine ? part.runs.some((run) => run.text.trim()) : part instanceof VMobject && part.hasOwnPoints()))
    .map((part) => part.getBounds().min.x));
  /** How far in from its marker each item of a list in a group starts to draw. */
  const offsets = (obj: Mobject) => ((obj as Group).children as Group[]).map((item) => {
    const [label, body] = item.children as Mobject[];
    return inkLeft(body) - label.getLeft()[0];
  });

  it('indent a list item by its width, &nbsp;, em and en spaces and a formula of space alone, and not plain spaces after the marker', async () => {
    const s = await slide('', [
      '::: {.group #algorithm x=-7.5 y=3 anchor=top-left width=15 font_size=24}',
      '1. **if** ($a < b$) {',
      '2. &nbsp;&nbsp;&nbsp;&nbsp;forward $M$ to $L_i$',
      '3. } **else** {',
      '4. $\\phantom{MMM}$find $p$',
      '5.   forward $M$ to $R$',
      '6.  forward',
      '7.    forward',
      ':::',
    ].join('\n'));
    const [column, ...rest] = offsets(element(s, 'algorithm'));
    const space = emOf(24) / 2;
    // The phantom takes the room of what it hides, as a formula is wide: by its ink.
    const phantom = (await new MarkupRenderer().mathPiece('MMM', '#000000', 24)).advance;
    expect(phantom).toBeGreaterThan(3 * emOf(24));
    expect(rest.map((offset) => offset - column)).toEqual([4 * space, 0, phantom, 2 * space, space, 0].map((expected) => expect.closeTo(expected, 6)));
  });

  it('keep their width at the start of a paragraph placed by its left, a formula of space alone too', async () => {
    const s = await slide('', [
      'Upon receiving {#plain x=0 y=2 anchor=left font_size=28}',
      '&nbsp;&nbsp;&nbsp;&nbsp;Upon receiving {#kept x=0 y=1 anchor=left font_size=28}',
      '$\\quad$Upon receiving {#quad x=0 y=0 anchor=left font_size=28}',
    ].join('\n\n'));
    const start = inkLeft(element(s, 'plain'));
    expect(inkLeft(element(s, 'kept')) - start).toBeCloseTo(4 * (emOf(28) / 2), 6);
    expect(inkLeft(element(s, 'quad')) - start).toBeCloseTo(emOf(28), 6);
    // Each starts where it is placed, its space first.
    for (const id of ['plain', 'kept', 'quad']) expect(element(s, id).getLeft()[0]).toBeCloseTo(0, 6);
  });

  it('leave a block whose first line starts with ink where it was, its other lines indented as before', async () => {
    const s = await slide('', 'Upon m: \\\\\n&nbsp;&nbsp;if new: \\\\\n$\\quad$forward {#p x=0 y=0 anchor=left font_size=28}');
    const [first, second, third] = ((element(s, 'p') as Group).children as Mobject[]).map(inkLeft);
    expect(element(s, 'p').getLeft()[0]).toBeCloseTo(first, 9);
    expect(second - first).toBeCloseTo(2 * (emOf(28) / 2), 6);
    expect(third - first).toBeCloseTo(emOf(28), 6);
  });

  it('count a plain space after them, so that a phantom under what it hides lines the next word up', async () => {
    const s = await slide('', '$\\Rightarrow$ either \\\\\n$\\phantom{\\Rightarrow}$ or {#p x=0 y=0 anchor=left font_size=28}');
    /** Where the words of a line start: its first line of text with ink. */
    const words = (line: Mobject) => Math.min(...line.getFamily().filter((part) => part instanceof StyledLine && part.runs.some((run) => run.text.trim())).map((part) => part.getBounds().min.x));
    const [either, or] = ((element(s, 'p') as Group).children as Mobject[]).map(words);
    // A line that starts with a formula is placed by its ink, one that starts with text by its
    // canvas, which has 2 pixels around the ink; the lead takes the place of the text's ink.
    expect(or - either).toBeCloseTo(2 / (96 * textResolutionScale()), 6);
  });

  it('gives a phantom the width of what it hides, other space the width it is typeset to, and a formula with ink the width of its ink as before', async () => {
    const renderer = new MarkupRenderer();
    const typeset = async (latex: string) => ((await renderLatexToSVG(latex, { displayMode: true })).width / 1000) * emOf(24);
    const advance = async (latex: string) => (await renderer.mathPiece(latex, '#000000', 24)).advance;
    for (const latex of ['\\phantom{MMM}', '\\hphantom{x+y}', '\\quad', '\\hspace{2em}']) expect((await renderer.mathPiece(latex, '#000000', 24)).blank, latex).toBe(true);
    expect(await advance('\\phantom{MMM}')).toBeCloseTo(await advance('MMM'), 9);
    expect(await advance('\\hphantom{x+y}')).toBeCloseTo(await advance('x+y'), 9);
    expect(await advance('\\phantom{\\Rightarrow}')).toBeCloseTo(await advance('\\Rightarrow'), 9);
    for (const latex of ['\\quad', '\\hspace{2em}']) expect(await advance(latex), latex).toBeCloseTo(await typeset(latex), 9);
    expect(await advance('\\quad')).toBeCloseTo(emOf(24), 9);
    const ink = await renderer.mathPiece('MMM', '#000000', 24);
    expect(ink.blank).toBeUndefined();
    expect(ink.advance).toBeCloseTo(ink.mobject.getWidth(), 9);
    expect(ink.advance).toBeLessThan(await typeset('MMM'));
  });
});
