/**
 * Document records and validation helpers for the component Markdown dialect.
 *
 * Parsing and tree validation never instantiate text, images or LaTeX; those
 * resources are created once by `MarkupSlide.build` during preparation.
 */
import { FILL_STYLES } from '../sketch';
import { ICON_NAMES } from '../icons';
import { CHART_TYPES } from '../charts';
import { TABLE_RULES } from './table';
import * as engine from 'manim-web';

/** Invalid markup, with an optional one-based source line number. */
export class MarkupError extends Error {
  /**
   * How a line number is named in messages. Documents assembled from imported
   * files install a function here that names the file the line came from.
   */
  static describe: (line: number) => string = (line) => `Line ${line}`;
  readonly line: number | null;

  constructor(message: string, line: number | null = null) {
    message = hyphenatedNames(message);
    super(line !== null ? `${MarkupError.describe(line)}: ${message}` : message);
    this.name = 'MarkupError';
    this.line = line;
  }
}

/** A text, code or native math run with accumulated inline styling. */
export interface InlineSpan {
  content: string;
  kind: 'text' | 'code' | 'math';
  bold: boolean;
  italic: boolean;
  color: string | null;
  /** Link target when the span sits inside a Markdown link. */
  href?: string | null;
  /** A line end of the source (a space in prose; a row break in a block with `&&` columns). */
  soft?: boolean;
  /** Struck through, `~~text~~`. */
  strike?: boolean;
  /** Underlined without being a link, `[text]{underline=true}`. */
  underline?: boolean;
  /** A subscript, `H~2~O`, or a superscript, `x^2^`, of text. */
  script?: 'sub' | 'sup';
  /** A `\\` break's indent of the line it starts: the spaces that begin that line in the source. */
  indent?: number;
}

export function span(
  content: string, kind: InlineSpan['kind'] = 'text', bold = false, italic = false, color: string | null = null, href: string | null = null,
): InlineSpan {
  return href ? { content, kind, bold, italic, color, href } : { content, kind, bold, italic, color };
}

/** Whether a text has the column separator `&&` in its prose; an escaped one (`\&&`) is none. */
export function hasSeparator(spans: readonly InlineSpan[]): boolean {
  return spans.some((s) => s.kind === 'text' && s.content.includes('&&'));
}

/** An attribute map, every value a string as written. */
export type Attributes = Record<string, string>;

/** One slide-local text, image, display-math, shape or connection element. */
/** Where a block sits in a bullet or numbered list: its nesting depth (0 at the top level) and
 * its marker (`•`, `–`, `◦` by depth, or the item's own number such as `3.`); blocks after the
 * first one of an item have an empty marker and keep the indentation. */
export interface ListItem {
  depth: number;
  marker: string;
  /** Whether the list is tight, its items written without blank lines between them: they then follow one another as lines, not paragraphs. */
  tight?: boolean;
}

/** A `::: align` block: the texts with `&&` columns in it, its rows, share them. */
export class AlignSpec {
  /** `gap`: the space between two columns, an em of the largest row's text when null. */
  constructor(readonly gap: number | null, readonly line = 1) {}
}

/** One element of a slide as parsed: its kind, inline spans, attributes, source text, line, heading level and list position. */
export class ElementSpec {
  constructor(
    readonly id: string,
    readonly kind: string,
    readonly spans: InlineSpan[] = [],
    readonly attributes: Attributes = {},
    readonly source = '',
    readonly line = 1,
    readonly level = 0,
    readonly list: ListItem | null = null,
  ) {}

  /** The slide whose tile this text is the verdict of (`verdict=` on an include), or null. */
  verdictOf: string | null = null;

  /**
   * The style an element made by a block takes after those of its kind (`verdict`, `lifeline`,
   * `process`, `message`, `event`, `node`, `edge`), when the deck defines it; null for an element written as such.
   */
  role: string | null = null;

  /** The length of the whole lifeline a piece of it belongs to (a timeline's lifeline drawn in pieces), or null. */
  lifeline: number | null = null;

  /** The part of a block the element is (`node`, `edge`, `message`, …), whether or not the block names its class; null for any other. */
  part: string | null = null;

  /** The `::: align` block whose columns this text shares, as one of its rows, or null. */
  align: AlignSpec | null = null;

  /** What texts written without a blank line between them have in common: they follow one another as lines. */
  run: object | null = null;

  /** The name a line of a timeline or a graph gave the element, local to its block (its id is `<block>.<name>`), or null. */
  localName: string | null = null;

  /** Explicit local coordinates, interpreted using the element's anchor. */
  get position(): [number, number, number] | null {
    if (!('x' in this.attributes) && !('y' in this.attributes)) return null;
    return [Number(this.attributes.x ?? 0), Number(this.attributes.y ?? 0), 0];
  }
}

export type CellAlignment = 'left' | 'center' | 'right';

/** A pipe table: rows of cells (the first row is the header), each cell a list of inline spans. */
export class TableSpec extends ElementSpec {
  constructor(id: string, readonly rows: InlineSpan[][][], readonly aligns: CellAlignment[], attributes: Attributes = {}, line = 1, list: ListItem | null = null) {
    super(id, 'table', [], attributes, '', line, 0, list);
  }
}

/** Elements laid out in their own coordinates and handled as one element by the slide. */
export class GroupSpec extends ElementSpec {
  constructor(id: string, readonly items: ElementSpec[], attributes: Attributes = {}, line = 1) {
    super(id, 'group', [], attributes, '', line);
  }
}

/** A reference to another slide, with parent-local placement attributes. */
export class IncludeSpec {
  constructor(readonly target: string, readonly attributes: Attributes = {}, readonly line = 1) {}
}

/** A code-authored child (`[[subslide: ClassName ...]]`) with parent-local placement attributes. */
export class CodeSlideSpec {
  /** Whether the deck's `slide` style draws it for its design, unless its class or its directive says otherwise. */
  debug = false;

  constructor(readonly className: string, readonly attributes: Attributes = {}, readonly line = 1) {}
}

/** @deprecated Use `CodeSlideSpec`. */
/** The old name of `CodeSlideSpec`. */
export const ImportSpec = CodeSlideSpec;
/** @deprecated Use `CodeSlideSpec`. */
export type ImportSpec = CodeSlideSpec;

/** An explicit show/hide directive targeting one slide-local element. */
export class EventSpec {
  constructor(
    readonly action: 'show' | 'hide', readonly target: string, readonly step: number, readonly line = 1, readonly attributes: Attributes = {},
  ) {}
}

/** Automatically advance after a numbered slide-local step completes. */
export class NextSpec {
  constructor(readonly step: number, readonly line = 1, readonly attributes: Attributes = {}) {}
}

/** Omit the next navigation event after a numbered slide-local step. */
export class SkipNextSpec {
  constructor(readonly step: number, readonly line = 1, readonly attributes: Attributes = {}) {}
}

/** The animation directives: `animate`, `effect`, `transform`, `move_along`. */
export type ActionKind = 'animate' | 'effect' | 'transform' | 'move_along';

/** An animation directive at a numbered step: `[[animate: #id ...]]`, `[[effect: name #id ...]]`, … */
export class ActionSpec {
  constructor(readonly action: ActionKind, readonly target: string, readonly step: number, readonly attributes: Attributes, readonly line = 1) {}
}

/** Anything a slide holds: elements, includes, code children, visibility events, actions and the next and skip_next commands. */
export type SlideItem = ElementSpec | IncludeSpec | CodeSlideSpec | EventSpec | ActionSpec | NextSpec | SkipNextSpec;

/** One change played at a step: a fade, a property animation, an effect, a morph or a path motion. */
export interface StepChange {
  action: 'show' | 'hide' | ActionKind;
  target: string;
  runTime?: number;
  lag?: number;
  /** Rate function name (`RATE_NAMES`). */
  rate?: string;
  /** Entrance or exit style for show/hide. */
  style?: string;
  /** `animate`: x, y, at, dx, dy, anchor, angle, scale, opacity, color. */
  props?: Attributes;
  /** `effect`: the effect name and its options (color, scale). */
  name?: string;
  options?: Attributes;
  /** `transform`: the element that replaces the target. */
  to?: string;
  /** `move_along`: the shape to follow and whether to rotate along it. */
  path?: string;
  rotate?: boolean;
}

/** @deprecated Use `StepChange`. */
/** A show or hide change of a step; the same shape as `StepChange`. */
export type VisibilityChange = StepChange;

/** A compiled click: parallel changes, then ordered child visits. */
export interface AnimationStep {
  number: number;
  changes: StepChange[];
  visits: string[];
  autoNext: boolean;
  skipNext: boolean;
  /** The first source line of what happens at this step (the slide's own line when nothing names one). */
  line: number;
}

/** A named slide definition; `placeholder` marks synthesized missing includes. */
/** A `::: notes` block of a slide: the presenter's notes for the slide, or for one of its steps. */
export interface NotesSpec {
  /** The step the notes belong to; null for the slide as a whole. */
  step: number | null;
  /** The notes, as Markdown. */
  markdown: string;
  line: number;
}

/** A slide as parsed: its id, items, attributes, line, whether it is a placeholder, and its presenter notes. */
export class SlideSpec {
  constructor(
    readonly id: string,
    readonly items: SlideItem[],
    readonly attributes: Attributes = {},
    readonly line = 1,
    readonly placeholder = false,
    readonly notes: NotesSpec[] = [],
  ) {}

  /** The presenter's notes shown at a stop: the slide's own, then the step's; empty when there are none. */
  notesFor(step: number | null): string {
    return this.notes.filter((block) => block.step === null || block.step === step).map((block) => block.markdown.trim()).filter(Boolean).join('\n\n');
  }
}

/** Named attribute sets applied through roles (`heading`, `body`, …) and `.class` tokens. */
export type StyleSheet = Record<string, Attributes>;

/** Validated slide definitions, a root ID, an asset-resolution base URL and the style sheet. */
/**
 * A parsed document: its slides, the root of the tree they form, or, when several slides are
 * included by none, those top-level slides in document order, which playback visits first to
 * last as the pages of a flat document (`roots`; `root` is then the first of them).
 */
export class MarkupDocument {
  readonly roots: string[];

  constructor(readonly slides: SlideSpec[], readonly root: string, readonly basePath = '', readonly styles: StyleSheet = {}, roots?: string[]) {
    this.roots = roots ?? (root ? [root] : []);
  }

  /** Whether the document is a flat sequence of top-level slides rather than one tree. */
  get sequence(): boolean {
    return this.roots.length > 1;
  }
}

/** Boolean attributes that may be written bare: `skip-return` means `skip-return=true`; here by their names with underscores. */
export const BARE_FLAGS = new Set(['start_here', 'only_this', 'skip_return', 'force_return', 'preview', 'debug', 'focus_only']);

/** Attributes known by an earlier name, which messages point to the new one. */
export const RENAMED_ATTRIBUTES: Record<string, string> = { return_to_parent: 'force_return' };

/**
 * An attribute as the engine knows it, from the way the source writes it: decks write every name
 * with hyphens (`font-size`, `only-this`, `right-of`), the engine and the directive modules read them
 * with underscores (`font_size`, `only_this`), but for the relative placements, which keep their
 * hyphens. A name written with underscores reads the same.
 */
export function flagName(name: string): string {
  return POSITION_REFERENCES.has(name) ? name : name.replace(/-/g, '_');
}

/** An attribute's name as the documentation and the messages write it: with hyphens. */
export function shownName(name: string): string {
  return name.replace(/_/g, '-');
}

/**
 * A message with the attributes it names written as decks write them, with hyphens (`font_size`
 * becomes `font-size`). Values and directives keep their underscores (`rush_into`, `move_along`), and
 * so does what the message quotes ("…") or what is an id, a class, a macro or a path.
 */
export function hyphenatedNames(message: string): string {
  const kept = new Set([...RATE_NAMES, 'move_along', 'skip_next']);
  return message
    .split(/("[^"]*")/)
    .map((part, index) => (index % 2 ? part : part.replace(/(?<![\w#./\\{-])[a-z]+(?:_[a-z]+)+(?![\w-]|\.\w)/g, (word) => (kept.has(word) ? word : word.replace(/_/g, '-')))))
    .join('');
}

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export const CONTAINER = /^\s*:::\s*(.*?)\s*$/;
export const DIRECTIVE = /^\s*\[\[(include|subslide|import|pdf|arrow|line|rectangle|circle|polyline|dot|ellipse|polygon|arc|icon|artwork|brace|box|blob|iframe|show|hide|animate|effect|transform|move_along|next|skip_next):\s*(.*?)\]\]\s*$/;
/** A directive of the deck's own, `[[name: …]]` with any other name: drawn by `directives/name.ts`. */
export const CUSTOM_DIRECTIVE = /^\s*\[\[([A-Za-z_][\w-]*):\s*(.*?)\]\]\s*$/;
/** The name of an enter or exit style, an effect or a camera transition of the deck's own. */
export const LIBRARY_NAME = /^[A-Za-z_][\w-]*$/;
/** Names accepted by `rate=`; implemented in `animations.ts`. */
export const RATE_NAMES = new Set(['smooth', 'linear', 'rush_into', 'rush_from', 'there_and_back', 'ease_in', 'ease_out', 'ease_in_out']);
export const EFFECT_NAMES = new Set(['indicate', 'wiggle', 'circumscribe', 'flash', 'focus', 'grow', 'shrink', 'write', 'create', 'uncreate', 'draw', 'wave']);
export const ENTER_STYLES = new Set(['fade', 'grow', 'write', 'create', 'draw']);
export const EXIT_STYLES = new Set(['fade', 'shrink', 'uncreate']);
/** Attributes of `[[animate: ...]]` that describe the target state. */
export const ANIMATE_PROPS = new Set(['x', 'y', 'at', 'dx', 'dy', 'anchor', 'angle', 'scale', 'opacity', 'color']);
export const GEOMETRY = new Set(['x', 'y', 'width', 'height', 'angle']);
/**
 * The directions an element may stand in from another: beyond one side of its box, or, diagonally,
 * beyond one of its corners, `buff` away along both axes.
 */
export const NEIGHBORS: Record<string, [number, number, number]> = {
  below: [0, -1, 0],
  above: [0, 1, 0],
  'left-of': [-1, 0, 0],
  'right-of': [1, 0, 0],
  'above-left-of': [-1, 1, 0],
  'above-right-of': [1, 1, 0],
  'below-left-of': [-1, -1, 0],
  'below-right-of': [1, -1, 0],
};
/** The diagonal directions, which set both coordinates. */
export const DIAGONALS = new Set(['above-left-of', 'above-right-of', 'below-left-of', 'below-right-of']);
export const ALIGNMENTS: Record<string, [number, number, number]> = {
  'left-aligned': [-1, 0, 0],
  'right-aligned': [1, 0, 0],
  'top-aligned': [0, 1, 0],
  'bottom-aligned': [0, -1, 0],
};
export const POSITION_REFERENCES = new Set([...Object.keys(NEIGHBORS), ...Object.keys(ALIGNMENTS), 'baseline-aligned']);
export const HORIZONTAL_POSITION = new Set(['left-of', 'right-of', 'left-aligned', 'right-aligned', ...DIAGONALS]);
export const VERTICAL_POSITION = new Set(['above', 'below', 'top-aligned', 'bottom-aligned', 'baseline-aligned', ...DIAGONALS]);
export const LAYOUT = new Set([...GEOMETRY, ...POSITION_REFERENCES, 'buff', 'dx', 'dy', 'anchor', 'at', 'class']);
/** Timing of an element's own fade-in and fade-out, in seconds. */
export const TIMING_ATTRS = new Set(['run_time', 'lag']);
export const ELEMENT_ATTRS = new Set([
  'id', 'x', 'y', 'width', 'height', 'angle', 'step', 'hide', 'color', 'font_size', 'font', 'focus_only', 'opacity', 'anchor', 'dx', 'dy', 'at', 'class',
  'enter', 'exit', 'href', ...POSITION_REFERENCES, 'buff', ...TIMING_ATTRS,
]);
/** Attributes of a `::: {.group}` container. */
export const GROUP_ATTRS = new Set([
  'id', 'x', 'y', 'width', 'angle', 'step', 'hide', 'opacity', 'anchor', 'dx', 'dy', 'at', 'class', 'focus_only', 'enter', 'exit', 'href',
  ...POSITION_REFERENCES, 'buff', ...TIMING_ATTRS, 'font_size', 'font', 'color', 'line_height',
]);
/** What a group passes down to the members that take it and do not set their own. */
export const INHERITED_ATTRS = ['font_size', 'font', 'color', 'line_height'] as const;
/** Anchor points: bounding-box center, edges and corners, plus the first baseline for text-like elements. */
export const ANCHORS = new Set([
  'center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'left-baseline', 'baseline', 'right-baseline',
]);
/** The anchors of a box: its center, the middles of its sides and its corners. */
export const BOX_ANCHORS = new Set(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
/** The anchors on a text's first baseline: at its left end, its middle or its right end. */
export const BASELINE_ANCHORS = new Set(['left-baseline', 'baseline', 'right-baseline']);
/** Anchors including `origin`, the local coordinate origin of a group. */
export const GROUP_ANCHORS = new Set([...ANCHORS, 'origin']);
/** Anchors accepted as `layout.textAnchor`. */
export const TEXT_ANCHORS = ANCHORS;
/** Element kinds positioned by left edge and baseline rather than by center. */
export const TEXT_LIKE = new Set(['text', 'math', 'code']);
export const SHAPES = new Set(['rectangle', 'circle', 'polyline', 'dot', 'ellipse', 'polygon', 'arc']);
export const CONNECTIONS = new Set(['arrow', 'line']);
/** Decorations attached to other elements after layout; like connections they cannot anchor others. */
export const ATTACHMENTS = new Set(['brace', 'box', 'blob']);
/** Attachments that may enclose several elements at once. */
export const ENCLOSURES = new Set(['box', 'blob']);
/** Names accepted by `[[icon: name ...]]`. */
export const ICON_KINDS = new Set<string>(ICON_NAMES);
/** Where an icon's label sits. */
export const LABEL_SIDES = new Set(['below', 'above', 'left', 'right']);
/** What a shape takes for its labels: `label` (centered by default) and `sublabel` (below by default), each with its side, color and gap. */
export const SHAPE_LABEL_ATTRS = ['label', 'label_side', 'label_color', 'label_buff', 'label_width', 'sublabel', 'sublabel_side', 'sublabel_color', 'sublabel_buff', 'sublabel_font_size', 'sublabel_width'];
/** Continuous vibration of vector geometry: `tremble=` with its amplitude and rate. */
export const TREMBLE_ATTRS = new Set(['tremble', 'tremble_amplitude', 'tremble_rate']);
/** Element kinds made of vector geometry, which `tremble=` can shake. */
export const VECTOR_KINDS = new Set([...SHAPES, ...CONNECTIONS, ...ATTACHMENTS, 'icon', 'math', 'group', 'table', 'chart']);
/** Values of `type=` on chart fences. */
export const CHART_TYPE_NAMES = new Set<string>(CHART_TYPES);
/** Values of `rules=` on tables. */
export const TABLE_RULE_NAMES = new Set<string>(TABLE_RULES);
/** Attributes of tables beyond the common element attributes. */
export const TABLE_ATTRS = new Set(['header', 'header_font_size', 'col_font_size', 'padding', 'padding_x', 'padding_y', 'col_width', 'rules', 'valign', 'border_color', 'stroke_width', 'row_rule_color', 'row_rule_width', 'col_rule_color', 'col_rule_width', 'header_col_rules', 'header_col_rule_color', 'header_col_rule_width', 'fill_color', 'fill_opacity', 'header_color', 'header_opacity', 'stripe_opacity']);
/** Attributes of chart fences beyond the common element attributes. */
export const CHART_ATTRS = new Set(['type', 'src', 'header', 'colors', 'axis_color', 'border_color', 'stroke_width', 'fill_opacity', 'grid', 'legend', 'values', 'min', 'max']);
/** File extensions rendered as videos by the image syntax. */
export const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|ogv|ogg|mov)(?:[?#].*)?$/i;
export const BRACE_SIDES: Record<string, [number, number, number]> = { left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
export const STROKE_ATTRS = new Set(['stroke_width']);
export const FILL_ATTRS = new Set(['fill_color', 'fill_opacity']);
/** Hand-drawn rendering of shapes, connections and attachments: `sketch=true` and its tuning knobs. */
export const SKETCH_ATTRS = new Set(['sketch', 'roughness', 'bowing', 'fill_style', 'hachure_angle', 'hachure_gap', 'fill_weight', 'seed']);
/** Values of `fill_style`. */
export const FILL_STYLE_NAMES = new Set<string>(FILL_STYLES);

/** The element IDs an attachment decorates (`target` holds them separated by spaces). */
/** The ids of an attachment's targets. */
export function attachmentTargets(item: ElementSpec): string[] {
  return attachmentReferences(item).map((reference) => reference.id);
}

/** An attachment's targets, each the whole element or, with `.text`, a list item's text alone. */
export function attachmentReferences(item: ElementSpec): Reference[] {
  return (item.attributes.target ?? '').split(/\s+/).filter(Boolean).map(textReference);
}

/** An element a reference names: the whole of it, or with `text`, a list item's text without its marker. */
export interface Reference {
  id: string;
  text: boolean;
}

/**
 * Read a reference without its `#`: `id`, or `id.text` for a list item's text without its bullet
 * or number (on anything else, the element itself).
 */
export function textReference(id: string): Reference {
  return id.length > 5 && id.endsWith('.text') ? { id: id.slice(0, -5), text: true } : { id, text: false };
}

/** A parsed `tremble=` value: the step the vibration starts at and the step it stops at, if any. */
export interface TrembleRange {
  start: number;
  end: number | null;
}

/**
 * Parse `tremble=true` (from the element's appearance on), `tremble=N` (from
 * step N on) or `tremble=N-M` (from step N until step M, like `step`/`hide`).
 * Returns null for `tremble=false`.
 */
export function parseTremble(value: string, appear: number, line: number): TrembleRange | null {
  if (value === 'false') return null;
  if (value === 'true') return { start: appear, end: null };
  const match = /^(\d+)(?:-(\d+))?$/.exec(value);
  if (!match) throw new MarkupError('tremble must be true, false, a step N or a range N-M', line);
  const start = Number(match[1]);
  const end = match[2] === undefined ? null : Number(match[2]);
  if (end !== null && end <= start) throw new MarkupError('tremble ranges must end after they start', line);
  return { start, end };
}

export function positionTargets(item: ElementSpec | IncludeSpec | CodeSlideSpec): Set<string> {
  const result = new Set<string>();
  for (const [key, value] of Object.entries(item.attributes)) if (POSITION_REFERENCES.has(key)) result.add(textReference(value.slice(1)).id);
  if ('at' in item.attributes) {
    const at = parseAt(item.attributes.at, item.line);
    if ('id' in at.target) result.add(at.target.id);
  }
  // The slide's edges are there from the start: nothing waits for them.
  for (const edge of SLIDE_EDGES) result.delete(edge);
  return result;
}

/**
 * The corners of the slide, each with the anchor of an element that fills it: `at=#TOPRIGHT` puts
 * an element's top-right corner there, and beside a corner an element keeps to the slide.
 */
export const SLIDE_CORNERS: Record<string, string> = { TOPLEFT: 'top-left', TOPRIGHT: 'top-right', BOTTOMLEFT: 'bottom-left', BOTTOMRIGHT: 'bottom-right' };

/**
 * The names of the slide's own edges, corners and center, which positions may reference as they
 * reference elements (`above=#BOTTOM`, `right-of=#LEFTMOST`, `at=#CENTER`, `at=#TOPRIGHT`): each
 * edge a line along the side of the canvas, each corner and the center a point.
 */
export const SLIDE_EDGES = new Set(['TOP', 'BOTTOM', 'LEFTMOST', 'RIGHTMOST', 'CENTER', ...Object.keys(SLIDE_CORNERS)]);

/** What one of the slide's names stands for, in messages: its top edge, its top-left corner, its center. */
export function slidePart(id: string): string {
  if (id === 'CENTER') return 'center';
  if (id in SLIDE_CORNERS) return `${SLIDE_CORNERS[id]} corner`;
  return `${id.toLowerCase().replace(/most$/, '')} edge`;
}

/** A parsed `at=` placement: `[anchor:]#id[.anchor]` or `[anchor:](x,y)`. */
export interface AtExpression {
  /** The element's own anchor to place, or null for its default anchor. */
  anchor: string | null;
  target: { id: string; anchor: string | null; text: boolean } | { point: [number, number, number] };
}

/** Parse an `at=` value: `[anchor:]#id[.anchor]` or `[anchor:](x,y)`. */
export function parseAt(value: string, line: number): AtExpression {
  let anchor: string | null = null;
  let rest = value.trim();
  const colon = rest.indexOf(':');
  if (colon > 0 && !rest.startsWith('(') && !rest.startsWith('#')) {
    anchor = rest.slice(0, colon);
    rest = rest.slice(colon + 1);
    if (!GROUP_ANCHORS.has(anchor)) throw new MarkupError(`Unknown anchor ${JSON.stringify(anchor)} in at=`, line);
  }
  if (rest.startsWith('(')) return { anchor, target: { point: endpoint(rest, line) as [number, number, number] } };
  if (!rest.startsWith('#')) throw new MarkupError('at= takes [anchor:]#id[.text][.anchor] or [anchor:](x,y)', line);
  let id = rest.slice(1);
  let targetAnchor: string | null = null;
  const dot = id.lastIndexOf('.');
  if (dot > 0 && GROUP_ANCHORS.has(id.slice(dot + 1))) {
    targetAnchor = id.slice(dot + 1);
    id = id.slice(0, dot);
  }
  const reference = textReference(id);
  if (!IDENTIFIER.test(reference.id)) throw new MarkupError(`Invalid at= reference #${id}`, line);
  return { anchor, target: { id: reference.id, anchor: targetAnchor, text: reference.text } };
}

/** Normalize deck-provided styles (attribute strings or plain objects) into attribute maps. */
export function normalizeStyles(styles: Record<string, string | Record<string, unknown>> | undefined): StyleSheet {
  const result: StyleSheet = {};
  for (const [name, value] of Object.entries(styles ?? {})) {
    if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new MarkupError(`Invalid style name ${JSON.stringify(name)}`);
    if (typeof value === 'string') {
      try {
        result[name] = parseAttributes(value, 1);
      } catch (error) {
        throw new MarkupError(`Style ${name}: ${String((error as Error).message).replace(/^Line \d+: /, '')}`);
      }
    } else result[name] = Object.fromEntries(Object.entries(value).map(([key, item]) => [flagName(key), String(item)]));
  }
  return result;
}

/** The style roles an item receives automatically, most generic first. */
export function styleRoles(item: ElementSpec | IncludeSpec | CodeSlideSpec): string[] {
  if (!(item instanceof ElementSpec)) return ['include'];
  return item.role ? [...kindRoles(item), item.role] : kindRoles(item);
}

/** The style roles of an element by its kind. */
function kindRoles(item: ElementSpec): string[] {
  if (item.kind === 'text') return item.level ? ['heading', `h${item.level}`] : ['body'];
  if (SHAPES.has(item.kind)) return ['shape', item.kind];
  if (item.kind === 'icon') return ['shape', 'icon', `icon-${item.source}`];
  if (CONNECTIONS.has(item.kind)) return ['connection', item.kind];
  if (ATTACHMENTS.has(item.kind)) return ['attachment', item.kind];
  return [item.kind];
}

/** Fill in role and class styles below an item's own attributes, consuming its `class` token list. */
/** The attributes each element took from its styles rather than writing them itself. */
const STYLED_KEYS = new WeakMap<object, Set<string>>();

/** The attributes `item` took from a style role or class, not written on the element itself. */
export function styledKeys(item: ElementSpec | IncludeSpec | CodeSlideSpec): ReadonlySet<string> {
  return STYLED_KEYS.get(item) ?? new Set();
}

/** The attributes each element took from the styles of its role (`heading`, `body`, `h1`, …), no class setting them. */
const ROLE_KEYS = new WeakMap<object, Set<string>>();

/** The attributes `item` took from the style of its role (`heading`, `body`, …), not from a class or itself. */
export function roleStyledKeys(item: ElementSpec | IncludeSpec | CodeSlideSpec): ReadonlySet<string> {
  return ROLE_KEYS.get(item) ?? new Set();
}

export function applyStyles(item: ElementSpec | IncludeSpec | CodeSlideSpec, styles: StyleSheet): void {
  const attrs = item.attributes;
  // Styles may be applied more than once (when parsing and when validating): the keys add up.
  const styled = STYLED_KEYS.get(item) ?? new Set<string>();
  STYLED_KEYS.set(item, styled);
  const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean);
  delete attrs.class;
  const layers: Attributes[] = [];
  for (const role of styleRoles(item)) if (styles[role]) layers.push(styles[role]);
  const roles = layers.length;
  for (const name of classes) {
    const style = styles[name];
    if (!style) throw new MarkupError(`Unknown style class .${name}`, item.line);
    layers.push(style);
  }
  const merged: Attributes = {};
  for (const layer of layers) Object.assign(merged, layer);
  const fromClasses = new Set(layers.slice(roles).flatMap((layer) => Object.keys(layer)));
  const fromRoles = ROLE_KEYS.get(item) ?? new Set<string>();
  ROLE_KEYS.set(item, fromRoles);
  for (const [key, value] of Object.entries(merged)) {
    if (key === 'id' || key === 'class') continue;
    if (!(key in attrs)) {
      attrs[key] = value;
      styled.add(key);
      if (!fromClasses.has(key)) fromRoles.add(key);
    }
  }
}

/** Resolve layout dependencies iteratively, rejecting cycles before media creation. */
export function positionOrder(elements: Map<string, ElementSpec | IncludeSpec | CodeSlideSpec>): string[] {
  const dependents = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  for (const [identifier, item] of elements) {
    const targets = positionTargets(item);
    remaining.set(identifier, targets.size);
    for (const target of targets) {
      if (!dependents.has(target)) dependents.set(target, []);
      (dependents.get(target) as string[]).push(identifier);
    }
  }
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  const order: string[] = [];
  while (ready.length) {
    const identifier = ready.shift() as string;
    order.push(identifier);
    for (const dependent of dependents.get(identifier) ?? []) {
      const count = (remaining.get(dependent) as number) - 1;
      remaining.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }
  if (order.length !== elements.size) {
    const identifier = [...remaining].find(([, count]) => count > 0)?.[0] as string;
    throw new MarkupError(`Relative positioning cycle involving #${identifier}`, elements.get(identifier)?.line ?? null);
  }
  return order;
}

export function childKey(index: number, item: IncludeSpec | CodeSlideSpec): string {
  // Colons cannot occur in markup slide IDs, so code-authored children never collide with includes.
  return item instanceof IncludeSpec ? item.target : `class:${index}`;
}

const RESERVED = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new',
  'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

export function checkClassName(className: string, line: number): void {
  const valid = className.split('.').every((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part) && !RESERVED.has(part));
  if (!valid) throw new MarkupError(`Invalid class name ${JSON.stringify(className)}`, line);
}

/** Split `source` like a POSIX shell lexer: quotes group, backslashes escape, parentheses keep `(x,y)` whole. */
export function tokenize(source: string, line: number, separators = ' \t\r\n'): string[] {
  const tokens: string[] = [];
  let current: string | null = null;
  let quote: string | null = null;
  let escaped = false;
  let depth = 0;
  const chars = [...source];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (escaped) {
      current = (current ?? '') + char;
      escaped = false;
      continue;
    }
    if (quote !== null) {
      // Inside quotes a backslash escapes the quote only; any other stays, so that `\\` is a line
      // break and `$\to$` a formula in a label.
      if (char === '\\' && chars[i + 1] === quote) {
        current = (current ?? '') + quote;
        i += 1;
      } else if (char === quote) quote = null;
      else current = (current ?? '') + char;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      if (current === null) current = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      if (current === null) current = '';
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')' && depth > 0) depth -= 1;
    if (depth === 0 && separators.includes(char)) {
      if (current !== null) tokens.push(current);
      current = null;
      continue;
    }
    current = (current ?? '') + char;
  }
  if (quote !== null) throw new MarkupError('Invalid attribute quoting: No closing quotation', line);
  if (escaped) throw new MarkupError('Invalid attribute quoting: No escaped character', line);
  if (current !== null) tokens.push(current);
  return tokens;
}

/**
 * Parse an attribute list (`{#id x=2 .class flag}`) into a map; commas also separate attributes
 * inside directives. `style=` is read as CSS and becomes `color`, unless `css` is false: the
 * arguments of a snippet are plain values, whatever their names.
 */
export function parseAttributes(source: string, line: number, options: { commas?: boolean; css?: boolean } = {}): Attributes {
  source = source.trim();
  if (source.startsWith('{') && source.endsWith('}')) source = source.slice(1, -1);
  const result: Attributes = {};
  const classes: string[] = [];
  for (const token of tokenize(source, line, options.commas ? ' \t\r\n,' : ' \t\r\n')) {
    if (token === '.element' || token === '.group') continue;
    if (token.startsWith('.')) {
      if (!/^\.[A-Za-z_][\w-]*$/.test(token)) throw new MarkupError(`Invalid class name ${JSON.stringify(token)}`, line);
      classes.push(token.slice(1));
      continue;
    }
    let key: string;
    let value: string;
    if (token.startsWith('#')) [key, value] = ['id', token.slice(1)];
    else if (token.includes('=')) {
      const index = token.indexOf('=');
      [key, value] = [token.slice(0, index), token.slice(index + 1)];
    } else if (token.includes(':') && POSITION_REFERENCES.has(token.split(':', 1)[0])) {
      const index = token.indexOf(':');
      [key, value] = [token.slice(0, index), token.slice(index + 1)];
    } else if (BARE_FLAGS.has(flagName(token)) || flagName(token) in RENAMED_ATTRIBUTES) [key, value] = [token, 'true'];
    else throw new MarkupError(`Expected an attribute such as x=2; found ${JSON.stringify(token)}`, line);
    // A snippet's arguments are named by its placeholders, whatever their names.
    if (options.css !== false) key = flagName(key);
    if (key in result) throw new MarkupError(`Duplicate attribute ${JSON.stringify(shownName(key))}`, line);
    result[key] = value;
  }
  if ('style' in result && options.css !== false) {
    if ('color' in result) throw new MarkupError('Use either color= or style= for color, not both', line);
    result.color = cssColor(result.style, line);
    delete result.style;
  }
  if (classes.length) {
    if ('class' in result) throw new MarkupError('Use .name tokens or class=, not both', line);
    result.class = classes.join(' ');
  }
  return result;
}

const CSS_NAMED: Record<string, string> = {
  aliceblue: '#F0F8FF', antiquewhite: '#FAEBD7', aqua: '#00FFFF', aquamarine: '#7FFFD4', azure: '#F0FFFF', beige: '#F5F5DC',
  bisque: '#FFE4C4', black: '#000000', blanchedalmond: '#FFEBCD', blue: '#0000FF', blueviolet: '#8A2BE2', brown: '#A52A2A',
  burlywood: '#DEB887', cadetblue: '#5F9EA0', chartreuse: '#7FFF00', chocolate: '#D2691E', coral: '#FF7F50',
  cornflowerblue: '#6495ED', cornsilk: '#FFF8DC', crimson: '#DC143C', cyan: '#00FFFF', darkblue: '#00008B', darkcyan: '#008B8B',
  darkgoldenrod: '#B8860B', darkgray: '#A9A9A9', darkgreen: '#006400', darkgrey: '#A9A9A9', darkkhaki: '#BDB76B',
  darkmagenta: '#8B008B', darkolivegreen: '#556B2F', darkorange: '#FF8C00', darkorchid: '#9932CC', darkred: '#8B0000',
  darksalmon: '#E9967A', darkseagreen: '#8FBC8F', darkslateblue: '#483D8B', darkslategray: '#2F4F4F', darkslategrey: '#2F4F4F',
  darkturquoise: '#00CED1', darkviolet: '#9400D3', deeppink: '#FF1493', deepskyblue: '#00BFFF', dimgray: '#696969',
  dimgrey: '#696969', dodgerblue: '#1E90FF', firebrick: '#B22222', floralwhite: '#FFFAF0', forestgreen: '#228B22',
  fuchsia: '#FF00FF', gainsboro: '#DCDCDC', ghostwhite: '#F8F8FF', gold: '#FFD700', goldenrod: '#DAA520', gray: '#808080',
  green: '#008000', greenyellow: '#ADFF2F', grey: '#808080', honeydew: '#F0FFF0', hotpink: '#FF69B4', indianred: '#CD5C5C',
  indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C', lavender: '#E6E6FA', lavenderblush: '#FFF0F5', lawngreen: '#7CFC00',
  lemonchiffon: '#FFFACD', lightblue: '#ADD8E6', lightcoral: '#F08080', lightcyan: '#E0FFFF', lightgoldenrodyellow: '#FAFAD2',
  lightgray: '#D3D3D3', lightgreen: '#90EE90', lightgrey: '#D3D3D3', lightpink: '#FFB6C1', lightsalmon: '#FFA07A',
  lightseagreen: '#20B2AA', lightskyblue: '#87CEFA', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#B0C4DE', lightyellow: '#FFFFE0', lime: '#00FF00', limegreen: '#32CD32', linen: '#FAF0E6', magenta: '#FF00FF',
  maroon: '#800000', mediumaquamarine: '#66CDAA', mediumblue: '#0000CD', mediumorchid: '#BA55D3', mediumpurple: '#9370DB',
  mediumseagreen: '#3CB371', mediumslateblue: '#7B68EE', mediumspringgreen: '#00FA9A', mediumturquoise: '#48D1CC',
  mediumvioletred: '#C71585', midnightblue: '#191970', mintcream: '#F5FFFA', mistyrose: '#FFE4E1', moccasin: '#FFE4B5',
  navajowhite: '#FFDEAD', navy: '#000080', oldlace: '#FDF5E6', olive: '#808000', olivedrab: '#6B8E23', orange: '#FFA500',
  orangered: '#FF4500', orchid: '#DA70D6', palegoldenrod: '#EEE8AA', palegreen: '#98FB98', paleturquoise: '#AFEEEE',
  palevioletred: '#DB7093', papayawhip: '#FFEFD5', peachpuff: '#FFDAB9', peru: '#CD853F', pink: '#FFC0CB', plum: '#DDA0DD',
  powderblue: '#B0E0E6', purple: '#800080', rebeccapurple: '#663399', red: '#FF0000', rosybrown: '#BC8F8F', royalblue: '#4169E1',
  saddlebrown: '#8B4513', salmon: '#FA8072', sandybrown: '#F4A460', seagreen: '#2E8B57', seashell: '#FFF5EE', sienna: '#A0522D',
  silver: '#C0C0C0', skyblue: '#87CEEB', slateblue: '#6A5ACD', slategray: '#708090', slategrey: '#708090', snow: '#FFFAFA',
  springgreen: '#00FF7F', steelblue: '#4682B4', tan: '#D2B48C', teal: '#008080', thistle: '#D8BFD8', tomato: '#FF6347',
  turquoise: '#40E0D0', violet: '#EE82EE', wheat: '#F5DEB3', white: '#FFFFFF', whitesmoke: '#F5F5F5', yellow: '#FFFF00',
  yellowgreen: '#9ACD32',
};

let enginePalette: Map<string, string> | null = null;

/**
 * The deck's named colors (`colors:` in its front matter or theme), by lowercase name: every
 * color attribute, inline span and formula of the deck may name them, before the engine's names.
 * One deck is loaded per page; loading one sets them.
 */
const DECK_COLORS = new Map<string, string>();

/** The color a deck names `name`, as #RRGGBB, or undefined. */
export function deckColor(name: string): string | undefined {
  return DECK_COLORS.get(name.trim().toLowerCase());
}

/**
 * Set the deck's named colors, replacing those of a deck loaded before: names of letters, digits,
 * `_` and `-`, each any color `color=` takes (a later one may name an earlier one).
 */
export function setDeckColors(colors: Record<string, string> | undefined): void {
  DECK_COLORS.clear();
  for (const [name, value] of Object.entries(colors ?? {})) {
    if (!/^[A-Za-z][\w-]*$/.test(name)) throw new MarkupError(`A color's name is letters, digits, _ and -: not ${JSON.stringify(name)}`);
    let color: string;
    try {
      color = parseColor(String(value));
    } catch {
      throw new MarkupError(`The color ${name} is not a color: ${JSON.stringify(value)}`);
    }
    DECK_COLORS.set(name.toLowerCase(), color);
  }
}

function palette(): Map<string, string> {
  if (!enginePalette) {
    enginePalette = new Map();
    for (const [name, value] of Object.entries(engine as unknown as Record<string, unknown>)) {
      if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) && /^[A-Z_0-9]+$/.test(name)) {
        enginePalette.set(name, value.toUpperCase());
      }
    }
  }
  return enginePalette;
}

function parseCssRgb(value: string): string | null {
  const match = value.match(/^rgba?\(\s*([^)]*)\)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channels = parts.slice(0, 3).map((part) => {
    if (part.endsWith('%')) return Math.round((parseFloat(part) / 100) * 255);
    return Math.round(parseFloat(part));
  });
  if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return null;
  if (parts.length > 3) {
    const alpha = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (alpha !== 1) throw new Error('Transparent text colors are not supported');
  }
  return '#' + channels.map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** Normalize a CSS color (named, hex or rgb) to an opaque six-digit hex string. */
export function parseCssColor(value: string): string {
  const trimmed = value.trim();
  const named = CSS_NAMED[trimmed.toLowerCase()];
  if (named) return named;
  const hex = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split('').map((d) => d + d).join('');
    if (digits.length === 8) {
      if (digits.slice(6).toLowerCase() !== 'ff') throw new Error('Transparent text colors are not supported');
      digits = digits.slice(0, 6);
    }
    return '#' + digits.toUpperCase();
  }
  const rgb = parseCssRgb(trimmed);
  if (rgb) return rgb;
  throw new Error(`Invalid color ${JSON.stringify(value)}`);
}

/**
 * A color of a gradient, which may be translucent: a palette name or CSS color, or a hex value
 * with an alpha (`#RRGGBBAA`, `#RGBA`), or `rgba(…)`; its opaque hex and its alpha from 0 to 1.
 */
export function gradientColor(value: string): { color: string; alpha: number } {
  const trimmed = value.trim();
  const hex = /^#([0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/.exec(trimmed);
  if (hex) {
    const digits = hex[1].length === 4 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
    return { color: '#' + digits.slice(0, 6).toUpperCase(), alpha: parseInt(digits.slice(6), 16) / 255 };
  }
  const rgba = /^rgba\(\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s)]+)\s*\)$/i.exec(trimmed);
  if (rgba) {
    const alpha = rgba[4].endsWith('%') ? Number(rgba[4].slice(0, -1)) / 100 : Number(rgba[4]);
    if (!(alpha >= 0 && alpha <= 1)) throw new Error(`Invalid alpha in ${JSON.stringify(value)}`);
    return { color: parseColor(`rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`), alpha };
  }
  return { color: parseColor(trimmed), alpha: 1 };
}

/** Normalize an engine palette name, hex value or CSS color into a hex string. */
export function parseColor(value: string): string {
  const trimmed = value.trim();
  const named = deckColor(trimmed);
  if (named) return named;
  const fromPalette = palette().get(trimmed.toUpperCase());
  if (fromPalette) return fromPalette;
  return parseCssColor(trimmed);
}

/** Normalize an opaque CSS color declaration into the existing color AST. */
export function cssColor(style: string, line: number): string {
  let color: string | null = null;
  for (const declaration of style.split(';')) {
    if (!declaration.trim()) continue;
    const index = declaration.indexOf(':');
    if (index < 0 || !declaration.slice(index + 1).trim()) throw new MarkupError('Expected a CSS declaration such as color:red', line);
    if (declaration.slice(0, index).trim().toLowerCase() !== 'color') {
      throw new MarkupError('Only the CSS color property is supported; use Markdown for emphasis', line);
    }
    color = declaration.slice(index + 1).trim();
  }
  if (color === null) throw new MarkupError('style must contain a CSS color declaration', line);
  try {
    return parseCssColor(color);
  } catch (error) {
    throw new MarkupError(`Invalid or non-opaque CSS color ${JSON.stringify(color)}`, line);
  }
}

/** The step of an element's own appearance: a nonnegative integer, or -1 for a member shown before its slide is first visited. */
export const EARLY_STEP = -1;

/** How the elements of a slide get their steps (`layout.steps`): numbered one by one, or following the source. */
export type StepMode = 'explicit' | 'sequential';

/** What `step=+` or `hide=+` without sequential steps is told. */
export const RELATIVE_STEP = 'step=+ and hide=+ count from the element before, which needs sequential steps: steps: sequential under layout: in the front matter';

export function elementStep(attrs: Attributes, line: number): number {
  if (attrs.step === '-1') return EARLY_STEP;
  return stepValue(attrs, 'step', line);
}

export function stepValue(attrs: Attributes, key: string, line: number, fallback = 0): number {
  const value = attrs[key] ?? String(fallback);
  if (!/^\d+$/.test(value)) throw new MarkupError(`${key} must be a nonnegative integer`, line);
  return Number(value);
}

export function numberValue(attrs: Attributes, key: string, line: number, fallback: number | null = null): number | null {
  const value = attrs[key] ?? fallback;
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (typeof value === 'string' && !value.trim())) throw new MarkupError(`${shownName(key)} must be a number`, line);
  if (['width', 'height', 'font_size', 'size'].includes(key) && number <= 0) throw new MarkupError(`Invalid ${key}: ${value}`, line);
  return number;
}

export type Endpoint = string | [number, number, number];

export function endpoint(value: string, line: number): Endpoint {
  if (value.startsWith('#')) return value.slice(1);
  const parts = value.replace(/^\(|\)$/g, '').split(',').map((part) => part.trim());
  const coordinates = parts.map(Number);
  if (coordinates.length !== 2 || parts.some((p) => !p) || coordinates.some((c) => !Number.isFinite(c))) {
    throw new MarkupError('Coordinates must be two finite numbers', line);
  }
  return [coordinates[0], coordinates[1], 0];
}

/** An end of an arrow or a line: an element (or a list item's text), at one of its anchors or at its edge, or a point. */
export type ConnectionEnd = { id: string; anchor: string | null; text: boolean } | [number, number, number];

/** Parse `#id`, `#id.text`, either with `.anchor` (as in `at=`), or `(x,y)` as an end of an arrow or a line. */
export function connectionEnd(value: string, line: number): ConnectionEnd {
  if (!value.startsWith('#')) return endpoint(value, line) as [number, number, number];
  let id = value.slice(1);
  let anchor: string | null = null;
  const dot = id.lastIndexOf('.');
  if (dot > 0 && GROUP_ANCHORS.has(id.slice(dot + 1))) {
    anchor = id.slice(dot + 1);
    id = id.slice(0, dot);
  }
  return { ...textReference(id), anchor };
}

export function polylinePoints(value: string, line: number, minimum = 2): Array<[number, number, number]> {
  const tokens = value.match(/\([^()]+\)/g) ?? [];
  if (tokens.length < minimum || value.replace(/\([^()]+\)/g, '').trim()) {
    throw new MarkupError(`${minimum === 2 ? 'Polyline' : 'Polygon'} points require at least ${minimum === 2 ? 'two' : 'three'} (x,y) coordinates`, line);
  }
  const points = tokens.map((token) => endpoint(token, line) as [number, number, number]);
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] === points[i - 1][0] && points[i][1] === points[i - 1][1]) {
      throw new MarkupError('Consecutive polyline points must be distinct', line);
    }
  }
  return points;
}
