/**
 * Measuring on the slides while designing them: with the measure gesture held (Control by
 * default), the pointer is a crosshair and a label beside it gives its coordinates in the slide
 * the camera is on, in that slide's units; a drag measures from where it started, the label giving
 * the length and its horizontal and vertical parts, along a line drawn between the two points.
 * Nothing of it is recorded, printed or exported: it is the page's own, over the stage.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A point of a slide, in its own coordinates, and the page point it was read at. */
export interface MeasuredPoint {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

/** A number as the label writes it: two decimals, a true minus sign, no negative zero. */
export function measureNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Math.abs(rounded).toFixed(2);
  return rounded < 0 ? `−${text}` : text;
}

/** What the label says: a point's coordinates, or the length from `start` to `end` and its parts. */
export function measureText(end: Pick<MeasuredPoint, 'x' | 'y'>, start: Pick<MeasuredPoint, 'x' | 'y'> | null = null): string {
  if (!start) return `x ${measureNumber(end.x)}   y ${measureNumber(end.y)}`;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return `length ${measureNumber(Math.hypot(dx, dy))}   dx ${measureNumber(dx)}   dy ${measureNumber(dy)}`;
}

/** The label and the line over the stage. */
export class MeasureOverlay {
  readonly label: HTMLElement;
  readonly line: SVGSVGElement;
  private readonly _segment: SVGLineElement;
  private readonly _ends: SVGCircleElement[];
  /** Where a drag started, while it lasts and until the pointer moves after it ended. */
  start: MeasuredPoint | null = null;
  /** Whether the last drag ended: the measure stays until the pointer moves on. */
  private _settled = false;

  constructor(private readonly host: HTMLElement) {
    this.label = document.createElement('div');
    this.label.className = 'measure-label';
    this.label.hidden = true;
    this.label.setAttribute('aria-live', 'off');
    this.line = document.createElementNS(SVG_NS, 'svg');
    this.line.setAttribute('class', 'measure-line');
    this.line.setAttribute('aria-hidden', 'true');
    this._segment = document.createElementNS(SVG_NS, 'line');
    this._ends = [0, 1].map(() => {
      const end = document.createElementNS(SVG_NS, 'circle');
      end.setAttribute('r', '3');
      return end;
    });
    this.line.append(this._segment, ...this._ends);
    this.line.style.display = 'none';
    host.append(this.line, this.label);
  }

  /** Show the coordinates of `point`, or, during a drag (or right after one), the measure from where it started. */
  show(point: MeasuredPoint, slide: string): void {
    const bounds = this.host.getBoundingClientRect();
    if (this._settled && this.start && Math.hypot(point.clientX - this._last.clientX, point.clientY - this._last.clientY) > 3) {
      this._settled = false;
      this.start = null;
    }
    const at = this._settled ? this._last : point;
    if (!this._settled) this._last = point;
    const start = this.start;
    this.label.textContent = '';
    const title = document.createElement('span');
    title.className = 'slide';
    title.textContent = slide;
    this.label.append(title, document.createTextNode(measureText(at, start)));
    this.label.hidden = false;
    // Beside the pointer, inside the stage.
    const x = at.clientX - bounds.left + 16;
    const y = at.clientY - bounds.top + 18;
    this.label.style.left = `${Math.min(x, Math.max(0, bounds.width - this.label.offsetWidth - 4))}px`;
    this.label.style.top = `${Math.min(y, Math.max(0, bounds.height - this.label.offsetHeight - 4))}px`;
    if (start) {
      const points = [start, at].map((p) => [p.clientX - bounds.left, p.clientY - bounds.top]);
      this._segment.setAttribute('x1', String(points[0][0]));
      this._segment.setAttribute('y1', String(points[0][1]));
      this._segment.setAttribute('x2', String(points[1][0]));
      this._segment.setAttribute('y2', String(points[1][1]));
      this._ends.forEach((end, index) => {
        end.setAttribute('cx', String(points[index][0]));
        end.setAttribute('cy', String(points[index][1]));
      });
      this.line.style.display = '';
    } else this.line.style.display = 'none';
  }

  private _last: MeasuredPoint = { x: 0, y: 0, clientX: 0, clientY: 0 };

  /** Start measuring from `point`. */
  begin(point: MeasuredPoint): void {
    this.start = point;
    this._settled = false;
    this._last = point;
  }

  /** The drag ended: its measure stays on screen until the pointer moves on. */
  end(): void {
    if (this.start) this._settled = true;
  }

  /** Nothing on screen. */
  hide(): void {
    this.start = null;
    this._settled = false;
    this.label.hidden = true;
    this.line.style.display = 'none';
  }
}
