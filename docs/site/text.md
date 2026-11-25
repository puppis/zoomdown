---
title: Text
description: Paragraphs, headings, emphasis, colors, code spans, line breaks, lists and links.
---

<a class="try" href="tour.html#slide=prose">Open in the tour ↗</a>

```markdown
Paragraphs wrap to `width`. Use **bold**, *italic*, ***both***, `inline code`
and inline math $e^{i\pi}+1=0$.

[Colored spans]{color=ORANGE} take palette names, [CSS colors]{style="color:#4ADE80"}
or hex values, and [nest **emphasis** and $\sqrt{2}$]{color=YELLOW}.

First line.\\
Second line after an explicit break.

- Bullet items are prose with a marker
  - Nested items indent, and wrap with a hanging indent
    1. Numbered lists nest too
- Headings set size only: `#` to `######`

### A level-3 heading {color=TEAL}

Links like [this one](https://vite.dev) are clickable.
```

## Blocks

Paragraphs, headings (`#` to `######`), bullet and numbered lists and fenced code blocks are
supported. Blank lines separate elements: each paragraph, heading, list item, image, formula and
listing is one element with its own attributes. Headings only change the typography; nesting
comes from includes.

As in LaTeX, a blank line between two texts makes a paragraph break, with a little more space
than between two lines: their baselines are `layout.paragraphSpacing` interlines apart (1.5 by
default), where the interline is the distance between two lines of one paragraph. A text and
another block (a table, an image, a shape) keep the same space between them.

## Lists

Items start with `-`, `*` or `+`, or with a number and `.` or `)`; indenting an item by two or
more spaces nests it under the previous one, to any depth. Each item is one element: its marker
sits in a column of `layout.listIndent` (0.6 units, wider when a number needs it), its prose
wraps to the rest of the width with a hanging indent, and nested items are shifted by one column
per level. Markers are `•`, `–` and `◦` by depth; numbered items show their own number with
its delimiter, so a list may start at any value. Items written line after line follow one
another as lines, one interline apart; blank lines between items are allowed and space them as
paragraphs. Attributes in braces work on an item as on any paragraph; an explicit `x` is the left
edge of the list, nested items keep their indentation to its right.

A block indented under an item after a blank line continues the item, as in Markdown: a
paragraph, a formula between `$$`, a listing, an image or a table, each an element of its own,
starts where the item's text starts, past its bullet or number:

```zoomdown {height=5}
::: slide {#item-blocks width=16 height=5}

1. Each node sends its identifier to both neighbors.

   The largest identifier survives each round:

   $$ \max(\mathit{id}_{p-1}, \mathit{id}_p, \mathit{id}_{p+1}) $$

2. The survivors start the next round.

:::
```

HTML comments are discarded and raw HTML is shown as text. Soft line breaks in the source are
joined; an explicit break takes two trailing spaces, a backslash before the newline, or `\\`.

## Indented lines

After a `\\` break, the spaces that start the next source line indent it, each by a plain space
of the font and a tab to the next multiple of four, without the `&nbsp;` that would otherwise keep
them. A long indented line wraps
within the rest of the width and its lines keep the indent:

```zoomdown {height=4}
::: slide {#indented width=16 height=4}

Upon receiving a message *m* from a neighbour: \\
    if *m* is new: \\
        store *m* and forward it to every other neighbour, which then does the same \\
    otherwise ignore it
{x=-7 y=1.2 width=9 font_size=22}

:::
```

Spaces after a line end without `\\` collapse into one, as Markdown has it. In a block with
`&&` columns they only align the source; in a list item they count from the column of the item's
text, so a continuation aligned under it is not indented. An indent leaves a quarter of the width
at least.

Spaces that keep their width indent the start of any line, a paragraph's or a list item's
first one too: `&nbsp;`, `&ensp;` and `&emsp;`, or the characters themselves (a no-break, en or
em space), and a formula of space alone. A phantom is as wide as what it hides, so
`$\phantom{\Rightarrow}$ or` under `$\Rightarrow$ either` starts *or* under *either*; other space,
such as `$\quad$` or `$\hspace{2em}$`, is as wide as it is typeset. So is the space a formula
starts or ends with, as in `$\qquad\Downarrow$` or `$x \quad$ for`, and the space TeX puts next
to an empty group there: `$m \in {}$ channel` keeps the thick space after the relation, and
`${}= b$` the one before it. A plain space after such a
start counts, as between words, and the lines a line that starts with space wraps to start under
its first word, as after a `\\` indent. Plain spaces after a list marker still only separate it
from the text. A list of pseudocode keeps its indentation:

```zoomdown {height=4}
::: slide {#pseudocode width=16 height=4}

::: {.group x=-7 y=1.7 anchor=top-left width=14 font_size=22}
1. **if** ($a < b$) {
2. &emsp;&emsp;forward $M$ to $L_i$
3. } **else** {
4. $\phantom{MM}$find $p$ and forward $M$ to $p$
5. }
:::

:::
```

## Columns

Pieces of text align across lines with `&&` between them, as in a table without rules or in a
LaTeX `align`: in a block of two lines or more that contains `&&`, every line of the source is a
row and `&&` ends a
cell, each column is as wide as its widest cell, and a cell starts where the columns before it
end, plus a gap of one em. A text of one line has nothing to align: there `&&` is two ampersands,
as in `[while (a && b)]` or a label `p@1 "e && f"`. Spaces around `&&` are free, so the source
itself can be aligned:

```zoomdown {height=4}
::: slide {#columns width=16 height=4}

This is a         && test             && (be careful) \\
                  && the second column && and then the third
                  &&                   && the third again
**Name**          && *Value*           && $x^2$
{x=-7 y=1 font_size=22}

:::
```

A row with fewer cells leaves the rest empty, and an empty cell (a line that starts with `&&`,
or two `&&` in a row) skips a column. A row without `&&` is one cell of the first column and
counts toward its width, as in LaTeX, so a long line of prose in such a block pushes the other
columns to its right; keep such lines in a block of their own. Cells do not
wrap: a block wider than its width shrinks as a whole, as a single overlong word does, so give a
wide one a `width`. Styles, formulas, code and links work inside cells. A literal double
ampersand is written `\&&`; a single `&` is ordinary text everywhere. `\\` still breaks a row,
which lets two rows share a source line.

### Rows of their own: `::: align`

The columns above are those of one block, which is one element: it has one `step`, one color, one
place. A `::: align` block lines up the columns of several: all the texts with `&&` in it, its
**rows**, share their columns, and each remains an element of the slide like any other, with
attributes of its own.

```zoomdown {height=5}
::: slide {#aligned-rows width=16 height=5 flow_top=0.6}

::: align
**message complexity** && = && number of messages {step=1}
**time complexity**    && = && length of a maximal chain of events \\
                       &&   && (local events may not count) {step=2}
**space complexity**   && = && memory used *per node* {step=3 color=TEAL}
:::

The flow goes on below. {step=4}

:::
```

- In it a text of one line has columns too. A line that ends with `{attributes}` ends its row, so
  the next line is the next row, one line below; a blank line between two rows separates them as
  paragraphs, or a `buff` of their own. Lines without attributes after them, up to a blank line,
  make one row of several lines, as in any block.
- A column is as wide as its widest cell in any row, whatever their sizes; `gap=` sets the space
  between the columns (an em by default), and rows shrink together when the widest does not fit. A
  text without `&&`, a formula, a picture, a list between two rows is laid out as anywhere, and does
  not change the columns.
- What the block writes is its rows' unless they write it: `::: align {step=+}` reveals them one by
  one (with [sequential steps](fragments.html#sequential-steps)), `color`, `font_size`, `font`,
  `width`, `opacity`, `enter` and the other attributes of text go to each, `buff` to each after the
  first, and a position (`x`, `y`, `at`, `below:#id`, …) to the first, under which the others flow;
  an `x` alone is every row's. Classes fill in the same attributes.
- A slide may hold several, each with columns of its own, and so may a [group](groups.html).

## Inline styling

Bold, italic, nested emphasis, code spans and inline math (`$…$`) can be combined freely. A
paragraph with inline math stays one element: prose and formulas share one baseline, and the
paragraph wraps to its width as a whole.

Colors are written as `[text]{color=…}` or `[text]{style="color:…"}` (not both). A color is a
palette name (`BLUE`, `RED`, `TEAL`, `ORANGE`, `YELLOW`, `GOLD`, `GRAY`, `GREEN`, `PURPLE`, each with
`_A` to `_E` variants, listed in [the manual](manual-markup.html#color-names)), a CSS name, a hex value or `rgb(…)`. Nested emphasis and math inherit the span's
color. A color-only span stays inline; any other attribute makes the bracketed text a positioned
element of its own, which then must be a whole block.

`~~text~~` strikes text through, and `[text]{underline=true}` underlines it without making it a
link; an inline span takes `color` and `underline` together. HTML entities keep spaces Markdown
would collapse: `&nbsp;` (never breaking the line), `&ensp;`, `&emsp;` and `&thinsp;`, as in
`WWW,&nbsp;&nbsp;Wikipedia`.

## Subscripts and superscripts

Text takes a subscript between single tildes and a superscript between carets, as in Pandoc:

```zoomdown {height=2}
::: slide {#scripts width=16 height=2}

H~2~O and CO~2~, the 1^st^ and 2^nd^ round, T~max\ load~, **x^2^** and *y~i~* {x=-7 y=0 font_size=28}

:::
```

A script is 0.7 as large as its text and lowered 0.15 em or raised 0.363 em, as LaTeX's
`\textsubscript` and `\textsuperscript` set it, and it keeps the style around it, bold, italic
or a color. It holds no space: a space written `\ ` is a no-break one, so `T~max\ load~` is one
subscript. A tilde or a caret with a space, a bracket, a formula or code before the next one stays
as it is, so `~5 ms`, `2^n and 3^m` and a link such as `[example.org/~me](https://example.org/~me)`
read as before, and `\~` or `\^` is always a literal one. Two tildes still strike text through.
Emphasis works inside a script, `y~*i*~`; a formula does not, so a variable with a subscript is
written as a formula, `$L_i$`, and a word with one either way: `send~i~` sets the index upright in
the text font, `$\mathit{send}_i$` in the formula's italic. A listing whose formulas are typeset reads
`~…~` and `^…^` too ([Formulas in pseudocode](code.html#formulas-in-pseudocode)).

## Links

`[label](https://…)` renders an underlined label that opens the page in a new tab; `mailto:` and
relative URLs work too. Links are clickable while their slide is the one on screen, not in a
parent's preview of it.

Any element can be a link as a whole: `href=` on a paragraph, heading, image, formula, shape,
icon, arrow, brace, box, blob, table, chart or group opens its URL in a new tab when the element
is clicked. The element's look does not change. Targets inside the deck, `#slide=id` and
`#step=N`, move to that stop instead, on a click or a double-click. While the pen is on, links
are inert, so a drag over a tile still draws, and the dot a tap would leave is taken back.

```markdown
[[icon: document #paper x=0 y=0 size=1.2 label="the paper" href=https://arxiv.org/abs/1234.56789]]

::: {.group #team x=4 y=0 href=https://example.org/team}
Our team
:::
```

## Typography defaults

By default prose is set in **Latin Modern Roman** and code spans in **Latin Modern Mono**, the
OpenType versions of the Computer Modern family LaTeX uses, both bundled with the player; formulas
use MathJax's TeX fonts, and a `font_size` means the same em for all three, so a paragraph with
code and formulas inside it looks like one LaTeX paragraph without any tuning. A character those
fonts lack, such as `$☞$`, is drawn in the prose face, where TeX would set it, a script's smaller. `layout.font` and
`layout.codeFont` replace the faces (`"Georgia"`, `"Fira Code"`, …) while keeping the size
calibration.

Body text uses `layout.fontSize` (28 by default) and headings `layout.headingSize` (42),
shrinking slightly per level. Any element can override its size with
`font_size=` and its color with `color=`, or through a [style](styles.html). A paragraph, heading,
arrow label or brace label can also pick its own face with `font=`: any font the page has, or the
bundled handwriting face **Zeyada**, which pairs with [hand-drawn shapes](sketch.html)
(`[A note]{font=Zeyada font_size=36}`).

Lines of a paragraph are as far apart as the font reaches above and below its baseline, plus
`layout.lineGap`. `layout.lineHeight` sets that distance in ems instead, as CSS's `line-height`,
and `line_height=` sets it for one text: a face with a tall natural interline, such as EB
Garamond's, can so be set as tightly as a design asks (`layout: lineHeight: 1.15`). Paragraphs
stay `layout.paragraphSpacing` interlines apart.
