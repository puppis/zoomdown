import { describe, expect, it } from 'vitest';
import { BARE_FLAGS, flagName, normalizeStyles, parseAttributes } from '../src/markup/ast';
import { MarkupParser } from '../src/markup/parser';

describe('flags of several words', () => {
  it('are written with hyphens or underscores alike', () => {
    for (const flag of BARE_FLAGS) {
      const hyphens = flag.replace(/_/g, '-');
      expect(parseAttributes(`{${hyphens}}`, 1)).toEqual({ [flag]: 'true' });
      expect(parseAttributes(`{${hyphens}=false}`, 1)).toEqual({ [flag]: 'false' });
      expect(parseAttributes(`{${flag}}`, 1)).toEqual({ [flag]: 'true' });
    }
    expect(flagName('left-aligned')).toBe('left-aligned');
    expect(normalizeStyles({ deco: { 'focus-only': true } })).toEqual({ deco: { focus_only: 'true' } });
  });

  it('are one flag in either spelling', () => {
    expect(() => parseAttributes('{only-this only_this=false}', 1)).toThrow(/Duplicate attribute "only_this"/);
  });

  it('reach slides and includes', () => {
    const document = new MarkupParser().parse('::: slide {#a}\n# A\n\n[[include: #b x=0 y=0 width=4 only-this, start-here]]\n:::\n\n::: slide {#b skip-return}\n# B\n:::');
    const [a, b] = document.slides;
    expect((a.items[1] as { attributes: Record<string, string> }).attributes).toMatchObject({ only_this: 'true', start_here: 'true' });
    expect(b.attributes.skip_return).toBe('true');
  });

  it('leave the arguments of a snippet as they are written', () => {
    expect(parseAttributes('only-this=yes', 1, { css: false })).toEqual({ 'only-this': 'yes' });
  });
});
