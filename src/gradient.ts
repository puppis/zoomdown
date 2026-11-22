/**
 * Gradient fills that fade: the engine fills a shape with a linear gradient by coloring the
 * vertices of a finely divided fill mesh, in red, green and blue only. A shape filled here keeps
 * the alpha of every color of its gradient too: after the engine builds its fill, the colors are
 * computed again, with their alpha, from the same divided mesh, which three.js then blends. The
 * alphas travel with the shape when the engine copies it (for snapshots and transforms).
 *
 * Shapes without alphas, and every shape without a gradient, are filled by the engine as before.
 */
import * as THREE from 'three';
import { VMobject } from 'manim-web';

/** One color of a gradient: an opaque hex color and its alpha, from 0 to 1. */
export interface GradientStop {
  color: string;
  alpha: number;
}

/** Which way a gradient runs, from its first color to its last. */
export type GradientDirection = 'up' | 'down' | 'left' | 'right';

/** The engine's angle for each direction: 0 runs left to right, a quarter turn bottom to top. */
const ANGLES: Record<GradientDirection, number> = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };

/** The engine's internals that a fill with alphas reads and replaces. */
interface FillInternals {
  _fillGradient: { type: 'linear'; angle?: number; stops: Array<{ offset: number; color: string }> } | null;
  _cachedFillMesh: THREE.Mesh | null;
  _updateFillGeometry(group: THREE.Object3D, points: number[][]): void;
  _copyFillGradientInto(target: VMobject): void;
  /** The alphas of the gradient's colors, in order, when one of them is not opaque. */
  markupFillAlphas?: number[];
}

/**
 * Fill `shape` with a linear gradient of `stops`, spaced evenly from the first to the last in
 * `direction`; its fill opacity scales every alpha.
 */
export function setGradientFill(shape: VMobject, stops: GradientStop[], direction: GradientDirection = 'right'): void {
  if (stops.length < 2) throw new Error('A gradient needs two colors or more');
  installGradientAlphas();
  const internals = shape as unknown as FillInternals;
  const alphas = stops.map((stop) => stop.alpha);
  if (alphas.some((alpha) => alpha < 1)) internals.markupFillAlphas = alphas;
  else delete internals.markupFillAlphas;
  shape.setFillGradient({
    type: 'linear',
    angle: ANGLES[direction],
    stops: stops.map((stop, index) => ({ offset: index / (stops.length - 1), color: stop.color })),
  });
}

/**
 * Where a point of a fill lies along a linear gradient at `angle`, from 0 to 1, within the
 * fill's box: the engine's own measure, so that the alphas follow its colors exactly.
 */
function along(angle: number, x: number, y: number, width: number, height: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const span = width * Math.abs(cos) + height * Math.abs(sin);
  if (span < 1e-9) return 0;
  const t = ((x - width / 2) * cos + (y - height / 2) * sin) / span + 0.5;
  return Math.max(0, Math.min(1, t));
}

/** The color and alpha at `t` of stops at `offsets`, mixed as the engine mixes them, in sRGB. */
function mix(offsets: number[], colors: number[][], alphas: number[], t: number): number[] {
  const last = offsets.length - 1;
  if (t <= offsets[0]) return [...colors[0], alphas[0]];
  if (t >= offsets[last]) return [...colors[last], alphas[last]];
  let i = 0;
  while (i < last - 1 && t > offsets[i + 1]) i += 1;
  const width = offsets[i + 1] - offsets[i];
  const f = width > 0 ? (t - offsets[i]) / width : 1;
  const [a, b] = [colors[i], colors[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, alphas[i] + (alphas[i + 1] - alphas[i]) * f];
}

/** Give a built fill mesh colors with alpha, from its gradient and its alphas. */
export function colorFillWithAlphas(shape: VMobject): void {
  const internals = shape as unknown as FillInternals;
  const gradient = internals._fillGradient;
  const alphas = internals.markupFillAlphas;
  const geometry = internals._cachedFillMesh?.geometry;
  if (!gradient || gradient.type !== 'linear' || !alphas || alphas.length !== gradient.stops.length || !geometry) return;
  const position = geometry.getAttribute('position');
  if (!position) return;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.count; i += 1) {
    minX = Math.min(minX, position.getX(i));
    maxX = Math.max(maxX, position.getX(i));
    minY = Math.min(minY, position.getY(i));
    maxY = Math.max(maxY, position.getY(i));
  }
  const offsets = gradient.stops.map((stop) => stop.offset);
  const color = new THREE.Color();
  const colors = gradient.stops.map((stop) => {
    color.set(stop.color);
    const rgb = { r: 0, g: 0, b: 0 };
    color.getRGB(rgb, THREE.SRGBColorSpace);
    return [rgb.r, rgb.g, rgb.b];
  });
  const values = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const t = along(gradient.angle ?? 0, position.getX(i) - minX, position.getY(i) - minY, maxX - minX, maxY - minY);
    const [r, g, b, a] = mix(offsets, colors, alphas, t);
    color.setRGB(r, g, b, THREE.SRGBColorSpace);
    values.set([color.r, color.g, color.b, a], i * 4);
  }
  // Four components: three.js blends each vertex by its alpha (the fill material is transparent).
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 4));
}

let installed = false;

/** Make the engine keep a gradient's alphas when it builds a fill and when it copies a shape. */
export function installGradientAlphas(): void {
  if (installed) return;
  installed = true;
  const prototype = VMobject.prototype as unknown as FillInternals;
  const build = prototype._updateFillGeometry;
  const copy = prototype._copyFillGradientInto;
  prototype._updateFillGeometry = function (this: FillInternals, group: THREE.Object3D, points: number[][]): void {
    build.call(this, group, points);
    if (this.markupFillAlphas) colorFillWithAlphas(this as unknown as VMobject);
  };
  prototype._copyFillGradientInto = function (this: FillInternals, target: VMobject): void {
    copy.call(this, target);
    const alphas = this.markupFillAlphas;
    if (alphas) (target as unknown as FillInternals).markupFillAlphas = [...alphas];
    else delete (target as unknown as FillInternals).markupFillAlphas;
  };
}
