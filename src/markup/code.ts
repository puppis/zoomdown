/**
 * Verbatim code listings for markup slides.
 *
 * `tokenizeCode` classifies comments, strings, numbers, keywords, types,
 * directives and attributes for a handful of common languages (plus this
 * project's own slide dialect); `layoutCode` stacks the resulting monospace
 * lines into one group whose first baseline is exposed through
 * `markupBaselineFraction`, like prose paragraphs.
 */
import { Group, type Mobject } from 'manim-web';
import { MONOSPACE, StyledLine, markLines, type MathPiece, type TextRun } from './text';
import { tokenizeCode, type CodeToken, type TokenClass } from './tokens';

export { tokenizeCode, languageFor } from './tokens';
export type { TokenClass, CodeToken } from './tokens';

/** Token colors by class, as `code-themes/<name>.json` gives them. */
export type CodeTheme = Partial<Record<TokenClass, string>>;

/** Token colors for light text on a dark background. */
export const DARK_CODE_THEME: CodeTheme = {
  keyword: '#569CD6', type: '#4EC9B0', string: '#CE9178', comment: '#6A9955', number: '#B5CEA8', directive: '#DCDCAA', attribute: '#9CDCFE',
};

/** Token colors for dark text on a light background. */
export const LIGHT_CODE_THEME: CodeTheme = {
  keyword: '#0000FF', type: '#267F99', string: '#A31515', comment: '#008000', number: '#098658', directive: '#795E26', attribute: '#001080',
};

/** Pick the theme that contrasts with the slide's text color (and hence its background). */
export function codeThemeFor(textColor: string): CodeTheme {
  const hex = textColor.replace('#', '');
  if (hex.length < 6) return DARK_CODE_THEME;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? DARK_CODE_THEME : LIGHT_CODE_THEME;
}

/** How a listing is laid out: font size, width, color, line gap, family and theme. */
export interface CodeLayoutOptions {
  fontSize: number;
  maxWidth: number;
  defaultColor: string;
  lineGap: number;
  /** CSS font family; defaults to the platform monospace stack. */
  fontFamily?: string;
  theme?: CodeTheme | null;
  /**
   * The typeset formula of a `$…$` of the listing in a color, as `codeFormulas` lists them. When it
   * is given, the listing's `$…$` are formulas, its `~…~` and `^…^` subscripts and superscripts as
   * in text, and `\$`, `\~` and `\^` those characters; otherwise all of them are code.
   */
  formula?: (latex: string, color: string) => MathPiece;
}

/** A `$` in a listing with formulas that its line does not close; `lineIndex` counts from 0. */
export class UnclosedFormula extends Error {
  constructor(readonly lineIndex: number) {
    super('A $ opens a formula that its line does not close: write \\$ for a dollar');
    this.name = 'UnclosedFormula';
  }
}

/** A piece of a line of a listing: a run of code, or a formula in a color. */
type CodePart = { run: TextRun } | { latex: string; color: string };

function themeOf(options: Pick<CodeLayoutOptions, 'defaultColor' | 'theme'>): CodeTheme {
  return options.theme === undefined ? codeThemeFor(options.defaultColor) : options.theme ?? {};
}

/**
 * Where a subscript (`~…~`) or a superscript (`^…^`) that opens at `i` closes, as in text: it holds
 * no space but an escaped one, and no formula, code or bracket; -1 when it does not close.
 */
function scriptEnd(line: string, i: number): number {
  const marker = line[i];
  let end = i + 1;
  while (end < line.length && line[end] !== marker) {
    if (line[end] === '\\' && end + 1 < line.length) {
      end += 2;
      continue;
    }
    if (/[\s$`[\]]/.test(line[end])) return -1;
    end += 1;
  }
  return end < line.length && end > i + 1 ? end : -1;
}

/**
 * The lines of a listing as runs of code in the theme's colors, null for a blank one. With `math`,
 * a `$…$` is a formula, in the color of the code its first `$` belongs to (a comment's in a
 * comment), `~…~` and `^…^` are a subscript and a superscript as in text, and `\$`, `\~` and `\^`
 * are those characters; an empty `$$` stays as it is.
 */
function codeParts(source: string, language: string, defaultColor: string, theme: CodeTheme, math: boolean): Array<CodePart[] | null> {
  return tokenizeCode(source, language).map((tokens, lineIndex) => {
    if (!tokens.some((token) => token.text.trim())) return null;
    const runOf = (text: string, token: CodeToken, script: TextRun['script'] = undefined): TextRun => ({
      text, bold: Boolean(token.bold), italic: token.cls === 'comment', color: theme[token.cls] ?? defaultColor, mono: false, ...(script ? { script } : {}),
    });
    if (!math || !tokens.some((token) => /[$~^]/.test(token.text))) return tokens.map((token) => ({ run: runOf(token.text, token) }));
    // The line as one string, each character's token remembered: a `$…$` or a script may span tokens.
    const line = tokens.map((token) => token.text).join('');
    const owner = tokens.flatMap((token, index) => Array.from({ length: token.text.length }, () => index));
    const parts: CodePart[] = [];
    let pending = '';
    let pendingToken = -1;
    let pendingScript: TextRun['script'] = undefined;
    const flush = () => {
      if (pending) parts.push({ run: runOf(pending, tokens[pendingToken], pendingScript) });
      pending = '';
    };
    const put = (text: string, token: number, script: TextRun['script'] = undefined) => {
      if (token !== pendingToken || script !== pendingScript) {
        flush();
        pendingToken = token;
        pendingScript = script;
      }
      pending += text;
    };
    let i = 0;
    while (i < line.length) {
      if (line[i] === '\\' && /[$~^]/.test(line[i + 1] ?? '')) {
        put(line[i + 1], owner[i + 1]);
        i += 2;
        continue;
      }
      if (line[i] === '~' || line[i] === '^') {
        const end = scriptEnd(line, i);
        if (end < 0) {
          put(line[i], owner[i]);
          i += 1;
          continue;
        }
        const script = line[i] === '~' ? 'sub' : 'sup';
        // An escaped space is a no-break one, any other escaped character itself.
        for (let k = i + 1; k < end; k += 1) {
          if (line[k] === '\\') {
            k += 1;
            put(line[k] === ' ' ? ' ' : line[k], owner[k], script);
          } else put(line[k], owner[k], script);
        }
        i = end + 1;
        continue;
      }
      if (line[i] !== '$') {
        put(line[i], owner[i]);
        i += 1;
        continue;
      }
      let end = i + 1;
      while (end < line.length && line[end] !== '$') end += line[end] === '\\' ? 2 : 1;
      if (end >= line.length) throw new UnclosedFormula(lineIndex);
      if (end === i + 1) put('$$', owner[i]);
      else {
        flush();
        pendingToken = -1;
        parts.push({ latex: line.slice(i + 1, end), color: theme[tokens[owner[i]].cls] ?? defaultColor });
      }
      i = end + 1;
    }
    flush();
    return parts;
  });
}

/** The formulas `layoutCode` asks `formula` for when a listing's `$…$` are typeset, each once. */
export function codeFormulas(source: string, language: string, options: Pick<CodeLayoutOptions, 'defaultColor' | 'theme'>): Array<{ latex: string; color: string }> {
  const seen = new Map<string, { latex: string; color: string }>();
  for (const parts of codeParts(source, language, options.defaultColor, themeOf(options), true)) {
    for (const part of parts ?? []) if ('latex' in part) seen.set(`${part.color}\u0000${part.latex}`, part);
  }
  return [...seen.values()];
}

/** A laid-out line of a listing: what it draws, its pen advance, its reach and how to place it on a baseline. */
interface CodeLine {
  mobject: Mobject;
  advance: number;
  ascent: number;
  descent: number;
  place: (y: number) => void;
}

/**
 * Stack highlighted monospace lines; the block scales down if wider than `maxWidth`. A line with
 * formulas sets them on its baseline between its runs of code; a line is as tall as its font, or
 * as a formula that reaches further, and the lines keep one pitch.
 */
export function layoutCode(source: string, language: string, options: CodeLayoutOptions): Mobject {
  const { fontSize, maxWidth, defaultColor, lineGap, formula } = options;
  const family = options.fontFamily || MONOSPACE;
  const lines = codeParts(source, language, defaultColor, themeOf(options), Boolean(formula)).map((parts): CodeLine | null => {
    if (!parts) return null;
    if (parts.every((part) => 'run' in part)) {
      const line = new StyledLine({ runs: parts.map((part) => (part as { run: TextRun }).run), fontSize, fontFamily: family, baseColor: defaultColor });
      return { mobject: line, advance: line.advance, ascent: line.fontAscent, descent: line.fontDescent, place: (y) => line.placeOrigin(0, y) };
    }
    const members: Mobject[] = [];
    let advance = 0;
    let ascent = 0;
    let descent = 0;
    let runs: TextRun[] = [];
    const endRuns = () => {
      if (!runs.length) return;
      const line = new StyledLine({ runs, fontSize, fontFamily: family, baseColor: defaultColor });
      line.placeOrigin(advance, 0);
      advance += line.advance;
      ascent = Math.max(ascent, line.fontAscent);
      descent = Math.max(descent, line.fontDescent);
      members.push(line);
      runs = [];
    };
    for (const part of parts) {
      if ('run' in part) {
        runs.push(part.run);
        continue;
      }
      endRuns();
      const piece = (formula as NonNullable<typeof formula>)(part.latex, part.color);
      const mobject = piece.mobject.copy();
      mobject.shift([advance, 0, 0]);
      advance += piece.advance;
      ascent = Math.max(ascent, piece.ascent);
      descent = Math.max(descent, piece.descent);
      members.push(mobject);
    }
    endRuns();
    const group = new Group(...members);
    return { mobject: group, advance, ascent, descent, place: (y) => group.shift([0, y, 0]) };
  });
  const present = lines.filter((line): line is CodeLine => line !== null);
  if (!present.length) return new Group();
  const pitch = Math.max(...present.map((line) => line.ascent + line.descent)) + lineGap / 2;
  lines.forEach((line, index) => line?.place(-index * pitch));
  const block = new Group(...present.map((line) => line.mobject)) as Group & { markupBaselineFraction: number };
  const width = Math.max(...present.map((line) => line.advance));
  if (width > maxWidth + 1e-6) block.scale(maxWidth / width, { aboutPoint: [0, 0, 0] });
  const height = block.getHeight();
  block.markupBaselineFraction = height > 0 ? -block.getCenter()[1] / height : 0;
  const scale = width > maxWidth + 1e-6 ? maxWidth / width : 1;
  const lastLine = lines.reduce((last, line, index) => (line ? index : last), 0);
  markLines(block, {
    first: 0, last: -lastLine * pitch * scale,
    ascent: Math.max(...present.map((line) => line.ascent)) * scale, descent: Math.max(...present.map((line) => line.descent)) * scale,
    interline: pitch * scale,
  });
  block.center();
  return block;
}
