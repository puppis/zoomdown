import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MeasureOverlay, measureNumber, measureText } from '../src/player/measure';
import { validGesture, describeGesture, DEFAULT_POINTER_BINDINGS } from '../src/player/settings';

describe('measuring on a slide', () => {
  it('writes numbers with two decimals and a true minus sign', () => {
    expect([measureNumber(2), measureNumber(-1.234), measureNumber(-0.001), measureNumber(3.456)]).toEqual(['2.00', '−1.23', '0.00', '3.46']);
  });

  it('gives a point\'s coordinates, or the length of a drag and its parts', () => {
    expect(measureText({ x: 1.5, y: -2 })).toBe('x 1.50   y −2.00');
    expect(measureText({ x: 4, y: 2 }, { x: 1, y: -2 })).toBe('length 5.00   dx 3.00   dy 4.00');
  });

  it('is held with Control by default, a gesture of its own that takes the main button only', () => {
    expect(DEFAULT_POINTER_BINDINGS.measure).toBe('Control');
    expect(validGesture('measure', 'Shift+Meta')).toBe(true);
    expect(validGesture('measure', 'Right')).toBe(false);
    expect(describeGesture('Control', 'hold')).toMatch(/^Hold (⌃|Ctrl)$/);
  });
});

describe('the measure overlay', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => host.remove());
  const at = (x: number, y: number, clientX = x * 10, clientY = -y * 10) => ({ x, y, clientX, clientY });

  it('shows the coordinates beside the pointer, and the measure of a drag until the pointer moves on', () => {
    const overlay = new MeasureOverlay(host);
    overlay.show(at(1, 2), '#s');
    expect(overlay.label.hidden).toBe(false);
    expect(overlay.label.textContent).toBe('#sx 1.00   y 2.00');
    expect(overlay.line.style.display).toBe('none');
    overlay.begin(at(1, 2));
    overlay.show(at(4, 6), '#s');
    expect(overlay.label.textContent).toContain('length 5.00   dx 3.00   dy 4.00');
    expect(overlay.line.style.display).toBe('');
    overlay.end();
    // A little jitter keeps the measure; moving on shows the coordinates again.
    overlay.show(at(4, 6, 41, -59), '#s');
    expect(overlay.label.textContent).toContain('length 5.00');
    overlay.show(at(5, 6), '#s');
    expect(overlay.label.textContent).toBe('#sx 5.00   y 6.00');
    expect(overlay.line.style.display).toBe('none');
    overlay.hide();
    expect(overlay.label.hidden).toBe(true);
  });
});
