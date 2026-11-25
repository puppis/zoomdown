/** Slide-local reference geometry for authoring layouts. */
import * as THREE from 'three';
import { Line, Rectangle, Text, VGroup, Group, type Mobject } from 'manim-web';

/** The opacity of the dots of a slide being designed: enough to find a coordinate by, no more. */
const DOT_OPACITY = 0.28;
/** At most this many dots along a side: a larger canvas has one every 2, 5, 10, … units. */
const MOST_DOTS = 64;

/** The spacing of the dots of a canvas: one unit, or the first of 2, 5, 10, 20, … that keeps them countable. */
export function dotSpacing(width: number, height: number): number {
  const extent = Math.max(width, height);
  for (let scale = 1; ; scale *= 10) for (const step of [1, 2, 5]) if (extent / (step * scale) <= MOST_DOTS) return step * scale;
}

/**
 * The points of the grid a slide of this size is designed on, with how much larger than the others
 * each dot is: those on the axes and, more, those where both coordinates are multiples of five
 * spacings, the origin among them.
 */
export function designPoints(width: number, height: number): Array<{ x: number; y: number; size: number }> {
  const step = dotSpacing(width, height);
  const along = (extent: number): number[] => {
    const most = Math.floor(extent / 2 / step + 1e-9);
    return Array.from({ length: 2 * most + 1 }, (_, index) => index - most);
  };
  return along(height).flatMap((j) => along(width).map((i) => ({
    x: i * step,
    y: j * step,
    size: i % 5 === 0 && j % 5 === 0 ? 2 : i === 0 || j === 0 ? 1.5 : 1,
  })));
}

/**
 * The aids of a slide drawn for its design (`debug`): a frame around its canvas, seen while the
 * camera is on it or on its parent, where it marks the tile, and faint dots at its coordinates, seen
 * while the camera is on it. Both fade as the camera moves away. The dots are one
 * mesh under the content, sized so that they look the same on slides of every size.
 */
export class SlideGuides {
  readonly frame: Rectangle;
  /** The dots; null for a frame alone, as around a child left out of a partial rendering. */
  readonly dots: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;

  constructor(width: number, height: number, style: { color: string; frameColor: string; frameWidth: number; dots?: boolean }) {
    // As thick on the screen on a slide of any size, when the camera is on it.
    this.frame = new Rectangle({ width, height, fillOpacity: 0, color: style.frameColor, strokeWidth: (style.frameWidth * width) / 16 });
    this.dots = style.dots === false ? null : SlideGuides._dots(width, height, style.color);
  }

  private static _dots(width: number, height: number, color: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const radius = width / 900;
    const sides = 8;
    const points = designPoints(width, height);
    const positions = new Float32Array(points.length * sides * 9);
    let at = 0;
    for (const { x, y, size } of points) {
      for (let side = 0; side < sides; side++) {
        for (const corner of [null, side, side + 1]) {
          const angle = corner === null ? 0 : (corner * 2 * Math.PI) / sides;
          const reach = corner === null ? 0 : radius * size;
          positions[at++] = x + reach * Math.cos(angle);
          positions[at++] = y + reach * Math.sin(angle);
          positions[at++] = 0;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dots = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: DOT_OPACITY, depthTest: false, depthWrite: false }));
    dots.frustumCulled = false;
    return dots;
  }

  /** Show the frame and the dots as much as they are seen, each from 0 to 1. */
  show(frame: number, dots: number): void {
    const object = this.frame.getThreeObject();
    object.visible = frame > 0;
    if (frame > 0) {
      // Its stroke alone: a material without opacity (the fill's) stays so.
      object.traverse((node) => {
        const { material } = node as THREE.Mesh;
        for (const each of Array.isArray(material) ? material : material ? [material] : []) if (each.opacity > 0) each.opacity = frame;
      });
    }
    if (!this.dots) return;
    this.dots.visible = dots > 0;
    this.dots.material.opacity = DOT_OPACITY * dots;
  }

  dispose(): void {
    this.dots?.geometry.dispose();
    this.dots?.material.dispose();
  }
}

/**
 * How much the camera is on a slide, from 1 (it fills the view) to 0 (seen from its parent, or from
 * inside one of its children): by the ratio of the width it would be seen at to the one it is seen
 * at, and by how far from its center the camera is.
 */
export function cameraNearness(target: { center: ArrayLike<number>; width: number }, camera: { center: ArrayLike<number>; width: number }): number {
  const zoom = Math.abs(Math.log2(target.width / camera.width));
  const away = Math.hypot(target.center[0] - camera.center[0], target.center[1] - camera.center[1]) / target.width;
  return Math.max(0, 1 - zoom / 0.7) * Math.max(0, 1 - away);
}

/** Draw unit grid lines and small axis labels inside a logical canvas. */
export function coordinateGrid(width: number, height: number): Mobject {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.ceil(-halfWidth); x <= Math.floor(halfWidth); x++) xs.push(x);
  for (let y = Math.ceil(-halfHeight); y <= Math.floor(halfHeight); y++) ys.push(y);
  const lines = new VGroup();
  for (const x of xs) {
    lines.add(new Line({ start: [x, -halfHeight, 0], end: [x, halfHeight, 0], color: '#D3D3D3', strokeWidth: 0.6 }));
  }
  for (const y of ys) {
    lines.add(new Line({ start: [-halfWidth, y, 0], end: [halfWidth, y, 0], color: '#D3D3D3', strokeWidth: 0.6 }));
  }
  const labels = new Group();
  const addLabel = (coordinate: number, center: [number, number, number]) => {
    const label = new Text({ text: String(coordinate), fontSize: 12, color: '#AAAAAA' });
    const target = Math.min(0.14, height / 4, width / 4);
    if (label.getHeight() > 0) label.scale(target / label.getHeight());
    // Keep labels for boundary coordinates inside the canvas as well.
    const limitX = halfWidth - label.getWidth() / 2;
    const limitY = halfHeight - label.getHeight() / 2;
    label.moveTo([
      Math.max(-limitX, Math.min(limitX, center[0])),
      Math.max(-limitY, Math.min(limitY, center[1])),
      0,
    ]);
    labels.add(label);
  };
  for (const x of xs) addLabel(x, [x, -0.16, 0]);
  for (const y of ys) if (y !== 0) addLabel(y, [0.16, y, 0]); // The origin is labelled on the horizontal axis.
  return new Group(lines, labels);
}
