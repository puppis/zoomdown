/**
 * Parse explicit slide containers and CommonMark blocks into a document AST,
 * then validate references and compile fragment state into animation steps.
 */
import MarkdownIt from 'markdown-it';
import { LINK_TARGET } from '../links';
import { TIP_KINDS, isViaList } from '../curves';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import {
  type NotesSpec,
  ALIGNMENTS, ANIMATE_PROPS, ATTACHMENTS, BASELINE_ANCHORS, BRACE_SIDES, CONNECTIONS, CONTAINER, DIRECTIVE, EFFECT_NAMES, ELEMENT_ATTRS,
  CUSTOM_DIRECTIVE, LIBRARY_NAME,
  ENTER_STYLES, EXIT_STYLES, FILL_ATTRS, GEOMETRY, GROUP_ANCHORS, GROUP_ATTRS, HORIZONTAL_POSITION, ICON_KINDS, IDENTIFIER,
  LABEL_SIDES, LAYOUT, SHAPE_LABEL_ATTRS, NEIGHBORS, POSITION_REFERENCES, RATE_NAMES, SHAPES, SKETCH_ATTRS, STROKE_ATTRS, TEXT_LIKE, TIMING_ATTRS, TREMBLE_ATTRS,
  VECTOR_KINDS, VERTICAL_POSITION, VIDEO_EXTENSIONS, FILL_STYLE_NAMES, CHART_ATTRS, CHART_TYPE_NAMES, TABLE_ATTRS, TABLE_RULE_NAMES,
  INHERITED_ATTRS, gradientColor,
  ActionSpec, AnimationStep, ElementSpec, EventSpec, GroupSpec, CodeSlideSpec, IncludeSpec, InlineSpan, MarkupDocument, MarkupError, TableSpec,
  type CellAlignment,
  type ListItem,
  NextSpec, SkipNextSpec, SlideItem, SlideSpec, StepChange, StyleSheet, Attributes, applyStyles, roleStyledKeys, attachmentTargets, checkClassName, childKey, connectionEnd, endpoint, styledKeys,
  RELATIVE_STEP, type StepMode,
  elementStep, numberValue, parseAt, parseAttributes, parseColor, parseTremble, polylinePoints, positionOrder, span, stepValue, textReference,
} from './ast';

type Env = { line?: number };

/** Markers of unordered list items by nesting depth (cycling when deeper). */
const BULLETS = ['•', '–', '◦'];

/** A line that opens a bullet or numbered list item. */
const LIST_START = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

function bracketEnd(source: string, start = 0): number | null {
  let depth = 0;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    const char = source[index];
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function dollarMath(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '$' || state.src.startsWith('$$', state.pos)) return false;
  let end = state.pos + 1;
  while (end < state.posMax) {
    if (state.src[end] === '\\') {
      end += 2;
      continue;
    }
    if (state.src[end] === '$') {
      if (end === state.pos + 1) return false;
      if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.content = state.src.slice(state.pos + 1, end);
      }
      state.pos = end + 1;
      return true;
    }
    end += 1;
  }
  throw new MarkupError('Unclosed inline math delimiter', (state.env as Env).line ?? null);
}

/**
 * Treat a double backslash outside code/math as one explicit prose break. The spaces that start the
 * source line after it indent the line it starts, a tab to the next multiple of four.
 */
function hardLineBreak(state: StateInline, silent: boolean): boolean {
  if (!state.src.startsWith('\\\\', state.pos)) return false;
  state.pos += 2;
  let indent = 0;
  if (state.pos < state.posMax && state.src[state.pos] === '\n') {
    state.pos += 1;
    for (; state.pos < state.posMax && (state.src[state.pos] === ' ' || state.src[state.pos] === '\t'); state.pos += 1) {
      indent = state.src[state.pos] === '\t' ? (Math.floor(indent / 4) + 1) * 4 : indent + 1;
    }
  }
  if (!silent) {
    const token = state.push('hardbreak', 'br', 0);
    if (indent) token.meta = { indent };
  }
  return true;
}

/**
 * A subscript or superscript of text, `H~2~O` and `x^2^`, as in Pandoc. It holds no space but an
 * escaped one, `\ `, which is a no-break space, and no formula, code or bracket either: a `~` in a
 * link's text and another in its target never pair, nor do two `^` around a formula. Emphasis
 * works inside.
 */
function textScript(state: StateInline, silent: boolean): boolean {
  const marker = state.src[state.pos];
  if (marker !== '~' && marker !== '^') return false;
  let end = state.pos + 1;
  while (end < state.posMax && state.src[end] !== marker) {
    if (state.src[end] === '\\' && end + 1 < state.posMax && state.src[end + 1] !== '\n') {
      end += 2;
      continue;
    }
    if (/[\s$`[\]]/.test(state.src[end])) return false;
    end += 1;
  }
  if (end >= state.posMax || end === state.pos + 1) return false;
  if (!silent) {
    const token = state.push('text_script', marker === '~' ? 'sub' : 'sup', 0);
    token.meta = marker === '~' ? 'sub' : 'sup';
    token.children = [];
    state.md.inline.parse(state.src.slice(state.pos + 1, end).replace(/\\ /g, ' '), state.md, state.env, token.children);
  }
  state.pos = end + 1;
  return true;
}

function coloredSpan(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '[') return false;
  const end = bracketEnd(state.src, state.pos);
  if (end === null || !state.src.startsWith('{', end + 1)) return false;
  const close = state.src.indexOf('}', end + 2);
  const line = (state.env as Env).line ?? 1;
  if (close < 0) throw new MarkupError('Unclosed span attributes', line);
  const attrs = parseAttributes(state.src.slice(end + 1, close + 1), line);
  if (Object.keys(attrs).some((key) => key !== 'color' && key !== 'underline')) {
    throw new MarkupError('A [text]{…} with attributes other than color and underline must be a block of its own: put a blank line between it and the lines around it (lines with no blank line between them form one paragraph, where a span takes color and underline only)', line);
  }
  if ('underline' in attrs && !['true', 'false'].includes(attrs.underline)) throw new MarkupError('underline must be true or false', line);
  if (!silent) {
    const token = state.push('styled_span', 'span', 0);
    token.meta = attrs;
    token.children = [];
    state.md.inline.parse(state.src.slice(state.pos + 1, end), state.md, state.env, token.children);
  }
  state.pos = close + 1;
  return true;
}

/** The style a span inherits from the spans around it. */
interface SpanStyle {
  bold: boolean;
  italic: boolean;
  color: string | null;
  href: string | null;
  strike: boolean;
  underline: boolean;
  script: 'sub' | 'sup' | null;
}

const PLAIN: SpanStyle = { bold: false, italic: false, color: null, href: null, strike: false, underline: false, script: null };

function spans(tokens: Token[], outer: SpanStyle = PLAIN): InlineSpan[] {
  const result: InlineSpan[] = [];
  let strong = outer.bold ? 1 : 0;
  let emphasis = outer.italic ? 1 : 0;
  let struck = outer.strike ? 1 : 0;
  const links: Array<string | null> = [];
  const currentHref = () => (links.length ? links[links.length - 1] : outer.href);
  const style = (): SpanStyle => ({ bold: strong > 0, italic: emphasis > 0, color: outer.color, href: currentHref(), strike: struck > 0, underline: outer.underline, script: outer.script });
  for (const token of tokens) {
    switch (token.type) {
      case 'strong_open': strong += 1; break;
      case 'strong_close': strong -= 1; break;
      case 'em_open': emphasis += 1; break;
      case 'em_close': emphasis -= 1; break;
      case 's_open': struck += 1; break;
      case 's_close': struck -= 1; break;
      case 'styled_span': {
        const attrs = token.meta as Attributes;
        const inner = style();
        if (attrs.color) inner.color = attrs.color;
        if (attrs.underline) inner.underline = attrs.underline === 'true';
        result.push(...spans(token.children ?? [], inner));
        break;
      }
      case 'text_script':
        result.push(...spans(token.children ?? [], { ...style(), script: token.meta as 'sub' | 'sup' }));
        break;
      case 'text':
      case 'text_special':
      case 'code_inline':
      case 'math_inline':
      case 'softbreak':
      case 'hardbreak': {
        const kind = token.type === 'math_inline' ? 'math' : token.type === 'code_inline' ? 'code' : 'text';
        const content = token.type === 'softbreak' ? ' ' : token.type === 'hardbreak' ? '\n' : token.content;
        const now = style();
        const piece = span(content, kind, now.bold, now.italic, now.color, now.href);
        if (token.type === 'softbreak') piece.soft = true;
        if (token.type === 'hardbreak' && token.meta?.indent) piece.indent = token.meta.indent as number;
        if (now.strike) piece.strike = true;
        if (now.underline) piece.underline = true;
        if (now.script) piece.script = now.script;
        result.push(piece);
        break;
      }
      case 'link_open': {
        const target = token.attrGet('href');
        if (target && !LINK_TARGET.test(target)) {
          throw new MarkupError(`Unsupported link target ${JSON.stringify(target)}`);
        }
        links.push(target || null);
        break;
      }
      case 'link_close':
        links.pop();
        break;
      default:
        throw new MarkupError(`Unsupported inline Markdown token: ${token.type}`);
    }
  }
  return result;
}

/** Parse component slides, directives and CommonMark blocks into a document AST. */
export class MarkupParser {
  readonly blockMarkdown: MarkdownIt;
  readonly markdown: MarkdownIt;
  /** How the document being parsed numbers its steps (`layout.steps`). */
  private _steps: StepMode = 'explicit';

  constructor() {
    this.blockMarkdown = new MarkdownIt('commonmark', { html: false });
    this.blockMarkdown.enable('table');
    this.markdown = new MarkdownIt('commonmark', { html: false });
    // ~~text~~ strikes text through, as in GitHub's Markdown.
    this.markdown.enable('strikethrough');
    // An escaped character stays a token of its own, so that `\&&` never reads as a column separator.
    this.markdown.core.ruler.disable('text_join');
    this.markdown.inline.ruler.before('escape', 'dollar_math', dollarMath);
    this.markdown.inline.ruler.before('escape', 'hard_line_break', hardLineBreak);
    this.markdown.inline.ruler.before('link', 'colored_span', coloredSpan);
    // After ~~strikethrough~~, which takes two tildes or more.
    this.markdown.inline.ruler.after('emphasis', 'text_script', textScript);
  }

  /** Parse inline markup (used for connection labels). */
  parseInlineSpans(source: string, line: number): InlineSpan[] {
    const tokens = this.markdown.parseInline(source, { line });
    return spans(tokens[0]?.children ?? []);
  }

  /** Parse a string; infer the unique unreferenced root unless specified. */
  parse(source: string, options: { root?: string | null; basePath?: string; styles?: StyleSheet; steps?: StepMode } = {}): MarkupDocument {
    this._steps = options.steps ?? 'explicit';
    // Keep source line numbers intact when discarding author comments.
    source = source.replace(/<!--[\s\S]*?-->/g, (match) => '\n'.repeat((match.match(/\n/g) ?? []).length));
    const lines = source.split(/\r?\n/);
    const slides: SlideSpec[] = [];
    const styles: StyleSheet = { ...(options.styles ?? {}) };
    let index = 0;
    while (index < lines.length) {
      if (!lines[index].trim()) {
        index += 1;
        continue;
      }
      const opening = CONTAINER.exec(lines[index]);
      if (opening && /^styles\s*$/.test(opening[1])) {
        const end = MarkupParser._containerEnd(lines, index);
        Object.assign(styles, MarkupParser._styles(lines.slice(index + 1, end), index + 2));
        index = end + 1;
        continue;
      }
      if (/^\s*\[\[import:/.test(lines[index])) {
        throw new MarkupError('File imports are resolved before parsing: load the document through markupDeck or expandImports', index + 1);
      }
      if (!opening || !opening[1].startsWith('slide ')) throw new MarkupError('Expected ::: slide {#slide-id} or ::: styles', index + 1);
      const attrs = parseAttributes(opening[1].slice(6), index + 1);
      if (!('id' in attrs)) throw new MarkupError('Every slide requires an explicit #id', index + 1);
      const end = MarkupParser._containerEnd(lines, index);
      const body = MarkupParser._takeNotes(lines.slice(index + 1, end), index + 2);
      const items = this._body(body.lines, index + 2);
      slides.push(new SlideSpec(attrs.id, items, attrs, index + 1, false, body.notes));
      index = end + 1;
    }
    if (!slides.length) throw new MarkupError('The document contains no slides');
    const document = new MarkupDocument(slides, (options.root ?? '').replace(/^#/, ''), options.basePath ?? '', styles);
    return new ASTTransformer({ steps: this._steps }).validate(document);
  }

  /**
   * Take the `::: notes` blocks out of a slide's lines: the presenter's notes, for the slide
   * (`::: notes`) or for one step (`::: notes {step=2}`), kept apart from the content. Their
   * lines stay blank, so the lines after them keep their numbers.
   */
  private static _takeNotes(lines: string[], firstLine: number): { lines: string[]; notes: NotesSpec[] } {
    const notes: NotesSpec[] = [];
    const kept = [...lines];
    let fence: string | null = null;
    for (let index = 0; index < kept.length; index += 1) {
      const code = /^\s*(`{3,}|~{3,})/.exec(kept[index]);
      if (code) {
        if (fence === null) fence = code[1];
        else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence !== null) continue;
      const opening = CONTAINER.exec(kept[index]);
      const block = opening ? /^notes(?:\s+(\{.*\}))?\s*$/.exec(opening[1]) : null;
      if (!block) continue;
      const line = firstLine + index;
      const attrs = block[1] ? parseAttributes(block[1], line) : {};
      for (const key of Object.keys(attrs)) if (key !== 'step') throw new MarkupError(`Notes take step=N and nothing else, not ${key}=`, line);
      const step = 'step' in attrs ? stepValue(attrs, 'step', line) : null;
      const end = MarkupParser._containerEnd(kept, index);
      notes.push({ step, markdown: kept.slice(index + 1, end).join('\n'), line });
      for (let blank = index; blank <= end; blank += 1) kept[blank] = '';
      index = end;
    }
    return { lines: kept, notes };
  }

  /** Parse `name: attributes` lines of a `::: styles` block. */
  /**
   * The styles of a theme file: its `::: styles` blocks, or, when it has none, every line of it
   * as a style line (`heading: color=BLUE_E`). Comments between the blocks are ignored.
   */
  static parseStyles(source: string): StyleSheet {
    const lines = source.replace(/<!--[\s\S]*?-->/g, (match) => '\n'.repeat((match.match(/\n/g) ?? []).length)).split(/\r?\n/);
    const styles: StyleSheet = {};
    let blocks = 0;
    for (let index = 0; index < lines.length; index++) {
      const opening = CONTAINER.exec(lines[index]);
      if (!opening || !/^styles\s*$/.test(opening[1])) continue;
      const end = MarkupParser._containerEnd(lines, index);
      Object.assign(styles, MarkupParser._styles(lines.slice(index + 1, end), index + 2));
      blocks += 1;
      index = end;
    }
    return blocks ? styles : MarkupParser._styles(lines, 1);
  }

  private static _styles(lines: string[], firstLine: number): StyleSheet {
    const result: StyleSheet = {};
    lines.forEach((text, offset) => {
      const line = firstLine + offset;
      if (!text.trim()) return;
      const match = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(text);
      if (!match) throw new MarkupError('Expected a style line such as footnote: font_size=18 color=GRAY', line);
      result[match[1]] = parseAttributes(match[2], line);
    });
    return result;
  }

  private static _containerEnd(lines: string[], start: number): number {
    let depth = 1;
    let fence: string | null = null;
    for (let index = start + 1; index < lines.length; index++) {
      const stripped = lines[index].replace(/^\s+/, '');
      const code = /^(`{3,}|~{3,})/.exec(stripped);
      if (code) {
        const marker = code[1];
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
        continue;
      }
      if (fence !== null) continue;
      const match = CONTAINER.exec(lines[index]);
      if (match) {
        if (match[1].startsWith('slide ')) throw new MarkupError('Define slides separately; nest them using [[include: #id]]', index + 1);
        depth += match[1] ? 1 : -1;
        if (depth === 0) return index;
      }
    }
    throw new MarkupError('Unclosed ::: container', start + 1);
  }

  /**
   * The step of a directive: its `step=N`, or, with sequential steps, NaN for a step that follows
   * the source (`step=+`, or none), settled once the slide is read. `missing` is what a directive
   * without a step is told otherwise.
   */
  private _directiveStep(attrs: Attributes, line: number, missing: string): number {
    if (attrs.step === '+' || !('step' in attrs)) {
      if (this._steps === 'sequential') return NaN;
      throw new MarkupError(attrs.step === '+' ? RELATIVE_STEP : missing, line);
    }
    return stepValue(attrs, 'step', line);
  }

  /**
   * An include, and the line under its tile when it has one: `verdict="…"` becomes a text of the
   * slide written right after the include, `#target-verdict`.
   */
  private _include(items: SlideItem[], target: string, attrs: Attributes, line: number): void {
    items.push(new IncludeSpec(target, attrs, line));
    if (!('verdict' in attrs)) return;
    const source = attrs.verdict;
    delete attrs.verdict;
    let content: InlineSpan[];
    try {
      content = this.parseInlineSpans(source, line);
    } catch (error) {
      throw new MarkupError(String((error as Error).message).replace(/^Line \d+: /, ''), line);
    }
    const verdict = new ElementSpec(`${target}-verdict`, 'text', content, {}, '', line);
    verdict.verdictOf = target;
    verdict.role = 'verdict';
    items.push(verdict);
  }

  /**
   * The includes of a `::: tiles {cols=N}` container, placed as a grid: the first where the
   * container says (its position), each next one right of the one before, top-aligned, and the
   * first of each row below the first of the row before (below its verdict when it has one), all
   * `buff` apart (`layout.gap` by default) and as large as the container's `width` or `height`
   * says unless they say it themselves. Without `cols`, the tiles make one row.
   */
  private _tiles(members: SlideItem[], attrs: Attributes, line: number): SlideItem[] {
    const POSITION = [...LAYOUT].filter((key) => !['width', 'height', 'angle', 'class', 'buff'].includes(key));
    for (const key of Object.keys(attrs)) {
      if (!['cols', 'buff', 'width', 'height', 'step', 'hide'].includes(key) && !POSITION.includes(key)) {
        throw new MarkupError(`Tiles take cols, buff, width, height, step, hide and a position, not ${key}=`, line);
      }
    }
    const cols = 'cols' in attrs ? Number(attrs.cols) : Infinity;
    if (!(Number.isInteger(cols) && cols >= 1) && cols !== Infinity) throw new MarkupError('cols must be a positive integer', line);
    const includes = members.filter((item): item is IncludeSpec => item instanceof IncludeSpec);
    for (const item of members) {
      if (!(item instanceof IncludeSpec) && !(item instanceof ElementSpec && item.verdictOf !== null)) {
        throw new MarkupError('Tiles contain includes only, each with its verdict if it has one', 'line' in item ? item.line : line);
      }
    }
    if (!includes.length) throw new MarkupError('Tiles contain at least one include', line);
    const verdictOf = (target: string) => members.find((item): item is ElementSpec => item instanceof ElementSpec && item.verdictOf === target);
    includes.forEach((item, i) => {
      const own = item.attributes;
      for (const key of POSITION) {
        if (key in own) throw new MarkupError(`Tiles place their includes: give the position (${key}=) to the tiles container`, item.line);
      }
      if (!('width' in own) && !('height' in own)) {
        if ('width' in attrs) own.width = attrs.width;
        else if ('height' in attrs) own.height = attrs.height;
      }
      if ('buff' in attrs && i > 0) own.buff = attrs.buff;
      if (i === 0) {
        for (const key of POSITION) if (key in attrs) own[key] = attrs[key];
      } else if (i % cols !== 0) {
        own['right-of'] = `#${includes[i - 1].target}`;
        own['top-aligned'] = `#${includes[i - 1].target}`;
      } else {
        const head = includes[i - cols];
        own.below = `#${verdictOf(head.target)?.id ?? head.target}`;
        own['left-aligned'] = `#${head.target}`;
      }
    });
    if (attrs.hide === '+') throw new MarkupError("hide=+ counts from an element's own step: give the tiles hide=N", line);
    this._stepBlock(members, attrs, line);
    return members;
  }

  /**
   * The end of a line of a timeline or a graph: an optional `"label"`, bare words (style names, or
   * a node's shape first), and `{attributes}` last.
   */
  private static _tail(rest: string, line: number): { label: string | null; words: string[]; attrs: Attributes } {
    let text = rest.trim();
    let attrs: Attributes = {};
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\\') i += 1;
      else if (text[i] === '"') quoted = !quoted;
      else if (text[i] === '{' && !quoted) {
        attrs = parseAttributes(text.slice(i), line);
        text = text.slice(0, i).trim();
        break;
      }
    }
    let label: string | null = null;
    const found = /"((?:[^"\\]|\\.)*)"/.exec(text);
    if (found) {
      label = found[1].replace(/\\"/g, '"');
      text = `${text.slice(0, found.index)} ${text.slice(found.index + found[0].length)}`.trim();
    }
    const words = text ? text.split(/\s+/) : [];
    for (const word of words) {
      if (!/^[A-Za-z_][\w-]*$/.test(word)) throw new MarkupError(`Unexpected ${JSON.stringify(word)}: a line ends with a "label", style names and {attributes}`, line);
    }
    return { label, words, attrs };
  }

  /** The attributes of an element a timeline or a graph makes: its own, with its style names. */
  private _drawn(own: Attributes, words: string[]): Attributes {
    const attrs = { ...own };
    if (words.length) attrs.class = [attrs.class, ...words].filter(Boolean).join(' ');
    return attrs;
  }

  /**
   * Step a block as a whole, line by line (rule B), whatever its lines are (nodes, messages,
   * events, includes, plain elements): with sequential steps its `step` is where its first line
   * starts, unless that line has a step of its own, the lines after it following as anywhere;
   * with numbered steps it goes to every line without a step of its own. Its `hide` goes to every
   * line without one. The block is stepped as a group whose members may carry steps.
   */
  private _stepBlock(items: SlideItem[], block: Attributes, line: number): void {
    const lines = items.filter((item): item is ElementSpec | IncludeSpec | CodeSlideSpec => (item instanceof ElementSpec && item.verdictOf === null) || item instanceof IncludeSpec || item instanceof CodeSlideSpec);
    if ('step' in block) {
      if (block.step === '+' && this._steps !== 'sequential') throw new MarkupError(RELATIVE_STEP, line);
      const takers = this._steps === 'sequential' ? lines.slice(0, 1) : lines;
      for (const item of takers) if (!('step' in item.attributes)) item.attributes.step = block.step;
    }
    if ('hide' in block) {
      // A verdict goes with its include's line; an include itself is never hidden.
      for (const item of items) if (item instanceof ElementSpec && !('hide' in item.attributes)) item.attributes.hide = block.hide;
    }
  }

  /** What a drawing block (a timeline, a graph) checks of its own attributes. */
  private static _drawingAttrs(attrs: Attributes, allowed: string[], what: string, line: number): void {
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) throw new MarkupError(`A ${what} takes ${allowed.join(', ')}, not ${key}=`, line);
    }
    if (attrs.hide === '+') throw new MarkupError(`hide=+ counts from an element's own step: give the ${what} hide=N`, line);
    if ('id' in attrs && !IDENTIFIER.test(attrs.id)) throw new MarkupError(`Invalid ${what} ID ${JSON.stringify(attrs.id)}`, line);
  }

  /** A line of a drawing block that is none of its own kinds: any element, parsed as in the slide, its ids under the block's. */
  private _drawnLine(text: string, at: number, base: string, items: SlideItem[]): void {
    items.push(...this._body([text], at, `${base}.`));
  }

  /**
   * A space-time diagram, `::: timeline {processes="p q" length=10}`: a horizontal lifeline for
   * each process, time flowing to the right from `x`, `y` (the top one) over `width` units for
   * `length` units of time, `spacing` apart, its name at its left (`$p$`, unless a line `p: name`
   * says otherwise); then, line by line, messages (`p@1 -> q@3 "m1"`, `--` for a line), events
   * (`q@2 "label"`, a dot) and any element, in which `p@t` is the point of process `p` at time `t`.
   */
  private _timeline(body: string[], line: number, attrs: Attributes, prefix: string): SlideItem[] {
    MarkupParser._drawingAttrs(attrs, ['id', 'processes', 'length', 'width', 'spacing', 'x', 'y', 'step', 'hide'], 'timeline', line);
    const processes = (attrs.processes ?? '').trim().split(/\s+/).filter(Boolean);
    if (!processes.length) throw new MarkupError('A timeline needs its processes: processes="p q …"', line);
    for (const [i, name] of processes.entries()) {
      if (!/^[A-Za-z_]\w*$/.test(name)) throw new MarkupError(`A process is named by letters, digits and _, not ${JSON.stringify(name)}`, line);
      if (processes.indexOf(name) !== i) throw new MarkupError(`Process ${name} is named twice`, line);
    }
    const length = numberValue(attrs, 'length', line);
    const width = numberValue(attrs, 'width', line);
    if (length === null && width === null) throw new MarkupError('A timeline needs its length (in units of time) or its width', line);
    const span = (length ?? width) as number;
    const extent = (width ?? length) as number;
    if (!(span > 0 && extent > 0)) throw new MarkupError("A timeline's length and width must be positive", line);
    const x0 = numberValue(attrs, 'x', line, 0) as number;
    const y0 = numberValue(attrs, 'y', line, 0) as number;
    const spacing = numberValue(attrs, 'spacing', line, 1) as number;
    const number = (value: number) => String(Number(value.toFixed(9)));
    const point = (process: string, time: number) => `(${number(x0 + (time * extent) / span)},${number(y0 - processes.indexOf(process) * spacing)})`;
    const base = `${prefix}${attrs.id ?? `timeline-${line}`}`;
    const who = `(${processes.join('|')})`;
    const time = '(-?\\d+(?:\\.\\d+)?)';
    const naming = new RegExp(`^\\s*${who}\\s*:\\s*(.+)$`);
    const message = new RegExp(`^\\s*${who}@${time}\\s*(->|--)\\s*${who}@${time}(?![\\w.@])(.*)$`);
    const event = new RegExp(`^\\s*${who}@${time}(?![\\w.@])(.*)$`);
    const anywhere = new RegExp(`(?<![\\w.@])${who}@${time}(?![\\w.@])`, 'g');
    const names = new Map<string, string>();
    for (const text of body) {
      const named = naming.exec(text);
      if (named) names.set(named[1], named[2].trim());
    }
    const items: SlideItem[] = [];
    const make = (id: string, kind: string, spans: InlineSpan[], own: Attributes, role: string, at: number) => {
      const element = new ElementSpec(own.id ?? id, kind, spans, own, '', at);
      element.role = role;
      items.push(element);
    };
    for (const process of processes) {
      const y = number(y0 - processes.indexOf(process) * spacing);
      make(`${base}-${process}`, 'line', [], this._drawn({ from: point(process, 0), to: point(process, span) }, []), 'lifeline', line);
      const name = this.parseInlineSpans(names.get(process) ?? `$${process}$`, line);
      make(`${base}-${process}-name`, 'text', name, this._drawn({ at: `right:(${number(x0 - 0.2)},${y})` }, []), 'process', line);
    }
    body.forEach((text, k) => {
      const at = line + 1 + k;
      if (!text.trim() || naming.test(text)) return;
      const id = `${base}-${k + 1}`;
      const sent = message.exec(text);
      if (sent) {
        const tail = MarkupParser._tail(sent[6], at);
        const own: Attributes = { ...tail.attrs, from: point(sent[1], Number(sent[2])), to: point(sent[4], Number(sent[5])) };
        if (tail.label !== null) own.label = tail.label;
        make(id, sent[3] === '->' ? 'arrow' : 'line', [], this._drawn(own, tail.words), 'message', at);
        return;
      }
      const happened = event.exec(text);
      if (happened) {
        const tail = MarkupParser._tail(happened[3], at);
        const [x, y] = point(happened[1], Number(happened[2])).slice(1, -1).split(',');
        const own: Attributes = { ...tail.attrs, x, y };
        if (tail.label !== null) own.sublabel = tail.label;
        make(id, 'dot', [], this._drawn(own, tail.words), 'event', at);
        return;
      }
      this._drawnLine(text.replace(anywhere, (_, process: string, moment: string) => point(process, Number(moment))), at, id, items);
    });
    this._stepBlock(items, attrs, line);
    return items;
  }

  /**
   * A graph, `::: graph {x y scale}`: line by line, nodes (`A (x,y)`, a circle unless a shape
   * follows, `"label"` written in it, or its name with `labels=true`), edges (`A -> B "3"`, `--`
   * for a line) and any element. A node's position is `x`, `y` plus `scale` times its own; its name
   * is its id, which edges and any element may name.
   */
  private _graph(body: string[], line: number, attrs: Attributes, prefix: string): SlideItem[] {
    MarkupParser._drawingAttrs(attrs, ['id', 'x', 'y', 'scale', 'labels', 'step', 'hide'], 'graph', line);
    if ('labels' in attrs && !['true', 'false'].includes(attrs.labels)) throw new MarkupError('labels must be true or false', line);
    const x0 = numberValue(attrs, 'x', line, 0) as number;
    const y0 = numberValue(attrs, 'y', line, 0) as number;
    const scale = numberValue(attrs, 'scale', line, 1) as number;
    const number = (value: number) => String(Number(value.toFixed(9)));
    const base = `${prefix}${attrs.id ?? `graph-${line}`}`;
    const node = /^\s*([A-Za-z_][\w-]*)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)(.*)$/;
    const edge = /^\s*([A-Za-z_][\w-]*)\s*(->|--)\s*([A-Za-z_][\w-]*)(?![\w.(])(.*)$/;
    const items: SlideItem[] = [];
    const make = (id: string, kind: string, own: Attributes, role: string, at: number) => {
      const element = new ElementSpec(own.id ?? id, kind, [], own, '', at);
      element.role = role;
      items.push(element);
    };
    body.forEach((text, k) => {
      const at = line + 1 + k;
      if (!text.trim()) return;
      const placed = node.exec(text);
      if (placed) {
        const tail = MarkupParser._tail(placed[4], at);
        const kind = ['circle', 'rectangle', 'ellipse', 'dot'].includes(tail.words[0]) ? (tail.words.shift() as string) : 'circle';
        const own: Attributes = { ...tail.attrs, x: number(x0 + scale * Number(placed[2])), y: number(y0 + scale * Number(placed[3])) };
        const label = tail.label ?? (attrs.labels === 'true' ? placed[1] : null);
        if (label !== null && label !== '') own.label = label;
        make(placed[1], kind, this._drawn(own, tail.words), 'node', at);
        return;
      }
      const joined = edge.exec(text);
      if (joined) {
        const tail = MarkupParser._tail(joined[4], at);
        const own: Attributes = { ...tail.attrs, from: `#${joined[1]}`, to: `#${joined[3]}` };
        if (tail.label !== null) own.label = tail.label;
        make(`${base}-${k + 1}`, joined[2] === '->' ? 'arrow' : 'line', this._drawn(own, tail.words), 'edge', at);
        return;
      }
      this._drawnLine(text, at, `${base}-${k + 1}`, items);
    });
    this._stepBlock(items, attrs, line);
    return items;
  }

  private _body(lines: string[], firstLine: number, prefix = ''): SlideItem[] {
    const items: SlideItem[] = [];
    let index = 0;
    while (index < lines.length) {
      if (!lines[index].trim()) {
        index += 1;
        continue;
      }
      const line = firstLine + index;
      const directive = DIRECTIVE.exec(lines[index]);
      if (directive) {
        const [, kind, value] = directive;
        if (kind === 'next' || kind === 'skip_next') {
          const attrs = parseAttributes(value, line, { commas: true });
          const only = `${kind} directives require only step=N`;
          if (Object.keys(attrs).some((key) => key !== 'step')) throw new MarkupError(only, line);
          const step = this._directiveStep(attrs, line, only);
          items.push(kind === 'next' ? new NextSpec(step, line, attrs) : new SkipNextSpec(step, line, attrs));
        } else if (ATTACHMENTS.has(kind)) {
          // Attachments list the elements they decorate before the first comma: [[blob: #a #b #c, #id, buff=0.4]].
          const trimmed = value.trim();
          const comma = trimmed.indexOf(',');
          const head = comma < 0 ? trimmed : trimmed.slice(0, comma);
          const tokens = head.split(/\s+/).filter(Boolean);
          const count = tokens.findIndex((token) => !token.startsWith('#'));
          const targets = count < 0 ? tokens : tokens.slice(0, count);
          if (!targets.length || targets.some((token) => !/^#[\w.-]+$/.test(token))) {
            throw new MarkupError(`Expected [[${kind}: #id #id ..., #name, attributes]]`, line);
          }
          const rest = (count < 0 ? '' : tokens.slice(count).join(' ')) + (comma < 0 ? '' : trimmed.slice(comma));
          const attrs = parseAttributes(rest, line, { commas: true });
          if ('target' in attrs) throw new MarkupError(`Name the ${kind} targets first: [[${kind}: #id #id ...]]`, line);
          attrs.target = targets.map((token) => token.slice(1)).join(' ');
          items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, kind, [], attrs, '', line));
        } else if (kind === 'icon' || kind === 'artwork') {
          // A built-in icon by name, or an artwork of the deck's own, found in its artworks folders at build time.
          // It needs an id only to be referenced, as a shape.
          const match = /^([A-Za-z_][\w.-]*)(?:\s+(.*))?$/s.exec(value.trim());
          if (!match) throw new MarkupError(`Expected [[${kind}: name ...]]`, line);
          const attrs = parseAttributes(match[2] ?? '', line, { commas: true });
          items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, 'icon', [], attrs, match[1], line));
        } else if (kind === 'pdf') {
          // A PDF placed inside the slide: its pages become children, visited with cuts between them.
          const match = /^(\S+)\s+(.*)$/s.exec(value.trim());
          if (!match || match[1].startsWith('#')) throw new MarkupError('Expected [[pdf: file.pdf #id x=… y=… width=…]]', line);
          const attrs = parseAttributes(match[2], line, { commas: true });
          if (!('id' in attrs)) throw new MarkupError('A PDF child requires an explicit #id', line);
          const { id, ...placement } = attrs;
          this._include(items, id, { ...placement, src: match[1] }, line);
        } else if (kind === 'import') {
          throw new MarkupError('File imports are resolved before parsing: load the document through markupDeck or expandImports', line);
        } else if (kind === 'subslide' && !value.trim().startsWith('#')) {
          // A child slide written in code: [[subslide: ClassName ...]].
          const match = /^([^\s,]+)(.*)$/s.exec(value.trim());
          if (!match) throw new MarkupError('Expected [[subslide: #id ...]] or [[subslide: ClassName ...]]', line);
          items.push(new CodeSlideSpec(match[1], parseAttributes(match[2], line, { commas: true }), line));
        } else if (['include', 'subslide', 'show', 'hide'].includes(kind)) {
          const match = /^#?([\w.-]+)(.*)$/s.exec(value);
          if (!match) throw new MarkupError('Expected a referenced #id', line);
          const attrs = parseAttributes(match[2], line, { commas: true });
          if (kind === 'include' || kind === 'subslide') this._include(items, match[1], attrs, line);
          else {
            const extra = kind === 'show' ? 'enter' : 'exit';
            const takes = `${kind} directives take step=N and optionally run_time, lag and ${extra}`;
            if (Object.keys(attrs).some((key) => key !== 'step' && key !== extra && !TIMING_ATTRS.has(key))) throw new MarkupError(takes, line);
            items.push(new EventSpec(kind as 'show' | 'hide', match[1], this._directiveStep(attrs, line, takes), line, attrs));
          }
        } else if (kind === 'iframe') {
          const match = /^(\S+?),?(\s.*)?$/s.exec(value.trim());
          if (!match) throw new MarkupError('Expected [[iframe: https://... #id width=W height=H ...]]', line);
          const attrs = parseAttributes(match[2] ?? '', line, { commas: true });
          attrs.url = match[1];
          items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, 'iframe', [], attrs, match[1], line));
        } else if (kind === 'animate' || kind === 'move_along') {
          const match = /^#?([\w.-]+)(.*)$/s.exec(value);
          if (!match) throw new MarkupError('Expected a referenced #id', line);
          const attrs = parseAttributes(match[2], line, { commas: true });
          items.push(new ActionSpec(kind, match[1], this._directiveStep(attrs, line, `${kind} requires step=N`), attrs, line));
        } else if (kind === 'effect') {
          const match = /^([\w-]+)\s+#?([\w.-]+)(.*)$/s.exec(value);
          if (!match) throw new MarkupError('Expected [[effect: name #id, step=N ...]]', line);
          const attrs = parseAttributes(match[3], line, { commas: true });
          const step = this._directiveStep(attrs, line, 'effect requires step=N');
          attrs.name = match[1];
          items.push(new ActionSpec('effect', match[2], step, attrs, line));
        } else if (kind === 'transform') {
          const match = /^#?([\w.-]+)\s*->\s*#?([\w.-]+)(.*)$/s.exec(value);
          if (!match) throw new MarkupError('Expected [[transform: #from -> #to, step=N ...]]', line);
          const attrs = parseAttributes(match[3].replace(/^[ ,]+/, ''), line, { commas: true });
          const step = this._directiveStep(attrs, line, 'transform requires step=N');
          attrs.to = match[2];
          items.push(new ActionSpec('transform', match[1], step, attrs, line));
        } else if (SHAPES.has(kind)) {
          // A shape needs an id only to be referenced, as any other element.
          const attrs = parseAttributes(value, line, { commas: true });
          items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, kind, [], attrs, '', line));
        } else {
          const end = '(?:#[\\w.-]+|\\([^()]+\\))';
          const match = new RegExp(`^(${end})\\s*->\\s*(${end})(.*)$`, 's').exec(value);
          if (!match) throw new MarkupError('Expected #source -> #target or (x,y) -> (x,y)', line);
          const attrs = parseAttributes(match[3].replace(/^[ ,]+/, ''), line, { commas: true });
          if ('from' in attrs || 'to' in attrs) throw new MarkupError(`Specify ${kind} endpoints before the attributes`, line);
          attrs.from = match[1];
          attrs.to = match[2];
          items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, kind, [], attrs, '', line));
        }
        index += 1;
        continue;
      }
      const custom = CUSTOM_DIRECTIVE.exec(lines[index]);
      if (custom) {
        // A directive of the deck's own, drawn by a module of its directives folders when the deck is built.
        const [, name, value] = custom;
        if (name === 'snippet') throw new MarkupError(`Unknown snippet: no ::: snippet block defines ${value.trim().split(/\s+/)[0]} and no snippets folder has it`, line);
        const attrs = parseAttributes(value, line, { commas: true });
        items.push(new ElementSpec(attrs.id ?? `${prefix}element-${items.length + 1}`, 'custom', [], attrs, name, line));
        index += 1;
        continue;
      }
      const container = CONTAINER.exec(lines[index]);
      if (container) {
        const drawing = /^(timeline|graph)(?:\s+(\{.*\}))?\s*$/.exec(container[1]);
        if (drawing) {
          const end = MarkupParser._containerEnd(lines, index);
          const attrs = drawing[2] ? parseAttributes(drawing[2], line) : {};
          const inside = lines.slice(index + 1, end);
          items.push(...(drawing[1] === 'timeline' ? this._timeline(inside, line, attrs, prefix) : this._graph(inside, line, attrs, prefix)));
          index = end + 1;
          continue;
        }
        const tiles = /^tiles(?:\s+(\{.*\}))?\s*$/.exec(container[1]);
        if (tiles) {
          const end = MarkupParser._containerEnd(lines, index);
          items.push(...this._tiles(this._body(lines.slice(index + 1, end), line + 1, prefix), tiles[1] ? parseAttributes(tiles[1], line) : {}, line));
          index = end + 1;
          continue;
        }
        const kind = /^\{\s*\.(element|group)(?:\s|\})/.exec(container[1])?.[1];
        if (!kind) throw new MarkupError('Only ::: {.element ...}, ::: {.group ...}, ::: tiles, ::: timeline and ::: graph containers are supported inside slides', line);
        const attrs = parseAttributes(container[1], line);
        const end = MarkupParser._containerEnd(lines, index);
        if (kind === 'group') {
          const identifier = attrs.id ?? `${prefix}element-${items.length + 1}`;
          const nested = this._body(lines.slice(index + 1, end), line + 1, `${identifier}.`);
          if (nested.some((item) => !(item instanceof ElementSpec))) {
            throw new MarkupError('A group contains elements, shapes, connections and nested groups only', line);
          }
          items.push(new GroupSpec(identifier, nested as ElementSpec[], attrs, line));
          index = end + 1;
          continue;
        }
        const nested = this._body(lines.slice(index + 1, end), line + 1, prefix);
        if (nested.length !== 1 || !(nested[0] instanceof ElementSpec)) {
          throw new MarkupError('An .element container must contain exactly one text/image/math/code block', line);
        }
        const element = nested[0];
        const merged = { ...element.attributes, ...attrs };
        const identifier = merged.id ?? `${prefix}element-${items.length + 1}`;
        items.push(element instanceof TableSpec
          ? new TableSpec(identifier, element.rows, element.aligns, merged, line)
          : new ElementSpec(identifier, element.kind, element.spans, merged, element.source, line, element.level, element.list));
        index = end + 1;
        continue;
      }
      if (lines[index].trim().startsWith('$$')) {
        const openingMath = lines[index].trim().slice(2);
        let latex: string;
        if (openingMath.endsWith('$$')) {
          latex = openingMath.slice(0, -2);
          index += 1;
        } else {
          const parts = [openingMath];
          index += 1;
          while (index < lines.length && lines[index].trim() !== '$$') {
            parts.push(lines[index]);
            index += 1;
          }
          if (index === lines.length) throw new MarkupError('Unclosed display math delimiter', line);
          latex = parts.join('\n').trim();
          index += 1;
        }
        if (!latex.trim()) throw new MarkupError('Display math must not be empty', line);
        items.push(new ElementSpec(`${prefix}element-${items.length + 1}`, 'math', [], {}, latex, line));
        continue;
      }
      const start = index;
      let fence: string | null = null;
      while (index < lines.length) {
        const text = lines[index].trim();
        const code = /^(`{3,}|~{3,})/.exec(text);
        if (code) {
          if (fence === null) fence = code[1];
          else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null;
          index += 1;
          continue;
        }
        // Display math indented under a list item after a blank line continues the item, down to
        // its closing `$$` when it spans lines.
        const itemMath = text.startsWith('$$') && LIST_START.test(lines[start]) && /^\s+\$\$/.test(lines[index]) && !lines[index - 1].trim();
        if (fence === null && itemMath) {
          if (!/^\$\$.*\$\$\s*(?:\{[^{}]*\})?$/.test(text)) {
            const opening = index;
            index += 1;
            while (index < lines.length && !/^\$\$\s*(?:\{[^{}]*\})?$/.test(lines[index].trim())) index += 1;
            if (index === lines.length) throw new MarkupError('Unclosed display math delimiter', firstLine + opening);
          }
          index += 1;
          continue;
        }
        if (fence === null && (CONTAINER.test(text) || text.startsWith('[[') || text.startsWith('$$'))) break;
        if (fence === null && !text) {
          // Blank lines end a block, except inside a list: further items and indented continuation
          // lines belong to the same list, so its nesting survives (each item is still one element).
          if (!LIST_START.test(lines[start])) break;
          let next = index + 1;
          while (next < lines.length && !lines[next].trim()) next += 1;
          if (next >= lines.length || !(LIST_START.test(lines[next]) || /^\s+\S/.test(lines[next]))) break;
          index = next;
          continue;
        }
        index += 1;
      }
      if (index === start) throw new MarkupError('Unknown or malformed directive', line);
      items.push(...this._blocks(lines.slice(start, index).join('\n'), line, items.length, prefix));
    }
    return items;
  }

  private _blocks(source: string, line: number, offset: number, prefix = ''): ElementSpec[] {
    const result: ElementSpec[] = [];
    const tokens = this.blockMarkdown.parse(source, {});
    let level = 0;
    // Open lists, innermost last; the marker of the current item is given to its first block only.
    const lists: Array<{ ordered: boolean; delimiter: string }> = [];
    let marker = '';
    let tight = false;
    const listItem = (): ListItem | null => {
      if (!lists.length) return null;
      const item = { depth: lists.length - 1, marker, tight };
      marker = '';
      return item;
    };
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      // markdown-it hides the paragraphs of a tight list, one written without blank lines between its items.
      if (token.type === 'paragraph_open') tight = Boolean(token.hidden);
      const tokenLine = line + (token.map ? token.map[0] : 0);
      if (token.type === 'table_open') {
        // A pipe table: header row first, alignments from the delimiter row.
        const rows: InlineSpan[][][] = [];
        const aligns: CellAlignment[] = [];
        let row: InlineSpan[][] | null = null;
        let cellLine = tokenLine;
        while (index + 1 < tokens.length && tokens[index + 1].type !== 'table_close') {
          index += 1;
          const inner = tokens[index];
          if (inner.type === 'tr_open') row = [];
          else if (inner.type === 'tr_close' && row) rows.push(row);
          else if (inner.type === 'th_open' || inner.type === 'td_open') {
            cellLine = line + (inner.map ? inner.map[0] : 0);
            if (inner.type === 'th_open') {
              const style = inner.attrGet('style') ?? '';
              aligns.push(style.includes('center') ? 'center' : style.includes('right') ? 'right' : 'left');
            }
          } else if (inner.type === 'inline' && row) {
            const children = this.markdown.parseInline(inner.content, { line: cellLine })[0]?.children ?? [];
            try {
              row.push(spans(children).filter((s) => s.content !== ''));
            } catch (error) {
              throw new MarkupError(String((error as Error).message).replace(/^Line \d+: /, ''), cellLine);
            }
          }
        }
        index += 1;
        result.push(new TableSpec(`${prefix}element-${offset + result.length + 1}`, rows, aligns, {}, tokenLine, listItem()));
        continue;
      }
      if (token.type === 'heading_open') level = Number(token.tag.slice(1));
      else if (token.type === 'heading_close') level = 0;
      else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        lists.push({ ordered: token.type === 'ordered_list_open', delimiter: token.markup });
      } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') lists.pop();
      else if (token.type === 'list_item_open') {
        const list = lists[lists.length - 1];
        marker = list.ordered ? `${token.info}${list.delimiter}` : BULLETS[(lists.length - 1) % BULLETS.length];
      } else if (token.type === 'fence' || token.type === 'code_block') {
        const info = (token.info ?? '').trim();
        const match = /^([^\s{}]*)\s*(\{.*\})?\s*$/s.exec(info);
        if (!match) throw new MarkupError('A code fence takes a language name followed by optional {attributes}', tokenLine);
        const attrs = match[2] ? parseAttributes(match[2], tokenLine) : {};
        if (match[1]) {
          if ('lang' in attrs) throw new MarkupError('Name the language once, before the attributes', tokenLine);
          attrs.lang = match[1];
        }
        const identifier = attrs.id ?? `${prefix}element-${offset + result.length + 1}`;
        if (attrs.lang === 'chart') {
          // A chart fence holds the data; its info string holds the options.
          delete attrs.lang;
          result.push(new ElementSpec(identifier, 'chart', [], attrs, token.content.replace(/\s+$/, ''), tokenLine, 0, listItem()));
        } else result.push(new ElementSpec(identifier, 'code', [], attrs, token.content.replace(/\s+$/, ''), tokenLine, 0, listItem()));
      } else if (token.type === 'inline') {
        const [content, attrs] = MarkupParser._blockAttributes(token.content, tokenLine);
        const identifier = attrs.id ?? `${prefix}element-${offset + result.length + 1}`;
        // Display math that continues a list item, a paragraph of its own indented under it.
        const display = lists.length && !marker ? /^\$\$([\s\S]*)\$\$$/.exec(content.trim()) : null;
        if (display) {
          if (!display[1].trim()) throw new MarkupError('Display math must not be empty', tokenLine);
          result.push(new ElementSpec(identifier, 'math', [], attrs, display[1].trim(), tokenLine, 0, listItem()));
          continue;
        }
        const inline = this.markdown.parseInline(content, { line: tokenLine })[0]?.children ?? [];
        if (inline.length === 1 && inline[0].type === 'image') {
          result.push(new ElementSpec(identifier, 'image', [], attrs, inline[0].attrGet('src') ?? '', tokenLine, 0, listItem()));
        } else {
          let items: InlineSpan[];
          try {
            items = spans(inline);
          } catch (error) {
            throw new MarkupError(String((error as Error).message).replace(/^Line \d+: /, ''), tokenLine);
          }
          result.push(new ElementSpec(identifier, 'text', items, attrs, '', tokenLine, level, listItem()));
        }
      }
    }
    return result;
  }

  private static _blockAttributes(content: string, line: number): [string, Attributes] {
    const match = /\{([^{}\n]*)\}\s*$/.exec(content);
    const references = [...POSITION_REFERENCES];
    if (!match || !(/(?:#|\.|[\w_]+=)/.test(match[1]) || references.some((key) => new RegExp(`(?:^|\\s)${key}:`).test(match[1])))) {
      return [content, {}];
    }
    const attrs = parseAttributes(match[0], line);
    let body = content.slice(0, match.index).replace(/\s+$/, '');
    // A color-only span remains an inline span. Layout/ID/fragment attributes
    // on the complete block instead describe an independently placed object.
    const keys = Object.keys(attrs);
    if (keys.every((key) => key === 'color') && body.endsWith(']')) return [content, {}];
    if (body.startsWith('[') && bracketEnd(body) === body.length - 1) body = body.slice(1, -1);
    return [body, attrs];
  }
}

const RESERVED_LAST = 'LAST is reserved: #LAST names the element written just before';

/** The attributes whose values name elements as `#id`: relative constraints, `at=` and the ends of an arrow or a line. */
const NAMING_KEYS = [...POSITION_REFERENCES, 'at', 'from', 'to'];

/**
 * Put the id of the element written just before, `last`, for `#LAST` in what an item names: its
 * relative constraints, its `at=`, the ends of an arrow or a line and an attachment's targets,
 * `.text` and anchors after it kept (`#LAST.text`, `at=#LAST.bottom-left`).
 */
function resolveLast(item: ElementSpec | IncludeSpec | CodeSlideSpec, last: string | null, where: string): void {
  const attrs = item.attributes;
  const missing = () => new MarkupError(`#LAST names the element written just before, and none comes before this one ${where}`, item.line);
  for (const key of NAMING_KEYS) {
    const value = attrs[key];
    if (value === undefined || !/#LAST(?![\w-])/.test(value)) continue;
    if (last === null) throw missing();
    attrs[key] = value.replace(/#LAST(?![\w-])/g, `#${last}`);
  }
  if (item instanceof ElementSpec && ATTACHMENTS.has(item.kind) && attrs.target) {
    const targets = attrs.target.split(/\s+/);
    if (!targets.some((target) => /^LAST(?![\w-])/.test(target))) return;
    if (last === null) throw missing();
    attrs.target = targets.map((target) => target.replace(/^LAST(?![\w-])/, last)).join(' ');
  }
}

/** Validate a component tree and compile fragment state into animation steps. */
export class ASTTransformer {
  /** `steps`: how the slides number their steps (`layout.steps`), settled while validating. */
  constructor(private readonly options: { steps?: StepMode } = {}) {}

  validate(document: MarkupDocument): MarkupDocument {
    const slides = new Map<string, SlideSpec>();
    const parents = new Map<string, string>();
    for (const slide of document.slides) {
      if (!IDENTIFIER.test(slide.id) || slides.has(slide.id)) throw new MarkupError(`Invalid or duplicate slide ID ${JSON.stringify(slide.id)}`, slide.line);
      if (slide.id === 'LAST') throw new MarkupError(RESERVED_LAST, slide.line);
      slides.set(slide.id, slide);
      this._checkAttrs(slide.attributes, new Set(['id', 'title', 'width', 'height', 'flow_top', 'flow_left', 'only_this', 'start_here', 'skip_return', 'return_to_parent', 'transition', 'preview', ...(slide.placeholder ? ['src'] : [])]), slide.line);
      ASTTransformer._checkFlags(slide.attributes, slide.line);
      ASTTransformer._checkTransition(slide.attributes, slide.line);
    }
    const styles = document.styles;
    for (const slide of document.slides) {
      const elements = new Map<string, ElementSpec>();
      const scopeOf = new Map<string, string>();
      // What a group passes down to its members that do not set their own: the text's size, face,
      // color and line height, a member taking those it has (a shape no font, an arrow no line height).
      const visit = (items: SlideItem[], scope: string, inherited: Attributes = {}): void => {
        // The element written last in this scope, which `#LAST` names: arrows, lines and
        // attachments, which nothing can reference, and subslides are passed over.
        let last: string | null = null;
        // The step of the item before, which the next one counts from (sequential steps, on the slide itself).
        let previous = 0;
        // The item written before, which an include without a position goes right of when it is an include.
        let before: SlideItem | null = null;
        const where = scope ? 'in its group' : 'on its slide';
        for (const item of items) {
          if (item instanceof ElementSpec) {
            applyStyles(item, styles);
            if (item.id === 'LAST') throw new MarkupError(RESERVED_LAST, item.line);
            resolveLast(item, last, where);
            ASTTransformer._fit(item);
            // A node of a graph is as large as its style says, or of a default size.
            if (item.role === 'node') {
              const sizes: Record<string, Attributes> = { circle: { radius: '0.3' }, rectangle: { width: '0.6', height: '0.6' }, ellipse: { width: '0.8', height: '0.5' } };
              for (const [key, value] of Object.entries(sizes[item.kind] ?? {})) if (!(key in item.attributes)) item.attributes[key] = value;
            }
            // A verdict hangs under its tile, unless its style places it.
            if (item.verdictOf !== null && !Object.keys(item.attributes).some((key) => key === 'x' || key === 'y' || key === 'at' || POSITION_REFERENCES.has(key))) {
              item.attributes.below = `#${item.verdictOf}`;
            }
            if (!scope) previous = this._sequence(item, previous);
            if (!IDENTIFIER.test(item.id) || elements.has(item.id)) {
              throw new MarkupError(`Invalid or duplicate element ID ${JSON.stringify(item.id)} in ${slide.id}`, item.line);
            }
            const takes = ASTTransformer.allowedAttributes(item);
            for (const [key, value] of Object.entries(inherited)) {
              if (!(key in item.attributes) && (takes === null || takes.has(key))) item.attributes[key] = value;
            }
            this._checkElement(item, scope);
            elements.set(item.id, item);
            scopeOf.set(item.id, scope);
            if (item instanceof GroupSpec) {
              const passed: Attributes = { ...inherited };
              for (const key of INHERITED_ATTRS) if (key in item.attributes) passed[key] = item.attributes[key];
              visit(item.items, item.id, passed);
            }
            // #LAST names what was written: a verdict is part of its include.
            if (!CONNECTIONS.has(item.kind) && !ATTACHMENTS.has(item.kind) && item.verdictOf === null) {
              last = item.id;
              before = item;
            }
          } else if (item instanceof IncludeSpec || item instanceof CodeSlideSpec) {
            if (scope) throw new MarkupError('Groups cannot contain includes or subslides', item.line);
            applyStyles(item, styles);
            resolveLast(item, last, where);
            ASTTransformer._fit(item);
            if (item instanceof IncludeSpec && before instanceof IncludeSpec) ASTTransformer._row(item, before);
            before = item;
            previous = this._sequence(item, previous);
            this._checkChild(item, slide, slides, parents);
            // An include is referenced by the id of the slide it includes.
            if (item instanceof IncludeSpec) last = item.target;
          } else if (scope) throw new MarkupError('Groups cannot contain directives', item.line);
          else previous = this._sequence(item, previous);
        }
      };
      visit(slide.items, '');
      const scopeCheck = (ownerScope: string, target: ElementSpec, what: string, line: number): void => {
        if (scopeOf.get(target.id) !== ownerScope) {
          throw new MarkupError(`${what} #${target.id} belongs to a different group`, line);
        }
      };
      for (const item of elements.values()) {
        const scope = scopeOf.get(item.id) as string;
        if (ATTACHMENTS.has(item.kind)) {
          const targets = attachmentTargets(item);
          if (!targets.length) throw new MarkupError(`A ${item.kind} needs at least one target`, item.line);
          for (const id of targets) {
            const target = elements.get(id);
            if (!target) throw new MarkupError(`Unknown ${item.kind} target #${id} in ${slide.id}`, item.line);
            if (CONNECTIONS.has(target.kind) || ATTACHMENTS.has(target.kind)) {
              throw new MarkupError(`A ${item.kind} must attach to text, image, math, code, a shape, an icon or a group`, item.line);
            }
            scopeCheck(scope, target, `The ${item.kind} target`, item.line);
          }
          if ('label' in item.attributes) {
            for (const s of new MarkupParser().parseInlineSpans(item.attributes.label, item.line)) {
              if (s.color) ASTTransformer._checkColor(s.color, item.line);
            }
          }
          continue;
        }
        if (!CONNECTIONS.has(item.kind)) continue;
        if (!('from' in item.attributes) || !('to' in item.attributes)) throw new MarkupError(`${item.kind} requires both endpoints`, item.line);
        for (const key of ['from', 'to']) {
          const end = connectionEnd(item.attributes[key], item.line);
          if (Array.isArray(end)) continue;
          const target = elements.get(end.id);
          if (!target) throw new MarkupError(`Unknown ${item.kind} endpoint #${end.id} in ${slide.id}`, item.line);
          if (CONNECTIONS.has(target.kind) || ATTACHMENTS.has(target.kind)) {
            throw new MarkupError('Arrow/line endpoints must reference text, image, math, code, shapes, icons or groups', item.line);
          }
          if (end.anchor) ASTTransformer._checkAnchorFor(target, end.anchor, item.line);
          scopeCheck(scope, target, 'The endpoint', item.line);
        }
        if ('label' in item.attributes) {
          for (const s of new MarkupParser().parseInlineSpans(item.attributes.label, item.line)) {
            if (s.color) ASTTransformer._checkColor(s.color, item.line);
          }
        }
      }
      const includes = new Set(slide.items.filter((item): item is IncludeSpec => item instanceof IncludeSpec).map((item) => item.target));
      for (const item of slide.items) {
        if (item instanceof EventSpec && elements.has(item.target)) {
          const target = elements.get(item.target) as ElementSpec;
          if (target.attributes.focus_only === 'true') throw new MarkupError('focus_only elements cannot have visibility events', item.line);
          if (scopeOf.get(item.target)) throw new MarkupError(`#${item.target} is a group member; show or hide its group instead`, item.line);
          const style = item.attributes.enter ?? item.attributes.exit;
          // A style that is not built in is an effect of the deck's own, found in its effects folders when the deck is built.
          if (style !== undefined && !(item.action === 'show' ? ENTER_STYLES : EXIT_STYLES).has(style) && !LIBRARY_NAME.test(style)) {
            throw new MarkupError(`Unknown ${item.action === 'show' ? 'enter' : 'exit'} style ${JSON.stringify(style)}`, item.line);
          }
        }
        if (item instanceof ActionSpec) this._checkAction(item, elements, scopeOf, includes);
      }
      for (const item of elements.values()) {
        for (const [key, styles] of [['enter', ENTER_STYLES], ['exit', EXIT_STYLES]] as const) {
          if (key in item.attributes && !styles.has(item.attributes[key]) && !LIBRARY_NAME.test(item.attributes[key])) {
            throw new MarkupError(`Unknown ${key} style ${JSON.stringify(item.attributes[key])}`, item.line);
          }
        }
      }
      const positionable = (item: ElementSpec) => !CONNECTIONS.has(item.kind) && !ATTACHMENTS.has(item.kind);
      // An include is a positioning reference by the id of the slide it includes, at the slide's top level.
      const framed = new Map(slide.items.filter((item): item is IncludeSpec => item instanceof IncludeSpec).map((item) => [item.target, item]));
      for (const item of elements.values()) {
        if (positionable(item)) ASTTransformer._checkPositioning(item, elements, scopeOf, scopeOf.get(item.id) as string, framed);
      }
      for (const item of slide.items) {
        if (item instanceof IncludeSpec || item instanceof CodeSlideSpec) ASTTransformer._checkPositioning(item, elements, scopeOf, '', framed);
      }
      const scopes = new Set([...scopeOf.values(), '']);
      for (const scope of scopes) {
        const members = new Map<string, ElementSpec | IncludeSpec>([...elements].filter(([id, item]) => positionable(item) && scopeOf.get(id) === scope));
        if (scope === '') for (const [id, item] of framed) if (!members.has(id)) members.set(id, item);
        positionOrder(members);
      }
      ASTTransformer._verdictSteps(slide);
      this.plan(slide);
    }
    const complete = new Set<string>();
    for (const identifier of slides.keys()) {
      let current = identifier;
      const path = new Set<string>();
      while (!complete.has(current) && parents.has(current)) {
        if (path.has(current)) throw new MarkupError(`Slide reference cycle involving #${current}`);
        path.add(current);
        current = parents.get(current) as string;
      }
      for (const id of path) complete.add(id);
      complete.add(current);
    }
    // The slides nothing includes, in document order: the root of a tree, or the pages of a flat document.
    const roots = [...slides.keys()].filter((id) => !parents.has(id));
    if (!roots.length) throw new MarkupError('Slides must form a tree or a sequence: at least one slide must be included by no other');
    const root = roots[0];
    // A document validated before carries its roots already; its `root` is then the first page, not a request.
    const requested = document.roots.length > 1 ? '' : document.root;
    if (requested && (roots.length !== 1 || requested !== root)) {
      throw new MarkupError(roots.length === 1 ? `Requested root #${requested} is not the tree root #${root}` : `Requested root #${requested}, but the document is a sequence of ${roots.length} top-level slides`);
    }
    const starts = new Map([...slides].map(([id, slide]) => [id, (slide.attributes.start_here ?? 'false') === 'true']));
    let importedStarts = 0;
    for (const slide of document.slides) {
      for (const item of slide.items) {
        if (item instanceof IncludeSpec && 'start_here' in item.attributes) starts.set(item.target, item.attributes.start_here === 'true');
        else if (item instanceof CodeSlideSpec && item.attributes.start_here === 'true') importedStarts += 1;
      }
    }
    if ([...starts.values()].filter(Boolean).length + importedStarts > 1) throw new MarkupError('start_here may be true on at most one slide');
    return new MarkupDocument([...slides.values()], root, document.basePath, {}, roots);
  }

  /**
   * Settle the step of an item of a slide from `previous`, the step of the item before it (0 at
   * the top of the slide), and return the step the item after it counts from. With sequential
   * steps, an element or a directive without `step` takes `previous`, `step=+` is the click after
   * it, and an include without a step is visited at that click; `hide=+` is the click after the
   * element's own step. Captions (`step=-1`) and static elements (`focus_only`) without a step are
   * left out of the count. Without sequential steps, `+` has nothing to count from.
   */
  private _sequence(item: SlideItem, previous: number): number {
    const sequential = this.options.steps === 'sequential';
    if (item instanceof ElementSpec) {
      // A verdict takes the click after its tile's visit, whatever the steps.
      if (item.verdictOf !== null) return previous;
      const attrs = item.attributes;
      if (!sequential) {
        if (attrs.step === '+' || attrs.hide === '+') throw new MarkupError(RELATIVE_STEP, item.line);
        return previous;
      }
      let next = previous;
      if (attrs.step === '+') attrs.step = String((next = previous + 1));
      else if (attrs.step === undefined) {
        if (attrs.focus_only !== 'true' && previous > 0) attrs.step = String(previous);
      } else if (attrs.step !== '-1') next = stepValue(attrs, 'step', item.line);
      if (attrs.hide === '+') attrs.hide = String(Math.max(0, Number(attrs.step ?? '0')) + 1);
      return next;
    }
    if (item instanceof IncludeSpec || item instanceof CodeSlideSpec) {
      const attrs = item.attributes;
      if (attrs.step !== undefined && attrs.step !== '+') return stepValue(attrs, 'step', item.line);
      if (!sequential) {
        if (attrs.step === '+') throw new MarkupError(RELATIVE_STEP, item.line);
        return previous;
      }
      attrs.step = String(previous + 1);
      return previous + 1;
    }
    // A directive: NaN when its step follows the source (parsed with sequential steps).
    if (Number.isNaN(item.step)) {
      const step = item.attributes.step === '+' ? previous + 1 : previous;
      (item as { step: number }).step = step;
      item.attributes.step = String(step);
    }
    return item.step;
  }

  /**
   * An include written right after another one, without a position of its own, goes on the same
   * row: right of it, top-aligned, `buff` apart (`layout.gap` by default), and as large as it when
   * it gives no size.
   */
  private static _row(item: IncludeSpec, before: IncludeSpec): void {
    const attrs = item.attributes;
    if (Object.keys(attrs).some((key) => key === 'x' || key === 'y' || key === 'at' || POSITION_REFERENCES.has(key))) return;
    attrs['right-of'] = `#${before.target}`;
    attrs['top-aligned'] = `#${before.target}`;
    if (!('width' in attrs) && !('height' in attrs)) {
      if ('width' in before.attributes) attrs.width = before.attributes.width;
      else if ('height' in before.attributes) attrs.height = before.attributes.height;
    }
  }

  /**
   * The verdict of a tile appears at the click after its visit. The visits without a step are
   * numbered first, as the plan numbers them (after the last numbered step, in source order), and
   * written down, so that the verdicts' own clicks do not move them.
   */
  private static _verdictSteps(slide: SlideSpec): void {
    const verdicts = slide.items.filter((item): item is ElementSpec => item instanceof ElementSpec && item.verdictOf !== null);
    if (!verdicts.length) return;
    let last = 0;
    for (const item of slide.items) {
      if (item instanceof ElementSpec) {
        if (item.verdictOf !== null) continue;
        last = Math.max(last, elementStep(item.attributes, item.line));
        if ('hide' in item.attributes) last = Math.max(last, stepValue(item.attributes, 'hide', item.line));
      } else if (item instanceof IncludeSpec || item instanceof CodeSlideSpec) {
        if ('step' in item.attributes) last = Math.max(last, stepValue(item.attributes, 'step', item.line));
      } else last = Math.max(last, item.step);
    }
    const visits = new Map<string, number>();
    for (const item of slide.items) {
      if (!(item instanceof IncludeSpec) && !(item instanceof CodeSlideSpec)) continue;
      if (!('step' in item.attributes)) item.attributes.step = String((last += 1));
      if (item instanceof IncludeSpec) visits.set(item.target, Number(item.attributes.step));
    }
    for (const verdict of verdicts) verdict.attributes.step = String((visits.get(verdict.verdictOf as string) as number) + 1);
  }

  /** The attributes an element of this kind takes, or null when it takes any (an artwork or element of the deck's own). */
  static allowedAttributes(item: ElementSpec): Set<string> | null {
    let allowed: Set<string> | null;
    if (item.kind === 'group') allowed = new Set(GROUP_ATTRS);
    else if (CONNECTIONS.has(item.kind)) {
      allowed = new Set(['id', 'step', 'hide', 'color', 'from', 'to', 'buff', 'buff_start', 'buff_end', 'dashed', 'halo_bridge', 'halo_width', 'tip', 'tip_length', 'tip_width', 'bend', 'loop', 'looseness', 'wavy', 'amplitude', 'via', 'label', 'label_buff', 'label_color', 'label_pos', 'label_side', 'label_width', 'slanted', 'font', 'font_size', 'opacity', 'href', ...STROKE_ATTRS, ...TIMING_ATTRS, ...SKETCH_ATTRS]);
    }
    else if (ATTACHMENTS.has(item.kind)) {
      allowed = new Set(['id', 'target', 'step', 'hide', 'color', 'buff', 'opacity', 'href', ...STROKE_ATTRS, ...TIMING_ATTRS, ...SKETCH_ATTRS]);
      if (item.kind === 'brace') for (const key of ['side', 'label', 'label_buff', 'label_color', 'font_size', 'font']) allowed.add(key);
      else if (item.kind === 'blob') for (const key of ['smoothness', ...FILL_ATTRS]) allowed.add(key);
      else for (const key of ['corner_radius', ...FILL_ATTRS]) allowed.add(key);
    } else if (item.kind === 'table') {
      allowed = new Set([...ELEMENT_ATTRS].filter((key) => key !== 'height'));
      for (const key of [...TABLE_ATTRS, ...SKETCH_ATTRS]) allowed.add(key);
    } else if (item.kind === 'chart') {
      allowed = new Set([...ELEMENT_ATTRS, ...CHART_ATTRS, ...SKETCH_ATTRS]);
    } else if (item.kind === 'icon') {
      allowed = new Set([...ELEMENT_ATTRS].filter((key) => !['width', 'height'].includes(key)));
      for (const key of ['size', 'label', 'label_buff', 'label_color', 'label_side', ...STROKE_ATTRS, ...FILL_ATTRS, ...SKETCH_ATTRS]) allowed.add(key);
      // An artwork of the deck's own reads its directive's attributes itself: any name is allowed.
      if (!ICON_KINDS.has(item.source)) allowed = null;
    } else if (item.kind === 'custom') {
      allowed = null;
    } else if (SHAPES.has(item.kind)) {
      allowed = new Set([...ELEMENT_ATTRS].filter((key) => !['width', 'height'].includes(key)));
      for (const key of [...STROKE_ATTRS, ...SKETCH_ATTRS, ...SHAPE_LABEL_ATTRS]) allowed.add(key);
      if (item.kind === 'polyline') allowed.add('points');
      else {
        for (const key of [...FILL_ATTRS, 'fill_gradient', 'gradient_direction']) allowed.add(key);
        if (item.kind === 'polygon') allowed.add('points');
        else if (item.kind === 'circle' || item.kind === 'dot') allowed.add('radius');
        else if (item.kind === 'arc') for (const key of ['radius', 'start_angle', 'angle']) allowed.add(key);
        else if (item.kind === 'ellipse') for (const key of ['width', 'height']) allowed.add(key);
        else for (const key of ['width', 'height', 'corner_radius']) allowed.add(key);
      }
    } else if (item.kind === 'iframe') {
      allowed = new Set(['id', 'url', 'x', 'y', 'width', 'height', 'anchor', 'at', 'dx', 'dy', 'class', 'title', 'poster', 'step', 'hide', 'color', 'href',
        ...POSITION_REFERENCES, 'buff', ...STROKE_ATTRS, ...TIMING_ATTRS]);
    } else {
      allowed = new Set(ELEMENT_ATTRS);
      if (item.kind !== 'text') allowed.delete('font');
      else allowed.add('line_height');
      if (item.kind === 'image') {
        allowed.add('play');
        if (VIDEO_EXTENSIONS.test(item.source)) allowed.add('muted');
      } else if (item.kind === 'code') {
        allowed.add('lang');
        allowed.add('math');
      }
    }
    if (allowed && VECTOR_KINDS.has(item.kind)) for (const key of TREMBLE_ATTRS) allowed.add(key);
    return allowed;
  }

  /** Validate one element's kind-specific attributes; `scope` is the enclosing group ID or ''. */
  private _checkElement(item: ElementSpec, scope: string): void {
    const decoration = CONNECTIONS.has(item.kind) || ATTACHMENTS.has(item.kind);
    if (!['text', 'image', 'math', 'code', 'group', 'iframe', 'icon', 'table', 'chart', 'custom'].includes(item.kind) && !SHAPES.has(item.kind) && !decoration) {
      throw new MarkupError(`Unknown element kind ${JSON.stringify(item.kind)}`, item.line);
    }
    if (scope) {
      for (const key of ['step', 'hide', 'focus_only', 'play']) {
        if (key in item.attributes) throw new MarkupError(`Group members cannot use ${key}; apply it to the group`, item.line);
      }
    }
    const allowed = ASTTransformer.allowedAttributes(item);
    if (allowed) this._checkAttrs(item.attributes, allowed, item.line);
    if (CONNECTIONS.has(item.kind)) {
      if ('dashed' in item.attributes && !['true', 'false'].includes(item.attributes.dashed)) throw new MarkupError('dashed must be true or false', item.line);
      // A halo bridge is true (the deck's background), false, or a color.
      if ('halo_bridge' in item.attributes && !['true', 'false'].includes(item.attributes.halo_bridge)) ASTTransformer._checkColor(item.attributes.halo_bridge, item.line);
      if ('halo_width' in item.attributes && !styledKeys(item).has('halo_width') && !('halo_bridge' in item.attributes)) throw new MarkupError('halo_width requires halo_bridge', item.line);
      const styledHere = styledKeys(item);
      // An arrow's tip: a filled triangle, open (two strokes) or none, its size uncapped when given.
      for (const key of ['tip', 'tip_length', 'tip_width']) {
        if (key in item.attributes && item.kind !== 'arrow' && !styledHere.has(key)) throw new MarkupError(`${key} applies to arrows only`, item.line);
      }
      if ('tip' in item.attributes && !(TIP_KINDS as readonly string[]).includes(item.attributes.tip)) throw new MarkupError('tip must be triangle, open or none', item.line);
      // The way a connection goes: straight, or one of a bend, a loop, a wave and a curve through points.
      const ways = ['bend', 'loop', 'wavy', 'via'].filter((key) => key in item.attributes);
      if (ways.length > 1) throw new MarkupError(`${ways.join(' and ')} cannot be combined: a connection bends, loops, waves or passes through points`, item.line);
      if ('loop' in item.attributes) {
        const side = item.attributes.loop;
        if (!['above', 'below', 'left', 'right'].includes(side) && !(side.trim() && Number.isFinite(Number(side)))) {
          throw new MarkupError('loop must be above, below, left, right or an angle in degrees', item.line);
        }
        const [from, to] = ['from', 'to'].map((key) => item.attributes[key] === undefined ? null : connectionEnd(item.attributes[key], item.line));
        if (!from || !to || Array.isArray(from) || Array.isArray(to) || from.id !== to.id) throw new MarkupError('loop= needs the same element at both ends', item.line);
      }
      if ('via' in item.attributes && !isViaList(item.attributes.via)) {
        throw new MarkupError('via must list points: (x,y) on the slide, +(x,y) from the start, ++(x,y) from the point before', item.line);
      }
      if ('looseness' in item.attributes && !styledHere.has('looseness') && !('bend' in item.attributes) && !('loop' in item.attributes)) throw new MarkupError('looseness requires bend or loop', item.line);
      if ('amplitude' in item.attributes && !styledHere.has('amplitude') && !('wavy' in item.attributes)) throw new MarkupError('amplitude requires wavy', item.line);
      // A connection's label: on which side of the edge, in the label's own frame along it, and whether it turns along the edge.
      if ('label_side' in item.attributes && !['above', 'below'].includes(item.attributes.label_side)) throw new MarkupError('An arrow\'s or a line\'s label_side must be above or below', item.line);
      if ('slanted' in item.attributes && !['true', 'false'].includes(item.attributes.slanted)) throw new MarkupError('slanted must be true or false', item.line);
      if ('label_pos' in item.attributes) {
        const along = Number(item.attributes.label_pos);
        if (!item.attributes.label_pos.trim() || !(along >= 0 && along <= 1)) throw new MarkupError('label_pos must be a number from 0 (the start) to 1 (the end)', item.line);
      }
    }
    // How a label looks needs a label, when the element says so itself: a style that sets it for
    // labeled and unlabeled elements alike just has no effect on the unlabeled ones.
    const styled = styledKeys(item);
    for (const key of ['label_side', 'slanted', 'label_pos', 'label_color', 'label_buff', 'label_width']) {
      if (key in item.attributes && !styled.has(key) && !('label' in item.attributes)) throw new MarkupError(`${key} requires a label`, item.line);
    }
    for (const key of ['sublabel_side', 'sublabel_color', 'sublabel_buff', 'sublabel_font_size']) {
      if (key in item.attributes && !styled.has(key) && !('sublabel' in item.attributes)) throw new MarkupError(`${key} requires a sublabel`, item.line);
    }
    if (SHAPES.has(item.kind)) {
      for (const key of ['label', 'sublabel']) {
        const side = item.attributes[`${key}_side`];
        if (side !== undefined && side !== 'center' && !LABEL_SIDES.has(side)) throw new MarkupError(`${key}_side must be center, below, above, left or right`, item.line);
        if (key in item.attributes) {
          for (const s of new MarkupParser().parseInlineSpans(item.attributes[key], item.line)) if (s.color) ASTTransformer._checkColor(s.color, item.line);
        }
      }
    }
    if ('href' in item.attributes && !LINK_TARGET.test(item.attributes.href)) {
      throw new MarkupError(`Unsupported link target ${JSON.stringify(item.attributes.href)}; use https://, mailto:, #, / or a relative path`, item.line);
    }
    if (item.kind === 'icon') {
      if ('label_side' in item.attributes && !LABEL_SIDES.has(item.attributes.label_side)) {
        throw new MarkupError('label_side must be below, above, left or right', item.line);
      }
      if ('label' in item.attributes) {
        for (const s of new MarkupParser().parseInlineSpans(item.attributes.label, item.line)) {
          if (s.color) ASTTransformer._checkColor(s.color, item.line);
        }
      }
    }
    if (item.kind === 'table') {
      if ('rules' in item.attributes && !TABLE_RULE_NAMES.has(item.attributes.rules)) {
        throw new MarkupError(`rules must be one of ${[...TABLE_RULE_NAMES].join(', ')}`, item.line);
      }
      if ('valign' in item.attributes && !['baseline', 'center', 'top', 'bottom'].includes(item.attributes.valign)) {
        throw new MarkupError('valign must be baseline, center, top or bottom', item.line);
      }
      for (const key of ['header', 'header_col_rules']) {
        if (key in item.attributes && !['true', 'false'].includes(item.attributes[key])) throw new MarkupError(`${key} must be true or false`, item.line);
      }
      if ('padding' in item.attributes) {
        // One value for all four sides, or two, vertical first as in CSS.
        const values = item.attributes.padding.trim().split(/[\s,]+/);
        if (values.length > 2 || values.some((value) => !value || !(Number(value) >= 0))) {
          throw new MarkupError('padding must be one or two nonnegative numbers, vertical first', item.line);
        }
      }
      if ('col_width' in item.attributes) {
        const widths = item.attributes.col_width.trim().split(/[\s,]+/);
        const columns = Math.max(...(item as TableSpec).rows.map((row) => row.length));
        if (widths.some((width) => width !== 'auto' && !(Number(width) > 0))) throw new MarkupError('col_width must be positive widths or auto', item.line);
        if (widths.length > 1 && widths.length !== columns) {
          throw new MarkupError(`col_width gives ${widths.length} widths for ${columns} columns: give one for all, or one per column`, item.line);
        }
      }
      if ('col_font_size' in item.attributes) {
        const sizes = item.attributes.col_font_size.trim().split(/[\s,]+/);
        const columns = Math.max(...(item as TableSpec).rows.map((row) => row.length));
        if (sizes.some((size) => size !== 'auto' && !(Number(size) > 0))) throw new MarkupError('col_font_size must be positive sizes or auto', item.line);
        if (sizes.length > 1 && sizes.length !== columns) {
          throw new MarkupError(`col_font_size gives ${sizes.length} sizes for ${columns} columns: give one for all, or one per column`, item.line);
        }
      }
      for (const row of (item as TableSpec).rows) for (const cell of row) for (const s of cell) if (s.color) ASTTransformer._checkColor(s.color, item.line);
    }
    if ('fill_gradient' in item.attributes) {
      const stops = item.attributes.fill_gradient.trim().split(/\s+/).filter(Boolean);
      if (stops.length < 2) throw new MarkupError('fill_gradient needs two colors or more, first to last', item.line);
      for (const stop of stops) {
        try {
          gradientColor(stop);
        } catch {
          throw new MarkupError(`Invalid color ${JSON.stringify(stop)} in fill_gradient`, item.line);
        }
      }
      if ((item.attributes.sketch ?? 'false') !== 'false') throw new MarkupError('A hand-drawn shape cannot have fill_gradient', item.line);
    }
    if ('gradient_direction' in item.attributes) {
      if (!['up', 'down', 'left', 'right'].includes(item.attributes.gradient_direction)) throw new MarkupError('gradient_direction must be up, down, left or right', item.line);
      if (!styled.has('gradient_direction') && !('fill_gradient' in item.attributes)) throw new MarkupError('gradient_direction requires fill_gradient', item.line);
    }
    if (item.kind === 'chart') {
      // A built-in type, or a chart of the deck's own, found in its charts folders when the slide is built.
      if ('type' in item.attributes && !CHART_TYPE_NAMES.has(item.attributes.type) && !IDENTIFIER.test(item.attributes.type)) {
        throw new MarkupError(`Chart type must be one of ${[...CHART_TYPE_NAMES].join(', ')}, or the name of a chart module of the deck`, item.line);
      }
      for (const key of ['grid', 'legend', 'values', 'header']) {
        if (key in item.attributes && !['true', 'false'].includes(item.attributes[key])) throw new MarkupError(`${key} must be true or false`, item.line);
      }
      if ('colors' in item.attributes) {
        const names = item.attributes.colors.split(/[\s,]+/).filter(Boolean);
        if (!names.length) throw new MarkupError('colors needs at least one color', item.line);
        for (const name of names) ASTTransformer._checkColor(name, item.line);
      }
      if ('min' in item.attributes && 'max' in item.attributes && Number(item.attributes.max) <= Number(item.attributes.min)) {
        throw new MarkupError('max must exceed min', item.line);
      }
      if (!item.source.trim() && !item.attributes.src) throw new MarkupError('A chart fence needs rows of data, or src= naming a CSV or JSON file', item.line);
      if (item.source.trim() && item.attributes.src) throw new MarkupError('A chart takes its rows from the fence or from src=, not both', item.line);
    }
    if ('tremble' in item.attributes) {
      const range = parseTremble(item.attributes.tremble, Math.max(0, elementStep(item.attributes, item.line)), item.line);
      if (range && 'hide' in item.attributes && range.start >= stepValue(item.attributes, 'hide', item.line)) {
        throw new MarkupError('tremble must start before the element is hidden', item.line);
      }
    }
    for (const key of ['tremble_amplitude', 'tremble_rate']) {
      if (key in item.attributes && !('tremble' in item.attributes)) throw new MarkupError(`${key} requires tremble=`, item.line);
    }
    if (item.kind === 'iframe') {
      if (!('width' in item.attributes) || !('height' in item.attributes)) throw new MarkupError('iframe requires width and height', item.line);
      if (!/^(https?:\/\/|\/|\.\.?\/|[\w.-]+(?:\/|\.html?(?:$|[?#])))/i.test(item.attributes.url)) {
        throw new MarkupError(`iframe URLs must be http(s) or relative: ${item.attributes.url}`, item.line);
      }
    }
    if ('muted' in item.attributes && !['true', 'false'].includes(item.attributes.muted)) throw new MarkupError('muted must be true or false', item.line);
    if (item.kind === 'code' && 'math' in item.attributes && !['true', 'false'].includes(item.attributes.math)) throw new MarkupError('math must be true or false', item.line);
    if ('anchor' in item.attributes) ASTTransformer._checkAnchorFor(item, item.attributes.anchor, item.line);
    if (item.kind === 'brace' && 'side' in item.attributes && !(item.attributes.side in BRACE_SIDES)) {
      throw new MarkupError('Brace side must be left, right, top or bottom', item.line);
    }
    const focusOnly = item.attributes.focus_only ?? 'false';
    if (!['true', 'false'].includes(focusOnly)) throw new MarkupError('focus_only must be true or false', item.line);
    if (focusOnly === 'true' && (Number(item.attributes.step ?? '0') !== 0 || 'hide' in item.attributes || 'play' in item.attributes)) {
      throw new MarkupError('focus_only elements are static; omit step, hide and play', item.line);
    }
    if (SHAPES.has(item.kind)) ASTTransformer._checkShape(item);
    if ('play' in item.attributes && !['once', 'loop'].includes(item.attributes.play)) {
      throw new MarkupError('Image play must be once or loop', item.line);
    }
    for (const s of item.spans) if (s.color) ASTTransformer._checkColor(s.color, item.line);
  }

  /** The boolean flags of a slide or include are true or false, and the two sides of the return choice are not both given. */
  private static _checkFlags(attrs: Attributes, line: number): void {
    for (const flag of ['start_here', 'only_this', 'skip_return', 'return_to_parent', 'preview']) {
      if (!['true', 'false'].includes(attrs[flag] ?? 'false')) throw new MarkupError(`${flag} must be true or false`, line);
    }
    if ('skip_return' in attrs && 'return_to_parent' in attrs) throw new MarkupError('Use skip_return or return_to_parent, not both', line);
  }

  private static _checkTransition(attrs: Attributes, line: number): void {
    if ('transition' in attrs && !['zoom', 'cut'].includes(attrs.transition) && !LIBRARY_NAME.test(attrs.transition)) {
      throw new MarkupError('transition must be zoom, cut, or the name of a camera transition of the deck', line);
    }
  }

  /** The attributes an include or a subslide takes. */
  static childAttributes(item: IncludeSpec | CodeSlideSpec): Set<string> {
    return new Set([...LAYOUT, 'step', 'only_this', 'start_here', 'skip_return', 'return_to_parent', 'transition', 'preview', ...(item instanceof IncludeSpec && 'src' in item.attributes ? ['src'] : [])]);
  }

  /**
   * Styles fill in only what fits (rule A). What a class or a role gives an element that its kind
   * does not take is dropped (a radius on a rectangle, a width on a dot), and so is an anchor its
   * kind has not. A placement from a style is kept only where it fits the element's own and that of
   * a stronger style (its own, then its classes, then its roles): `at=` only on an element placed
   * by nothing else, a coordinate or an alignment only on an axis nothing else sets and never with
   * `at=` or a direction along it, a direction only on a free axis; `buff` only on an element placed
   * by a direction or flowing down, `dx` and `dy` only on one placed at all. Only the attributes
   * written on the element itself can conflict.
   */
  private static _fit(item: ElementSpec | IncludeSpec | CodeSlideSpec): void {
    const attrs = item.attributes;
    const styled = styledKeys(item);
    if (!styled.size) return;
    const fromStyle = (key: string) => key in attrs && styled.has(key);
    const takes = item instanceof ElementSpec ? ASTTransformer.allowedAttributes(item) : ASTTransformer.childAttributes(item);
    if (takes) for (const key of Object.keys(attrs)) if (fromStyle(key) && !takes.has(key)) delete attrs[key];
    if (fromStyle('anchor')) {
      try {
        ASTTransformer._checkAnchorFor(item, attrs.anchor, item.line);
      } catch {
        delete attrs.anchor;
      }
    }
    const placing = (key: string) => key === 'x' || key === 'y' || key === 'at' || POSITION_REFERENCES.has(key);
    const axis = (key: string) => (key === 'x' || HORIZONTAL_POSITION.has(key) ? 'x' : key === 'y' || VERTICAL_POSITION.has(key) ? 'y' : null);
    const kept = Object.keys(attrs).filter((key) => placing(key) && !fromStyle(key));
    const roles = roleStyledKeys(item);
    const rank = (key: string) => (roles.has(key) ? 10 : 0) + (key === 'at' ? 0 : key in NEIGHBORS ? 1 : 2);
    const offered = Object.keys(attrs).filter((key) => placing(key) && fromStyle(key)).sort((a, b) => rank(a) - rank(b));
    for (const key of offered) {
      const fits = !kept.includes('at') && (key !== 'at' || !kept.length)
        && !kept.some((other) => axis(other) === axis(key))
        && !((key === 'x' || key === 'y') && kept.some((other) => other in NEIGHBORS));
      if (fits) kept.push(key);
      else delete attrs[key];
    }
    if (fromStyle('buff') && !kept.some((key) => key in NEIGHBORS) && !ASTTransformer._flowsDown(item)) delete attrs.buff;
    for (const key of ['dx', 'dy']) if (fromStyle(key) && !kept.length) delete attrs[key];
  }

  /** Validate an include or import and register its parent link. */
  private _checkChild(item: IncludeSpec | CodeSlideSpec, slide: SlideSpec, slides: Map<string, SlideSpec>, parents: Map<string, string>): void {
    this._checkAttrs(item.attributes, ASTTransformer.childAttributes(item), item.line);
    ASTTransformer._checkFlags(item.attributes, item.line);
    ASTTransformer._checkTransition(item.attributes, item.line);
    if ('anchor' in item.attributes) ASTTransformer._checkAnchorFor(item, item.attributes.anchor, item.line);
    if ('step' in item.attributes && stepValue(item.attributes, 'step', item.line) === 0) {
      throw new MarkupError('A child visit step must be at least one', item.line);
    }
    if (item instanceof CodeSlideSpec) {
      checkClassName(item.className, item.line);
      return;
    }
    if (!slides.has(item.target)) {
      if (!IDENTIFIER.test(item.target)) throw new MarkupError(`Invalid slide reference #${item.target}`, item.line);
      // A PDF child stands for its document: a placeholder that carries the file, filled when the deck loads.
      slides.set(item.target, new SlideSpec(item.target, [], { id: item.target, ...('src' in item.attributes ? { src: item.attributes.src } : {}) }, item.line, true));
    } else if ('src' in item.attributes) {
      // Validated again (the slide builder does so), the child's own placeholder is already there.
      const existing = slides.get(item.target) as SlideSpec;
      if (!existing.placeholder || existing.attributes.src !== item.attributes.src) {
        throw new MarkupError(`#${item.target} is a slide of the document; a PDF child needs an id of its own`, item.line);
      }
    }
    if (parents.has(item.target)) {
      throw new MarkupError(`Slide #${item.target} is included more than once; use a fresh slide ID`, item.line);
    }
    parents.set(item.target, slide.id);
  }

  /** Validate an animation directive against the slide's elements and included viewports. */
  private _checkAction(item: ActionSpec, elements: Map<string, ElementSpec>, scopeOf: Map<string, string>, includes: Set<string>): void {
    const attrs = item.attributes;
    const resolve = (id: string, what: string): ElementSpec | null => {
      const element = elements.get(id);
      if (element) {
        if (scopeOf.get(id)) throw new MarkupError(`#${id} is a group member; animate its group instead`, item.line);
        return element;
      }
      if (item.action === 'animate' && includes.has(id)) return null;
      throw new MarkupError(`Unknown ${what} #${id}`, item.line);
    };
    const target = resolve(item.target, `${item.action} target`);
    let allowed: Set<string>;
    if (item.action === 'animate') allowed = new Set(['step', ...ANIMATE_PROPS, ...TIMING_ATTRS, 'rate']);
    else if (item.action === 'effect') allowed = new Set(['step', 'name', 'color', 'scale', ...TIMING_ATTRS, 'rate']);
    else if (item.action === 'transform') allowed = new Set(['step', 'to', ...TIMING_ATTRS, 'rate']);
    else allowed = new Set(['step', 'path', 'rotate', ...TIMING_ATTRS, 'rate']);
    this._checkAttrs(attrs, allowed, item.line);
    if (item.step === 0) throw new MarkupError(`${item.action} steps must be at least one`, item.line);
    if ('rate' in attrs && !RATE_NAMES.has(attrs.rate)) throw new MarkupError(`Unknown rate ${JSON.stringify(attrs.rate)}`, item.line);
    if ('scale' in attrs && Number(attrs.scale) <= 0) throw new MarkupError('scale must be positive', item.line);
    if (item.action === 'animate') {
      if (![...ANIMATE_PROPS].some((key) => key in attrs)) throw new MarkupError('animate needs a target property such as x, y, at, angle, scale, opacity or color', item.line);
      if ('at' in attrs && ('x' in attrs || 'y' in attrs)) throw new MarkupError('at= replaces x and y', item.line);
      if ('anchor' in attrs) {
        if (target) ASTTransformer._checkAnchorFor(target, attrs.anchor, item.line);
        else if (!GROUP_ANCHORS.has(attrs.anchor) || attrs.anchor === 'origin' || BASELINE_ANCHORS.has(attrs.anchor)) {
          throw new MarkupError('Child viewports take a box anchor such as center, top-left or right', item.line);
        }
      }
      if ('at' in attrs) {
        const at = parseAt(attrs.at, item.line);
        if (at.anchor && target) ASTTransformer._checkAnchorFor(target, at.anchor, item.line);
        if ('id' in at.target) {
          const reference = resolve(at.target.id, 'at= reference');
          if (reference && (CONNECTIONS.has(reference.kind) || ATTACHMENTS.has(reference.kind))) {
            throw new MarkupError('at= cannot reference an arrow, line, brace, box or blob', item.line);
          }
          if (at.target.anchor && reference) ASTTransformer._checkAnchorFor(reference, at.target.anchor, item.line);
        }
      }
    } else if (item.action === 'effect') {
      // A built-in effect, or one of the deck's own, found in its effects folders when the slide is built.
      if (!EFFECT_NAMES.has(attrs.name) && !IDENTIFIER.test(attrs.name)) throw new MarkupError(`Unknown effect ${JSON.stringify(attrs.name)}`, item.line);
    } else if (item.action === 'transform') {
      const to = resolve(attrs.to, 'transform target') as ElementSpec;
      if (to === target) throw new MarkupError('transform needs two different elements', item.line);
      if ((target as ElementSpec).attributes.focus_only === 'true' || to.attributes.focus_only === 'true') {
        throw new MarkupError('focus_only elements cannot be transformed', item.line);
      }
    } else {
      if (!('path' in attrs) || !attrs.path.startsWith('#')) throw new MarkupError('move_along requires path=#shape', item.line);
      const path = resolve(attrs.path.slice(1), 'move_along path') as ElementSpec;
      if (!SHAPES.has(path.kind)) throw new MarkupError('move_along paths must be shapes (circle, arc, polyline, ...)', item.line);
      if ('rotate' in attrs && !['true', 'false'].includes(attrs.rotate)) throw new MarkupError('rotate must be true or false', item.line);
    }
  }

  /** Reject anchors that do not exist for an item: baselines need text, `origin` needs a group. */
  private static _checkAnchorFor(item: ElementSpec | IncludeSpec | CodeSlideSpec, anchor: string, line: number): void {
    if (!GROUP_ANCHORS.has(anchor)) throw new MarkupError(`Unknown anchor ${JSON.stringify(anchor)}`, line);
    if (anchor === 'origin' && !(item instanceof GroupSpec)) throw new MarkupError('origin is an anchor of groups only', line);
    if (BASELINE_ANCHORS.has(anchor) && !(item instanceof ElementSpec && TEXT_LIKE.has(item.kind))) {
      throw new MarkupError('Baseline anchors apply to text, math and code only', line);
    }
  }

  private static _checkColor(value: string, line: number): void {
    try {
      parseColor(value);
    } catch {
      throw new MarkupError(`Invalid color ${JSON.stringify(value)}`, line);
    }
  }

  private static _checkShape(item: ElementSpec): void {
    const attrs = item.attributes;
    const required: Record<string, string[]> = {
      rectangle: ['width', 'height'], circle: ['radius'], polyline: ['points'], dot: [], ellipse: ['width', 'height'], polygon: ['points'], arc: ['radius', 'angle'],
    };
    const needed = required[item.kind];
    if (!needed.every((key) => key in attrs)) throw new MarkupError(`${item.kind} requires ${needed.join(', ')}`, item.line);
    if (item.kind === 'polyline') polylinePoints(attrs.points, item.line);
    if (item.kind === 'polygon') polylinePoints(attrs.points, item.line, 3);
    if (item.kind === 'arc' && Number(attrs.angle) === 0) throw new MarkupError('arc angle must be nonzero', item.line);
    if (item.kind === 'rectangle' && Number(attrs.corner_radius ?? 0) > Math.min(Number(attrs.width), Number(attrs.height)) / 2) {
      throw new MarkupError('corner_radius must not exceed half the smaller dimension', item.line);
    }
  }

  private _checkAttrs(attrs: Attributes, allowed: Set<string>, line: number): void {
    const unknown = Object.keys(attrs).filter((key) => !allowed.has(key)).sort();
    if (unknown.length) throw new MarkupError(`Unknown attributes: ${unknown.join(', ')}`, line);
    for (const key of [...GEOMETRY, 'font_size', 'size', 'buff', 'radius', 'corner_radius', 'stroke_width', 'fill_opacity', 'opacity', 'dx', 'dy', 'run_time', 'lag',
      'start_angle', 'scale', 'roughness', 'bowing', 'hachure_angle', 'hachure_gap', 'fill_weight', 'seed', 'smoothness', 'tremble_amplitude', 'tremble_rate',
      'padding_x', 'padding_y', 'header_opacity', 'stripe_opacity', 'min', 'max', 'row_rule_width', 'col_rule_width', 'header_col_rule_width', 'label_buff', 'sublabel_buff', 'sublabel_font_size', 'halo_width',
      'tip_length', 'tip_width', 'bend', 'looseness', 'wavy', 'amplitude', 'buff_start', 'buff_end', 'flow_top', 'flow_left', 'label_width', 'line_height', 'header_font_size']) {
      if (!(key in attrs)) continue;
      const number = numberValue(attrs, key, line) as number;
      if (['buff', 'buff_start', 'buff_end', 'corner_radius', 'stroke_width', 'lag', 'roughness', 'bowing', 'fill_weight', 'seed', 'tremble_amplitude', 'padding_x', 'padding_y', 'row_rule_width', 'col_rule_width', 'header_col_rule_width', 'label_buff', 'sublabel_buff', 'halo_width', 'flow_top', 'flow_left'].includes(key) && number < 0) {
        throw new MarkupError(`${key} must be nonnegative`, line);
      }
      if (['radius', 'run_time', 'hachure_gap', 'tremble_rate', 'tip_length', 'tip_width', 'looseness', 'wavy', 'label_width', 'line_height', 'header_font_size', 'sublabel_font_size'].includes(key) && number <= 0) throw new MarkupError(`${key} must be positive`, line);
      if (['fill_opacity', 'opacity', 'smoothness', 'header_opacity', 'stripe_opacity'].includes(key) && (number < 0 || number > 1)) {
        throw new MarkupError(`${key} must be between zero and one`, line);
      }
    }
    // An element's step may be -1 (shown before the slide's first visit); where that makes no sense the caller says so.
    for (const key of ['step', 'hide']) if (key in attrs && !(key === 'step' && attrs.step === '-1')) stepValue(attrs, key, line);
    for (const key of ['color', 'fill_color', 'border_color', 'header_color', 'axis_color', 'label_color', 'sublabel_color', 'row_rule_color', 'col_rule_color', 'header_col_rule_color']) if (key in attrs) ASTTransformer._checkColor(attrs[key], line);
    if ('seed' in attrs && !Number.isInteger(Number(attrs.seed))) throw new MarkupError('seed must be an integer', line);
    if ('sketch' in attrs && !['true', 'false'].includes(attrs.sketch)) throw new MarkupError('sketch must be true or false', line);
    if ('fill_style' in attrs && !FILL_STYLE_NAMES.has(attrs.fill_style)) {
      throw new MarkupError(`fill_style must be one of ${[...FILL_STYLE_NAMES].join(', ')}`, line);
    }
  }

  private static _checkPositioning(
    item: ElementSpec | IncludeSpec | CodeSlideSpec, elements: Map<string, ElementSpec>, scopeOf: Map<string, string>, scope: string,
    includes: Map<string, IncludeSpec> = new Map(),
  ): void {
    const attrs = item.attributes;
    // A reference names an element of the slide or, at its top level and when no element has
    // that id, a slide it includes.
    const lookup = (id: string): ElementSpec | IncludeSpec | undefined => elements.get(id) ?? includes.get(id);
    const scopeOfTarget = (target: ElementSpec | IncludeSpec) => (target instanceof IncludeSpec ? '' : scopeOf.get(target.id));
    const decoration = (target: ElementSpec | IncludeSpec) => target instanceof ElementSpec && (CONNECTIONS.has(target.kind) || ATTACHMENTS.has(target.kind));
    const keys = Object.keys(attrs);
    if (('dx' in attrs || 'dy' in attrs) && !keys.some((key) => POSITION_REFERENCES.has(key) || ['x', 'y', 'at'].includes(key))) {
      throw new MarkupError('dx and dy require coordinates, at= or a relative constraint', item.line);
    }
    if ('at' in attrs) {
      if (keys.some((key) => POSITION_REFERENCES.has(key) || ['x', 'y', 'buff'].includes(key))) {
        throw new MarkupError('at= replaces x, y and relative constraints', item.line);
      }
      const at = parseAt(attrs.at, item.line);
      if (at.anchor) ASTTransformer._checkAnchorFor(item, at.anchor, item.line);
      if ('id' in at.target) {
        const target = lookup(at.target.id);
        if (!target) throw new MarkupError(`Unknown at= reference #${at.target.id}`, item.line);
        if (decoration(target)) throw new MarkupError('at= cannot reference an arrow, line, brace, box or blob', item.line);
        if (scopeOfTarget(target) !== scope) throw new MarkupError(`#${at.target.id} belongs to a different group`, item.line);
        if (at.target.anchor) ASTTransformer._checkAnchorFor(target, at.target.anchor, item.line);
      }
      return;
    }
    if ('baseline-aligned' in attrs && (!(item instanceof ElementSpec) || !TEXT_LIKE.has(item.kind))) {
      throw new MarkupError('baseline-aligned is only supported on text, math and code', item.line);
    }
    if (keys.filter((key) => key in NEIGHBORS).length > 1) throw new MarkupError('Specify only one relative direction', item.line);
    for (const [coordinate, constraints] of [['x', HORIZONTAL_POSITION], ['y', VERTICAL_POSITION]] as const) {
      const specified = keys.filter((key) => constraints.has(key));
      if (specified.length > 1 || (specified.length && coordinate in attrs)) {
        throw new MarkupError(`Conflicting ${coordinate} positioning constraints`, item.line);
      }
    }
    if ('buff' in attrs && !keys.some((key) => key in NEIGHBORS) && !ASTTransformer._flowsDown(item)) {
      throw new MarkupError('buff requires a relative direction, or an element that flows down after the block before it (no y nor vertical alignment)', item.line);
    }
    for (const key of keys.filter((key) => POSITION_REFERENCES.has(key))) {
      const reference = attrs[key];
      if (!reference.startsWith('#') || !IDENTIFIER.test(reference.slice(1))) {
        throw new MarkupError(`${key} requires a slide-local #element ID`, item.line);
      }
      const target = lookup(textReference(reference.slice(1)).id);
      if (!target) throw new MarkupError(`Unknown positioning reference ${reference}`, item.line);
      if (decoration(target)) throw new MarkupError('Positioning references cannot target an arrow, line, brace, box or blob', item.line);
      if (scopeOfTarget(target) !== scope) throw new MarkupError(`${reference} belongs to a different group`, item.line);
      if (key === 'baseline-aligned' && !(target instanceof ElementSpec && TEXT_LIKE.has(target.kind))) {
        throw new MarkupError('baseline-aligned must reference text, math or code', item.line);
      }
    }
  }

  /**
   * Whether the flow sets an element's height, after the block before it: nothing sets its y or a
   * vertical alignment, and it is no point-defined shape nor, placed by a coordinate, anything but
   * text anchored off its center.
   */
  private static _flowsDown(item: ElementSpec | IncludeSpec | CodeSlideSpec): boolean {
    const attrs = item.attributes;
    if ('y' in attrs || 'at' in attrs || Object.keys(attrs).some((key) => VERTICAL_POSITION.has(key) || key in NEIGHBORS)) return false;
    if (!(item instanceof ElementSpec)) return !('x' in attrs);
    if (item.kind === 'polyline' || item.kind === 'polygon') return false;
    return !('x' in attrs) || (TEXT_LIKE.has(item.kind) && attrs.anchor !== 'center');
  }

  private static _change(action: StepChange['action'], target: string, attrs: Attributes): StepChange {
    const change: StepChange = { action, target };
    if (attrs.run_time !== undefined) change.runTime = Number(attrs.run_time);
    if (attrs.lag !== undefined) change.lag = Number(attrs.lag);
    if (attrs.rate !== undefined) change.rate = attrs.rate;
    if (action === 'show' && attrs.enter !== undefined) change.style = attrs.enter;
    if (action === 'hide' && attrs.exit !== undefined) change.style = attrs.exit;
    if (action === 'animate') {
      change.props = Object.fromEntries(Object.entries(attrs).filter(([key]) => ANIMATE_PROPS.has(key)));
    } else if (action === 'effect') {
      change.name = attrs.name;
      change.options = Object.fromEntries(Object.entries(attrs).filter(([key]) => key === 'color' || key === 'scale'));
    } else if (action === 'transform') change.to = attrs.to;
    else if (action === 'move_along') {
      change.path = attrs.path.slice(1);
      change.rotate = attrs.rotate === 'true';
    }
    return change;
  }

  /** Compile and validate visibility transitions and ordered child calls. */
  plan(slide: SlideSpec): AnimationStep[] {
    const states = new Map<string, boolean>();
    const changes = new Map<number, Array<[StepChange['action'], string, number, Attributes]>>();
    const visits = new Map<number, string[]>();
    const nextSteps = new Set<number>();
    const skipSteps = new Set<number>();
    const lines = new Map<number, number>();
    const push = <T>(map: Map<number, T[]>, key: number, value: T) => {
      if (!map.has(key)) map.set(key, []);
      (map.get(key) as T[]).push(value);
    };
    // Each step remembers the first line that names it, so an editor can find the stop of a line.
    const noteLine = (step: number, line: number) => lines.set(step, Math.min(lines.get(step) ?? Infinity, line));
    for (const item of slide.items) {
      if (item instanceof ElementSpec) {
        const appear = elementStep(item.attributes, item.line);
        // step=-1: shown before the slide is first visited, so present from the start and never animated in.
        if (appear < 0 && 'enter' in item.attributes) throw new MarkupError('step=-1 shows the element before the slide is visited, where nothing animates: no enter= there', item.line);
        states.set(item.id, appear <= 0);
        if (appear > 0) push(changes, appear, ['show', item.id, item.line, item.attributes]);
        noteLine(Math.max(0, appear), item.line);
        if ('hide' in item.attributes) {
          const hide = stepValue(item.attributes, 'hide', item.line);
          if (hide <= appear) throw new MarkupError("hide must be later than the element's appearance step", item.line);
          push(changes, hide, ['hide', item.id, item.line, item.attributes]);
          noteLine(hide, item.line);
        }
      } else if (item instanceof EventSpec) {
        if (item.step === 0) throw new MarkupError('Visibility event steps must be at least one', item.line);
        // A directive's own timing and style win over the element's defaults.
        const element = slide.items.find((candidate): candidate is ElementSpec => candidate instanceof ElementSpec && candidate.id === item.target);
        const timing: Attributes = {};
        for (const key of [...TIMING_ATTRS, item.action === 'show' ? 'enter' : 'exit']) {
          const value = item.attributes[key] ?? element?.attributes[key];
          if (value !== undefined) timing[key] = value;
        }
        push(changes, item.step, [item.action, item.target, item.line, timing]);
        noteLine(item.step, item.line);
      } else if (item instanceof ActionSpec) {
        push(changes, item.step, [item.action, item.target, item.line, item.attributes]);
        noteLine(item.step, item.line);
      } else if (item instanceof NextSpec || item instanceof SkipNextSpec) {
        const command = item instanceof NextSpec ? 'next' : 'skip_next';
        const commandSteps = item instanceof NextSpec ? nextSteps : skipSteps;
        if (!Number.isInteger(item.step) || item.step < 0) throw new MarkupError(`${command} steps must be nonnegative integers`, item.line);
        if (commandSteps.has(item.step)) throw new MarkupError(`Duplicate ${command} directive at step ${item.step}`, item.line);
        commandSteps.add(item.step);
        noteLine(item.step, item.line);
      }
    }
    // A transform reveals its target: a `step=N` on that element at the same step is consumed.
    for (const list of changes.values()) {
      for (const entry of [...list]) {
        if (entry[0] !== 'transform') continue;
        const index = list.findIndex((candidate) => candidate[0] === 'show' && candidate[1] === entry[3].to);
        if (index >= 0) list.splice(index, 1);
      }
    }
    let last = Math.max(0, ...changes.keys(), ...nextSteps, ...skipSteps);
    const explicitVisits = slide.items
      .filter((item): item is IncludeSpec | CodeSlideSpec => (item instanceof IncludeSpec || item instanceof CodeSlideSpec) && 'step' in item.attributes)
      .map((item) => stepValue(item.attributes, 'step', item.line));
    last = Math.max(last, ...explicitVisits);
    slide.items.forEach((item, index) => {
      if (item instanceof IncludeSpec || item instanceof CodeSlideSpec) {
        let number: number;
        if ('step' in item.attributes) number = stepValue(item.attributes, 'step', item.line);
        else {
          last += 1;
          number = last;
        }
        push(visits, number, childKey(index, item));
        noteLine(number, item.line);
      }
    });
    const result: AnimationStep[] = [];
    const numbers = new Set<number>([...changes.keys(), ...visits.keys(), ...nextSteps, ...skipSteps, ...[...nextSteps].map((n) => n + 1)]);
    for (const number of [...numbers].sort((a, b) => a - b)) {
      const seen = new Set<string>();
      const touch = (target: string, line: number, action: string) => {
        if (seen.has(target)) throw new MarkupError(`#${target} is changed twice at step ${number} (${action})`, line);
        seen.add(target);
      };
      for (const [action, target, line, attrs] of changes.get(number) ?? []) {
        if (action === 'show' || action === 'hide') {
          if (!states.has(target)) throw new MarkupError(`Unknown fragment target #${target}`, line);
          if (seen.has(target) || states.get(target) === (action === 'show')) {
            throw new MarkupError(`Inconsistent ${action} of #${target} at step ${number}`, line);
          }
          states.set(target, action === 'show');
          seen.add(target);
        } else if (action === 'transform') {
          if (states.get(target) !== true) throw new MarkupError(`#${target} must be visible to be transformed at step ${number}`, line);
          if (states.get(attrs.to) !== false) throw new MarkupError(`#${attrs.to} must be hidden before the transform at step ${number}`, line);
          touch(target, line, action);
          touch(attrs.to, line, action);
          states.set(target, false);
          states.set(attrs.to, true);
        } else {
          // Elements must be visible to be animated; included viewports always are.
          if (states.has(target) && states.get(target) !== true) {
            throw new MarkupError(`#${target} is hidden at step ${number}; show it before the ${action}`, line);
          }
          touch(target, line, action);
        }
      }
      result.push({
        number,
        changes: (changes.get(number) ?? []).map(([action, target, , attrs]) => ASTTransformer._change(action, target, attrs)),
        visits: visits.get(number) ?? [],
        autoNext: nextSteps.has(number),
        skipNext: skipSteps.has(number),
        line: lines.get(number) ?? slide.line,
      });
    }
    return result;
  }
}

export { ALIGNMENTS, NEIGHBORS };
