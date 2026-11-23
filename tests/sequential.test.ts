import { describe, expect, it } from 'vitest';
import { MarkupParser, ASTTransformer } from '../src/markup/parser';
import { ActionSpec, ElementSpec, EventSpec, GroupSpec, IncludeSpec, NextSpec } from '../src/markup/ast';
import { LayoutConfig } from '../src/markup/renderer';

const CHILDREN = '::: slide {#a}\nA\n:::\n::: slide {#b}\nB\n:::';
const parse = (body: string, steps: 'explicit' | 'sequential' = 'sequential') =>
  new MarkupParser().parse(`::: slide {#r}\n${body}\n:::\n${CHILDREN}`, { steps });
const slide = (body: string, steps: 'explicit' | 'sequential' = 'sequential') => parse(body, steps).slides.find((s) => s.id === 'r')!;
/** The step and hide of each element of the slide, by id. */
const steps = (body: string) => Object.fromEntries(slide(body).items
  .filter((item): item is ElementSpec => item instanceof ElementSpec)
  .map((item) => [item.id, [item.attributes.step ?? '', item.attributes.hide ?? ''].join('/')]));

describe('sequential steps', () => {
  it('gives an element without step the step of the element before it, and step=+ the click after', () => {
    const body = [
      'Round with pivot r {#round step=+}',
      '',
      '- every node sends a request {#ask}',
      '- the pivot answers {#answer}',
      '',
      '[deadlock!]{#dead step=+ hide=+}',
      '',
      '[next round]{#again step=+}',
    ].join('\n');
    expect(steps(body)).toEqual({ round: '1/', ask: '1/', answer: '1/', dead: '2/3', again: '3/' });
  });

  it('keeps the elements before the first click at the start, and counts from explicit numbers', () => {
    expect(steps('[a]{#a}\n\n[b]{#b step=3}\n\n[c]{#c}\n\n[d]{#d step=+}\n\n[e]{#e step=1}\n\n[f]{#f}'))
      .toEqual({ a: '/', b: '3/', c: '3/', d: '4/', e: '1/', f: '1/' });
    // step=0 shows an element from the start, and the elements after it without step as well.
    expect(steps('[a]{#a step=+}\n\n[frame]{#frame step=0}\n\n[label]{#label}\n\n[b]{#b step=2}'))
      .toEqual({ a: '1/', frame: '0/', label: '/', b: '2/' });
  });

  it('leaves captions and static elements out of the count', () => {
    expect(steps('[a]{#a step=+}\n\n# Title {#cap step=-1}\n\n[b]{#b}\n\n[pinned]{#pinned focus_only=true}\n\n[c]{#c step=+}'))
      .toEqual({ a: '1/', cap: '-1/', b: '1/', pinned: '/', c: '2/' });
    // hide=+ on a caption: gone at the first click.
    expect(steps('# Title {#cap step=-1 hide=+}')).toEqual({ cap: '-1/1' });
  });

  it('steps a group as a whole, never its members', () => {
    const items = slide('[a]{#a step=+}\n\n::: {.group #g}\n[m]{#m}\n[[dot: #d x=0 y=0]]\n:::\n\n[b]{#b}').items;
    const group = items.find((item) => item instanceof GroupSpec) as GroupSpec;
    expect(group.attributes.step).toBe('1');
    expect(group.items.map((member) => member.attributes.step)).toEqual([undefined, undefined]);
    expect((items.find((item) => item instanceof ElementSpec && item.id === 'b') as ElementSpec).attributes.step).toBe('1');
  });

  it('visits an include without step at a click of its own', () => {
    const items = slide('[intro]{#intro step=+}\n\n[[include: #a]]\n\n[[include: #b]]\n\n[after]{#after step=+}').items;
    const visits = items.filter((item): item is IncludeSpec => item instanceof IncludeSpec).map((item) => item.attributes.step);
    expect(visits).toEqual(['2', '3']);
    expect((items.find((item) => item instanceof ElementSpec && item.id === 'after') as ElementSpec).attributes.step).toBe('4');
    const plan = new ASTTransformer().plan(slide('[intro]{#intro step=+}\n\n[[include: #a]]\n\n[[include: #b step=5]]\n\n[late]{#late}'));
    expect(plan.map((step) => [step.number, step.visits.length, step.changes.length])).toEqual([[1, 0, 1], [2, 1, 0], [5, 1, 1]]);
  });

  it('gives directives the step of the item before them, or the click after with step=+', () => {
    const items = slide([
      '[a]{#a step=+}',
      '',
      '[b]{#b}',
      '',
      '[[animate: #a dx=1 step=+]]',
      '',
      '[[effect: flash #b]]',
      '',
      '[c]{#c}',
      '',
      '[[hide: #c step=+]]',
      '',
      '[[next:]]',
    ].join('\n')).items;
    expect(items.filter((item) => item instanceof ActionSpec).map((item) => (item as ActionSpec).step)).toEqual([2, 2]);
    expect((items.find((item) => item instanceof ElementSpec && item.id === 'c') as ElementSpec).attributes.step).toBe('2');
    expect((items.find((item) => item instanceof EventSpec) as EventSpec).step).toBe(3);
    expect((items.find((item) => item instanceof NextSpec) as NextSpec).step).toBe(3);
  });

  it('plans the slide as numbered steps would', () => {
    const sequential = new ASTTransformer().plan(slide('[a]{#a step=+}\n\n[b]{#b}\n\n[c]{#c step=+ hide=+}\n\n[d]{#d step=+}'));
    const explicit = new ASTTransformer().plan(slide('[a]{#a step=1}\n\n[b]{#b step=1}\n\n[c]{#c step=2 hide=3}\n\n[d]{#d step=3}', 'explicit'));
    expect(sequential).toEqual(explicit);
  });

  it('settles steps once: validating the document again changes nothing', () => {
    const document = parse('[a]{#a step=+}\n\n[b]{#b}\n\n[[animate: #b dx=1 step=+]]');
    const again = new ASTTransformer().validate(document);
    const r = again.slides.find((s) => s.id === 'r')!;
    expect((r.items[1] as ElementSpec).attributes.step).toBe('1');
    expect((r.items[2] as ActionSpec).step).toBe(2);
  });

  it('asks for sequential steps when + is used without them', () => {
    for (const body of ['[a]{#a step=+}', '[a]{#a hide=+}', '[[include: #a step=+]]', '[a]{#a}\n\n[[animate: #a dx=1 step=+]]', '[[next: step=+]]']) {
      expect(() => parse(body, 'explicit')).toThrow(/steps: sequential/);
    }
    // Without sequential steps a directive still needs its step.
    expect(() => parse('[a]{#a}\n\n[[animate: #a dx=1]]', 'explicit')).toThrow(/animate requires step=N/);
    expect(() => parse('[[next:]]', 'explicit')).toThrow(/next directives require only step=N/);
  });

  it('keeps the checks of numbered steps', () => {
    expect(() => parse('::: {.group #g}\n[m]{#m step=+}\n:::')).toThrow(/Group members cannot use step/);
    expect(() => parse('[a]{#a step=x}')).toThrow(/step must be a nonnegative integer/);
    // A directive without step before the first click lands on step 0, where visibility events cannot be.
    expect(() => parse('[a]{#a}\n\n[[hide: #a]]')).toThrow(/at least one/);
  });

  it('is a layout setting', () => {
    expect(new LayoutConfig().steps).toBe('explicit');
    expect(new LayoutConfig({ steps: 'sequential' }).steps).toBe('sequential');
    expect(() => new LayoutConfig({ steps: 'numbered' as 'explicit' })).toThrow(/explicit or sequential/);
  });
});
