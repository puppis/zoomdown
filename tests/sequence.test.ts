import { describe, expect, it } from 'vitest';
import { MarkupParser } from '../src/markup/parser';
import { SlideBuilder } from '../src/markup/slide';
import { parseAttributes } from '../src/markup/ast';
import { Slide, pageSequence, walk } from '../src/slides';
import { Presenter, PresenterConfig, commonAncestor } from '../src/runtime';
import { BASE_PAGE_PIXELS, MAX_PAGE_PIXELS, pagePixels } from '../src/pdfdeck';

describe('the return choice', () => {
  it('is unset by default, decided by forceReturn or skipReturn, and left to the default by false', () => {
    expect(new Slide('a').returnToParent).toBeNull();
    expect(new Slide('a').skipReturn).toBe(false);
    expect(new Slide('a').forceReturn).toBe(false);
    expect(new Slide('a', { skipReturn: true }).returnToParent).toBe(false);
    expect(new Slide('a', { forceReturn: true }).returnToParent).toBe(true);
    // False decides nothing: the default applies.
    expect(new Slide('a', { skipReturn: false }).returnToParent).toBeNull();
    expect(new Slide('a', { forceReturn: false }).returnToParent).toBeNull();
    expect(new Slide('a', { forceReturn: false, skipReturn: true }).returnToParent).toBe(false);
    expect(() => new Slide('a', { forceReturn: true, skipReturn: true })).toThrow(/contradict/);
    // The choice itself, for code that computes it.
    expect(new Slide('a', { returnToParent: true }).forceReturn).toBe(true);
    expect(new Slide('a', { returnToParent: false }).skipReturn).toBe(true);
    expect(new Slide('a', { returnToParent: false, skipReturn: true }).returnToParent).toBe(false);
    expect(() => new Slide('a', { returnToParent: true, skipReturn: true })).toThrow(/contradicts skipReturn/);
    const slide = new Slide('a');
    slide.skipReturn = true;
    expect(slide.returnToParent).toBe(false);
    slide.skipReturn = false;
    expect(slide.returnToParent).toBeNull();
    slide.forceReturn = true;
    expect(slide.returnToParent).toBe(true);
    slide.skipReturn = false;
    expect(slide.returnToParent).toBe(true);
    const parent = new Slide('p', { width: 16 });
    const child = parent.addChild(new Slide('c', { forceReturn: true }), { returnToParent: null });
    expect(child.returnToParent).toBeNull();
    parent.addChild(new Slide('d'), { skipReturn: true });
    expect(parent.children[1].returnToParent).toBe(false);
    // From the parent's side too, false leaves the child as it is.
    expect(parent.addChild(new Slide('e', { forceReturn: true }), { skipReturn: false, forceReturn: false }).returnToParent).toBe(true);
  });

  it('is written force-return or skip-return on the include, bare, and false leaves the default', () => {
    expect(parseAttributes('skip-return', 1)).toEqual({ skip_return: 'true' });
    expect(parseAttributes('force-return preview', 1)).toEqual({ force_return: 'true', preview: 'true' });
    expect(() => parseAttributes('sideways', 1)).toThrow(/Expected an attribute/);
    const source = (attrs: string) => `::: slide {#r}\n[[include: #a ${attrs}]]\n[[include: #b]]\n:::\n::: slide {#a}\nx\n:::\n::: slide {#b}\ny\n:::`;
    const build = (attrs: string) => new SlideBuilder().build(new MarkupParser().parse(source(attrs)));
    expect(build('').children[0].returnToParent).toBeNull();
    expect(build('skip-return').children[0].returnToParent).toBe(false);
    expect(build('force-return').children[0].returnToParent).toBe(true);
    expect(build('skip_return').children[0].returnToParent).toBe(false);
    // False decides nothing: the child is left as the default says.
    expect(build('skip-return=false').children[0].returnToParent).toBeNull();
    expect(build('force-return=false').children[0].returnToParent).toBeNull();
    expect(build('force-return=false skip-return').children[0].returnToParent).toBe(false);
    expect(() => build('skip-return force-return')).toThrow(/Use skip-return or force-return, not both/);
    expect(() => build('force-return=maybe')).toThrow(/force-return must be true or false/);
    // The former name says what it is called now.
    expect(() => build('return-to-parent')).toThrow(/return-to-parent is now called force-return, written bare as in \[\[include: #id force-return\]\]/);
    expect(() => build('return_to_parent=false')).toThrow(/is now called force-return/);
    // On the slide itself it is refused: the include says how its child is left.
    expect(() => new MarkupParser().parse('::: slide {#r}\n[[include: #a]]\n:::\n::: slide {#a force-return}\nx\n:::')).toThrow(/goes on the include that places this slide/);
  });
});

describe('a flat sequence of pages', () => {
  const PAGES = '::: slide {#one}\n# One\n:::\n\n::: slide {#two}\n# Two\n[[include: #child]]\n:::\n\n::: slide {#child}\nc\n:::\n\n::: slide {#three transition=zoom}\n# Three\n:::';

  it('is what several top-level slides parse to, in document order', () => {
    const document = new MarkupParser().parse(PAGES);
    expect(document.sequence).toBe(true);
    expect(document.roots).toEqual(['one', 'two', 'three']);
    expect(document.root).toBe('one');
    const tree = new MarkupParser().parse('::: slide {#r}\n[[include: #a]]\n:::\n::: slide {#a}\nx\n:::');
    expect(tree.sequence).toBe(false);
    expect(tree.roots).toEqual(['r']);
    expect(() => new MarkupParser().parse(PAGES, { root: 'two' })).toThrow(/sequence of 3 top-level slides/);
  });

  it('hangs the pages from a hidden root that cuts between them and shows them at once', () => {
    const root = new SlideBuilder().build(new MarkupParser().parse(PAGES));
    expect(root.hidden).toBe(true);
    expect(root.children.map((page) => page.name)).toEqual(['One', 'Two', 'Three']);
    expect([...walk(root)].length).toBe(5);
    const [one, two, three] = root.children;
    expect(one.transition).toBeNull();
    expect(three.transition).toBe('zoom');
    // Moves between pages cut (their common ancestor is the hidden root); moves inside a page zoom.
    const presenter = new PresenterConfig();
    const times = (a: Slide, b: Slide) => Presenter.prototype.transitionTime.call({ config: presenter, transitionMode: Presenter.prototype.transitionMode }, a, b);
    expect(times(one, two)).toBe(0);
    expect(times(two.children[0], one)).toBe(0);
    expect(times(two, two.children[0])).toBe(presenter.transitionTime);
    expect(times(two.children[0], two)).toBe(presenter.transitionTime);
    // A page that asks for a zoom pans to its neighbours instead.
    expect(times(two, three)).toBe(presenter.transitionTime);
    expect(times(two.children[0], three)).toBe(presenter.transitionTime);
    expect(commonAncestor(one, two)).toBe(root);
    expect(commonAncestor(two.children[0], two)).toBe(two);
    expect(commonAncestor(one, new Slide('elsewhere'))).toBeNull();
    expect(one.preview).toBe(true);
    expect(two.children[0].preview).toBe(false);
    expect(two.children[0].transition).toBeNull();
    // Pages sit on one row, far enough apart that a padded view of one never reaches the next.
    const centers = root.children.map((page) => (page.viewport as { getCenter(): number[] }).getCenter()[0]);
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1]);
    expect(centers[1] - centers[0]).toBeGreaterThanOrEqual(3 * Math.max(one.width, one.height) - 1e-9);
    expect(centers[0] + centers[2]).toBeCloseTo(0);
  });

  it('is built from slides by pageSequence', () => {
    const tall = new Slide('tall', { width: 8, height: 12 });
    const wide = new Slide('wide', { width: 16, height: 9 });
    const root = pageSequence([tall, wide], { name: 'Pages' });
    expect(root.name).toBe('Pages');
    expect(root.hidden).toBe(true);
    expect(root.height).toBe(12);
    expect(root.width).toBe(2 * 3 * 16);
    expect(tall.parent).toBe(root);
    expect(() => pageSequence([])).toThrow(/at least one/);
    expect(() => pageSequence([wide])).toThrow(/parent already/);
  });
});

describe('the pictures of PDF pages', () => {
  it('are drawn at the density of the screen, within the base and the cap', () => {
    expect(pagePixels(16, 100)).toBe(1600);
    expect(pagePixels(16, 1)).toBe(BASE_PAGE_PIXELS);
    expect(pagePixels(16, 1e6)).toBe(MAX_PAGE_PIXELS);
    expect(pagePixels(16, Infinity)).toBe(BASE_PAGE_PIXELS);
  });
});
