import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { ReloadWatch, ignoredByPreview } from '../bin/zoomdown.mjs';

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

/** course/x.yaml, two decks that extend it, a stray file; deck1 has an artworks folder. */
function course(): { deck1: string; deck2: string; shared: string } {
  root = mkdtempSync(join(tmpdir(), 'zoomdown-watch-'));
  const dir = join(root, 'course');
  mkdirSync(join(dir, 'deck1', 'artworks'), { recursive: true });
  mkdirSync(join(dir, 'deck2'));
  writeFileSync(join(dir, 'x.yaml'), 'layout: { gap: 0.3 }\n');
  writeFileSync(join(dir, 'base.yaml'), 'extends: x.yaml\n');
  writeFileSync(join(dir, 'deck1', 'slides.zd'), '---\nextends: ../base.yaml\n---\n::: slide {#a}\nA\n:::\n');
  writeFileSync(join(dir, 'deck2', 'slides.zd'), '---\nextends: ../x.yaml\n---\n::: slide {#b}\nB\n:::\n');
  return { deck1: join(dir, 'deck1', 'slides.zd'), deck2: join(dir, 'deck2', 'slides.zd'), shared: join(dir, 'x.yaml') };
}

describe('a preview reloads for what the deck loads (rule F)', () => {
  it('watches the deck and the whole chain it extends, not the folders holding them', async () => {
    const { deck1, deck2, shared } = course();
    const watch = await new ReloadWatch({ deckPath: deck1 }).load();
    expect(watch.concerns(deck1)).toBe(true);
    expect(watch.concerns(shared)).toBe(true);
    expect(watch.concerns(join(root, 'course', 'base.yaml'))).toBe(true);
    // Another deck beside the shared settings, and a stray file, change nothing.
    expect(watch.concerns(deck2)).toBe(false);
    expect(watch.concerns(join(root, 'course', 'notes.txt'))).toBe(false);
    expect(watch.concerns(join(root, 'course', 'deck1', 'README.md'))).toBe(false);
  });

  it('adds what a page opens or looks for, and anything in the library folders', async () => {
    const { deck1 } = course();
    const watch = await new ReloadWatch({ deckPath: deck1 }).load();
    const image = join(root, 'course', 'deck1', 'assets', 'a b.png');
    expect(watch.open(`/@fs${image.split('\\').join('/').replace(' ', '%20')}?import`)).toBe(image);
    expect(watch.open('/src/dev.ts')).toBeNull();
    expect(watch.concerns(image)).toBe(true);
    expect(watch.concerns(join(root, 'course', 'deck1', 'artworks', 'new.svg'))).toBe(true);
    // After a reload the list starts again: the pages will open what they need.
    await watch.reset();
    expect(watch.concerns(image)).toBe(false);
    expect(watch.concerns(deck1)).toBe(true);
  });

  it('keeps what a page opens while the settings are read anew', async () => {
    const { deck1 } = course();
    const watch = await new ReloadWatch({ deckPath: deck1 }).load();
    const image = join(root, 'course', 'deck1', 'assets', 'a.png');
    const reading = watch.reset();
    watch.open(`/@fs${image}`);
    await reading;
    expect(watch.concerns(image)).toBe(true);
  });

  it('keeps the chain of a deck saved with front matter that does not parse', async () => {
    const { deck1, shared } = course();
    const watch = await new ReloadWatch({ deckPath: deck1 }).load();
    writeFileSync(deck1, '---\nextends: [../base.yaml\n---\n::: slide {#a}\nA\n:::\n');
    await watch.reset();
    expect(watch.concerns(deck1)).toBe(true);
    expect(watch.concerns(shared)).toBe(true);
  });

  it('ignores exports, packages and Git files by their path below the deck, not by where the deck is kept', () => {
    const talk = join(sep, 'home', 'build', 'my dist talk');
    expect(ignoredByPreview(join(talk, 'build', 'index.html'), [talk])).toBe(true);
    expect(ignoredByPreview(join(talk, 'node_modules', 'x', 'index.js'), [talk])).toBe(true);
    expect(ignoredByPreview(join(talk, '.git', 'HEAD'), [talk])).toBe(true);
    expect(ignoredByPreview(join(talk, 'slides.zd'), [talk])).toBe(false);
    expect(ignoredByPreview(join(talk, 'assets', 'build-steps.svg'), [talk])).toBe(false);
    // A file a page opened elsewhere: an image in a search folder.
    expect(ignoredByPreview(join(sep, 'home', 'build', 'shared', 'logo.svg'), [talk])).toBe(false);
    expect(ignoredByPreview(join(sep, 'home', 'node_modules', 'x', 'a.js'), [talk])).toBe(true);
  });

  it('keeps --watch for anything else', async () => {
    const { deck1 } = course();
    const extra = join(root, 'data');
    const watch = await new ReloadWatch({ deckPath: deck1, extra: [extra] }).load();
    expect(watch.concerns(join(extra, 'series.csv'))).toBe(true);
  });

  it('reads the extends chain anew after the front matter changes', async () => {
    const { deck1, shared } = course();
    const watch = await new ReloadWatch({ deckPath: deck1 }).load();
    writeFileSync(deck1, '::: slide {#a}\nA\n:::\n');
    await watch.reset();
    expect(watch.concerns(shared)).toBe(false);
  });
});
