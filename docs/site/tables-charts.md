---
title: Tables and charts
description: Pipe tables with styled cells, rules and shading, and bar, line and pie charts drawn from rows of numbers, crisp or hand-drawn.
---

<a class="try" href="tour.html#slide=tables">Open in the tour ↗</a>

````markdown
::: {.element #sales x=5 y=1.3 rules=rows stripe-opacity=0.08}
| Region | 2023 | 2024 |
| :--- | ---: | ---: |
| North | 3.2 | **5.0** |
| South | 2.1 | $\pi$ |
:::

```chart {#bars x=5 y=-2.6 width=6 height=2.6 values=true}
Region, 2023, 2024
North, 3.2, 5.0
South, 2.1, 3.1
```
````

## Tables

A Markdown pipe table (a header row, a delimiter row, then body rows) becomes a grid of cells.
Cells hold the usual inline markup: emphasis, code, math, colored spans and links. The delimiter
row sets each column's alignment (`:---` left, `:---:` center, `---:` right). Like a formula, a
table is positioned and styled by wrapping it in a `::: {.element …}` container, which also gives
it its `#id`, `step`, `hide` and the placement attributes of [Positioning](positioning.html);
tables are centered on `x`, `y` unless `anchor=` says otherwise. Columns take the width of their
widest cell, at least a line height; when the table would exceed `width` (the available width by
default), columns shrink in proportion and their text wraps. Every row is at least as tall as the
letters of the table's font, a capital or an ascender above the baseline and a descender below,
as TeX's strut makes them, plus the vertical padding: rows of plain text in one size are equal,
whether they hold "…", "ace", "A" or nothing, and a cell may still be wide and flat. A formula
reaching beyond the letters makes its row taller.

`header-font-size` sets the size of the header row's text, and `col-font-size` the size of the
body cells' text per column, as `col-width` sets widths: `header-font-size=20 col-font-size="18 14 14"`.

`col-width` fixes the width of the columns, rules to rules: one value for all of them, or a list
with one per column, where `auto` keeps a column's natural width. Empty columns then keep their
width, and a cell wraps to its column, a line height wide at the narrowest; a column too narrow
for that and its padding widens. With small, flat cells:

```markdown
::: {.element #routes header=false font-size=17 padding="0.02 0.07" col-width=0.37}
| A | | |
| :-: | :-: | :-: |
:::
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `rules` | `all` | which lines to draw: `all`, `rows`, `cols`, `outer` or `none` |
| `valign` | `baseline` | how the cells of a row line up: on their first baseline, or by the `center`, `top` or `bottom` of their box |
| `border-color` | the text color | color of every rule and the default shading color |
| `stroke-width` | 1.5 | width of every rule |
| `row-rule-color`, `row-rule-width` | `border-color`, `stroke-width` | the horizontal rules: between rows, and the top and bottom of the frame |
| `col-rule-color`, `col-rule-width` | `border-color`, `stroke-width` | the vertical rules: between columns, and the sides of the frame |
| `header-col-rules` | `false` | whether the vertical rules, the sides of the frame included, cross the header row |
| `header-col-rule-color`, `header-col-rule-width` | `col-rule-color`, `col-rule-width` | the vertical rules in the header row, the sides included |
| `header` | `true` | whether the first row is a header (shaded; `false` treats it as a body row) |
| `header-color`, `header-opacity` | the rule color, 0.12 | background of the header row |
| `stripe-opacity` | 0 | background of every second body row, in the rule color |
| `fill-color`, `fill-opacity` | the rule color, 0 | background of the whole table |
| `padding` | 0.15 | space between a cell's text and its rules on all four sides; two values give the vertical then the horizontal space, as in CSS |
| `padding-x`, `padding-y` | `padding` | the space beside a cell's text, and above and below it |
| `col-width` | natural widths | the width of every column, or a list with one per column (`auto` for a natural one) |
| `header-font-size` | the column's | the size of the header row's text |
| `col-font-size` | `font-size` | the size of the body cells' text, one for every column or one each (`auto` keeps `font-size`) |
| `font-size`, `font`, `color`, `opacity` | the layout's | typography and translucency |
| `sketch` and its tuning | `false` | [hand-drawn](sketch.html) rules and backgrounds |

The shared `border-color` and `stroke-width` style every rule; the `row-rule_` and `col-rule_`
attributes override them for one direction, so rows and columns may differ in color and weight:
`row-rule-color=BLUE row-rule-width=3 col-rule-color=GRAY`. A width of 0 leaves out the rules of
that direction, the sides of the frame included. Where they cross, the row rules lie over the
column rules.

The vertical rules start under the header row, the sides of the frame as the rules between
columns. `header-col-rules=true` carries them through the header, and `header-col-rule-color` and
`header-col-rule-width` give them a style of their own there:
`header-col-rules=true header-col-rule-color=WHITE header-col-rule-width=1`. Without a header
(`header=false`) they run whole.

Tables take the style role `table`, so `table: rules=rows header-opacity=0.2` in a styles block
sets a deck-wide look, and `tremble=` makes their rules vibrate like any vector geometry.

## Charts

A fenced block whose language is `chart` holds the data; its info string holds the options, among
them `type`: `bar`, `line`, `pie`, or the name of a chart module of the deck's own in its
`charts/` folder ([Extending a deck](extending.html#chart-types)):

````markdown
```chart {#visits x=4 y=0 width=7 height=3.5 type=line colors="RED_E TEAL_E"}
Month, Visits, Signups
Jan, 12, 3
Feb, 18, 5
Mar, 15, 4
```
````

Each line is a row; its cells are separated by commas, semicolons or tabs. The first row names the series (its first cell
labels the category column and is ignored) unless its cells after the first are plain numbers;
years such as `2023` still count as names, and `header=true` or `header=false` settles doubtful
cases. Each later row is a category followed by one value per series. Lines starting with `#` are
comments.

| Attribute | Default | Meaning |
| --- | --- | --- |
| `type` | `bar` | `bar` (grouped bars), `line` (lines with markers) or `pie` (the first series as slices); any other name is a chart module of the deck's own |
| `src` | the fence's rows | a CSV, TSV or JSON file with the rows, next to the Markdown or in the `paths` folders; the fence is then left empty ([Extending a deck](extending.html#chart-types)) |
| `width`, `height` | 6, 3.5 | size of the plot area, or of the box a pie fits in; axis labels and the legend add to it |
| `colors` | a built-in palette | series (or slice) colors, space- or comma-separated |
| `fill-opacity` | 0.85 | opacity of bars and slices |
| `border-color` | each bar's own color | outline of bars and slices (`WHITE` separates slices cleanly) |
| `stroke-width` | 2 | width of axes, series lines and outlines |
| `axis-color` | the text color | axes, ticks and gridlines |
| `grid` | `true` | horizontal gridlines at the ticks |
| `legend` | `true` with several series | legend above the plot |
| `values` | `false` | value labels on bars and points (pies always show percentages) |
| `min`, `max` | from the data | fixed bounds of the value axis |
| `font-size`, `font`, `color`, `opacity` | the layout's | typography (labels use 75% of the size) and translucency |
| `sketch` and its tuning | `false` | [hand-drawn](sketch.html) bars, lines, slices and axes |

Charts are centered on `x`, `y`, take `anchor=`, the relative constraints, `step`, `hide`,
`enter`/`exit` and `tremble=`, serve as endpoints and attachment targets, and carry the style
role `chart`. Negative values extend below the baseline; the value axis always includes zero
unless `min`/`max` move it.

## From code

```ts
import { buildChart, parseChartData, buildTable } from 'zoomdown';

const data = parseChartData('Region, 2023, 2024\nNorth, 3.2, 5\nSouth, 2.1, 3.1');
const chart = await buildChart(data, { type: 'bar', width: 6, height: 3, values: true }, makeLabel);
```

`buildChart(data, options, label)` returns an engine `Group` centered at the origin; `label(text,
size, color)` must return a text mobject, for example the renderer's `text()` method, so charts
use the deck's typography. `niceStep` and `valueAxis` expose the axis arithmetic. `buildTable(rows,
options, cell)` works the same way with a cell factory that lays out inline spans within a width.
