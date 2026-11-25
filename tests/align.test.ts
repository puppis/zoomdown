import { beforeAll, describe, expect, it } from 'vitest';
import type { Mobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import type { ElementSpec } from '../src/markup/ast';
import { StyledLine, baselineY, shareColumns, textLines } from '../src/markup/text';
import { built, element, installFakeCanvas, slide } from './helpers/slides';
import { LayoutConfig } from '../src/markup/renderer';

beforeAll(installFakeCanvas);

const align = (body: string, attrs = '') => `::: align${attrs ? ` ${attrs}` : ''}\n${body}\n:::`;
const parse = (body: string, steps: 'explicit' | 'sequential' = 'explicit') =>
  new MarkupParser().parse(`::: slide {#s}\n${body}\n:::`, { steps }).slides[0].items.filter((item): item is ElementSpec => 'kind' in item);
/** The lines of a text that have ink, each with where its pen starts. */
const cells = (obj: Mobject) => (obj.getFamily().filter((member) => member instanceof StyledLine && member.runs.some((run) => run.text.trim())) as StyledLine[])
  .map((line) => ({ text: line.runs.map((run) => run.text).join('').trim(), x: line.getLeft()[0] + line.originInset }));
const at = (obj: Mobject, text: string) => cells(obj).find((cell) => cell.text === text)?.x as number;

describe('an align block', () => {
  it('lines up the columns of its rows, whatever stands between them', async () => {
    const s = await slide('', align('a && = && first {#one}\n\nSome text in between, without columns. {#between}\n\nlonger name && = && second {#two}'));
    const [one, two] = [element(s, 'one'), element(s, 'two')];
    expect(at(one, '=')).toBeCloseTo(at(two, '='), 6);
    expect(at(one, 'first')).toBeCloseTo(at(two, 'second'), 6);
    expect(at(one, 'a')).toBeCloseTo(at(two, 'longer name'), 6);
    // The columns are as wide as the widest cell of any row, an em apart.
    expect(at(one, '=') - at(one, 'a')).toBeGreaterThan(element(s, 'two').getWidth() * 0.3);
    expect(cells(element(s, 'between')).map((cell) => cell.text).join(' ')).toContain('without columns');
  });

  it('makes columns of a text of one line, which is two ampersands elsewhere', async () => {
    const s = await slide('', `while (a && b) {#outside}\n\n${align('x && y {#row}\n\n`c && d` && $e$ {#code}')}`);
    expect(cells(element(s, 'outside')).map((cell) => cell.text).join(' ')).toContain('&&');
    expect(cells(element(s, 'row')).map((cell) => cell.text)).toEqual(['x', 'y']);
    expect(cells(element(s, 'code')).map((cell) => cell.text)).toContain('c && d');
  });

  it('starts every row at the same place, with an empty first cell or one whose ink starts later', async () => {
    const s = await slide('', align('name && one {#a}\n\n&& two {#b}\n\n&nbsp;&nbsp;indented && three {#c}'));
    const [a, b, c] = ['a', 'b', 'c'].map((id) => element(s, id));
    expect(b.getLeft()[0]).toBeCloseTo(a.getLeft()[0], 6);
    expect(at(b, 'two')).toBeCloseTo(at(a, 'one'), 6);
    expect(at(c, 'three')).toBeCloseTo(at(a, 'one'), 6);
  });

  it('keeps rows of several lines, and each row its own size and color', async () => {
    const s = await slide('', align('a && = && first \\\\\n&& && and more {#one}\n\nlong name && = && second {#two font_size=14 color=RED}'));
    const [one, two] = [element(s, 'one'), element(s, 'two')];
    expect(at(one, 'and more')).toBeCloseTo(at(one, 'first'), 6);
    expect(at(two, 'second')).toBeCloseTo(at(one, 'first'), 6);
    expect((one.getFamily().find((member) => member instanceof StyledLine) as StyledLine).getFontSize()).not.toBe((two.getFamily().find((member) => member instanceof StyledLine) as StyledLine).getFontSize());
  });

  it('takes a gap of its own', async () => {
    const gap = async (attrs: string) => {
      const s = await slide('', align('a && b {#row}', attrs));
      return at(element(s, 'row'), 'b') - at(element(s, 'row'), 'a');
    };
    expect((await gap('{gap=2}')) - (await gap('{gap=0}'))).toBeCloseTo(2, 9);
  });

  it('shrinks its rows alike when the widest does not fit', async () => {
    const wide = 'w'.repeat(200);
    const s = await slide('width=8', align(`a && b {#one}\n\nc && ${wide} {#two}`));
    const [one, two] = [element(s, 'one'), element(s, 'two')];
    expect(two.getWidth()).toBeLessThanOrEqual(8);
    expect(at(one, 'b') - one.getLeft()[0]).toBeCloseTo(at(two, wide) - two.getLeft()[0], 6);
  });

  it('follows its rows as lines when no blank line is between them, a line with attributes ending its row', async () => {
    const s = await slide('', align('a && one {#a step=1}\nbb && two {#b step=2}\nccc && three\n{#c step=3}\ndddd && four {#d}\n\neeeee && five {#e}'));
    const base = (id: string) => baselineY(element(s, id));
    const interline = (textLines(element(s, 'a')) as NonNullable<ReturnType<typeof textLines>>).interline;
    expect(base('a') - base('b')).toBeCloseTo(interline, 6);
    expect(base('b') - base('c')).toBeCloseTo(interline, 6);
    expect(base('c') - base('d')).toBeCloseTo(interline, 6);
    // A blank line makes a paragraph.
    expect(base('d') - base('e')).toBeCloseTo(new LayoutConfig().paragraphSpacing * interline, 6);
    expect(new Set(['a', 'b', 'c', 'd', 'e'].map((id) => element(s, id).getLeft()[0].toFixed(9))).size).toBe(1);
  });

  it('keeps its lists whole, loose or tight, nested and numbered', async () => {
    const loose = await slide('height=16', align('- one && a {#a step=1}\n\n- two && b {#b step=2}'));
    const tight = await slide('height=16', align('1. one && a {#a step=1}\n2. two && b {#b step=2}\n   - nested && c {#c}'));
    const interline = (textLines(element(tight, 'a')) as NonNullable<ReturnType<typeof textLines>>).interline;
    expect(baselineY(element(tight, 'a')) - baselineY(element(tight, 'b'))).toBeCloseTo(interline, 6);
    expect(baselineY(element(loose, 'a')) - baselineY(element(loose, 'b'))).toBeCloseTo(new LayoutConfig().paragraphSpacing * interline, 6);
    expect(cells(element(tight, 'b')).map((cell) => cell.text)).toEqual(['2.', 'two', 'b']);
    expect(element(tight, 'c').getLeft()[0]).toBeGreaterThan(element(tight, 'b').getLeft()[0] + 0.3);
    expect(at(element(tight, 'a'), 'a')).toBeCloseTo(at(element(tight, 'b'), 'b'), 6);
  });

  it('gives its rows what they do not write themselves', () => {
    const rows = parse(align('a && b\n\nplain text\n\nc && d {step=5 color=BLUE}\n\ne && f', '{step=2 hide=7 color=RED buff=0.1}'));
    expect(rows.map((row) => [row.attributes.step, row.attributes.hide])).toEqual([['2', '7'], [undefined, undefined], ['5', '7'], ['2', '7']]);
    expect(rows.map((row) => row.attributes.color)).toEqual(['RED', undefined, 'BLUE', 'RED']);
    // The space between rows comes after the first.
    expect(rows.map((row) => row.attributes.buff)).toEqual([undefined, undefined, '0.1', '0.1']);
  });

  it('reveals its rows one by one with step=+', () => {
    const rows = parse(align('a && b\n\nc && d\n\ne && f {step=5}', '{step=+}'), 'sequential');
    expect(rows.map((row) => row.attributes.step)).toEqual(['1', '2', '5']);
    expect(() => parse(align('a && b', '{step=+}'))).toThrow(/step=\+/);
  });

  it('is placed by its first row, under which the others flow', async () => {
    const placed = await slide('', `${align('a && b {#a}\n\nc && d {#c}', '{x=2 y=1}')}`);
    expect(element(placed, 'c').getLeft()[0]).toBeCloseTo(element(placed, 'a').getLeft()[0], 6);
    expect(baselineY(element(placed, 'a'))).toBeCloseTo(1, 6);
    expect(baselineY(element(placed, 'c'))).toBeLessThan(1);
    // An x alone is every row's, in the flow.
    const column = await slide('', `Before {#before}\n\n${align('a && b {#a}\n\nc && d {#c}', '{x=2}')}`);
    expect(element(column, 'c').getLeft()[0]).toBeCloseTo(element(column, 'a').getLeft()[0], 6);
    expect(baselineY(element(column, 'c'))).toBeLessThan(baselineY(element(column, 'a')));
    const under = await slide('', `[Before]{#before x=1 y=2}\n\n${align('a && b {#a}\n\nc && d {#c}', '{below:#before left-aligned:#before}')}`);
    expect(element(under, 'a').getLeft()[0]).toBeCloseTo(element(under, 'before').getLeft()[0], 6);
    expect(element(under, 'c').getLeft()[0]).toBeCloseTo(element(under, 'before').getLeft()[0], 6);
  });

  it('takes classes, whose attributes its own win over', () => {
    const source = `::: styles\nloose: buff=0.4 color=RED gap=1\n:::\n\n::: slide {#s}\n${align('a && b\n\nc && d', '{.loose color=BLUE}')}\n:::`;
    const rows = new MarkupParser().parse(source).slides[0].items as ElementSpec[];
    expect(rows.map((row) => [row.attributes.color, row.attributes.buff])).toEqual([['BLUE', undefined], ['BLUE', '0.4']]);
    expect(rows[0].align?.gap).toBe(1);
    expect(() => new MarkupParser().parse(source.replace('.loose', '.missing'))).toThrow(/Unknown style class \.missing/);
  });

  it('holds any element, lists and groups too, and may be in a group or repeat on a slide', async () => {
    const body = [
      align('a && b {#a}\n\n[[circle: #dot radius=0.2]]\n\n$$x^2$$\n\n- item && c {#li}\n- another && d {#li2}\n\n::: {.group #g}\nx && y\nz && w\n:::'),
      align('wide first column && e {#other}'),
      `::: {.group #grouped}\n${align('p && q {#p}\n\nlong && r {#r}')}\n:::`,
    ].join('\n\n');
    const s = await slide('height=20 width=30', body);
    expect(at(element(s, 'li'), 'c')).toBeCloseTo(at(element(s, 'li2'), 'd'), 6);
    expect(at(element(s, 'other'), 'e') - element(s, 'other').getLeft()[0]).toBeGreaterThan(at(element(s, 'a'), 'b') - element(s, 'a').getLeft()[0]);
    expect(at(element(s, 'p'), 'q')).toBeCloseTo(at(element(s, 'r'), 'r'), 6);
    expect(s.elements.has('dot')).toBe(true);
    // Ids made up for its elements are no others'.
    const ids = parse(`one\n\n${body}\n\ntwo`).map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses what it cannot take', () => {
    expect(() => parse(align('no columns here'))).toThrow(/at least one text with &&/);
    expect(() => parse(align('a && b', '{cols=2}'))).toThrow(/An align block takes .* not cols=/);
    expect(() => parse(align('a && b', '{gap=-1}'))).toThrow(/gap must be nonnegative/);
    expect(() => parse('::: aligned\na && b\n:::')).toThrow(/::: align/);
  });

  it('leaves texts outside it as they are', async () => {
    const source = 'This is a && test\nand this && another {#block}';
    const plain = await slide('', source);
    const beside = await slide('', `${source}\n\n${align('a very long first column && b')}`);
    expect(cells(element(beside, 'block')).map((cell) => cell.x)).toEqual(cells(element(plain, 'block')).map((cell) => cell.x));
    expect((await built('::: slide {#s}\na && b {#x}\n:::')).elements.has('x')).toBe(true);
  });
});

describe('shared columns', () => {
  it('are as wide as the widest cell of any row, a gap apart, and shrink by the row that fits least', () => {
    const measure = (lines: number[][], em = 1) => ({ widths: lines[0].map((_, i) => Math.max(...lines.map((line) => line[i] ?? 0))), em, left: 0.1 * em, lines });
    expect(shareColumns([{ measure: measure([[1, 2]]), room: 100 }, { measure: measure([[3], [2]], 2), room: 100 }], null)).toEqual({ starts: [0, 5], left: 0.1, scale: 1 });
    expect(shareColumns([{ measure: measure([[1, 2]]), room: 4 }, { measure: measure([[3, 5]]), room: 100 }], 1)).toEqual({ starts: [0, 4], left: 0.1, scale: 4 / 6 });
  });
});
