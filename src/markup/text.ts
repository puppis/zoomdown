/**
 * Prose typography for markup slides.
 *
 * A `StyledLine` draws one line of styled runs (bold, italic, color, code)
 * onto a canvas texture and records its typographic baseline and advance, so
 * mixed prose/math lines share a baseline and wrapped paragraphs keep
 * consistent line pitch. `layoutParagraph` wraps spans within a logical
 * width and assembles the resulting lines into one group whose
 * `markupBaselineFraction` exposes the first baseline for layout anchors.
 */
import * as THREE from 'three';
import { Group, Text, type Mobject } from 'manim-web';
import type { InlineSpan } from './ast';

/** Canvas pixels per world unit at resolution scale one: an em is `fontSize / 72` units. */
export const PX_PER_WORLD_BASE = 96;
const PADDING_PX = 2;

/**
 * Supersampling scale of text canvases at rest. It is the same on every screen: the player
 * redraws the lines in view at the screen's own density once the camera rests, so following
 * the device pixel ratio here would only multiply the memory of the hundreds of lines out of
 * view (a 2× tablet ran out of it and Safari killed the page).
 */
export function textResolutionScale(): number {
  return 2;
}

/** Canvas pixels per world unit of a line at rest. */
/** How many times text lines were drawn to their canvases, and the time it took, since the page loaded. */
export const RASTER_STATS = { count: 0, ms: 0 };

export function textBasePxPerWorld(): number {
  return PX_PER_WORLD_BASE * textResolutionScale();
}

/** A run of text in one style within a laid-out line. */
export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  color: string;
  mono: boolean;
  /** Link target; linked runs are underlined and get a DOM hit area in the player. */
  href?: string | null;
  /** Struck through. */
  strike?: boolean;
  /** Underlined without being a link. */
  underline?: boolean;
  /** A subscript or a superscript: smaller, lowered or raised. */
  script?: 'sub' | 'sup';
}

/**
 * The size of a subscript or superscript of text, relative to the text, and how far it is raised,
 * in ems of the text: LaTeX's `\textsuperscript` and `\textsubscript` at ten points, a seven-point
 * script on the math axis' shifts of text style.
 */
const SCRIPT_SIZE = 0.7;
const SCRIPT_RISE = { sub: -0.15, sup: 0.363 } as const;

/** A run's font size in pixels, `px` being the text's. */
function runPx(run: Pick<TextRun, 'script'>, px: number): number {
  return run.script ? px * SCRIPT_SIZE : px;
}

/** How far a run's baseline is above the line's, in pixels. */
function runRise(run: Pick<TextRun, 'script'>, px: number): number {
  return run.script ? SCRIPT_RISE[run.script] * px : 0;
}

/** A link's horizontal extent on a rendered line, in the line's local world coordinates. */
export interface LinkBox {
  href: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Every live line that carries links, for the player's link layer. */
export const LINKED_LINES = new Set<StyledLine>();

/** Every live line, so the player can redraw text at the screen's resolution when the camera settles. */
export const TEXT_LINES = new Set<StyledLine>();

/** Smallest and largest canvas density relative to the base supersampling, and the widest canvas drawn. */
const MIN_DENSITY = 0.2;
const MAX_DENSITY = 6;
const MAX_CANVAS_PX = 8192;
/**
 * Relative change of density that triggers a redraw. At rest the texels must coincide with the
 * screen's pixels: a canvas even half a percent larger than its size on screen drifts by pixels
 * across a long line, which the pixel snapping of its left edge cannot cure. Only rounding
 * noise is ignored.
 */
const DENSITY_TOLERANCE = 1e-4;

/** The run layout of a line at the base canvas resolution, from which every redraw is drawn. */
interface LineLayout {
  px: number;
  width: number;
  height: number;
  originX: number;
  baselineY: number;
  metrics: RunMetrics[];
}

export interface StyledLineOptions {
  runs: TextRun[];
  fontSize: number;
  fontFamily: string;
  /** Color used when engine recolors the whole mobject (e.g. Indicate). */
  baseColor: string;
}

export const MONOSPACE = '"Latin Modern Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

function fontString(run: Pick<TextRun, 'bold' | 'italic' | 'mono'>, px: number, family: string): string {
  return `${run.italic ? 'italic' : 'normal'} ${run.bold ? 'bold' : 'normal'} ${px}px ${run.mono ? MONOSPACE : family}`;
}

let measureContext: CanvasRenderingContext2D | null = null;

function measurer(): CanvasRenderingContext2D {
  if (!measureContext) {
    const canvas = document.createElement('canvas');
    measureContext = canvas.getContext('2d');
    if (!measureContext) throw new Error('Canvas 2D is required for text layout');
  }
  return measureContext;
}

export interface RunMetrics {
  advance: number;
  inkLeft: number;
  inkRight: number;
  ascent: number;
  descent: number;
  fontAscent: number;
  fontDescent: number;
}

/**
 * Measure one run of text `px` canvas pixels large, in canvas pixels. A script's ink is where it
 * is drawn, raised or lowered; its line box is the text's.
 */
export function measureRun(run: TextRun, px: number, family: string): RunMetrics {
  const ctx = measurer();
  const size = runPx(run, px);
  const rise = runRise(run, px);
  ctx.font = fontString(run, size, family);
  const m = ctx.measureText(run.text);
  const fontAscent = (m.fontBoundingBoxAscent ?? size * 0.8) * (px / size);
  const fontDescent = (m.fontBoundingBoxDescent ?? size * 0.2) * (px / size);
  const blank = !run.text.trim();
  return {
    advance: m.width,
    inkLeft: blank ? 0 : -(m.actualBoundingBoxLeft ?? 0),
    inkRight: blank ? 0 : m.actualBoundingBoxRight ?? m.width,
    ascent: blank ? 0 : (m.actualBoundingBoxAscent ?? fontAscent) + rise,
    descent: blank ? 0 : (m.actualBoundingBoxDescent ?? fontDescent) - rise,
    fontAscent,
    fontDescent,
  };
}

const X_HEIGHTS = new Map<string, number>();

/** The height of a lowercase x in the context's current font, `px` pixels large, as a share of `px` cached per font. */
function xHeight(ctx: CanvasRenderingContext2D, px: number): number {
  let share = X_HEIGHTS.get(ctx.font);
  if (share === undefined) {
    const measured = ctx.measureText('x').actualBoundingBoxAscent;
    share = Number.isFinite(measured) && measured > 0 ? measured / px : 0.45;
    X_HEIGHTS.set(ctx.font, share);
  }
  return share * px;
}

/** One rendered line of styled prose with baseline metadata. */
export class StyledLine extends Text {
  private _runs: TextRun[] | null = null;
  private _family = '';
  private _baseColor = '#FFFFFF';
  /** Logical advance of the pen across the whole line, in world units. */
  advance = 0;
  /** World distance from the plane's left edge to the pen origin. */
  originInset = 0;
  /** Baseline height relative to the center, as a fraction of the plane height. */
  markupBaselineFraction = 0;
  /** Ink extents above and below the baseline, in world units. */
  inkAscent = 0;
  inkDescent = 0;
  /** Font line box above and below the baseline, in world units. */
  fontAscent = 0;
  fontDescent = 0;
  /** Link hit boxes in local coordinates (origin at the plane center). */
  links: LinkBox[] = [];
  private _layout: LineLayout | null = null;
  /** Canvas density relative to the base resolution; 1 until the player asks for another. */
  private _density = 1;
  /** The share of the canvas the quad shows: the texels actually drawn, not the rounded-up canvas size. */
  private _mapping = { x: 1, y: 1 };
  /** Whether the texture is aligned to the screen's pixels with plain filtering (the camera rests). */
  private _resting = false;

  constructor(options: StyledLineOptions) {
    super({
      text: options.runs.map((run) => run.text).join(''),
      fontSize: options.fontSize,
      fontFamily: options.fontFamily,
      color: options.baseColor,
      textAlign: 'left',
    });
    this._runs = options.runs;
    this._family = options.fontFamily;
    this._baseColor = options.baseColor;
    this._canvasDirty = true;
    this._renderToCanvas();
    TEXT_LINES.add(this);
  }

  get runs(): TextRun[] {
    return this._runs ?? [];
  }

  /** The mesh carries a reference to its line, so the player's text batches can find it in a slide's tree. */
  protected override _createThreeObject(): THREE.Object3D {
    const object = super._createThreeObject();
    const mesh = this.getTextureMesh();
    if (mesh) mesh.userData.styledLine = this;
    return object;
  }

  // What a text batch needs of a line: its raster, where the quad samples it, and whether it rests.
  get canvasElement(): HTMLCanvasElement | null {
    return this._canvas;
  }

  get lineTexture(): THREE.Texture | null {
    return this._texture;
  }

  private _rasterVersion = 0;

  /** Grows whenever the raster is redrawn; a batch compares it with the version it copied. */
  get rasterVersion(): number {
    return this._rasterVersion;
  }

  get resting(): boolean {
    return this._resting;
  }

  /** The part of the canvas the quad shows, with the resting shift, in the line's own texture coordinates. */
  get textureMapping(): { ox: number; oy: number; rx: number; ry: number } {
    const texture = this._texture;
    return texture ? { ox: texture.offset.x, oy: texture.offset.y, rx: texture.repeat.x, ry: texture.repeat.y } : { ox: 0, oy: 0, rx: 1, ry: 1 };
  }

  private _batched = false;

  /**
   * Drawn by a batch rather than by its own mesh: the mesh moves to a layer the camera does not
   * render (it stays in the tree for layout, links and bounds) and its texture leaves the GPU;
   * both come back when the line is drawn on its own again.
   */
  get batched(): boolean {
    return this._batched;
  }

  set batched(value: boolean) {
    const mesh = this.getTextureMesh();
    if (!mesh || value === this._batched) return;
    this._batched = value;
    mesh.layers.set(value ? 1 : 0);
    if (value) this._texture?.dispose();
  }

  /** Pixel size of the base font on the supersampled canvas. */
  private _px(): number {
    return (this.getFontSize() * 4) / 3 * textResolutionScale();
  }

  /** Canvas pixels per world unit of the current drawing. */
  get canvasDensity(): number {
    return PX_PER_WORLD_BASE * textResolutionScale() * this._density;
  }

  /**
   * Redraw the glyphs so that the canvas holds about `pxPerWorld` pixels per
   * world unit, which the player sets to the screen's own density once the
   * camera rests. The layout, the plane and every metric stay as they were;
   * only the sharpness of the bitmap changes. Returns whether a redraw happened.
   */
  rasterizeAt(pxPerWorld: number): boolean {
    const layout = this._layout;
    if (!layout || !this._canvas || !this._ctx || !Number.isFinite(pxPerWorld) || pxPerWorld <= 0) return false;
    const base = PX_PER_WORLD_BASE * textResolutionScale();
    let density = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, pxPerWorld / base));
    density = Math.min(density, MAX_CANVAS_PX / Math.max(layout.width, layout.height));
    if (Math.abs(density / this._density - 1) <= DENSITY_TOLERANCE) return false;
    this._density = density;
    this._draw(layout);
    const texture = this._texture;
    this._updateMesh();
    // A canvas of another size gets a fresh texture, mipmapped and unaligned again.
    if (this._texture !== texture) this._resting = false;
    this._applyMapping(0, 0);
    this._markDirty();
    return true;
  }

  /**
   * Map the quad onto exactly the texels drawn (the canvas is a whole number of texels, the
   * drawing `layout × density` of them), shifted by a fraction of a texel for pixel alignment.
   * The texture is flipped vertically, so the drawn rows are the top of its coordinate range.
   */
  private _applyMapping(shiftX: number, shiftY: number): void {
    const texture = this._texture;
    if (!texture) return;
    texture.repeat.set(this._mapping.x, this._mapping.y);
    texture.offset.set(shiftX, 1 - this._mapping.y + shiftY);
  }

  /**
   * Rest the line on the screen: shift its texture by the fraction of a pixel that separates
   * the quad from the pixel grid, so texels and pixels coincide, and sample it without mipmaps,
   * which would otherwise blend in a little of the half-resolution level. `toPixel` maps world
   * coordinates to device pixels. A rotated line only gets the plain filtering.
   */
  restOnScreen(toPixel: (x: number, y: number) => { x: number; y: number }): void {
    const texture = this._texture;
    const canvas = this._canvas;
    const mesh = this._mesh;
    if (!texture || !canvas || !mesh) return;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld.elements;
    const rotated = Math.abs(m[1]) > 1e-6 * Math.abs(m[0]) || Math.abs(m[4]) > 1e-6 * Math.abs(m[5]);
    if (rotated) this._applyMapping(0, 0);
    else {
      const corner = new THREE.Vector3(-this._worldWidth / 2, this._worldHeight / 2, 0).applyMatrix4(mesh.matrixWorld);
      const pixel = toPixel(corner.x, corner.y);
      const nearest = (value: number) => {
        const fraction = value - Math.floor(value);
        return fraction > 0.5 ? fraction - 1 : fraction;
      };
      // Screen pixel k samples texel k - left; adding the fraction back lands on texel centers.
      this._applyMapping(nearest(pixel.x) / canvas.width, -nearest(pixel.y) / canvas.height);
    }
    if (!this._resting) {
      this._resting = true;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }
  }

  /** Back to mipmapped, unaligned sampling for the camera's motion. */
  unrest(): void {
    const texture = this._texture;
    if (!texture) return;
    this._applyMapping(0, 0);
    if (!this._resting) return;
    this._resting = false;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }

  /** Draw the laid-out runs onto the canvas at the current density. */
  private _draw(layout: LineLayout): void {
    const drawStarted = performance.now();
    const canvas = this._canvas as HTMLCanvasElement;
    const ctx = this._ctx as CanvasRenderingContext2D;
    const runs = this._runs as TextRun[];
    const k = this._density;
    canvas.width = Math.max(1, Math.ceil(layout.width * k));
    canvas.height = Math.max(1, Math.ceil(layout.height * k));
    this._mapping = { x: (layout.width * k) / canvas.width, y: (layout.height * k) / canvas.height };
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const tint = this.color !== this._baseColor ? this.color : null;
    const px = layout.px;
    let x = layout.originX;
    const rule = Math.max(1, px * 0.05);
    runs.forEach((run, i) => {
      const size = runPx(run, px);
      const baseline = layout.baselineY - runRise(run, px);
      ctx.font = fontString(run, size, this._family);
      ctx.fillStyle = tint ?? run.color;
      ctx.globalAlpha = this.fillOpacity;
      if (run.text.trim()) ctx.fillText(run.text, x, baseline);
      // An underline stays on the line's, under a script too.
      if (run.href || run.underline) ctx.fillRect(x, layout.baselineY + px * 0.1, layout.metrics[i].advance, rule);
      // A strike runs through the middle of the lowercase letters, by the font's own x-height.
      if (run.strike) ctx.fillRect(x, baseline - xHeight(ctx, size) / 2 - rule / 2, layout.metrics[i].advance, rule);
      x += layout.metrics[i].advance;
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this._texture) this._texture.needsUpdate = true;
    this._rasterVersion += 1;
    RASTER_STATS.count += 1;
    RASTER_STATS.ms += performance.now() - drawStarted;
  }

  protected override _renderToCanvas(): void {
    if (!this._canvas || !this._ctx) return;
    const runs = this._runs;
    if (!runs) {
      // Called from the base constructor before runs exist.
      this._canvas.width = 1;
      this._canvas.height = 1;
      this._worldWidth = 0.01;
      this._worldHeight = 0.01;
      return;
    }
    const scale = textResolutionScale();
    const pxPerWorld = PX_PER_WORLD_BASE * scale;
    const px = this._px();
    const metrics = runs.map((run) => measureRun(run, px, this._family));
    let cursor = 0;
    let inkLeft = Infinity;
    let inkRight = -Infinity;
    let ascent = 0;
    let descent = 0;
    let fontAscent = 0;
    let fontDescent = 0;
    metrics.forEach((m, i) => {
      if (runs[i].text.trim()) {
        inkLeft = Math.min(inkLeft, cursor + m.inkLeft);
        inkRight = Math.max(inkRight, cursor + m.inkRight);
      }
      ascent = Math.max(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
      fontAscent = Math.max(fontAscent, m.fontAscent);
      fontDescent = Math.max(fontDescent, m.fontDescent);
      cursor += m.advance;
    });
    const empty = !Number.isFinite(inkLeft);
    if (empty) {
      inkLeft = 0;
      inkRight = 0;
    }
    const width = Math.max(1, Math.ceil(inkRight - inkLeft + 2 * PADDING_PX));
    // Underlines sit below the ink; keep room for them on the canvas.
    const underlineDepth = runs.some((run) => run.href || run.underline) ? px * 0.1 + Math.max(1, px * 0.05) : 0;
    const height = Math.max(1, Math.ceil(ascent + Math.max(descent, underlineDepth) + 2 * PADDING_PX));
    const originX = PADDING_PX - inkLeft;
    const baselineY = PADDING_PX + ascent;
    this._layout = { px, width, height, originX, baselineY, metrics };
    this._draw(this._layout);
    let x = originX;
    const linkRuns: Array<{ href: string; from: number; to: number }> = [];
    runs.forEach((run, i) => {
      if (run.href) {
        const last = linkRuns[linkRuns.length - 1];
        if (last && last.href === run.href && Math.abs(last.to - x) < 0.5) last.to = x + metrics[i].advance;
        else linkRuns.push({ href: run.href, from: x, to: x + metrics[i].advance });
      }
      x += metrics[i].advance;
    });
    this._worldWidth = width / pxPerWorld;
    this._worldHeight = height / pxPerWorld;
    this.links = linkRuns.map((run) => ({
      href: run.href,
      left: run.from / pxPerWorld - this._worldWidth / 2,
      right: run.to / pxPerWorld - this._worldWidth / 2,
      top: this._worldHeight / 2,
      bottom: -this._worldHeight / 2,
    }));
    if (this.links.length) LINKED_LINES.add(this);
    this.advance = cursor / pxPerWorld;
    this.originInset = originX / pxPerWorld;
    this.inkAscent = ascent / pxPerWorld;
    this.inkDescent = descent / pxPerWorld;
    this.fontAscent = fontAscent / pxPerWorld;
    this.fontDescent = fontDescent / pxPerWorld;
    const baselineWorld = this._worldHeight / 2 - baselineY / pxPerWorld;
    this.markupBaselineFraction = this._worldHeight > 0 ? baselineWorld / this._worldHeight : 0;
    this._canvasDirty = false;
  }

  override dispose(): void {
    TEXT_LINES.delete(this);
    LINKED_LINES.delete(this);
    super.dispose();
  }

  override copy(): StyledLine {
    const clone = new StyledLine({ runs: this.runs.map((run) => ({ ...run })), fontSize: this.getFontSize(), fontFamily: this._family, baseColor: this._baseColor });
    this._copyBaseAttributesInto(clone, { copyChildren: false });
    if (clone.color !== this.color) clone.setColor(this.color);
    return clone;
  }

  /** Place the pen origin at `x` with the baseline at `y`, in local coordinates. */
  placeOrigin(x: number, y: number): this {
    const centerX = x - this.originInset + this.getWidth() / 2;
    const centerY = y - this.markupBaselineFraction * this.getHeight();
    this.moveTo([centerX, centerY, 0]);
    return this;
  }
}

/**
 * A math object laid out so that its pen starts at x = 0 and its baseline is at y = 0: its ink
 * starts at x = 0, or `inset` further when the formula starts with space.
 */
export interface MathPiece {
  mobject: Mobject;
  advance: number;
  ascent: number;
  descent: number;
  /** A formula of space alone (`\phantom{MMM}`, `\quad`): it draws nothing, and its advance is its typeset width. */
  blank?: boolean;
  /** The space a formula that draws starts with (`$\qquad x$`), before its ink and within its advance. */
  inset?: number;
}

/** Makes the mobject of an inline formula at a size and a color. */
export type MathFactory = (latex: string, color: string) => Promise<MathPiece>;

export interface ParagraphOptions {
  fontSize: number;
  maxWidth: number;
  defaultColor: string;
  fontFamily: string;
  lineGap: number;
  /**
   * The distance between the baselines of two lines, in ems of `fontSize`; when set, it replaces
   * the font's reach above and below the baseline plus `lineGap`, and the lines' reach is split
   * from it as CSS splits a line box.
   */
  lineHeight?: number | null;
  /**
   * The columns of a row of a `::: align` block, which it shares with the other rows: `&&` then
   * separates cells in a text of one line too.
   */
  columns?: SharedColumns;
  /** Measure the text as such a row, and lay nothing out. */
  measureColumns?: (measure: ColumnMeasure) => void;
}

/** The columns the rows of a `::: align` block share. */
export interface SharedColumns {
  /** Where each column starts. */
  starts: number[];
  /** The left edge of a row's box, from the pen of its first column. */
  left: number;
  /** How much the rows shrink, all alike, so that the widest fits. */
  scale: number;
}

/** What a row of a `::: align` block asks of the columns: their widths, its em, where its ink starts, and the widths of its lines' cells. */
export interface ColumnMeasure {
  widths: number[];
  em: number;
  left: number;
  lines: number[][];
}

/** The columns that rows with these measures share, `gap` apart, each row within its width (`room`). */
export function shareColumns(rows: ReadonlyArray<{ measure: ColumnMeasure; room: number }>, gap: number | null): SharedColumns {
  const space = gap ?? Math.max(0, ...rows.map(({ measure }) => measure.em));
  const widths: number[] = [];
  for (const { measure } of rows) measure.widths.forEach((width, index) => { widths[index] = Math.max(widths[index] ?? 0, width ?? 0); });
  const starts: number[] = [];
  let x = 0;
  for (const [index, width] of widths.entries()) {
    starts[index] = x;
    x += (width ?? 0) + space;
  }
  let scale = 1;
  for (const { measure, room } of rows) {
    for (const line of measure.lines) {
      const right = line.length ? starts[line.length - 1] + line[line.length - 1] : 0;
      if (right > room + 1e-6) scale = Math.min(scale, room / right);
    }
  }
  return { starts, left: Math.min(...rows.map(({ measure }) => measure.left)), scale };
}

/** Whether a text has the column separator in its prose, as the parser sees it. */
const hasSeparator = (spans: InlineSpan[]): boolean => spans.some((s) => s.kind === 'text' && s.content.includes('&&'));

/** Whitespace that separates words: only ASCII's, so that a no-break or em space written as `&nbsp;` or `&emsp;` keeps its width. */
const BLANK = /^[ \t\n\r\f\v]*$/;
const isBlank = (text: string) => BLANK.test(text);

type Atom = InlineSpan;
type Word = Atom[];

/**
 * A line of a block: its cells, one unless the block has `&&` columns, and its indent, in spaces:
 * those that start its source line after a `\\` break (none in a block with columns, whose source
 * may be aligned freely).
 */
export interface Row {
  cells: Word[][];
  indent: number;
}

/**
 * Whether a block has columns: an unescaped `&&` in its prose (an escaped `\&&` arrives as two
 * separate spans), in a block of two lines or more (a line end of the source or `\\`). A single
 * line has nothing to align: there `&&` is two ampersands, as in `while (a && b)`.
 */
export function hasColumns(spans: InlineSpan[]): boolean {
  if (!hasSeparator(spans)) return false;
  return spans.some((s) => s.kind === 'text' && (s.soft || s.content.includes('\n')));
}

/**
 * Split spans into rows of cells of words. A row ends at a hard break (`\\`); in a block with
 * `&&` columns a line end of the source ends a row too, and `&&` ends a cell. Without columns
 * every row has one cell.
 */
export function inlineRows(spans: InlineSpan[], columns = hasColumns(spans)): Row[] {
  const rows: Row[] = [];
  let cells: Word[][] = [];
  let words: Word[] = [];
  let current: Atom[] = [];
  let gap: Atom[] = [];
  let indent = 0;
  const endWord = () => {
    if (current.length) {
      words.push(current);
      current = [];
    }
  };
  const endCell = () => {
    endWord();
    cells.push(words);
    words = [];
    gap = [];
  };
  const endRow = (next = 0) => {
    endCell();
    rows.push({ cells, indent });
    cells = [];
    indent = columns ? 0 : next;
  };
  const pattern = columns ? /\n|&&|[ \t\r\f\v]+|(?:[^ \t\n\r\f\v&]|&(?!&))+/g : /\n|[ \t\r\f\v]+|[^ \t\n\r\f\v]+/g;
  for (const s of spans) {
    const atoms = s.kind === 'math' ? [s.content] : (columns && s.soft ? '\n' : s.content).match(pattern) ?? [];
    for (const atom of atoms) {
      const part: Atom = { ...s, content: atom };
      if (s.kind === 'text' && columns && atom === '&&') {
        endCell();
      } else if (s.kind !== 'math' && isBlank(atom)) {
        endWord();
        if (atom === '\n') endRow(s.indent ?? 0);
        else if (s.kind === 'code') gap.push(part);
        else {
          // The space between two words of a link, a strike or an underline is drawn as they are.
          gap = [{ content: ' ', kind: 'text', bold: false, italic: false, color: null, href: s.href ?? null }];
          if (s.strike) gap[0].strike = true;
          if (s.underline) gap[0].underline = true;
        }
      } else {
        current.push(...gap);
        gap = [];
        current.push(part);
      }
    }
  }
  endRow();
  return rows;
}

/** Split spans into paragraphs of words, the cells of a row run together. */
export function inlineWords(spans: InlineSpan[]): Word[][] {
  return inlineRows(spans).map((row) => row.cells.flat());
}

function runsOf(atoms: Atom[], defaultColor: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const atom of atoms) {
    const run: TextRun = {
      text: atom.content, bold: atom.bold, italic: atom.italic, color: atom.color ?? defaultColor, mono: atom.kind === 'code', href: atom.href ?? null,
    };
    if (atom.strike) run.strike = true;
    if (atom.underline) run.underline = true;
    if (atom.script) run.script = atom.script;
    const last = runs[runs.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.color === run.color && last.mono === run.mono && (last.href ?? null) === run.href
      && Boolean(last.strike) === Boolean(run.strike) && Boolean(last.underline) === Boolean(run.underline) && last.script === run.script) {
      last.text += run.text;
    } else runs.push(run);
  }
  return runs;
}

/** Group a word sequence into prose segments and math atoms. */
function segments(words: Word[]): Array<{ math: Atom } | { prose: Atom[] }> {
  const result: Array<{ math: Atom } | { prose: Atom[] }> = [];
  let prose: Atom[] = [];
  const atoms = words.flat();
  // Leading prose whitespace is discarded at a wrapped line start.
  let start = 0;
  while (start < atoms.length && atoms[start].kind === 'text' && isBlank(atoms[start].content)) start += 1;
  for (const atom of atoms.slice(start)) {
    if (atom.kind === 'math') {
      if (prose.length) result.push({ prose });
      prose = [];
      result.push({ math: atom });
    } else prose.push(atom);
  }
  if (prose.length) result.push({ prose });
  return result;
}

interface ShapedLine {
  parts: Array<{ kind: 'text'; line: StyledLine } | { kind: 'math'; piece: MathPiece }>;
  advance: number;
  keepIndent: boolean;
  /**
   * The width of what starts the line without ink: spaces that keep their width (`&nbsp;`, `&emsp;`,
   * …) and formulas of space alone (`$\phantom{MMM}$`).
   */
  lead: number;
}

/** Spaces that keep their width, all but ASCII's, at the start of a text. */
const KEPT_SPACES = /^[^\S \t\n\r\f\v]+/;

/** Wrap spans to `maxWidth` logical units and assemble a left-aligned block. */
export async function layoutParagraph(spans: InlineSpan[], options: ParagraphOptions, mathFactory: MathFactory): Promise<Mobject> {
  const { fontSize, maxWidth, defaultColor, fontFamily, lineGap } = options;
  const lineHeight = options.lineHeight ?? null;
  // The interline: the font's reach plus the gap, or the line height in ems; with a line height,
  // the lines reach as far as their half of the difference takes them, as in CSS.
  const lineBox = (ascent: number, descent: number) => {
    if (lineHeight === null) return { spacing: ascent + descent + lineGap, ascent, descent };
    const spacing = lineHeight * (((fontSize * 4) / 3) / PX_PER_WORLD_BASE);
    const half = (spacing - ascent - descent) / 2;
    return { spacing, ascent: ascent + half, descent: descent + half };
  };
  const scale = textResolutionScale();
  const pxPerWorld = PX_PER_WORLD_BASE * scale;
  const px = (fontSize * 4) / 3 * scale;
  const mathCache = new Map<string, Promise<MathPiece>>();
  const mathFor = (atom: Atom) => {
    const key = `${atom.color ?? defaultColor}\u0000${atom.content}`;
    if (!mathCache.has(key)) mathCache.set(key, mathFactory(atom.content, atom.color ?? defaultColor));
    return mathCache.get(key) as Promise<MathPiece>;
  };
  const advanceOf = async (words: Word[]): Promise<number> => {
    let total = 0;
    for (const segment of segments(words)) {
      if ('math' in segment) total += (await mathFor(segment.math)).advance;
      else for (const run of runsOf(segment.prose, defaultColor)) total += measureRun(run, px, fontFamily).advance / pxPerWorld;
    }
    return total;
  };
  /**
   * A line is placed by its ink, which what starts it without ink does not have: spaces that keep
   * their width, formulas of space alone and the space a formula starts with. The line keeps its
   * width, and that of a plain space after it, which then separates words as anywhere in a line
   * (plain spaces that start the line are gone already).
   */
  const leadOf = async (words: Word[]): Promise<number> => {
    let lead = 0;
    for (const segment of segments(words)) {
      if ('math' in segment) {
        const piece = await mathFor(segment.math);
        if (!piece.blank) return lead + (piece.inset ?? 0);
        lead += piece.advance;
        continue;
      }
      for (const atom of segment.prose) {
        const spaces = isBlank(atom.content) ? atom.content : KEPT_SPACES.exec(atom.content)?.[0];
        if (!spaces) return lead;
        lead += measureRun({ text: spaces, bold: atom.bold, italic: atom.italic, color: defaultColor, mono: atom.kind === 'code', href: null, script: atom.script }, px, fontFamily).advance / pxPerWorld;
        if (spaces.length < atom.content.length) return lead;
      }
    }
    return lead;
  };
  const shape = async (words: Word[]): Promise<ShapedLine> => {
    const parts: ShapedLine['parts'] = [];
    let advance = 0;
    for (const segment of segments(words)) {
      if ('math' in segment) {
        const template = await mathFor(segment.math);
        const piece: MathPiece = { ...template, mobject: template.mobject.copy() };
        parts.push({ kind: 'math', piece });
        advance += piece.advance;
      } else {
        const line = new StyledLine({ runs: runsOf(segment.prose, defaultColor), fontSize, fontFamily, baseColor: defaultColor });
        parts.push({ kind: 'text', line });
        advance += line.advance;
      }
    }
    const first = words[0]?.[0];
    return { parts, advance, keepIndent: Boolean(first && first.kind === 'code' && !first.content.trim()), lead: await leadOf(words) };
  };
  const shared = (options.columns || options.measureColumns) && hasSeparator(spans);
  const rows = inlineRows(spans, shared || hasColumns(spans));
  // Columns: each row's cells are shaped unwrapped, every column is as wide as its widest cell,
  // and a cell starts where the columns before it end, plus a gap of an em; a row with fewer
  // cells leaves the rest empty, a row with one cell spans from the first column.
  if (rows.some((row) => row.cells.length > 1)) {
    const columns = options.columns;
    const em = ((fontSize * 4) / 3) / PX_PER_WORLD_BASE;
    const shaped: Array<ShapedLine[] | null> = [];
    const widths: number[] = [];
    for (const { cells: row } of rows) {
      if (row.every((cell) => !cell.length)) {
        shaped.push(null);
        continue;
      }
      const cells: ShapedLine[] = [];
      for (const [index, cell] of row.entries()) {
        const line = cell.length ? await shape(cell) : { parts: [], advance: 0, keepIndent: false, lead: 0 };
        cells.push(line);
        widths[index] = Math.max(widths[index] ?? 0, line.advance);
      }
      shaped.push(cells);
    }
    if (options.measureColumns) {
      // Where the ink of the first column starts, from the pen: the rows of a block start alike.
      let left = Infinity;
      for (const cells of shaped) {
        const first = cells?.[0].parts[0];
        if (!first) continue;
        if (first.kind === 'text') first.line.placeOrigin(0, 0);
        left = Math.min(left, (first.kind === 'text' ? first.line : first.piece.mobject).getLeft()[0]);
      }
      options.measureColumns({
        widths, em, left: Number.isFinite(left) ? left : 0,
        lines: shaped.filter((cells): cells is ShapedLine[] => cells !== null).map((cells) => cells.map((cell) => cell.advance)),
      });
      for (const cells of shaped) for (const cell of cells ?? []) for (const part of cell.parts) if (part.kind === 'text') part.line.dispose();
      return new Group();
    }
    let starts: number[] = [];
    let x = 0;
    widths.forEach((width, index) => {
      starts[index] = x;
      x += width + em;
    });
    if (columns) starts = columns.starts;
    const groups: Group[] = [];
    let ascent = 0;
    let descent = 0;
    let rowNumber = 0;
    for (const cells of shaped) {
      const members: Mobject[] = [];
      let right = 0;
      for (const [index, cell] of (cells ?? []).entries()) {
        let cursor = starts[index];
        for (const part of cell.parts) {
          if (part.kind === 'text') {
            part.line.placeOrigin(cursor, 0);
            cursor += part.line.advance;
            ascent = Math.max(ascent, part.line.inkAscent, part.line.fontAscent);
            descent = Math.max(descent, part.line.inkDescent, part.line.fontDescent);
            members.push(part.line);
          } else {
            part.piece.mobject.shift([cursor, 0, 0]);
            cursor += part.piece.advance;
            ascent = Math.max(ascent, part.piece.ascent);
            descent = Math.max(descent, part.piece.descent);
            members.push(part.piece.mobject);
          }
        }
        right = Math.max(right, cursor);
      }
      if (cells && members.length) {
        const group = new Group(...members);
        if (columns && group.getLeft()[0] > columns.left + 1e-9) {
          // The rows of an align block have their boxes start alike, wherever their ink does: a blank
          // line of text, a box of transparent pixels, marks it.
          const mark = new StyledLine({ runs: [{ text: '\u00a0', bold: false, italic: false, color: defaultColor, mono: false, href: null }], fontSize, fontFamily, baseColor: defaultColor });
          mark.placeOrigin(columns.left + mark.originInset, 0);
          group.add(mark);
        }
        // A block wider than its width shrinks as a whole row, as an overlong word does; the rows of
        // an align block shrink together.
        const factor = columns ? columns.scale : right > maxWidth + 1e-6 ? maxWidth / right : 1;
        if (factor !== 1) group.scale(factor, { aboutPoint: [0, 0, 0] });
        (group as Group & { rowNumber?: number }).rowNumber = rowNumber;
        groups.push(group);
      }
      rowNumber += 1;
    }
    if (!groups.length) return new Group();
    const box = lineBox(ascent, descent);
    const spacing = box.spacing;
    for (const group of groups) group.shift([0, -((group as Group & { rowNumber?: number }).rowNumber ?? 0) * spacing, 0]);
    const block = new Group(...groups) as Group & { markupBaselineFraction: number };
    const height = block.getHeight();
    block.markupBaselineFraction = height > 0 ? -block.getCenter()[1] / height : 0;
    const lastRow = Math.max(...groups.map((group) => (group as Group & { rowNumber?: number }).rowNumber ?? 0));
    markLines(block, { ascent: box.ascent, descent: box.descent, interline: spacing, first: 0, last: -lastRow * spacing });
    block.center();
    return block;
  }
  // A line indented by spaces starts that many plain spaces of the font in, and so do the lines it
  // wraps to, within what remains of the width (a quarter of it at least). The lines a line that
  // starts with space wraps to start under its first word too.
  const space = rows.some((row) => row.indent)
    ? measureRun({ text: ' ', bold: false, italic: false, color: defaultColor, mono: false, href: null }, px, fontFamily).advance / pxPerWorld
    : 0;
  const lines: Array<ShapedLine | null> = [];
  const indents: number[] = [];
  for (const row of rows) {
    const words = row.cells.flat();
    if (!words.length) {
      lines.push(null);
      indents.push(0);
      continue;
    }
    const indent = Math.min(row.indent * space, 0.75 * maxWidth);
    let hang: number | null = null;
    let start = 0;
    while (start < words.length) {
      if (start > 0 && hang === null) hang = Math.min(indent + (await leadOf(words)), 0.75 * maxWidth);
      const left = start === 0 ? indent : (hang as number);
      const width = maxWidth - left;
      let end = words.length;
      if (start === 0 && (await advanceOf(words)) <= width) end = words.length;
      else {
        // Exponential probing bounds one line, then binary search chooses its last whole word.
        let low = start + 1;
        let count = 2;
        let high = Math.min(start + count, words.length);
        while (high < words.length) {
          if ((await advanceOf(words.slice(start, high))) > width) break;
          low = high;
          count *= 2;
          high = Math.min(start + count, words.length);
        }
        while (low < high) {
          const middle = (low + high + 1) >> 1;
          if ((await advanceOf(words.slice(start, middle))) <= width) low = middle;
          else high = middle - 1;
        }
        end = low;
      }
      lines.push(await shape(words.slice(start, end)));
      indents.push(left);
      start = end;
    }
  }
  const visible = lines.filter((line): line is ShapedLine => line !== null);
  if (!visible.length) return new Group();
  const preserveIndent = visible.some((line) => line.keepIndent);
  // Place parts along each line's baseline at y = 0, then measure extents.
  const lineGroups: Array<Group | null> = [];
  // Where a line that starts with kept spaces is placed from: where it starts to draw, less their width.
  const starts: Array<number | null> = [];
  let ascent = 0;
  let descent = 0;
  for (const [number, line] of lines.entries()) {
    if (!line) {
      lineGroups.push(null);
      starts.push(null);
      continue;
    }
    let cursor = 0;
    const members: Mobject[] = [];
    for (const part of line.parts) {
      if (part.kind === 'text') {
        part.line.placeOrigin(cursor, 0);
        cursor += part.line.advance;
        ascent = Math.max(ascent, part.line.inkAscent, part.line.fontAscent);
        descent = Math.max(descent, part.line.inkDescent, part.line.fontDescent);
        members.push(part.line);
      } else {
        part.piece.mobject.shift([cursor, 0, 0]);
        cursor += part.piece.advance;
        ascent = Math.max(ascent, part.piece.ascent);
        descent = Math.max(descent, part.piece.descent);
        members.push(part.piece.mobject);
      }
    }
    // Its parts that draw: kept spaces alone before a formula are a part with no ink, whose box
    // stands at the pen and would count their width twice, and a formula of space alone has none.
    let start: number | null = null;
    if (line.lead) {
      const inked = line.parts.filter((part) => (part.kind === 'math' ? !part.piece.blank : part.line.runs.some((run) => run.text.trim())));
      if (inked.length) start = Math.min(...inked.map((part) => (part.kind === 'math' ? part.piece.mobject : part.line).getLeft()[0])) - line.lead;
    }
    const group = new Group(...members);
    // The line's box starts with its lead, so that a block whose lines all have one, a list item's
    // or a paragraph's single line, keeps it: a blank line of text, a box of transparent pixels,
    // marks where it starts. A block whose lines keep the indent of their code has none.
    if (start !== null && !preserveIndent && group.getLeft()[0] > start + 1e-9) {
      const mark = new StyledLine({ runs: [{ text: '\u00a0', bold: false, italic: false, color: defaultColor, mono: false, href: null }], fontSize, fontFamily, baseColor: defaultColor });
      mark.placeOrigin(start + mark.originInset, 0);
      group.add(mark);
    }
    const width = maxWidth - indents[number];
    let factor = 1;
    if (line.advance > width + 1e-6) {
      // A single unbreakable word can exceed the requested width.
      factor = width / line.advance;
      group.scale(factor, { aboutPoint: [0, 0, 0] });
    }
    lineGroups.push(group);
    starts.push(start === null ? null : factor * start);
  }
  const box = lineBox(ascent, descent);
  const spacing = box.spacing;
  const present = lineGroups.filter((g): g is Group => g !== null);
  const commonLeft = Math.min(...present.map((group) => group.getLeft()[0]));
  lineGroups.forEach((group, number) => {
    if (!group) return;
    const left = preserveIndent ? commonLeft : starts[number] ?? group.getLeft()[0];
    group.shift([indents[number] - left, -number * spacing, 0]);
  });
  const block = new Group(...present) as Group & { markupBaselineFraction: number };
  const height = block.getHeight();
  block.markupBaselineFraction = height > 0 ? -block.getCenter()[1] / height : 0;
  const lastLine = lineGroups.reduce((last, group, number) => (group ? number : last), 0);
  markLines(block, { ascent: box.ascent, descent: box.descent, interline: spacing, first: 0, last: -lastLine * spacing });
  block.center();
  return block;
}

/**
 * The lines of a laid-out text: its first and last baselines, how far its lines reach above and
 * below a baseline (the font's, or a taller formula's), and the distance between the baselines of
 * consecutive lines. Placement measures text by these rather than by its ink, so that a label
 * with descenders and one without, or two paragraphs, line up as lines of type do.
 */
export interface TextLines {
  /** The y of the first baseline. */
  first: number;
  /** The y of the last baseline. */
  last: number;
  ascent: number;
  descent: number;
  /** The distance between the baselines of consecutive lines. */
  interline: number;
}

type LinesMobject = Mobject & { markupLines?: { first: number; last: number; ascent: number; descent: number; interline: number } };

/**
 * Remember a text's lines, measured in its current coordinates, as fractions of its height from
 * its center, so that moving or scaling it keeps them.
 */
export function markLines(obj: Mobject, lines: TextLines): void {
  const height = obj.getHeight();
  if (!(height > 0)) return;
  const center = obj.getCenter()[1];
  (obj as LinesMobject).markupLines = {
    first: (lines.first - center) / height, last: (lines.last - center) / height,
    ascent: lines.ascent / height, descent: lines.descent / height, interline: lines.interline / height,
  };
}

/** The lines of a laid-out text where it is now, or null for anything that is not text. */
export function textLines(obj: Mobject): TextLines | null {
  const marks = (obj as LinesMobject).markupLines;
  if (!marks) return null;
  const height = obj.getHeight();
  const center = obj.getCenter()[1];
  return {
    first: center + marks.first * height, last: center + marks.last * height,
    ascent: marks.ascent * height, descent: marks.descent * height, interline: marks.interline * height,
  };
}

/** Read a typographic baseline from current measured geometry. */
export function baselineY(obj: Mobject): number {
  const fraction = (obj as Mobject & { markupBaselineFraction?: number }).markupBaselineFraction ?? 0;
  return obj.getCenter()[1] + fraction * obj.getHeight();
}

export { THREE };
