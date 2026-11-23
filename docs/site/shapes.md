---
title: Shapes, connections and attachments
description: Rectangles, circles, dots, ellipses, polygons, arcs and polylines; arrows and lines; braces, boxes and blobs.
---

<a class="try" href="tour.html#slide=shapes">Open in the tour ↗</a>

```markdown
[[rectangle: #box x=-6 y=-2.4 width=3.4 height=1.8 corner_radius=0.3 color=BLUE fill_color=BLUE fill_opacity=0.15]]
[[circle: #disk right-of:#box buff=2.2 radius=0.9 color=GREEN stroke_width=4]]
[[dot: #p x=-8.5 y=-2.4 color=YELLOW]]
[[ellipse: #e x=-5.5 y=-2.4 width=3.4 height=1.6 color=TEAL fill_color=TEAL fill_opacity=0.2]]
[[polygon: #tri points="(-2.5,-3.2) (-0.5,-1.2) (0.5,-3.2)" color=ORANGE fill_color=ORANGE fill_opacity=0.3]]
[[arc: #a x=3.5 y=-2.8 radius=1.4 start_angle=0 angle=2.4 color=RED stroke_width=4]]
[[polyline: #zigzag points="(2,-4.2) (4,-2.3) (6,-3.8) (8,-2)" color=ORANGE stroke_width=3]]
```

## Shapes

A shape takes an `#id` when something refers to it, as any element does. All accept `color` (the layout color by default), `stroke_width`
(default 2), `fill_color` and `fill_opacity` (0 by default; polylines have no fill), `opacity`,
the placement attributes of [Positioning](positioning.html), `step`, `hide` and `focus_only`.

`fill_gradient` fills a shape with a linear gradient through two colors or more, from the first
to the last in `gradient_direction` (`right`, `left`, `up` or `down`). Its colors may be
translucent (`#RRGGBBAA`, `#RGBA`), so a picture can fade under a white gradient as in Figma:

```markdown
[[rectangle: #fade x=0 y=-2 width=8 height=2 stroke_width=0 fill_gradient="#ffffff00 #ffffff" gradient_direction=down]]
```

| Directive | Required | Optional |
| --- | --- | --- |
| `rectangle` | `width`, `height` | `corner_radius` |
| `ellipse` | `width`, `height` | |
| `circle` | `radius` | |
| `dot` | | `radius` (0.08; filled by default) |
| `polygon` | `points` (three or more) | |
| `arc` | `radius`, `angle` | `start_angle` (radians; `x`, `y` are the center of its circle; `angle` is the sweep) |
| `polyline` | `points` (two or more) | |

### Labels

A shape takes a `label`, written in its middle, and a `sublabel`, written beside it: a node's
letter and the name under it, without a text of their own placed against the shape.

```markdown
[[circle: .node x=1 y=0 label="A" sublabel="Alice"]]
[[dot: x=3 y=0 sublabel="$p_1$" sublabel_side=right]]
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `label`, `sublabel` | none | the texts, with emphasis, links and formulas |
| `label_side`, `sublabel_side` | `center`, `below` | where each goes: `center`, `above`, `below`, `left` or `right` |
| `label_buff`, `sublabel_buff` | 0.1 | the space between the shape and a text beside it |
| `font_size`, `sublabel_font_size` | `layout.fontSize` | their sizes (the sublabel's is the label's unless set) |
| `label_color`, `sublabel_color` | the shape's `color` | their colors |
| `font` | the prose font | their face |

A text beside the shape is centered on it along that side, its box `buff` away, as
`at=top:#shape.bottom` places a text under it. The shape alone places the whole: `x`, `y`, its
anchors and `at=` are the shape's, and arrows, lines and blobs reach the shape, while the labels
move, fade and turn with it. A class sets how the labels of its shapes look
(`node: radius=0.34 label_color=#1f3d7a sublabel_font_size=20 sublabel_color=#555555`).

Point-defined shapes (`polygon`, `polyline`, `arc`) keep their coordinates unless they are
positioned; `points` is a quoted, space-separated list of `(x,y)` pairs. Shapes serve as
positioning anchors and as connection endpoints. Every shape, connection and attachment also
takes `sketch=true`, which draws it [by hand](sketch.html) with a hatched or solid fill. Ready-made
symbols for diagrams (people, servers, databases, clouds, …) are [icons](icons.html), which behave
like shapes.

## Connections

<a class="try" href="tour.html#slide=shapes">Open in the tour ↗</a>

```markdown
[[arrow: #box -> #disk, #edge, label="**labeled** $\to$", color=YELLOW]]
[[line: #disk -> (-1.2,-5), #drop, color=GRAY, stroke_width=2]]
[[arrow: (-8.8,-5) -> #box, #pointer, color=RED, step=1]]
```

An arrow or line goes from one endpoint to another: an element ID, attached where the line
between the two meets its border (the outline of a circle, a dot or an ellipse, the facing
bounding edge of anything else), an element at one of its anchors, or a literal `(x,y)` point:

```markdown
[[arrow: #a0.top-right -> #b1.top-left]]
[[line: #a0.bottom -> #b1]]
[[arrow: #p -> (3,-2), buff_start=0.2, buff_end=0]]
```

The anchors are those of [`at=`](positioning.html#anchor-expressions): `top-left`, `top`,
`top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`, and the
baseline ones of text. A line ends right on its endpoints; an arrow stops a little short of each,
0.08 away, so that its tip does not touch the element. `buff` sets the space left at both ends,
between the connection and what it joins, and `buff_start` and `buff_end` the space at one end
only, as TikZ's `shorten <` and `shorten >`: `buff_end=0` makes an arrow touch its target, and a
message that ends on a bare process line can keep its start clear with `buff_start` alone. The
space applies to elements, anchors and points alike and is measured along the path, cut from a
curve itself, so a tip points along the stretch that remains; labels (`label_pos`) run along the
shortened path, and halo bridges test crossings against the ends as drawn. An arrow's tip grows and shrinks with its
`stroke_width` (0.3 long at the default 4) and is at most a quarter of the arrow, so a short thin
arrow keeps a small tip, unless its size is given. Arrows and lines also take an optional `#id`, a
`label` with inline styling and math (sized by `font_size`, set in `font`), `color` for the
line and its label, `label_color` for a label in another color, `stroke_width`, `opacity`,
`step`, `hide` and timing.

The label sits at the middle of the edge, above it by default: upright, and clear of the line
on a slanted or vertical edge. `label_pos` moves it along the edge, from its start (0) to its
end (1), like `pos` in TikZ: `label_pos=0.25` is a quarter of the way. `label_buff` (0.1)
sets its distance from the edge. Labels are placed by their lines, as their font measures them,
not by their ink, so a label with descenders and one without share a baseline. `slanted=true` turns it along the edge, and `label_side=below`
puts it on the other side. Above and below are taken in the label's own frame along the edge,
which reads from left to right, or from bottom to top on a vertical edge, so that a label is never
upside down: above a vertical edge is its left, whichever way the arrow points.

```markdown
[[arrow: #a -> #b, #rise, label="slanted", slanted=true]]
[[arrow: #b -> #c, #fall, label="below", slanted=true, label_side=below]]
```

`dashed=true` draws a line, or an arrow's shaft, in dashes. The dashes begin and end the line
and grow longer with a thicker `stroke_width`; an arrow's tip stays solid, and a hand-drawn
connection (`sketch=true`) gets hand-drawn dashes.

```markdown
[[line: #a -> #c, #link, dashed=true]]
[[arrow: #c -> #a, #back, dashed=true, stroke_width=6, label="optional"]]
```

`tip` sets an arrow's tip: `triangle`, the filled default; `open`, two strokes in the arrow's
color and width meeting at its point, which the shaft reaches; or `none`. An open tip is 0.2 long
at the default width, its sides spreading 0.7 of its length to each side. `tip_length` sets a
tip's length along the arrow and `tip_width` how far it spreads on each side of the line (half
its width). A size given this way is kept however short the arrow, and the other follows in the
tip's proportions, so a short bold arrow keeps its tip. `arrow: tip=open` in a `::: styles`
block gives every arrow of a deck an open tip; a dashed arrow keeps a solid one, and a
hand-drawn arrow sketches its two strokes.

```markdown
[[arrow: #a -> #b, #next, tip=open]]
[[arrow: #p -> #path, #hop, stroke_width=7, tip=open, tip_length=0.17, tip_width=0.15]]
[[arrow: #c -> #d, #plain, tip=none]]
```

### Curves

A connection may curve instead of running straight:

- `bend` leaves at that angle, in degrees, to the line between its ends and arrives at the
  mirrored one, an arc as TikZ's `bend left` draws it: a positive angle bends to the left of the
  way, a negative one to the right. `looseness` (1) stretches the arc or flattens it.
- `loop` joins an element to itself (`from` and `to` the same element): a loop on the side
  named, `above`, `below`, `left` or `right`, or toward an angle in degrees (0 right, 90 above),
  leaving 35 degrees to one side of it and coming back 35 degrees to the other. `looseness` makes
  it larger or smaller.
- `wavy` waves along the straight line: that many waves, at most `amplitude` (0.15) from the line,
  to its left first (a negative amplitude starts to the right). The waves grow from the line over
  their first quarter and settle back on it over their last, so the path leaves and arrives along
  the line and a tip points the way it goes.
- `via` passes smoothly through points (a centripetal Catmull-Rom spline, which never loops
  between close points): `+(x,y)` is an offset from the start, the center or anchor of the
  element it leaves, so the curve moves with its elements; `++(x,y)` is an offset from the point
  before, and `(x,y)` a point of the slide.

```markdown
[[arrow: #p2 -> #q2, bend=20]]
[[arrow: #pq -> #pq, loop=above, dashed=true]]
[[arrow: #p -> #q, wavy=2.5, amplitude=0.3, dashed=true]]
[[arrow: #p3 -> #r3, via="+(0.4,-0.3) +(0.1,-0.9) +(0.8,-1.1)", dashed=true]]
```

A curve stops at each element's border along its own way: a bend and a loop leave and arrive at
their angles, and a curve through points is cut where it first leaves the element it starts
from and where it last enters the other. An arrow's tip points along the curve's last stretch,
its base on the curve. Labels sit beside the curve at `label_pos` of its length, by its
direction there; dashes, hand-drawn strokes and `halo_bridge` follow it, and a curved connection
is a path that [`[[move_along]]`](animations.html#move_along) follows. One of `bend`, `loop`, `wavy` and
`via` at a time.

### Halo bridges

`halo_bridge=true` makes a line pass over the arrows and lines it crosses that were written
before it: at each crossing the earlier path is broken on both sides of it, as in knot diagrams
and maps. Elements draw in source order, so the path written later is the one on top. The gap is
a small patch in the deck's background, only where the halo around the line, a strip
`halo_width` engine units wide (the line's width plus 12 by default), meets the stroke of the
path it crosses; `halo_bridge=` a color gives the patch that color instead, for paths that cross
on a colored shape. A style bridges every arrow at once: `arrow: halo_bridge=true` in a
`::: styles` block, and `halo_bridge=false` exempts one of them.

```markdown
[[line: #a -> #b, #first]]
[[arrow: #c -> #d, #over, halo_bridge=true]]
[[line: #e -> #f, #thick, halo_bridge=YELLOW, halo_width=20]]
```

Only proper crossings are bridged. Two paths that leave or reach the same element, at the same
anchor or at two, never break one another, nor do two paths whose ends lie closer than
`layout.haloBridgeTolerance` (0.2). A path that ends on another (a T), paths that cross at a
narrow angle (under about 12 degrees, where the gap would grow long) and crossings so near an end
that the gap would reach it are left alone too, so that an arrow's tip is never notched. A
hand-drawn path is bridged where its strokes cross, a curve along its curve, and an arrow along
its shaft, never its tip. A bridge shows, hides and fades with its path; an animated color leaves
it in the background's color.

Connections are created after all other elements, so forward references work;
they cannot anchor other elements and are not hidden implicitly when an endpoint disappears.

## Attachments

<a class="try" href="tour.html#slide=more-shapes">Open in the tour ↗</a>

```markdown
[[brace: #e, #be, side=bottom, label="an ellipse", color=GRAY]]
[[box: #tri, #bx, buff=0.2, corner_radius=0.1, color=GREEN, step=2]]
```

A `brace` is attached to one element or several, named first: under several it spans their
joint bounding box (`[[brace: #a #b #c, #all, label="the three"]]`). It takes `side` (`bottom`
by default, or `left`, `right`, `top`), `buff`, an inline `label` with `font_size`, `font` and
`label_color`, `color` and `stroke_width`. A `box` (a surrounding rectangle) and a `blob` (a smooth curve at a fixed
distance) enclose one or **several** elements, listed before the first comma; they are described
in [Boxes and blobs](enclosures.html). All attachments accept `step`, `hide`, `opacity` and
timing, may attach to a [group](groups.html) or an [icon](icons.html), and, like connections,
are created after layout. Shapes, icons, connections and attachments can also vibrate over a
range of steps with [`tremble=`](animations.html#tremble).

## Space-time diagrams

A `::: timeline` block draws a space-time diagram from its events, written as data: a horizontal
lifeline for each process, time flowing to the right, the process's name at its left; then, line
by line, what happens on them.

```markdown
::: timeline {#run processes="p q r" x=-5.5 y=1.5 width=11 length=11 spacing=1.3}
r: $r$ (the initiator)
p@0.4 -> q@0.6
p@0.4 "(1,0,0)"
[$\times$]{.snap at=center:q@1.1 step=+}
p@2 -> q@4 "$m_2$" {color=#c0392b}
r@5 -> p@6.5 marker
[[line: q@1.1 -> q@4, .recording]]
:::
```

| Line | Draws |
| --- | --- |
| `p@1 -> q@3 "m1"` | a message: an arrow from process `p` at time 1 to `q` at time 3, labeled; `--` draws a line |
| `q@2 "label"` | an event: a dot on `q` at time 2, its label (optional) as the dot's sublabel |
| `p: name` | the name shown for `p` (inline text); `$p$` by default |
| anything else | any element, in which `p@t` is the point of `p` at time `t` (`at=center:q@1.1`, `[[line: p@0 -> p@2]]`) |

A message or an event line ends with an optional `"label"`, style names written bare
(`marker`, `snap`: the same as `{.marker}`) and `{attributes}` (`{color=RED step=+}`). The block
takes `processes` (names of letters, digits and `_`), `length` (the time the lifelines span) and
`width` (their length in units; either one alone gives both), `spacing` (1) between lifelines,
`x`, `y` (the left end of the top lifeline, time 0), `#id`, and `step` and `hide` for every part
without its own (with [sequential steps](fragments.html#steps-that-follow-the-source), `step` goes
to the first part, and the others follow it as usual). Its parts are elements of the slide: the
lifelines `#id-p`, the names `#id-p-name` and the line `k` of the block `#id-k`, so each appears at
its own click. They take the deck's styles `lifeline`, `process`, `message` and `event` after
those of their kind, each only what its kind takes. In a [group](groups.html) the diagram is part of the group.

## Graphs

A `::: graph` block places nodes by coordinates and joins them by name: networks, state machines,
Petri nets.

```markdown
::: graph {#net x=-4 y=-3.2 scale=1.75}
p1 (0,0) place
t1 (1,0) rectangle transition
p2 (2,0) place
p1 -> t1
t1 -> p2
p2 -> p1 "back" {bend=-40}
[[dot: at=center:#p1 radius=0.09]]
:::
```

| Line | Draws |
| --- | --- |
| `A (x,y)` | a node `#A`, a circle at `x`, `y` (scaled by `scale` from the block's `x`, `y`); `rectangle`, `ellipse` or `dot` after the coordinates changes its shape |
| `A (x,y) "label"` | the same, its [label](#labels) inside |
| `A -> B "3"` | an edge: an arrow from `#A` to `#B`, labeled; `--` draws a line |
| anything else | any element, which may name the nodes |

Lines end as in a timeline: a `"label"`, style names written bare, `{attributes}`. A node is
`radius=0.3` (a rectangle 0.6 square, an ellipse 0.8 by 0.5) unless its attributes or styles size
it. With `labels=true` every node without a label of its own is labeled by its name. Nodes and
edges take the deck's styles `node` and `edge` after those of their kind, each only what its kind
takes, and the block's `step` and `hide` as a timeline's parts do.
