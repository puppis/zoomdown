---
title: Fragments and steps
description: Reveal and hide elements on clicks, time the fades, advance automatically and skip events.
---

<a class="try" href="tour.html#slide=fragments">Open in the tour ↗</a>

```markdown
[Visible on entry, hidden at step 3]{#hint x=0.6 y=1.7 hide=3}

[Appears at step 1]{#one x=0.6 y=0.9 step=1 color=GREEN}

[Step 2 reveals this, then advances by itself]{#two x=0.6 y=0.1 step=2 color=YELLOW}
[[next: step=2]]

[Step 3 shows this and hides the hint]{#three x=0.6 y=-0.7 step=3}

[[show: #hint step=4]]
[[hide: #one step=4]]
[[skip_next: step=4]]

[Never shown: step 5 is skipped]{#five x=0.6 y=-1.5 step=5}

[Step 6 follows step 4 directly]{#six x=0.6 y=-2.3 step=6 color=RED}
```

## Steps

An omitted `step` (or `step=0`) makes an element part of the slide's initial content; `step=N`
fades it in at click N and `hide=M` fades it out later. `[[show: #id step=N]]` and
`[[hide: #id step=N]]` repeat changes as often as needed. Showing a visible element or hiding a
hidden one is an error, reported with its line. A fade in ends at the element's own opacity, from
`opacity=` or its style, each part of a group at its own, however often it is shown.

Numbers are local to each slide and need not be consecutive: a lone `step=4` creates one click,
not four. All changes sharing a number play together, followed by a pause; if a step also visits
children, the parent's changes play first.

Elements are drawn in source order, whichever click shows each: one written later lies over one
written earlier, so a highlight revealed at a later click stays under the text that follows it in
the source. Write it after the text to put it on top.

### Before the visit: step=-1

A child slide that is not previewed stays hidden in its parent's view until it is first visited,
when its initial content fades in. An element of the child with `step=-1` is its caption: it
fades in at a click of the parent *just before* the click that visits the child, so that the
tile announces itself while the rest of it waits for the visit. The click that would zoom in
first reveals the caption, as a stop of the parent of its own, and the next click visits. On the
visit nothing happens to it; it stays through the child's steps like any initial element,
`hide=M` removes it at click `M`, and it goes with the slide in exports and printouts. Jumping
straight into the child, from a link or the slide menu, brings the caption in with the entry
fade. The reveal is always a fade, so `enter=` is refused there. On a root slide, on a page of a
flat document and on a `preview=true` child, where everything shows from the start anyway,
`step=-1` is the same as no step.

The caption belongs to the child, not to the parent: it is laid out with the child, and a step
never changes the size of a text, so it is as large as the same text at any other step, and on the
parent as small as the tile makes the child. A `font-size` or a class sizes it, as any text.

```zoomdown {height=5}
::: slide {#early-parent width=16 height=5}

One click shows the tile's caption, the next visits the child. {x=-7 y=1.8 font-size=20}

[[include: #early-child x=0 y=-0.6 width=6 step=1]]

:::

::: slide {#early-child width=6 height=3.375}

[The child's caption, shown just before the visit]{#early-cap x=0 y=1.1 anchor=center font-size=18 color=RED step=-1}

The rest appears on the visit {x=-2.6 y=0 width=5.2 font-size=16}

:::
```

## Steps that follow the source

With `steps: sequential` under `layout:` in the front matter, an element needs a step only where a
click happens: an element without `step` takes the step of the element before it in the source,
so the lines of a paragraph, the items of a list and the shapes of a figure written after
something appear with it.

| Written | Means |
| --- | --- |
| no `step` | the step of the element before (0 at the top of the slide: shown from the start) |
| `step=+` | the click after the step of the element before |
| `step=N` | click `N`, as always; the elements after it without a step take `N` too |
| `step=0` | shown from the start, and the elements after it without a step as well |
| `hide=+` | gone at the click after the element's own step |

```markdown
---
layout:
  steps: sequential
---

::: slide {#rounds}

Round with pivot r {step=+}

- every node sends a request
- the pivot answers

[deadlock!]{.dead step=+ hide=+}

The next round starts. {step=+}

:::
```

The heading and the two items appear at click 1, the warning at click 2 and gone at click 3,
where the last line appears. Inserting a click is adding one `step=+`: the clicks after it move
on by themselves.

Captions (`step=-1`) and static decorations (`focus-only`) without a step stand apart: the element
after them counts from the one before them. A group takes a step as a whole, and its members none.
A child without `step` is visited at the click after the element before it (`step=+`), so the
children written one after the other are visited at successive clicks, and the element written
after a child counts from its visit. Directives follow the same rule: `[[show]]`, `[[hide]]`,
`[[animate]]`, `[[effect]]`, `[[transform]]`, `[[move_along]]`, `[[next]]` and `[[skip_next]]`
without `step` take the step of the element before them, and `step=+` the click after it. Without
`steps: sequential`, `+` has nothing to count from and is refused.

## Blocks step as a whole

A `::: timeline`, a `::: graph` and a `::: tiles` block are stepped as a whole, line by line,
like a group whose members may carry steps of their own; every line is treated alike, whatever
it is (a node, an edge, a message, an event, an include or a plain element):

- with sequential steps, the block's `step` is where its first line starts, unless that line has
  a step of its own, and the lines after it follow as anywhere (`step=+` the click after, none
  the same click);
- with numbered steps, the block's `step` goes to every line without a step of its own;
- the block's `hide` goes to every line without one (the verdict of a tile included: an include
  itself is never hidden).

A [`::: align`](text.html#rows-of-their-own-align) block is no such whole: its `step` and `hide` are
those of each of its rows that writes none, so `::: align {step=+}` reveals them one by one.

```markdown
::: graph {step=1 hide=2}
A (0,0)
B (2,0)
A -> B
[x]{at=(1,1)}
:::
```

A, B, the arrow and x appear at click 1 and go at click 2, whichever line is written first.

## Timing

<a class="try" href="tour.html#slide=anchors">Open in the tour ↗</a>

Each fade lasts `layout.animationTime` unless the element sets `run-time=S`; `lag=S` delays its
start inside the step, so one click can stagger several elements. A `show`/`hide` directive may
carry its own `run-time`, `lag` and `enter` or `exit`.

```markdown
[Fades in over 1.5 s]{#slow x=-3.5 y=-0.4 step=1 run-time=1.5}
[Starts 0.5 s later]{#later below:#slow left-aligned:#slow step=1 lag=0.5}
```

## Entrance and exit styles

`enter=` and `exit=` on an element (or on `show`/`hide` directives) replace the default fades:

| `enter=` | `exit=` |
| --- | --- |
| `fade` (default), `grow`, `write`, `create`, `draw` | `fade` (default), `shrink`, `uncreate` |

`write`, `create`, `draw` and `uncreate` suit vector content (formulas and shapes).

Any other name is an effect of the deck's own, `effects/<name>.ts`, played on entry or exit
([Extending a deck](extending.html#effects)).

## Automatic advancement

`[[next: step=N]]` advances to the following stop automatically once step N (and the child
visits it triggers) has finished; `step=0` marks the slide's entry. Chains of `next` play without
clicks; backward and outline jumps show the recorded states without starting playback.

## Skipping the next event

`[[skip_next: step=N]]` omits exactly one following event: a fragment step, a child visit (with
its whole subtree) or the return to the parent, even across numeric gaps. On a child's last step
it suppresses the zoom back to the parent, which is also what `skip-return` on the include
does more declaratively.

## Animated images

Images with `play=once` or `play=loop` play when they are revealed: finite ones finish before the
pause, loops become a looping stop that the next click leaves. See [Images](images.html).
