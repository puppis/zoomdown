---
title: Slides and the forest
description: Slide containers, canvas sizes, includes, visit order, start and preview flags, placeholders.
---

<a class="try" href="tour.html#slide=tree">Open in the tour ↗</a>

## Slide containers

```markdown
::: slide {#overview title="Lecture overview" width=20}
# Introduction

[[include: #chapter x=4 y=-1 width=8 angle=0.1 step=2]]
:::

::: slide {#chapter}
## A chapter
:::
```

- Every slide is a `::: slide {#id} … :::` container. IDs start with a letter or underscore and
  continue with letters, digits, `_`, `.` or `-`; they are unique in the document.
- Definition order and heading levels never determine nesting; only includes do.
- A deck is a **forest**: the slides that nothing includes are its roots, visited first to last
  with cuts between them, and every other slide belongs to the tree of one root. Most decks are
  a single tree; a deck whose slides include none of the others is a
  [flat document](documents.html), as the pages of a PDF are. Unknown references, cycles and
  including the same slide twice are errors. To show the same content twice, define it twice
  under different IDs.
- `title="…"` names the slide in the outline; otherwise its first heading, then its ID, is used.

## Canvas size

`width` and `height` on a slide set its canvas. The default is 16 × 9 (or
`layout.defaultSlideSize`); one dimension infers the other from the default proportions, two
choose a different aspect ratio.

```markdown
::: slide {#wide width=32}        → 32 × 18
::: slide {#square width=10 height=10}
```

`flow_top` and `flow_left` set where the slide's flow starts: the distance from the top edge to the
top of the first flowing block, and from the left edge to the flow's left edge. Both default to
`layout.margin` and leave the canvas and its coordinates as they are
([Positioning](positioning.html#flow)).

```markdown
::: slide {#rounds flow_top=6.27 flow_left=0.11}   → text starts 6.27 below the top edge
```

## Includes

```markdown
[[include: #diagram x=4.5 y=-2 width=9 angle=0.08]]
[[subslide: #notes below:#heading left-aligned:#heading width=6 step=1]]
```

An include places the referenced slide's viewport in the current canvas. `x`, `y` are the center
of the viewport (or the point named by `anchor=`), `width`/`height` its size (one dimension keeps
the child's aspect ratio, two letterbox it), `angle` rotates it in radians. Without `width` and
`height` the viewport is at most six units wide. Includes accept the relative constraints, `at=`,
`dx`/`dy` and `.class` styles of [Positioning](positioning.html), and are references themselves,
by the id of the slide they include: `[[include: #b below:#a]]` puts one under another. `[[subslide: #id …]]` is the
same thing; `subslide` also places [code-authored children](#code-authored-children).

An include referring to an **undefined** slide draws a red placeholder rather than failing, and
the placeholder is never a stop, so a deck keeps running while a slide is still unwritten.

## Rows and grids of tiles

An include written right after another include, with no position of its own (no `x`, `y`, `at`
nor relative constraint), goes on the same row: right of it, top-aligned, `buff` apart
(`layout.gap` by default), and as wide as it unless it gives a `width` or `height` itself.
What does not flow, written between them, does not break the row: directives, arrows and lines,
pictures and drawings, the parts of a graph or a timeline, and anything placed by a point, by `at=`
or against another element, such as a label placed over a group of tiles. A block that flows
(a paragraph without a position) ends the row.

```markdown
[[include: #bitcoin x=-7.7 y=0.9 anchor=top-left width=2.6]]
[[include: #double-spending buff=0.6]]
[[include: #pow buff=0.6]]
```

A `::: tiles` container lays its includes out as a grid of `cols` columns: the first tile where
the container's position says, each next one right of the one before, and the first of each row
under the first of the row before (under its verdict when it has one, measured from the verdict's
line box, so the rows step evenly whatever its letters reach), all `buff` apart and as
large as the container's `width` or `height` unless they say it themselves. Without `cols` the
tiles make one row. Classes on the container fill in what it takes and does not write
(`::: tiles {cols=5 .medsep}`: the gap of `medsep`). The includes inside take no position of their own. Its `step` and `hide`
step it [as a whole, line by line](fragments.html#blocks-step-as-a-whole): the first tile is
visited at its `step`, the verdicts go at its `hide`.

```markdown
::: tiles {cols=3 x=-7 y=3 anchor=top-left width=3.5 buff=0.5}
[[include: #mining]]
[[include: #forks]]
[[include: #attacks]]
[[include: #rewards]]
:::
```

### The line under a tile

`verdict="…"` on an include writes a line under its tile, centered, wrapped at the tile's width,
that appears at the click after the tile's visit: what the child taught, once it has been seen.
It is a text of the parent, `#child-verdict`, styled by the deck's `verdict` style (color, size,
`width`, and a position that replaces the place under the tile); its text may hold emphasis and
formulas. The include passes `verdict_<attribute>` to its verdict, for one tile: `verdict_width=4.4`,
`verdict_at=left:#LAST.right`, `verdict_class=note`; under its tile, a verdict hangs from its first
line box, so the verdicts of a row share a baseline whatever their letters; `::: tiles {verdict_width=4.4}` passes it to
every tile's verdict that does not set it. With sequential steps, an element written after the include comes with the include's visit, as it
came with a verdict line written there before: turning a verdict line into `verdict=` can move the
next element without a step of its own one click earlier; give it `step=+` to keep it after the
verdict. The visits of a slide whose tiles have verdicts are numbered first, so the verdicts'
clicks come after them; with [sequential steps](fragments.html#steps-that-follow-the-source) the
verdicts stand outside the count, the element after an include counting from its visit.

```markdown
[[include: #bitcoin x=-7.7 y=0.9 anchor=top-left width=2.6 verdict="a public ledger of transactions"]]
[[include: #double-spending buff=0.6 verdict="a shared ledger is not enough"]]
```

### Captions sized by their tile

With `captionSize` under `layout:`, a caption of a tile (a `step=-1` text, see
[Before the visit](fragments.html#before-the-visit-step-1)) without a `font_size` of its own or of
a class is that many points of the parent, whatever the tile's width: in a 16-wide child shown 2.6
wide, `captionSize: 26` makes it 26 × 16 / 2.6 = 160 points of the child. The style of its role
(`heading`, `h1`) gives way to it.

## Visit order

Children without `step` are visited in source order after all numbered steps of the parent.
`step=N` interleaves a visit with the parent's fragments: the parent's changes of step N play
first, then the child is visited. When a child ends, the camera goes straight to the next sibling
when nothing happens in between, and zooms back to the parent when the parent has a step of its
own before the next child, and after the last one; the parent then resumes with its previous
state, and children keep their final appearance as previews. `skip_return` on a child keeps the
camera on it even then, and `return_to_parent` brings it back even before a sibling that follows
at once ([Flags](#flags)).

```markdown
[Shown first]{#a step=1}
[[include: #left x=-4 y=-2 width=7 step=1]]     ← visited after the reveal of step 1
[Shown next]{#b step=2}
[[include: #right x=4 y=-2 width=7]]            ← visited after step 2
```

## Flags

| Attribute | On | Effect |
| --- | --- | --- |
| `start_here=true` | slide, include, subslide | open playback at this slide (at most one in a deck) |
| `only_this=true` | slide, include | prepare only this subtree while editing; everything else becomes a placeholder |
| `return_to_parent` | slide, include, subslide | zoom back to the parent after this child even when a sibling follows at once; `return_to_parent=false` is `skip_return` |
| `skip_return` | slide, include, subslide | leave this child straight for the next stop even when it is the last one, without zooming back to the parent; `skip_return=false` is `return_to_parent` |
| `transition=cut` | slide, include, subslide | arrive at this slide without a camera animation; `transition=zoom` restores the zoom under a `cut` deck; any other name is a camera transition of the deck's own ([Extending a deck](extending.html#camera-transitions)) |
| `preview=true` | slide, include, subslide | show the child's content before its first visit instead of fading it in on entry, as the tiles of the tour's front page do |

A flag written bare means `=true`: `[[include: #proof skip_return]]`. By default a child returns
to its parent only when it is the last one visited, so the camera moves from sibling to sibling
and comes back once at the end; `return_to_parent` and `skip_return` force either choice for one
child. They are the two sides of one choice and are never written together.

## Cuts instead of zooms

Every camera move is a zoom, with one exception: a root of the forest (a page of a PDF, a slide
nothing includes) is reached with a cut from outside its own tree, as the next page of a document
is; zooming back out to a root from its own children is a move like any other. A slide's
`transition` says how the camera arrives at it, whichever slide it comes from, and overrides the
rule in both directions, a cut into a zoomed deck or a zoom into a cut one: `transition=cut` on a slide (or on the include that places it) replaces the view
at once when the camera moves into that slide, `transition=zoom` on a root pans to it from its
neighbor; fades of focus-only decorations still play. The move out of a slide is the next
destination's business: back to the parent, it follows the parent's setting. To present a whole
deck with cuts, set `presenter: { transition: cut }` in the front matter; individual slides can
then ask for `transition=zoom` again, and a module of the deck's own by name
([Extending a deck](extending.html#camera-transitions)).

## Presenter notes

```markdown
::: slide {#results width=20}
## Results

::: notes
Thank the team first. The figure is from the March run; the April one looked the same.
:::

[Accuracy went up by 12 %]{#gain x=-9 y=1 step=1}

::: notes {step=1}
*Twelve* on the held-out set; say it is 9 on the public one if asked.
:::
:::
```

A `::: notes` block inside a slide holds the presenter's notes for it, in ordinary Markdown:
emphasis, lists, code, links. `::: notes {step=N}` ties a block to one step. The notes are never
laid out on the canvas, printed, or shown to the audience: they appear on the
[companion tablet](player.html#a-tablet-as-a-drawing-pad), under the picture of the slide,
whenever a stop settles, the slide's own notes first and the current step's after them. Formulas
in notes stay as written. The notes travel with the deck, so a deck handed to the audience is
exported with `--without-notes`, which leaves them out ([Exporting a deck](exporting.html#options)).

## Code-authored children

```markdown
[[subslide: Orbit x=0 y=-3 width=4 step=5]]
```

`subslide` with a class name instead of a `#id` instantiates a `Slide` subclass exported by the
module named by `classes` in the front matter; see [Code-authored slides](code-slides.html). It
takes the same placement attributes as an include.

## Splitting a deck into files

<a class="try" href="tour.html#slide=imports">Open in the tour ↗</a>

```markdown
::: slide {#intro}
## Introduction
[[import: parts/footer.zd]]
:::

[[import: parts/appendix.zd]]
```

`[[import: path.zd]]` splices another Markdown file into the document before it is parsed.
`[[snippet: name key=value …]]` does the same with a snippet, markup defined once with
`{{placeholders}}` and used many times ([Extending a deck](extending.html#snippets)).
Between slides the file contributes slides and `::: styles` blocks; inside a slide it contributes
elements and directives, as if its lines were written there. Paths are relative to the importing
file (so a file in `parts/` imports its neighbours by bare name), imported files may import
others, and import lines inside fenced code are left alone. Error messages name the imported
file and the line within it. Asset paths (images, videos, pages) in an imported file keep
resolving relative to the main document, like everything else. A file that is not next to the
importing one is looked for in the folders `paths` names in the front matter, in their order.

Exports embed the imported files, so a built deck needs no server to resolve them; the
preview server reloads when any of them is saved.
