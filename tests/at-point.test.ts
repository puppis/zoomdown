import { beforeAll, describe, expect, it } from 'vitest';
import { anchorPoint } from '../src/markup/renderer';
import { element, installFakeCanvas, slide } from './helpers/slides';

beforeAll(installFakeCanvas);

const near = (point: number[], x: number, y: number) => {
  expect(point[0]).toBeCloseTo(x, 9);
  expect(point[1]).toBeCloseTo(y, 9);
};

describe('at= a point', () => {
  it('centers an element there, as x= y= anchor=center did', async () => {
    const built = await slide('', '[Label]{#l at=(3,-2)}\n\n::: {.element #m at=(-3,1)}\n$$x^2$$\n:::\n\n[[icon: user at=(1,1)]]\n\n[Before]{#b x=3 y=1 anchor=center}');
    near(element(built, 'l').getCenter(), 3, -2);
    near(element(built, 'm').getCenter(), -3, 1);
    // An icon needs no id: the slide names it.
    near(element(built, 'element-3').getCenter(), 1, 1);
    near(element(built, 'b').getCenter(), 3, 1);
  });

  it('lands another point when at= or anchor= names it', async () => {
    const built = await slide('', '[a]{#a at=left-baseline:(1,1)}\n\n[b]{#b at=(1,-1) anchor=right}');
    near(anchorPoint(element(built, 'a'), 'left-baseline'), 1, 1);
    near(anchorPoint(element(built, 'b'), 'right'), 1, -1);
  });

  it('turns a text about its center there, and the flow passes over it', async () => {
    const built = await slide('', 'First {#a}\n\n[centered]{#c at=(4,-3) angle=0.5}\n\nNext {#n}');
    near(element(built, 'c').getCenter(), 4, -3);
    const plain = await slide('', 'First {#a}\n\nNext {#n}');
    expect(element(built, 'n').getTop()[1]).toBeCloseTo(element(plain, 'n').getTop()[1], 9);
  });

  it('is where [[animate]] centers an element', async () => {
    const built = await slide('', '[t]{#t x=0 y=0}\n\n[[animate: #t step=1 at=(2,1)]]');
    near(element(built, 't').getCenter(), 2, 1);
  });
});
