import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Slide } from '../src/slides';
import { defineDeck } from '../src/deck';
import { PlayerUI } from '../src/player/ui';
import { DEFAULT_POINTER_BINDINGS, describeGesture } from '../src/player/settings';

const deck = defineDeck({ title: 'Gestures', deck: () => new Slide('root'), background: '#ffffff', foreground: '#000000' });
let ui: PlayerUI;
let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  ui = new PlayerUI(host, deck, { embedded: true, useLocation: false });
  ui.openSettings();
});
afterEach(() => {
  ui.dispose();
  host.remove();
});

const row = (label: string) => [...ui.root.querySelectorAll<HTMLElement>('#zd-settings-pointer .binding')].find((item) => item.textContent?.includes(label)) as HTMLElement;
const shown = (label: string) => row(label).querySelector('.keys')?.textContent;
const set = (label: string) => row(label).querySelector('.add') as HTMLButtonElement;
const waiting = () => ui.root.querySelectorAll('#zd-settings-pointer .capturing').length;
const press = async (target: EventTarget, init: PointerEventInit = {}) => {
  const all = { bubbles: true, cancelable: true, button: 0, ...init };
  target.dispatchEvent(new PointerEvent('pointerdown', all));
  // A row drawn afresh takes the rest of the press in its place.
  const under = target instanceof Node && target.isConnected ? target : document.body;
  under.dispatchEvent(new MouseEvent('mousedown', all));
  under.dispatchEvent(new PointerEvent('pointerup', all));
  under.dispatchEvent(new MouseEvent('mouseup', all));
  under.dispatchEvent(new MouseEvent(all.button === 0 ? 'click' : 'auxclick', all));
  await new Promise((done) => setTimeout(done, 70));
};
const saved = () => JSON.parse(localStorage.getItem('zoomdown:settings') ?? '{}').pointer;

describe('recording a pointer gesture in the settings', () => {
  it('takes the keys held and the click, wherever it is', async () => {
    expect(shown('open the source')).toBe(describeGesture(DEFAULT_POINTER_BINDINGS.edit, 'click'));
    set('open the source').click();
    expect(waiting()).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', shiftKey: true, metaKey: true, cancelable: true }));
    expect(set('open the source').textContent).toMatch(/(Shift\+Win|⇧⌘) \+ click…/);
    // The press is the gesture's alone: what is under it sees nothing of it.
    const seen: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) document.body.addEventListener(type, () => seen.push(type));
    await press(document.body, { shiftKey: true, metaKey: true });
    expect(seen).toEqual([]);
    await press(document.body);
    expect(seen).toEqual(['pointerdown', 'mousedown', 'mouseup', 'click']);
    expect(waiting()).toBe(0);
    expect(shown('open the source')).toMatch(/(Shift\+Win|⇧⌘) \+ click/);
    expect(saved().edit).toBe('Shift+Meta');
  });

  it('takes another button for a click, the main one only for a drag', async () => {
    set('next stop').click();
    await press(document.body, { button: 1 });
    expect(saved().advance).toBe('Middle');
    set('drag to draw').click();
    await press(document.body, { button: 2 });
    expect(waiting()).toBe(1);
    expect(set('drag to draw').textContent).toMatch(/Main button only/);
    // The keys of the source click by default (⇧⌘ on a Mac, Shift + Ctrl elsewhere).
    await press(document.body, { button: 0, shiftKey: true, ...(DEFAULT_POINTER_BINDINGS.edit === 'Shift+Meta' ? { metaKey: true } : { ctrlKey: true }) });
    expect(saved().pen).toBe(DEFAULT_POINTER_BINDINGS.edit);
    // The gesture moved here from the action that had it.
    expect(saved().edit).toBeNull();
    expect(shown('open the source')).toBe('Off');
  });

  it('takes a plain click on its own button, and leaves any other plain click and Esc alone', async () => {
    set('open the source').click();
    await press(ui.root);
    expect(waiting()).toBe(0);
    expect(shown('open the source')).toBe(describeGesture(DEFAULT_POINTER_BINDINGS.edit, 'click'));
    set('open the source').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(waiting()).toBe(0);
    set('next stop').click();
    await press(set('next stop'));
    expect(shown('next stop')).toBe('Plain click');
    expect(shown('drag to draw')).toBe('Off');
  });

  it('removes a gesture by its chip, and restores the defaults', () => {
    (row('open the source').querySelector('.chip') as HTMLButtonElement).click();
    expect(shown('open the source')).toBe('Off');
    const restore = [...ui.root.querySelectorAll('button')].find((button) => button.textContent === 'Restore default gestures');
    restore?.click();
    expect(shown('open the source')).toBe(describeGesture(DEFAULT_POINTER_BINDINGS.edit, 'click'));
  });
});

describe('a gesture on the stage', () => {
  it('opens the source with the keys and button it is set to, and no other', async () => {
    const opened: Array<{ x: number; y: number } | undefined> = [];
    ui.editSource = (at) => { opened.push(at); };
    set('open the source').click();
    await press(document.body, { button: 1 });
    await press(ui.stageHost, { button: 1, clientX: 30, clientY: 40 });
    expect(opened).toEqual([{ x: 30, y: 40 }]);
    await press(ui.stageHost, { altKey: true });
    await press(ui.stageHost, { button: 1, shiftKey: true });
    expect(opened.length).toBe(1);
    set('open the source').click();
    await press(document.body, { button: 2, shiftKey: true });
    await press(ui.stageHost, { button: 2, shiftKey: true, clientX: 5, clientY: 6 });
    // The menu of the right button stays away, and the source opens once the keys are up.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, shiftKey: true });
    ui.stageHost.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(opened.length).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    expect(opened[1]).toEqual({ x: 5, y: 6 });
  });
});
