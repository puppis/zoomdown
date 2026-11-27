---
title: Code listings
description: Fenced code blocks as verbatim listings with syntax colors for common languages and for the slide dialect itself.
---

<a class="try" href="tour.html#slide=listings">Open in the tour ↗</a>

````markdown
```python {#py x=0.6 y=3.7 width=9 step=1}
def visit(slide):
    yield slide                 # pre-order
    for child in slide.children:
        yield from visit(child)
```

```json {x=0.6 y=1.3 step=2}
{ "keywords": ["procedure", "while", "return"] }
```

```pseudo {x=0.6 y=0.4 step=3}
procedure gcd(a, b)
  while b ≠ 0 do            // Euclid
    (a, b) := (b, a mod b)
  return a
```
````

A fenced block (`` ``` `` or `~~~`) is a verbatim listing. Its info string names the language,
optionally followed by the usual `{…}` attributes: `#id`, `x`/`y` (left edge and first
baseline, like prose), `width` (the block shrinks uniformly if a line is wider), `height`,
`font-size` (default `layout.codeSize`, 80 % of the text size), `color`, `anchor`, `step`/`hide`,
`focus-only`, `.class` and the relative constraints, and `math` (see [Formulas in
pseudocode](#formulas-in-pseudocode)). Lines never wrap and tabs become four spaces.
A `::: {.element …}` container around the fence works as for other blocks.

## Languages

| Names | Highlighting |
| --- | --- |
| `python`, `py` | keywords, builtins, strings (including triple quotes), comments, numbers |
| `javascript`, `typescript`, `js`, `ts`, `jsx`, `tsx`, `java`, `c`, `cpp`, `cs`, `rust`, `go`, `kotlin`, `swift`, `scala`, `dart`, `php` | C-like keywords and types, strings, line and block comments, numbers |
| `bash`, `sh`, `zsh`, `shell`, `console` | keywords and common commands, strings, comments, `$variables`, `--flags` |
| `json` | keys, strings, numbers, literals |
| `latex`, `tex` | commands, math, comments |
| `html`, `xml`, `svg` | tags, attributes, strings, comments |
| `markdown`, `md`, `slides` | this dialect: containers, directives, attributes, math, code spans, headings |
| a name in the deck's `languages/` folder | the profile `languages/<name>.json` defines, see [Extending a deck](extending.html#languages-and-code-themes) |
| anything else, or no name | plain text |

Token colors follow the slide's text color: light text on a dark background gets a dark-theme
palette, dark text on a light background a light-theme one. Listings and inline code use the
bundled Latin Modern Mono, the LaTeX typewriter face; `layout.codeFont` picks another monospace
family, from the deck's `fonts/` folder when it has it. `layout.codeTheme` names a color scheme
of the deck's own, `code-themes/<name>.json`.

## Pseudocode

No pseudocode is built in, since every course writes its own: a deck names its keywords in a
[language profile](extending.html#languages-and-code-themes), and its fences take the profile's
name. The tour colors the `pseudo` listing above with `languages/pseudo.json`:

```json
{
  "keywords": ["procedure", "function", "begin", "end", "if", "then", "else", "while", "do",
               "for", "each", "all", "in", "to", "downto", "repeat", "until", "return",
               "and", "or", "not", "mod", "div", "let", "var", "true", "false", "nil"],
  "types": ["integer", "boolean", "real", "string", "array", "list", "set", "graph", "node", "edge"],
  "lineComment": ["//"],
  "strings": ["\""]
}
```

Keywords take the keyword color and types the type color; `//` starts a comment. Add the words
of your own algorithms (`send`, `receive`, `parent`) to the lists. A fence finds the profile by
its file name, `pseudo` here. Symbols such as `≠` show as they are; one the code font lacks is
drawn in another face.

## Formulas in pseudocode

A listing is verbatim, so `$L_i$` shows as typed, unless its `$…$` are formulas: a profile with
`"math": true` typesets them in every fence of its language, and `math=true` on a fence does it
for that listing alone, in any language (`math=false` turns a profile's off again). Such a listing
also reads `~…~` and `^…^` as a subscript and a superscript of its code, as
[text](text.html#subscripts-and-superscripts) does:

````zoomdown {height=4}
::: slide {#pseudo-math width=16 height=4}

```text {x=-7 y=1.2 font-size=22 math=true}
upon receiving $\langle \mathit{wave}, m \rangle$ from $q$ do
  if $\mathit{parent}_p = \bot$ then          // first wave: $O(|E|)$ messages
    $\mathit{parent}_p \gets q$
    for each $r \in N_p \setminus \{q\}$ do send $m$ to $r$
  wait for ack~r~ from every r, at most 2^k^ rounds
  pay \$5 to $L_i$
```

:::
````

A formula is typeset as an inline formula of the listing's size, with the deck's `macros`, on the
line's baseline between the runs of code, which keep their monospace columns before it and
continue after it. It takes the color of the code it starts in: the text color, or the comment
color in a comment. `\$` is a dollar, and a `$` left open on its line is an error. The lines keep
one pitch, the font's, or a taller formula's (a fraction spreads every line of its listing).

A subscript or superscript is code set 0.7 as large, lowered or raised, in the colors of the code
it is made of: `ack~i,j~` and `2^k^`, in a comment too. As in text it holds no space but an escaped
one (`T~max\ load~`) and no formula, code or bracket, so an operator with spaces around it,
`a ^ b`, stays code, and so do `\~` and `\^`. Listings without formulas keep every `~` and `^`.

> **Tip** To show markup that itself contains fences, open the outer block with four backticks.
