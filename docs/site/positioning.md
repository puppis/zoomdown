---
title: Positioning
description: Anchors, flow, explicit coordinates, relative constraints, at= expressions, offsets and sizes.
---

<a class="try" href="tour.html#slide=layout">Open in the tour ↗</a>

## Anchors

`x`, `y` position an element's **anchor**. The default anchor is `left-baseline` for prose,
headings, math and listings (the left edge and the first baseline), `origin` for groups (their
local `(0,0)`) and `center` for images, shapes, icons, tables, charts and child viewports.
`layout.textAnchor` changes the default of prose, headings, math and listings for the whole deck:
with `textAnchor: top-left` they stand by their top-left corner, measured as the flow and
`flow_top` measure a block, and `anchor=top-left` need not be written on each.
`anchor=` chooses another point:

| Anchors | Available on |
| --- | --- |
| `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right` | every element and viewport; an arc's `center` is the center of its circle, the others are on its box |
| `left-baseline`, `baseline`, `right-baseline` | text, math and listings: the first baseline, at its left end, middle or right end |
| `origin` | groups (their local origin) |

```markdown
![](assets/tiles.png){#img x=-9.35 y=0.4 width=4 anchor=top-left}
[[rectangle: #r x=9.35 y=-5 width=3 height=1.2 anchor=bottom-right]]
[Ends at x = 9.35]{#rb x=9.35 y=-0.4 anchor=right-baseline}
```

`layout.textAnchor` changes the default for text.

## Flow

Blocks without coordinates flow downward from the top-left margin of the canvas. Text is spaced
by its lines, as in LaTeX: two paragraphs (separated by a blank line) have their baselines
`layout.paragraphSpacing` interlines apart (1.5 by default), a little more than two lines of one
paragraph; the items of a list written without blank lines are one interline apart; a text and
any other block (a table, a shape, an image) keep the space two paragraphs have between their
lines. Two blocks that are not text are `layout.gap` apart. A center-anchored element with one
missing coordinate defaults that axis to zero.

### After a placed block

A block without a position goes on after the block written before it, wherever that one is
placed: under it, at its left edge, with the spacing above. So a column needs a position only at
its top, and everything written after it follows, without `below:#LAST left-aligned:#LAST`:

```zoomdown {height=4}
::: slide {#after-placed width=16 height=4}

The right column starts here {#head x=1 y=1.4 width=6.5 color=BLUE}

and goes on under it, at its left edge, with no position of its own.

- a list keeps its bullets in one column,
  - and its nested items indented.

:::
```

- **What counts as the block before**: text, a formula, a listing, a table, a chart or a group,
  however it is placed, or anything that flowed down before. Pictures and drawings placed at a
  point (images, icons, shapes, includes), which stand beside or behind the text, are passed over;
  so are a block placed by its right end or its middle (`anchor=right-baseline`,
  `at=center:(…)`: a corner link, a centered label), a caption of the parent's view placed out of
  the flow (`step=-1`), and an element placed against the one that follows (an overlay written
  before what it marks). The first block of a slide or a group starts the flow at `flow_top`
  and `flow_left`.
- **Options win, axis by axis**: the default is as if `below` and `left-aligned` the block before
  were written, and what is written replaces either. `x` alone puts the block in a column of its
  own, which the flow fills from where it stands, as before, not under the block before (unless
  it starts a column beside that block, below); a
  horizontal alignment (`left-aligned:#q`, `left-aligned:#LAST.text`) keeps it under the block
  before, aligned with `#q`, and the blocks after it go on at that edge. A `y` or a vertical
  alignment sets its height, and its left edge stays the flow's. A direction (`below:#x`,
  `right-of:#x`) or `at=` places it entirely, as before: `below:#x` alone still centers it under
  `#x`; add `left-aligned:#LAST` to keep the left edge.
- **Columns side by side**: a text, formula or listing with `x` alone, written right after a block
  placed by a point (`y`, or `at=` a point, by its left edge) and standing right of that block's
  right edge, starts a column beside it: its top at that block's top, as `top-aligned:#LAST`
  would put it, and the blocks written after it without a position go on under it, in its
  column. A column so started heads the next one, so a row of columns needs a position only on
  the first: `{y=0.75 anchor=top-left width=3.6}`, then `{x=-3.65 width=3.6}`,
  `{x=0.45 width=3.6}`. A drawing, an arrow or a line written between the two, a block placed
  against another element (a picture's caption), a block placed by its right end or its middle,
  a caption of the parent's view and an `x` left of the block before keep the flow as above.
- **Spacing**: `buff=` alone sets the space after the block before, as `below:` measures it, so
  `{buff=0.45}` places a block where `{below:#LAST left-aligned:#LAST buff=0.45}` did whenever
  the block before is the one `#LAST` names (not a picture or an include, which the flow passes
  over). At the start of the flow it does nothing.
- **Lists stay lists**: the items line up under one another, nested items indent, and the blocks
  that continue an item go under its text. `left-aligned:#LAST.text` puts the next block under the
  text of the item before instead.
- **Wrapping**: a column is as wide as the block that starts it says: the paragraphs that flow in
  it without a `width` of their own wrap at the `width` of the block placed at its top, or at the
  flow's when that block has none.

`flow_top` and `flow_left` on a slide move the start of its flow: `flow_top` is the distance from
the slide's top edge to the top of the first flowing block, `flow_left` the distance from its left
edge to the flow's left edge. Both default to `layout.margin` (0.65), must be nonnegative and less
than the slide's height and width, and are measured from the top-left corner, as Figma measures
positions in a frame. Paragraphs wrap between `flow_left` and the right margin. Nothing else moves:
explicit coordinates, anchors, `at=` and includes keep the slide's coordinates, paragraphs and
lists keep their spacing, text with only `x` flows at its own left edge, and groups keep their
local flow. A slide that continues another one, a full page laid over the end of its parent, can
so start its text right after the parent's last item, each block on its own step:

```markdown
::: slide {#rounds flow_top=6.27 flow_left=0.11}

Round with pivot *r* … {step=1}

- every concerned node sends a request … {step=2}

- upon receiving the pivot's table … {step=3}
:::
```

## Relative constraints

<a class="try" href="tour.html#slide=layout">Open in the tour ↗</a>

```markdown
### A heading {#h x=0.6 y=1.6}

[Below it, left-aligned]{#p below:#h left-aligned:#h buff=0.3}

[A side note]{#note right-of:#p buff=0.5 font_size=18 color=GRAY}

[Big]{#big x=0.6 y=-1.4 font_size=48}
[shares the baseline]{x=2.3 baseline-aligned:#big}
```

- `below`, `above`, `left-of` and `right-of` place the element beyond the reference's bounding
  edge, centered on the other axis, at distance `buff` (default `layout.gap`); a negative `buff`
  makes it overlap the reference by that much (`above:#box buff=-0.5`, over its top). Two texts line up
  as lines of type: side by side on one baseline, and one below the other a line apart, `buff`
  plus the line gap between the bottom of one's last line and the top of the other's first, as
  their font measures them.
- `above-left-of`, `above-right-of`, `below-left-of` and `below-right-of` place the element
  diagonally, beyond that corner of the reference: `above-right-of:#box` puts the element's
  bottom-left corner `buff` to the right of and `buff` above the box's top-right one (with `buff=0`
  the corners touch; negative, the two overlap). A diagonal sets both coordinates: it takes no
  alignment, `x` or `y`, and `dx`/`dy` move the element from there.
- `left-aligned`, `right-aligned`, `top-aligned` and `bottom-aligned` match an edge without moving
  the other axis.
- `baseline-aligned` matches the typographic baseline of text, math or listings.
- One direction and at most one constraint per axis are allowed; an explicit coordinate may set
  the free axis (`below:#h x=0`).

References target elements of the same slide (and the same [group](groups.html)), including
later ones and hidden fragments, but never arrows, lines, braces, boxes or blobs. At the slide's
top level they also target the slides it [includes](slides.html#includes), by their id, so
includes stack without coordinates of their own and captions follow them:

```markdown
[[include: #first x=-4 y=2 width=4]]
[[include: #second below:#first buff=0.3 width=4]]
[[include: #third right-of:#second width=3]]
[The second step]{#caption below:#second}
```
 Sizes are measured once
during preparation; dependency cycles are reported with their line.

## The edges of the slide

`#TOP`, `#BOTTOM`, `#LEFTMOST` and `#RIGHTMOST` name the four edges of the slide, each a line along
its side of the canvas; `#TOPLEFT`, `#TOPRIGHT`, `#BOTTOMLEFT` and `#BOTTOMRIGHT` its four corners,
and `#CENTER` its center, the origin, each a point. Every reference takes them, as it takes an
element:

```markdown
[A footer, centered at the bottom]{above=#BOTTOM}
[[rectangle: #box width=3 height=1 right-of=#LEFTMOST top-aligned=#TOP]]
[[icon: server at=#TOPRIGHT dx=-0.5 dy=-0.5]]
[A page number]{above-left-of=#BOTTOMRIGHT buff=0.3}
[Under the top-left corner]{below=#TOPLEFT}
[Right in the middle]{at=center:#CENTER}
```

- Beside an edge (`above=#BOTTOM`, `below=#TOP`, `right-of=#LEFTMOST`, `left-of=#RIGHTMOST`), an
  element stands `layout.margin` (0.65) from it, the distance the flow keeps, unless `buff` says
  otherwise, and it is centered along the edge unless an alignment or a coordinate sets that axis.
- An alignment with an edge puts the element against it: `left-aligned=#LEFTMOST top-aligned=#TOP`
  is the top-left corner of the canvas, with no margin.
- With `at=`, an edge's anchors are its middle (`#TOP`, `#TOP.center`) and its ends (`#TOP.left`,
  `#BOTTOM.right`, …, the corners of the canvas); `#CENTER` is the center.
- At a corner, an element fills it: `at=#TOPRIGHT` puts the element's own top-right corner there,
  flush with both edges, and `dx`/`dy` move it in (`at=#TOPRIGHT dx=-0.5 dy=-0.5`). An anchor of its
  own, `at=center:#TOPRIGHT` or `anchor=`, puts that anchor on the corner instead.
- Beside a corner, an element stands `layout.margin` from it and against the side of the slide the
  two share: `below=#TOPLEFT` is a margin below the top edge, on the left edge; `left-of=#BOTTOMRIGHT`
  a margin from the right edge, on the bottom one. An alignment or a coordinate sets the other axis
  otherwise (`below=#TOPLEFT x=-6`). Diagonally inward from a corner, an element keeps the margin
  from both sides: `below-right-of=#TOPLEFT`, `above-left-of=#BOTTOMRIGHT buff=0.3`.

They follow the slide's `width` and `height`. The names are reserved: no element or slide may take
one. A group has coordinates of its own, so the elements inside it cannot reference the slide's
edges, corners or center; place the group itself against them.

## The element before, and an item's text

`#LAST` names the element written just before, so an element placed against the one above it
needs no id for that:

```markdown
![](assets/ring.png){#ring x=-5 y=1 width=4}
[The ring after one round]{below:#LAST left-aligned:#LAST}
[[arrow: #LAST -> (3,0)]]
```

It works wherever a reference does: the relative constraints, `at=` (`at=#LAST.bottom-right`),
the ends of arrows and lines, and the targets of braces, boxes and blobs. The element before is
the one written before in the source, imports and snippets expanded, whatever its `step`: arrows,
lines, braces, boxes and blobs, which nothing can reference, and subslides are passed over. In a
group it is the member before, and the group itself for what follows it; at a slide's top level
an include counts, as the slide it shows. Each element finds its own, so a list item's or a
style's `#LAST` names the element before that item or that styled element:
`caption: below:#LAST left-aligned:#LAST` in `::: styles` makes `{.caption}` hang a caption
under whatever precedes it. A `#LAST` with nothing before it in its slide or group is an error,
and `LAST` is no id.

`#id.text` names a list item's text without its bullet or number, where `#id` names the whole
item, so a block can line up under either:

```zoomdown {height=4}
::: slide {#item-text width=16 height=4}

10. Each node sends its identifier to both neighbors {#send x=-7 y=1.2}

[Under its text]{below:#LAST left-aligned:#LAST.text color=BLUE}

[Under its number]{below:#LAST left-aligned:#send color=RED}

[[box: #send.text, #bx, buff=0.1, color=GREEN]]

:::
```

`.text` takes anchors after it (`at=top-left:#send.text.bottom-left`, `[[arrow: #a -> #send.text.left]]`)
and works in every reference; on an element that is not a list item it is the element itself.
It is read at the end of a reference, before an anchor, as anchors are, so an id of your own
should not end in `.text`.

## Anchor expressions

<a class="try" href="tour.html#slide=styles">Open in the tour ↗</a>

```markdown
[[rectangle: #ref x=-6 y=-2.2 width=3 height=1.6]]
[My top-left at its bottom-right]{#tl at=top-left:#ref.bottom-right dx=0.2}
[[dot: #d at=#ref.top color=RED]]
[Centered on a point]{#cp at=center:(5,-3.6)}
```

`at=[anchor:]#id[.text][.anchor]` or `at=[anchor:](x,y)` puts one anchor of the element (the prefix,
or `anchor=`, or, on a literal point, its center, or on an element its default anchor) on an anchor
of another element or on a literal point: `at=(3,-2)` centers the element there, as
`x=3 y=-2 anchor=center` does. Without
an anchor, a text is aimed at on the middle of its first baseline (`baseline`), anything else
at its `center`. It replaces `x`, `y` and the relative constraints, combines with `dx`/`dy`, and
follows the same reference rules. Inside directives, keep `(x,y)` tuples together; the comma
inside parentheses does not split attributes.

## Offsets and sizes

- `dx`, `dy` shift the final position of any positioned element. An element placed relative to
  it, or `at=` one of its anchors, sees it shifted.
- `angle` turns an element by that many radians, counterclockwise, once it is placed and shifted,
  about its anchor (the one `anchor=` or `at=` names): text about the left end of its first
  baseline, which stays on its point, shapes and images about their center, groups about their
  origin. The flow keeps the room of the upright element. Elements placed against it see it as
  drawn, by the box around it, whose middle is then also its baseline; arrows and lines meet its
  turned sides, or the turned outline of a circle, an ellipse or a dot. An arc's `angle` is its
  sweep instead: `start_angle` turns it. Iframes cannot be turned.

```markdown
[Time]{#axis-label x=-7 y=-3 angle=1.5708}       ← reads upward from (-7, -3)
[[rectangle: #card x=3 y=0 width=3 height=2 angle=-0.2]]
[[rectangle: #tab at=top-left:(1,2) width=2 height=1 angle=0.5]]   ← about its top-left corner
```
- `width` controls paragraph wrapping, image width and the maximum width of formulas and listings;
  `height` scales the result; `font_size` overrides the layout size.
- `opacity` (0 to 1) makes any element translucent; fades preserve it.

## Children

Includes and subslides take the same attributes against local elements: `x`, `y`, `anchor`, `at=`,
the relative constraints, `dx`/`dy` and `.class` styles. Their `width`/`height` size the viewport,
not the child's canvas.
