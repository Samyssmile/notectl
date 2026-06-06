# Complex-document bug hunt — findings

A comprehensive document exercising every non-video plugin is built purely
through user interactions (`e2e/fixtures/complex-document.ts`), then its model is
checked against a hand-authored expected model (`complex-document-expected.ts`).
Tests live in `e2e/complex-document.spec.ts`.

Each finding below reproduces from a **minimal gesture on a fresh editor**.
Finding 1 has since been **fixed (#152)**: its demos are now plain (passing)
tests. The still-open findings (2, 3, and the finding-1 residual) stay as skipped
`test.fixme` cases asserting the *ideal* behaviour — remove `.fixme` to watch each
fail against current behaviour. The suite itself stays green.

## Finding 1 — Inserting a block object on an empty line leaves a blank line above it — **FIXED (#152)**

Matches the requested finding "Es gibt zu viele Leerzeilen" (too many empty lines).

**Was:** inserting a **table, horizontal rule, image, or display formula** while
the cursor sat in an empty paragraph did **not** consume that paragraph — the
object was inserted *after* it, leaving a stray empty paragraph (blank line) above.

**Fix:** all four insert paths now route through the shared
`insertBlockObjectOnOwnLine` primitive (`packages/core/src/commands/BlockInsertion.ts`),
which consumes the anchor when it is a blank-line paragraph. The emptiness test is
inline-aware, so a paragraph holding only an inline node (e.g. an inline formula)
is never consumed. Proven by `packages/core/src/plugins/InsertBlockObjectOnEmptyLine.test.ts`.

Minimal repro (fresh editor = one empty paragraph), now matching "Expected":

| Action | Was | Now (Expected) |
|---|---|---|
| Insert table | `["paragraph","table","paragraph"]` | `["table","paragraph"]` |
| Insert horizontal rule | `["paragraph","horizontal_rule","paragraph"]` | `["horizontal_rule","paragraph"]` |
| Insert image | `["paragraph","image","paragraph"]` | `["image","paragraph"]` |
| Insert display formula | `["paragraph","math_display","paragraph"]` | `["math_display","paragraph"]` |

The four `inserting a … on an empty line …` tests are now un-`fixme`'d and green,
and the full-document model in `complex-document-expected.ts` no longer carries
the stray paragraphs.

**Residual (separate from #152, still open):** inserting a display formula and
then an image *back-to-back* still ends the document with **two** trailing empty
paragraphs. This is a different mechanism: the display-formula insert leaves a
node selection on the formula plus its own trailing paragraph, so the subsequent
image anchors on that node and inserts between the formula and its trailing line,
stacking a second trailing paragraph. It is not the stray-above bug and is left
as a follow-up (encoded as `test.fixme` "display-formula→image should leave
exactly one trailing paragraph"). The image alone, in isolation, correctly leaves
exactly one trailing — `["image","paragraph"]`.

## Finding 2 — A formula loses its editable LaTeX after a clipboard roundtrip — **FIXED (#154)**

Matches the requested category "formulas/inserts not handled correctly".

**Was:** copying a selection that contained **both an inline and a display
formula** and pasting it back dropped both formulas' LaTeX source (`latex` became
`""`, the `<semantics>/<annotation>` wrapper was stripped, a `data-block-id` leaked
into the stored MathML, and the LaTeX surfaced as raw text inside `<math>`), so the
formulas rendered but were no longer editable. A single inline formula, a single
display formula, or several inline formulas all roundtripped fine, only the
**inline + display mix** broke.

**Root cause:** the paste pre-sanitization pass in `PasteHTMLHandler.handleHTML`
relied on DOMPurify's default allowlist, which does not include MathML
`<semantics>`/`<annotation>` (those are registered by the formula plugin's schema).
They were stripped in that first pass before the registry-aware passes ran. Single
formulas survived because the standalone-math paste interceptor handled them on the
raw HTML with the correct allowlist.

**Fix:** the pre-sanitize pass now extends DOMPurify's defaults with the registry's
allowed tags/attrs (`ADD_TAGS`/`ADD_ATTR`), so plugin markup survives the
active-content scrub. The formula node specs additionally strip `data-block-id` from
the stored canonical `<math>` (`stripBlockIds`) so editor-internal block ids never
pollute persisted MathML. Proven by `inline + display formulas keep their LaTeX
source through a clipboard roundtrip (#154)`; the full cut/paste model test now
asserts `mathml`/`latex` survive (only the math-only default `fontSize` is dropped).

## Finding 3 — Typing after a link (or any mark) extends it onto new text — FIXED (#153)

Matches the requested finding "Links werden nicht richtig angezeigt".

notectl had no mark-inclusivity concept (`MarkSpec` had no `inclusive` flag);
`getBlockMarksAtOffset` re-derived the preceding span's marks at a right boundary.
So typing immediately after a linked span continued the link onto the new text.
Every mainstream editor treats links as *non-inclusive* precisely to avoid this.

Minimal repro: type `a`, select it, apply a link, press End, type `b` →
the model was a single linked text node `"ab"` (both characters linked).

**Fixed (#153):** `MarkSpec` now has an `inclusive` flag (default `true`), and
the link spec sets `inclusive: false`. A new pure model helper `getCursorMarks`
drops non-inclusive marks sitting at their right boundary, and every
collapsed-cursor mark derivation (typing, toggle, attributed marks, toolbar
active state) routes through the centralized `resolveCursorMarks`. The fix is
generic, not link-specific; inclusive marks and mid-span behaviour are unchanged.
Test: `typing immediately after a link should not extend the link` (now passing).

## Minor observations (not headlined)

- `horizontal_rule` nodes carry an empty text child `[{text:""}]`, whereas
  `image` and `math_display` use `[]`. Cosmetic model inconsistency.
- Redo on a large document does not perfectly restore block `dir` attributes
  (e.g. the blockquote's inner paragraph loses its `dir`). The minimal
  two-paragraph case restores correctly after a settle, so this is entangled
  with the reactive `text-direction-auto` plugin rather than a clean undo/redo
  defect. The undo/redo test verifies all other content/structure/marks restore
  exactly.

## Verified working (no bug)

- The full 31-block model matches the expected model field-for-field: headings,
  all inline marks (bold, italic, underline, strikethrough, inline code,
  super/subscript, text color, highlight, font, font size, link, inline bidi
  isolation), inline + display formula, code block, blockquote, bullet/ordered/
  checklist lists (incl. a checked item via the `[x]` input rule), 2×2 table,
  center alignment, RTL block direction, hard break, and image embedding.
- Undo reverts the whole document to empty; redo restores content/structure/marks
  exactly.
- Select-all → copy → paste duplicates the document body.
- Select-all → cut → paste preserves the full model (except the formula loss).

## Plugin coverage

All full-preset plugins except **video** are exercised. Headless plugins:
HardBreak (via Shift+Enter → `hard_break` node), SmartPaste (exercised by the
paste tests), TextDirectionAuto (produces the `dir` attributes). **Print** is a
toolbar action that opens the browser print dialog and produces no model output,
so it is not asserted.
