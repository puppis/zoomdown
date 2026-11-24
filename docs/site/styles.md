---
title: Styles
description: Named attribute sets applied by class tokens and automatically by roles such as heading, body or code.
---

<a class="try" href="tour.html#slide=styles">Open in the tour ↗</a>

```markdown
---
styles:
  footnote: { font_size: 18, color: GRAY }
  heading: color=BLUE_E
---
```

```markdown
::: styles
callout: color=ORANGE font_size=30
:::

[A side remark]{.footnote below:#body left-aligned:#body}
[Look here]{#c .callout x=0 y=-2}
```

A **style** is a named set of attributes. Styles are defined under `styles` in the front
matter, as attribute strings or maps, or in a `::: styles` block of the Markdown file (one
`name: attributes` line each); the `::: styles` definition wins for the same name. A style sheet
kept apart from the deck is a **theme**, `themes/<name>.zd` next to the deck, applied with
`theme: lecture` in the front matter under the deck's own styles; see
[Extending a deck](extending.html#themes).

## Classes

A style may build on others: the classes it names among its attributes give their attributes
first, its own go over them (`note: .smallsep color=muted`). In a `::: styles` block, a style that
names itself builds on its definition so far, the theme's or the front matter's:
`verdict: .verdict width=4` adds a width to the course's verdict instead of replacing it. A style
builds only on styles defined before it: in the theme or the front matter, or earlier in the same
block; a later one is an unknown style there.

Elements, includes and subslides opt into styles with `.name` tokens in their attribute list. Several
classes may be listed; later ones win. A style may set how labels look (`label_pos`,
`label_side`, `slanted`, `label_color`) for elements with and without a label alike: on one
without a label they have no effect, while written on such an element itself they are an
error.

## Roles

Styles named after a **role** apply automatically to every element of that role:

| Role | Applies to |
| --- | --- |
| `heading`, `h1` … `h6` | headings (the level-specific name wins) |
| `body` | paragraphs and list items |
| `math`, `code`, `image`, `iframe`, `table`, `chart`, `group`, `include` | that element kind, or child viewports |
| `shape`, and `rectangle`, `circle`, `dot`, `ellipse`, `polygon`, `arc`, `polyline` | shapes |
| `connection`, `arrow`, `line` | arrows and lines |
| `attachment`, `brace`, `box`, `blob` | braces, boxes and blobs |
| `icon`, `icon-<name>` | every icon, or the icons of one name |
| `verdict` | the lines under tiles (`verdict=` on an include) |
| `lifeline`, `process`, `message`, `event` | the parts of a [timeline](shapes.html#space-time-diagrams) |
| `node`, `edge` | the parts of a [graph](shapes.html#graphs) |
| `timeline`, `graph` | the blocks themselves: what every timeline or graph takes (`timeline: event_dot=false lifeline_tip=true`), under its classes and what it writes |

The parts of a block take the style of their role only when the block names no class for them:
`::: graph {node=place edge=arc}` gives its nodes `.place` and its edges `.arc` instead, so each
block chooses its own look and a deck's `.node` class meant for other elements reaches no graph
by surprise. The block passes `<role>_<attribute>` to its parts as well (`node_radius=0.2`), as an
include passes `verdict_<attribute>` to its verdict and a shape `label_color` to its label: an
anonymous class of the block's, over the classes it names, which fills in only what fits each part.

## Resolution

An element's own attributes win, then its classes, then its roles, then the layout defaults.
A style may set any attribute (`anchor`, `width`, `opacity`, `stroke_width`, `enter`, …), and
**fills in only what fits** the element it reaches:

- **Its kind**: an attribute the element's kind does not take is left out, from a class as from a
  role, so one class can size every shape of a drawing (`big: radius=0.3 width=0.4 height=0.4`
  gives a circle its radius, a rectangle its width and height, a text nothing of it), and an
  anchor the kind has not (a baseline on a shape) is left out too.
- **Its placement**: a placement from a style fills in only what the element's own placement,
  and that of a stronger style, leaves free. `at=` fills in only an element placed by nothing
  else; a coordinate or an alignment only an axis nothing else sets, and never one placed by
  `at=` or by a direction along it; `buff` only an element placed by a direction or flowing
  down; `dx` and `dy` only an element something places. So `verdict: color=good buff=0.1`
  spaces a verdict that flows and is ignored on one placed by `at=(0,0)`.

Only attributes written on the element itself can conflict: `[x]{at=(0,0) buff=0.1}` is an
error, naming the element's line, and so is an attribute its kind does not take.

> **Tip** Put common typography in `layout` (`fontSize`, `headingSize`, `codeSize`, `font`,
> `color`) and use styles for the few recurring variations: footnotes, callouts, captions.
> A `shape: sketch=true` style (with `connection` and `attachment`) makes a whole deck
> [hand-drawn](sketch.html).
