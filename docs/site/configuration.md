---
title: Configuration
description: The front matter of a deck's Markdown: every setting, the layout and presenter options, settings shared with extends, and the command line.
---

<a class="try" href="tour.html#slide=config">Open in the tour ↗</a>

## Front matter

A deck is its `.zd` file (or, for a deck written before `.zd`, its `.md` file). Its settings sit at the top, as YAML between a first line `---`
and the next `---` (or `...`):

```markdown
---
title: ZoomDown tour
classes: code-slides.ts
viewport: 16x9
layout:
  fontSize: 26
  headingSize: 40
  codeSize: 19
presenter:
  transitionTime: 0.8
  showSlideBorders: false
macros:
  N: '\mathbb{N}'
  R: '\mathbb{R}'
  pair: ['\langle #1, #2 \rangle', 2]
styles:
  footnote: font_size=18 color=GRAY
---

::: slide {#tour width=44}
…
```

The front matter's lines are left blank when the slides are parsed, so every line keeps its
number, in error messages and for `zoomdown jump`. Every way of opening the deck (the command
line, the desktop app, a page that mounts it, a notebook) reads the same settings, and the
default title is the same everywhere; a file without front matter has the defaults. YAML single
quotes keep backslashes as written, so a macro is `'\mathbb{N}'`, not `"\\mathbb{N}"`; they
also keep a color such as `'#0F172A'` from being read as a comment. `deck.json` is no longer
read: its settings move into the front matter, without `markup`, and `imports` is written
`classes`.

| Setting | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `title` | text | the name of the folder holding the Markdown (`tour` for `tour/slides.zd`) | the page title and outline root label |
| `root` | text | none | the root slide ID, when you want it checked explicitly; an error on a forest |
| `background` | text | white | canvas background color |
| `viewport` | `16x9` (also `16:9`) or `{ width: 16, height: 9 }` | 16 × 9 | proportions the camera fits (the stage reveals surrounding canvas when it has room) |
| `showOutline` | true or false | false | open the outline at start |
| `theme` | a name or a list of names | none | themes under the deck's own `styles`, `layout`, `presenter`, `background` and `viewport`: `themes/<name>.zd`, see [Extending a deck](extending.html#themes) |
| `layout` | map | below | typography and spacing, below |
| `presenter` | map | below | timing and camera policy, below |
| `colors` | map | none | named colors (`ok: '#1e7d32'`, `ink: BLUE_E`) that every color attribute, style, inline span and formula (`\textcolor{ok}{…}`) of the deck may name |
| `macros` | map | none | LaTeX macros for every formula, in MathJax's form: an expansion, or `[expansion, number of arguments]`, or `[expansion, number of arguments, default of an optional first argument]` (see [Mathematics](math.html)) |
| `styles` | map | none | named styles applied by `.class` tokens and roles, a name to an attribute string or a map, see [Styles](styles.html) |
| `classes` | path | none | module exporting `Slide` classes for `[[subslide: Name]]`, relative to the file |
| `extends` | path | none | a deck's `.zd` (or `.md`) file or a YAML file whose settings this one builds on, below |
| `paths` | folder or list of folders | none | folders searched, after the Markdown file's own, for the files it names: imported Markdown, images, videos, pages; as in `[../shared, figures]` |
| `artworks` | folder or list of folders | `artworks/` | folders with artworks of the deck's own, `name.svg` or `name.js`/`.ts`, for `[[artwork: name]]`; an `artworks/` folder next to the Markdown is searched anyway, then the `paths`; see [Icons](icons.html#artworks-of-your-own) |
| `snippets`, `directives`, `fonts`, `effects`, `transitions`, `charts`, `languages`, `codeThemes`, `themes`, `slides` | folder or list of folders | the folder of the same name | folders with snippets, directive modules, fonts, effect modules, camera transitions, chart modules, language profiles, code themes, themes and slide classes of the deck's own; the folder of the same name (`code-themes/` for `codeThemes`) next to the Markdown is searched anyway, then the `paths`; see [Extending a deck](extending.html) |

Paths (`classes`, `extends` and the folders) are relative to the file that names them. An
unknown setting is an error that lists the allowed ones.

## Shared settings

`extends: path` builds on another file's settings: a `.zd` (or `.md`) file, whose front matter is used,
or a `.yaml`/`.yml` file, which is all settings. Settings shared by several talks live there once:

```yaml
# course.yaml, next to the talks' folders
theme: lecture
themes: themes
paths: shared
layout:
  fontSize: 26
  font: Inter
macros:
  N: '\mathbb{N}'
```

```markdown
---
extends: ../course.yaml
title: Week 3
layout:
  fontSize: 24
macros:
  R: '\mathbb{R}'
---
```

- `layout`, `presenter`, `macros` and `styles` merge entry by entry, and the file's own entries
  win: week 3 has `fontSize: 24`, `font: Inter` and both macros.
- Folder settings add up, the file's own folders first.
- Every other setting is replaced by the file's own.
- Paths resolve against the file that names them: `themes` and `shared` above are folders next
  to `course.yaml`.
- An extended file may extend another in turn; a cycle is an error.

## Settings given in code

`loadMarkupDeck` and `markupDeck` take the settings as options too
([A deck inside a page](embedding.html)), and what code gives wins over the front matter:
`layout`, `presenter`, `macros` and `styles` merge entry by entry, the options' entries winning,
and the options' folders come before the front matter's.

## layout

| Key | Default | Meaning |
| --- | --- | --- |
| `fontSize` | 28 | body text size |
| `headingSize` | 42 | level-1 heading size; deeper levels shrink slightly |
| `codeSize` | 80 % of `fontSize` | listing size |
| `color` | `#000000` | text and default stroke color (black on the default white canvas) |
| `font` | Latin Modern Roman (bundled) | prose font family; the LaTeX text face by default, so prose and formulas share one design; a family in the deck's `fonts/` folder is loaded from there |
| `codeFont` | Latin Modern Mono (bundled) | inline code and listings; the LaTeX typewriter face, sized to pair with the text face |
| `codeTheme` | the deck's text color decides | token colors of listings, `code-themes/<name>.json`, see [Extending a deck](extending.html#languages-and-code-themes) |
| `margin` | 0.65 | distance of the flow from the canvas edges; a slide's `flow_top` and `flow_left` move its start |
| `gap` | 0.35 | distance between flowing blocks that are not text, and default `buff` |
| `lineGap` | 0.12 | extra space between wrapped lines |
| `lineHeight` | unset | the distance between the baselines of two lines of prose in ems, replacing the font's reach plus `lineGap` |
| `paragraphSpacing` | 1.5 | the distance between the baselines of two paragraphs, in interlines |
| `listIndent` | 0.6 | marker column of list items and indentation per nesting level |
| `haloBridgeTolerance` | 0.2 | arrows and lines whose ends lie closer than this never bridge one another (`halo_bridge`) |
| `animationTime` | 0.35 | duration of fades |
| `defaultSlideSize` | `[16, 9]` | canvas of slides without `width`/`height` |
| `textAnchor` | `left-baseline` | default anchor of text, formulas and listings placed by a point: any anchor; `top-left` places them by their top-left corner, as the flow and `flow_top` measure |
| `steps` | `explicit` | `sequential`: steps follow the source, an element without `step` taking the step of the element before it and `step=+` the click after, see [Steps that follow the source](fragments.html#steps-that-follow-the-source) |

## presenter

| Key | Default | Meaning |
| --- | --- | --- |
| `transitionTime` | 0.7 | seconds of each camera move; 0 jumps |
| `transition` | `zoom` | `cut` replaces the view at once between slides, like turning PDF pages; the name of a module in the deck's `transitions/` folder moves the camera its own way; a slide's own `transition=` overrides it for the moves into that slide |
| `padding` | 1 | camera width multiplier around a focused slide |
| `pauseOnEntry` | true | stop after entering a slide, before its first step |
| `pauseOnReturn` | true | stop after returning to a parent |
| `showSlideBorders` | false | draw every slide's canvas border (design aid) |
| `slideBorderColor`, `slideBorderWidth` | `#FC6255`, 3 | border style |
| `showSlideGrid` | false | draw a coordinate grid, with numbers, on the focused slide, exports included; the [`debug`](slides.html#designing-a-slide) flag draws lighter dots, and never in an export |
| `reversePlayback` | true | play stops backwards on the left key |
| `revealOnEntry` | true | children start invisible and fade in when first entered; `false` shows every slide's content from the start; `preview=true` on an include does it for one child |

## Command line

```bash
node bin/zoomdown.mjs serve <deck> [--port N] [--host] [--no-open] [--editor NAME] [--scene Name] [--watch PATH]...
node bin/zoomdown.mjs build <deck> -o <folder> [--one-file] [--show-outline] [--without-notes] [--scene Name]
node bin/zoomdown.mjs jump <file> <line>
```

`<deck>` is a `.zd` file (or a deck's `.md`), a PDF, a JS/TS module exporting a deck definition, or a
[Slajdomat presentation](documents.html#a-slajdomat-presentation) by its folder, `index.html` or `manifest.json`; another `.json`
path is refused, with a message saying to move its settings into the front matter. Both
commands read the front matter, with the files it extends. `serve` serves the deck's folder, the
folders its settings name and those of the files it extends, and reloads the preview for what the
deck loads, not for the folders that hold it: the deck and the whole chain of files it extends,
every file its pages open or look for (imports, snippets, themes, images, directives, fonts),
anything in its library folders (`artworks/`, `fonts/`, `directives/`, …), and any `--watch`
path; the list is read anew at each reload. Another deck beside a shared settings file, a README
or a stray file reloads nothing.

A reload follows a save, whether the editor writes the file in place, renames a new copy over it
or moves the old one away as a backup; what is not saved is not shown. The page comes back at the
slide and step you were on. What a program writes rather than you reloads nothing: exports (any
`build` or `dist` folder below the deck's or another served folder), `node_modules`, `.git` and
`recordings/`; nor does anything reload while the player is writing an export. The deck itself and
the files it extends reload wherever they are kept, also below folders of those names. Front matter
saved half-written leaves the preview watching the files the deck extended before, so the next save
of any of them reloads it.

`--watch PATH` (repeatable) adds a file or a folder to what reloads it,
`--host` also listens on the network for a tablet, and `--editor` names the editor (`emacs`,
`sublime`, `code`, `vim`, `jetbrains`, … or a command with `{file}` and `{line}`;
`ZOOMDOWN_EDITOR` is the default) that the player's E key and ⇧⌘ + click open source lines
with. `jump` moves the running preview to the stop of a source line, and `build` exports the deck,
both as last saved: `build` writes `index.html`, `assets/` and `deck/` into the folder, or
`offline.html` with `--one-file`; `--without-notes` leaves the presenter's `::: notes` out of
either. Code decks in `--one-file` mode embed the code but not images they load themselves.

## Development page

`npm run dev` serves `index.html`, which reads `?deck=` (a `.zd` or `.md` file, a PDF or a module
path, also `/@fs/absolute/path`) and `&scene=` for named exports, and opens
`examples/tour/slides.zd` when `deck` is omitted. Files under `examples/` trigger a reload on
change, and `zoomdown jump` and the inverse search work there too (set `ZOOMDOWN_EDITOR` before
`npm run dev`).

## Package scripts

| Script | Does |
| --- | --- |
| `npm run dev` | development page |
| `npm test`, `npm run typecheck` | unit tests, TypeScript |
| `npm run docs` | rebuild this documentation into `docs/html/` |
| `npm run serve -- <deck>` | the editing preview |
