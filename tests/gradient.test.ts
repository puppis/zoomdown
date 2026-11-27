import { beforeAll, describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { Ellipse, Rectangle, type VMobject } from 'manim-web';
import { MarkupParser } from '../src/markup/parser';
import { gradientColor } from '../src/markup/ast';
import { setGradientFill } from '../src/gradient';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

/** The colors of a shape's built fill: per vertex, its y and its color's components. */
function fill(shape: VMobject): { size: number; vertices: Array<{ x: number; y: number; rgba: number[] }> } {
  shape.getThreeObject();
  const mesh = (shape as unknown as { _cachedFillMesh: THREE.Mesh | null })._cachedFillMesh;
  if (!mesh) throw new Error('no fill');
  const color = mesh.geometry.getAttribute('color');
  const position = mesh.geometry.getAttribute('position');
  const vertices = [];
  for (let i = 0; i < position.count; i += 1) {
    const rgba = [color.getX(i), color.getY(i), color.getZ(i), color.itemSize === 4 ? color.getW(i) : 1];
    vertices.push({ x: position.getX(i), y: position.getY(i), rgba });
  }
  return { size: color.itemSize, vertices };
}

describe('a gradient fill', () => {
  it('fades by the alphas of its colors, from first to last in its direction', () => {
    const shape = new Rectangle({ width: 4, height: 2 });
    shape.setFill('#FFFFFF', 1);
    setGradientFill(shape, [gradientColor('#ffffff00'), gradientColor('#ffffff')], 'down');
    const { size, vertices } = fill(shape);
    expect(size).toBe(4);
    // Transparent at the top, opaque at the bottom, half way in the middle, white throughout.
    for (const { y, rgba } of vertices) {
      expect(rgba[3]).toBeCloseTo((1 - y) / 2, 5);
      expect(rgba.slice(0, 3)).toEqual([1, 1, 1]);
    }
  });

  it('runs left, right and up as well, through every color', () => {
    const shape = new Ellipse({ width: 4, height: 2 });
    shape.setFill('#000000', 1);
    setGradientFill(shape, ['#ff000000', '#00ff00', '#0000ff80'].map(gradientColor), 'left');
    const { vertices } = fill(shape);
    const at = (x: number) => vertices.reduce((best, v) => (Math.abs(v.x - x) < Math.abs(best.x - x) ? v : best));
    // From the right (red, transparent) through green to the left (blue, half transparent).
    expect(at(2).rgba[0]).toBeCloseTo(1, 1);
    expect(at(2).rgba[3]).toBeCloseTo(0, 1);
    expect(at(0).rgba[1]).toBeGreaterThan(0.9);
    expect(at(-2).rgba[2]).toBeCloseTo(1, 1);
    expect(at(-2).rgba[3]).toBeCloseTo(128 / 255, 1);
  });

  it('keeps its alphas in a copy, and leaves an opaque gradient to the engine', () => {
    const shape = new Rectangle({ width: 2, height: 2 });
    shape.setFill('#FFFFFF', 1);
    setGradientFill(shape, [gradientColor('#ffffff00'), gradientColor('#ffffff')], 'up');
    expect(fill(shape.copy() as VMobject).size).toBe(4);
    const opaque = new Rectangle({ width: 2, height: 2 });
    opaque.setFill('#FFFFFF', 1);
    setGradientFill(opaque, ['#ff0000', '#0000ff'].map(gradientColor));
    expect(fill(opaque).size).toBe(3);
  });

  it('fills a shape written with fill_gradient', async () => {
    const s = await slide('', '[[rectangle: #fade x=0 y=0 width=4 height=2 stroke_width=0 fill_gradient="#ffffff00 #ffffff" gradient_direction=down]]');
    const shape = element(s, 'fade') as VMobject;
    expect(shape.getFillGradient()?.stops.map((stop) => stop.color)).toEqual(['#FFFFFF', '#FFFFFF']);
    expect(shape.fillOpacity).toBe(1);
    expect(fill(shape).size).toBe(4);
  });

  it('takes two colors or more, translucent ones too, one of four directions, and no hand drawing', () => {
    const parse = (body: string) => new MarkupParser().parse(`::: slide {#s}\n${body}\n:::`);
    const rect = (attributes: string) => parse(`[[rectangle: #r x=0 y=0 width=1 height=1 ${attributes}]]`);
    expect(gradientColor('#ffffff00')).toEqual({ color: '#FFFFFF', alpha: 0 });
    expect(gradientColor('#0008').alpha).toBeCloseTo(136 / 255, 9);
    expect(gradientColor('rgba(255,0,0,0.25)')).toEqual({ color: '#FF0000', alpha: 0.25 });
    expect(gradientColor('BLUE').alpha).toBe(1);
    expect(() => rect('fill_gradient="WHITE #ffffff80 #000000" gradient_direction=up')).not.toThrow();
    expect(() => rect('fill_gradient=WHITE')).toThrow(/fill-gradient needs two colors or more/);
    expect(() => rect('fill_gradient="WHITE nocolor"')).toThrow(/Invalid color "nocolor" in fill-gradient/);
    expect(() => rect('fill_gradient="WHITE BLACK" gradient_direction=sideways')).toThrow(/gradient-direction must be up, down, left or right/);
    expect(() => rect('gradient_direction=up')).toThrow(/gradient-direction requires fill-gradient/);
    expect(() => rect('fill_gradient="WHITE BLACK" sketch=true')).toThrow(/A hand-drawn shape cannot have fill-gradient/);
    expect(() => parse('[[polyline: #p points="(0,0) (1,1)" fill_gradient="WHITE BLACK"]]')).toThrow(/Unknown attributes: fill-gradient/);
  });
});
