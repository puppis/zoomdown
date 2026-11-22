import { beforeAll, describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { anchorPoint, shapeFrame, type TurnedMobject } from '../src/markup/renderer';
import { textLines } from '../src/markup/text';
import type { OutlineMobject } from '../src/sketch';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const QUARTER = Math.PI / 2;
const close = (actual: readonly number[], expected: readonly number[]) => expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 6));
/** Within the wobble of hand-drawn strokes, which a sketchy shape is placed by. */
const near = (actual: readonly number[], expected: readonly number[]) => expected.slice(0, 2).forEach((value, axis) => expect(Math.abs(actual[axis] - value)).toBeLessThan(0.05));
/** `p` turned by `angle` about `pivot`. */
const turned = (p: readonly number[], angle: number, pivot: readonly number[]) => [
  pivot[0] + Math.cos(angle) * (p[0] - pivot[0]) - Math.sin(angle) * (p[1] - pivot[1]),
  pivot[1] + Math.sin(angle) * (p[0] - pivot[0]) + Math.cos(angle) * (p[1] - pivot[1]),
];

describe('angle on an element', () => {
  it('is accepted on elements and groups, not on iframes, connections and attachments', () => {
    const parse = (body: string) => new MarkupParser().parse(`::: slide {#s}\n[[rectangle: #a x=0 y=0 width=1 height=1]]\n\n${body}\n:::`);
    for (const body of ['Tilted {#t angle=0.2}', '[[rectangle: #r x=1 y=1 width=2 height=1 angle=0.2]]', '[[icon: star #i angle=-0.4]]',
      '![](assets/tiles.png){#img angle=0.1}', '::: {.group #g angle=0.3}\nOne\n:::', '[[arc: #arc x=0 y=0 radius=1 angle=2]]']) {
      expect(() => parse(body)).not.toThrow();
    }
    expect(() => parse('Tilted {#t angle=steep}')).toThrow(/angle must be a number/);
    expect(() => parse('[[iframe: https://example.org, #f, angle=0.2]]')).toThrow(/Unknown attributes: angle/);
    expect(() => parse('[[arrow: #a -> (3,3), #ar, angle=0.2]]')).toThrow(/Unknown attributes: angle/);
    expect(() => parse('[[box: #a, #bx, angle=0.2]]')).toThrow(/Unknown attributes: angle/);
  });

  it('turns a shape about its center, counterclockwise', async () => {
    const s = await slide('', '[[rectangle: #r x=1 y=2 width=4 height=2 angle=0.5]]');
    const r = element(s, 'r');
    close(r.getCenter(), [1, 2]);
    expect(r.getWidth()).toBeCloseTo(4 * Math.cos(0.5) + 2 * Math.sin(0.5), 6);
    expect(r.getHeight()).toBeCloseTo(4 * Math.sin(0.5) + 2 * Math.cos(0.5), 6);
    // Counterclockwise: the right end of the long side rises.
    const corners = (r as OutlineMobject).markupOutline?.getPoints() ?? [];
    const rightmost = corners.reduce((best, p) => (p[0] > best[0] ? p : best));
    expect(rightmost[1]).toBeGreaterThan(2);
  });

  it('turns the exact outline of a sketchy shape with it, which paths follow', async () => {
    const s = await slide('', `[[rectangle: #r x=2 y=1 width=4 height=1 angle=${QUARTER} sketch=true]]`);
    const points = (element(s, 'r') as OutlineMobject).markupOutline?.getPoints() ?? [];
    const span = (axis: number) => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
    const middle = (axis: number) => (Math.max(...points.map((p) => p[axis])) + Math.min(...points.map((p) => p[axis]))) / 2;
    expect(span(0)).toBeCloseTo(1, 6);
    expect(span(1)).toBeCloseTo(4, 6);
    near([middle(0), middle(1)], [2, 1]);
  });

  it('turns text about its anchor, the left end of its first baseline, which stays on its point', async () => {
    const upright = element(await slide('', 'Label {#t x=-3 y=-1}'), 't');
    const tilted = element(await slide('', `Label {#t x=-3 y=-1 angle=${QUARTER}}`), 't');
    // Its box before the turn, turned a quarter about (-3, -1): it reads upward from the point.
    close(shapeFrame(tilted).center, turned(upright.getCenter(), QUARTER, [-3, -1]));
    expect(tilted.getWidth()).toBeCloseTo(upright.getHeight(), 6);
    expect(tilted.getHeight()).toBeCloseTo(upright.getWidth(), 6);
    // Measured by its box from now on: no lines of text, baseline anchors at its middle.
    expect(textLines(tilted)).toBeNull();
    expect(anchorPoint(tilted, 'baseline')[1]).toBeCloseTo(tilted.getCenter()[1], 9);
  });

  it('turns about the anchor at= names, once dx and dy have moved the element', async () => {
    const s = await slide('', '[[rectangle: #r at=top-left:(1,1) width=2 height=1 angle=0.5]]\n\n[[rectangle: #q x=0 y=-2 dx=1 width=2 height=1 angle=0.5]]');
    // The rectangle's top-left corner stays on (1, 1); its center turns about it.
    close(shapeFrame(element(s, 'r')).center, turned([2, 0.5], 0.5, [1, 1]));
    close(element(s, 'q').getCenter(), [1, -2]);
  });

  it('keeps the flow\'s room for the upright element', async () => {
    const upright = await slide('', 'First {#a}\n\nSecond {#b}');
    const tilted = await slide('', 'First {#a angle=0.3}\n\nSecond {#b}');
    close(element(tilted, 'b').getCenter(), element(upright, 'b').getCenter());
  });

  it('shows elements placed against it the element as drawn', async () => {
    const s = await slide('', `[[rectangle: #r x=0 y=0 width=4 height=1 angle=${QUARTER}]]\n\n[[rectangle: #d below:#r width=1 height=1 buff=0.5]]`);
    // Upright, a quarter turn makes it 4 tall: its bottom is at -2.
    expect(element(s, 'd').getTop()[1]).toBeCloseTo(-2.5, 6);
  });

  it('is met by connections on its turned sides and outline', async () => {
    const s = await slide('', [
      `[[rectangle: #r x=0 y=0 width=4 height=1 angle=${Math.PI / 4}]]`,
      '[[line: (6,0) -> #r, #l]]',
      `[[ellipse: #e x=0 y=5 width=4 height=2 angle=${QUARTER}]]`,
      '[[line: (6,5) -> #e, #m]]',
    ].join('\n\n'));
    // Toward (6, 0), the ray from the center meets the long side, half a unit from it, at x = 1/√2
    // (its bounding box would stop it at 5/(2√2)).
    expect(element(s, 'l').getLeft()[0]).toBeCloseTo(Math.SQRT1_2, 6);
    // The ellipse turned upright is one unit wide.
    expect(element(s, 'm').getLeft()[0]).toBeCloseTo(1, 6);
  });

  it('turns a group about its origin, which stays where it was placed', async () => {
    const s = await slide('', '::: {.group #g x=2 y=1 angle=0.5}\n[[rectangle: #m x=1 y=0 width=0.5 height=0.5]]\n:::');
    const g = element(s, 'g');
    close(anchorPoint(g, 'origin'), [2, 1]);
    close(element(s, 'm').getCenter(), [2 + Math.cos(0.5), 1 + Math.sin(0.5)]);
  });

  it('leaves an arc, whose angle is its sweep, and an element at zero as they are', async () => {
    const s = await slide('', '[[arc: #arc x=0 y=0 radius=1 angle=2]]\n\n[[rectangle: #r x=0 y=0 width=2 height=1 angle=0]]');
    for (const id of ['arc', 'r']) expect((element(s, id) as TurnedMobject).markupTurn).toBeUndefined();
    expect(element(s, 'r').getWidth()).toBeCloseTo(2, 9);
  });
});

describe('the exact outline of a sketchy shape', () => {
  /** The middle of the points of a sketchy element's exact outline. */
  const outlineMiddle = (obj: unknown) => {
    const points = (obj as OutlineMobject).markupOutline?.getPoints() ?? [];
    return [0, 1].map((axis) => (Math.max(...points.map((p) => p[axis])) + Math.min(...points.map((p) => p[axis]))) / 2);
  };

  it('follows the shape where the layout places it, which move_along follows', async () => {
    const s = await slide('', '[[rectangle: #r x=4 y=-1 width=3 height=1.5 sketch=true]]\n\n[[rectangle: #q below:#r width=1 height=1 dx=0.5 sketch=true]]');
    near(outlineMiddle(element(s, 'r')), [4, -1]);
    near(outlineMiddle(element(s, 'q')), element(s, 'q').getCenter());
  });

  it('moves with the group that holds the shape', async () => {
    const s = await slide('', '::: {.group #g x=2 y=1}\n[[rectangle: #m x=1 y=0 width=1 height=1 sketch=true]]\n:::');
    near(outlineMiddle(element(s, 'm')), [3, 1]);
  });
});
