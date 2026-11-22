import { beforeAll, describe, expect, it } from 'vitest';
import type { Animation, Mobject, VMobject } from 'manim-web';
import { anchorPoint } from '../src/markup/renderer';
import type { OutlineMobject } from '../src/sketch';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const close = (actual: readonly number[], expected: readonly number[], digits = 6) => expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, digits));
/** The exact geometry of an arc: the arc itself, or the outline a hand-drawn one stands for. */
const geometry = (obj: Mobject) => ((obj as OutlineMobject).markupOutline ?? obj) as VMobject;
/** The point of a circle about `center`, `radius` large, at `angle`. */
const onCircle = (center: readonly number[], radius: number, angle: number) => [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
/** Every point an arc's geometry passes through (the ends of its curves, every third point) lies on its circle. */
const expectOnCircle = (obj: Mobject, center: readonly number[], radius: number) => {
  const points = geometry(obj).getPoints();
  expect(points.length).toBeGreaterThan(3);
  for (let i = 0; i < points.length; i += 3) expect(Math.hypot(points[i][0] - center[0], points[i][1] - center[1])).toBeCloseTo(radius, 6);
};

describe('an arc', () => {
  const ARC = '[[arc: #a x=0 y=0 radius=1 start_angle=0 angle=0.8]]\n\n[[dot: #c x=0 y=0]]';

  it('has the center of its circle at x, y, which its anchor center names', async () => {
    const s = await slide('', ARC);
    const arc = element(s, 'a');
    expectOnCircle(arc, [0, 0], 1);
    close(geometry(arc).getPoints()[0], onCircle([0, 0], 1, 0));
    close(anchorPoint(arc, 'center'), [0, 0]);
    close(element(s, 'c').getCenter(), [0, 0]);
    // Its box lies off the center, up and to the right.
    expect(arc.getCenter()[0]).toBeGreaterThan(0.5);
    expect(arc.getCenter()[1]).toBeGreaterThan(0.2);
  });

  it('stays where it is written without x and y, as before', async () => {
    const s = await slide('', '[[arc: #a radius=2 start_angle=1 angle=-2]]');
    expectOnCircle(element(s, 'a'), [0, 0], 2);
  });

  it('keeps its other anchors on its box', async () => {
    const s = await slide('', '[[arc: #a x=1 y=-1 anchor=top-left radius=1 start_angle=0 angle=0.8]]');
    const arc = element(s, 'a');
    close(anchorPoint(arc, 'top-left'), [1, -1]);
    close([arc.getLeft()[0], arc.getTop()[1]], [1, -1]);
  });

  it('puts the center of its circle on at=, and an element at=#arc on it', async () => {
    const s = await slide('', '[[arc: #a at=(2,1) radius=1.5 start_angle=0.5 angle=2]]\n\n[[dot: #d at=#a]]\n\n[[arc: #b at=center:#a.top radius=0.5 angle=3]]');
    expectOnCircle(element(s, 'a'), [2, 1], 1.5);
    close(element(s, 'd').getCenter(), [2, 1]);
    // Other anchors are on the box: #a.top is the middle of its top side.
    const top = anchorPoint(element(s, 'a'), 'top');
    expect(top[1]).toBeCloseTo(element(s, 'a').getTop()[1], 9);
    expectOnCircle(element(s, 'b'), top, 0.5);
  });

  it('is placed the same way filled and hand-drawn, its exact outline with it', async () => {
    const s = await slide('', [
      '[[arc: #fill x=-3 y=1 radius=1 start_angle=0.3 angle=1.2 fill_opacity=0.4]]',
      '[[arc: #rough x=3 y=-1 radius=1.2 start_angle=-0.5 angle=1.5 sketch=true]]',
      '[[arc: #both x=0 y=2 radius=0.8 angle=2.5 sketch=true fill_opacity=0.5]]',
      '[[arc: #moved at=(-2,-2) radius=1 start_angle=1 angle=1.5 sketch=true]]',
    ].join('\n\n'));
    for (const [id, center, radius] of [['fill', [-3, 1], 1], ['rough', [3, -1], 1.2], ['both', [0, 2], 0.8], ['moved', [-2, -2], 1]] as const) {
      const arc = element(s, id);
      close(anchorPoint(arc, 'center'), center);
      expectOnCircle(arc, center, radius);
    }
  });

  it('is followed by move_along along the arc as drawn', async () => {
    const s = await slide('', '[[dot: #d x=5 y=5]]\n\n[[arc: #a x=1 y=-1 radius=2 start_angle=0 angle=1.5]]\n\n[[arc: #r x=-1 y=1 radius=1 start_angle=3 angle=-1 sketch=true]]');
    const follow = (path: string) => {
      const change = { action: 'move_along', target: 'd', path };
      const animation = (s as unknown as { _changeAnimation(ctx: unknown, change: unknown, movies: string[]): Animation })._changeAnimation(null, change, []);
      animation.begin();
      animation.interpolate(0);
      const start = element(s, 'd').getCenter();
      animation.finish();
      return [start, element(s, 'd').getCenter()];
    };
    const [start, end] = follow('a');
    close(start, onCircle([1, -1], 2, 0));
    close(end, onCircle([1, -1], 2, 1.5));
    const [roughStart, roughEnd] = follow('r');
    close(roughStart, onCircle([-1, 1], 1, 3));
    close(roughEnd, onCircle([-1, 1], 1, 2));
  });

  it('moves by its circle\'s center when animated to x, y or at=', async () => {
    // The slide is played to its last step.
    const s = await slide('', '[[arc: #a x=0 y=0 radius=1 angle=1]]\n\n[[arc: #b x=0 y=0 radius=0.5 start_angle=2 angle=1]]\n\n[[animate: #a, step=1, x=2, y=3]]\n\n[[animate: #b, step=1, at=(-1,-2)]]');
    expectOnCircle(element(s, 'a'), [2, 3], 1);
    expectOnCircle(element(s, 'b'), [-1, -2], 0.5);
  });
});
