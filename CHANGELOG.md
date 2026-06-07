# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- **Unit test suite cleanup.** Removed 9 redundant unit tests, each a byte-identical or strict-subset duplicate of a surviving test in the same file (`DocumentSerializer`, `CaretNavigation`, `Platform`, `CodeBlockPlugin`, `MathAlphabet`, `XmlDetector`, `FontSizePlugin`, `FontPlugin`, `TextDirectionPlugin`). No behaviour coverage was lost and the suite stays green.
- **E2E test suite cleanup.** Removed the redundant `print-font` e2e spec (3 tests). Its assertions only checked CSS property-name presence in the print HTML string and exercised no real-browser behaviour, so the same coverage already exists, more thoroughly, in the `PrintServiceImpl`, `FullPreset`, and `PrintPlugin` unit tests.

## [2.2.1] - 2026-06-07

### Fixed

- **Copying an inline and a display formula together no longer loses their LaTeX source (#154)** — When a copied or cut selection contained both an inline formula and a display formula, pasting it back dropped the LaTeX source of both: the `latex` attribute became empty, the `<semantics>`/`<annotation>` wrapper was stripped, the LaTeX surfaced as raw text inside `<math>`, and an editor-internal `data-block-id` leaked into the stored MathML, so the formulas still rendered but could no longer be edited. A single inline formula, a single display formula, or several inline formulas all round-tripped fine; only the mixed inline-plus-display selection broke. The cause was the paste pre-sanitization pass in `PasteHTMLHandler`, which scrubbed active content using DOMPurify's default allowlist. That default list does not include the MathML `<semantics>`/`<annotation>` tags registered by the formula plugin's schema, so they were stripped in that first pass before the registry-aware passes ran. Single formulas survived only because the standalone-math paste interceptor handled them on the raw HTML with the correct allowlist. The pre-sanitize pass now extends DOMPurify's defaults with the schema registry's allowed tags and attributes (`ADD_TAGS` / `ADD_ATTR`), so plugin markup survives the active-content scrub while legacy normalization still sees deprecated tags. The formula node specs additionally strip `data-block-id` from the canonical `<math>` they store, so block identity (still adopted from the live element) never pollutes persisted MathML or suppresses re-injection of the current id on the next copy. Covered by a new unit test for the `stripBlockIds` helper and an e2e clipboard round-trip regression test.

- **Typing immediately after a link no longer extends the link onto the new text (#153)** — Inline marks were inclusive at their right edge: placing the caret at the end of a linked span and typing absorbed the new characters into the link (`a` linked, type `b`, and the whole `ab` became one linked node). The editor had no mark-inclusivity concept, so at a collapsed caret on a span's right boundary it re-derived the preceding span's marks and carried them onto the inserted text. `MarkSpec` now has an `inclusive` flag (default `true`, so bold, italic, and other marks still extend as you type), and the link mark sets `inclusive: false`. A new pure model helper `getCursorMarks` keeps a non-inclusive mark only when it also covers the content to the right of the caret, so it never bleeds past its boundary, and every collapsed-caret mark derivation (text insertion, mark toggles, attributed marks, and toolbar active state) now routes through a single `resolveCursorMarks` helper rather than reading raw content marks. The fix is generic, not link-specific; range selections, inclusive marks, and mid-span behaviour are unchanged. `Schema` exposes `getMarkSpec` so the inclusivity flag is the single source of truth. Covered by new unit tests and the e2e regression suite.

- **Inserting a block object on an empty line no longer leaves a stray empty paragraph above it (#152)** — Inserting a table, horizontal rule, image, or display formula while the cursor sat in an empty paragraph did not consume that paragraph: the object was inserted after it, leaving a blank line above (`[paragraph, table, paragraph]` instead of `[table, paragraph]`), and the blank lines accumulated in longer documents. The four insert commands each hand-rolled their own placement logic; they now route through a single shared `insertBlockObjectOnOwnLine` primitive (`commands/BlockInsertion.ts`) that resolves the top-level ancestor of the selection, inserts the object followed by a trailing paragraph, and consumes the anchor when it is a blank-line paragraph. The emptiness test is inline-aware (it counts inline atoms as width 1), so a paragraph holding only an inline node such as an inline formula is never deleted; it is deliberately stricter than the paste pipeline's helper (paragraph-only, not any empty non-void block). A side effect of routing through top-level-ancestor resolution: inserting a horizontal rule or image with the cursor inside a container (e.g. a blockquote) now escapes to the document root, consistent with table and display-formula insertion, instead of failing. Covered by new unit tests (including a content-loss guard for the inline-node case) and the e2e regression suite.

## [2.2.0] - 2026-06-04

### Added

- **First-class Angular 22 Signal Forms support on `<ntl-editor>` (`FormValueControl`)** — `NotectlEditorComponent` now exposes a Signal Forms `value` model (`Document`), so an editor binds to a Signal Form as a first-class custom control via `[formField]="form(signal<Document>(doc))"`, alongside the existing classic Reactive Forms / `ngModel` integration through `ControlValueAccessor` (Angular 22 keeps CVA fully supported, so both forms systems work). `value` and the existing `content` two-way binding are independent views onto editor state, each driven from editor state changes and each writing to the editor when set externally, never to each other, so there is no echo loop. The component also implements the optional `FormUiControl` surface that is meaningful for an editor: a `disabled` input folds into the editor's read-only state, and a `touch` output marks the bound field touched on blur. The control is structural: no `implements FormValueControl` clause is shipped, so the published type surface references only `@angular/core` and the package still builds for Angular 21 consumers, who simply do not use `[formField]`. Conformance is proven by the Angular example app binding a Signal Form under `strictTemplates`, and a Playwright e2e verifies the bidirectional round-trip (editor edits update the field, and `form` model changes render in the editor) against the AOT build.

- **Video embed plugin (#142)** — A dependency-free, accessibility-first, privacy-first video plugin. Embeds for YouTube (incl. `youtu.be`, `/shorts/`, `/live/`, nocookie), Vimeo (incl. unlisted `?h=` hashes), and Dailymotion are produced entirely by client-side URL parsing, with no oEmbed call, no provider SDK, and no third-party request before the viewer opts in (the single runtime dependency, `dompurify`, is unchanged). The `video` node is a void, selectable block that stores structured attributes (`provider`, `videoId`, `hash`, `aspectRatio`, `widthPercent`, `align`, `title`, `caption`, `privacy`), never a raw `<iframe>` string; the live iframe is built only at view time behind a privacy-first click-to-load facade, so until the viewer presses Play there is zero contact with the provider (the GDPR / Schrems II safe default). On activation the iframe uses the privacy-enhanced host and params (`youtube-nocookie.com`, Vimeo `dnt=1`), `referrerpolicy="no-referrer"`, and `loading="lazy"`, and never autoplays under `prefers-reduced-motion`. Accessibility is the headline: the embed lives in a labelled `<figure>`, the iframe always carries a required, descriptive `title` (the insert form blocks submission until one is given, satisfying WCAG SC 4.1.2), the facade is a real keyboard-operable `<button>`, activation moves focus into the player with an always-reachable exit control, and selection, resize, and player transitions are announced via the live region. Insertion is via a toolbar button and an accessible insert/edit form (URL, title, optional caption, aspect ratio), plus ask-first paste-to-embed: a pasted video URL is kept as text and offers an announced "Embed this video?" affordance rather than silently rewriting content under the caret. Videos are insertable into table cells, resize responsively (ratio-locked, width-percentage, pointer handles plus `Ctrl+Shift+Arrow` shortcuts), and align left/center/right, all as invertible transactions so undo/redo work. HTML export is a progressive-enhancement `<figure data-video-*>` with a labelled watch link that upgrades to the facade in a notectl renderer and degrades to a privacy-preserving link elsewhere; a global DOMPurify host-allowlist hook validates any `<iframe>` on import (exact `https:` hostname match, rejecting `srcdoc`, non-https, and look-alike hosts) across all sanitize sinks. Ships with 9 locales (English plus eight translations, with browser-language resolution) and an extensible provider registry (adding a provider is one config object).

- **Optional clean HTML export via `getContentHTML({ includeBlockIds: false })` (#147)** — `getContentHTML` gains an `includeBlockIds` option (default `true`, so existing behaviour is unchanged) that omits the editor-internal `data-block-id` attribute from the output. By default every block element carries `data-block-id` as notectl's wire format, which lets `setContentHTML(getContentHTML())` preserve block identity so the caret survives content round-trips driven by external sync (Angular signal forms, RxJS pipes). Consumers that treat the output as a final artifact (database storage, server-side tag/attribute validation, handoff to another system) can now pass `includeBlockIds: false` for clean HTML, accepting that round-trips of the cleaned HTML generate fresh ids and no longer preserve the caret. The option works in both `cssMode: 'inline'` and `cssMode: 'classes'`. The strip is enforced with DOMPurify `FORBID_ATTR: ['data-block-id']` rather than allowlist removal, because `data-block-id` is a `data-*` attribute that DOMPurify permits by default via `ALLOW_DATA_ATTR` regardless of `ALLOWED_ATTR`; the serializer skips its central injection and `FORBID_ATTR` guarantees removal even when a third-party `NodeSpec.toHTML` emits its own id. `ContentHTMLOptions` now extends a new low-level `SerializeOptions` type, and the `getContentHTML` overloads were updated so the option is available in both return-type modes. Documented in the API reference, the content guide, and ARCHITECTURE 9.2, with an `includeBlockIds` toggle added to the vanillajs playground's HTML / CSS+HTML inspector tabs.

- **Formula / math plugin (#143)** — Inline (`$…$`) and display (`$$…$$`) math rendered with native browser MathML, so no math-rendering library is bundled (the single runtime dependency, `dompurify`, is unchanged). Authoring funnels two input methods into one canonical format: a LaTeX field with a live MathML preview (a zero-dependency LaTeX→MathML converter covering ~200 commands including matrices, accents, big operators with limit placement, and the Unicode math alphabets) and an accessible structural palette (an ARIA toolbar with roving tabindex). Each formula is stored as MathML with its LaTeX source embedded as a TeX annotation, so re-editing is lossless. Formulas are inserted via the `$…$` / `$$…$$` input rules, a toolbar button, or `Ctrl+Shift+E` / `Ctrl+Shift+M`, and existing formulas are editable by click, double-click, or keyboard through a floating overlay (mounted in the shadow DOM) that commits as a single transaction, so undo/redo come for free. Paste import recognizes MathML from KaTeX, MathJax, and Word, dropping the `aria-hidden` visual layer. A per-node font-size control resizes whole formulas, and the toolbar Font Size also applies across a range / `Ctrl+A` selection. An opt-in bundled OpenType MATH font (a subset of Noto Sans Math, SIL OFL) exposed via the `./fonts` subpath fixes Chromium stretchy rendering. The `latex/`, `mathml/`, and `math-field/` layers are framework-agnostic (zero notectl imports, independently publishable), and the plugin is accessibility-first throughout: labelled fields, a focus-trapped dialog, screen-reader announcements (including a selection hint on display formulas), and 9 bundled locales.

- **Blockquote is now a container block (#136)** — Blockquote becomes a B2 container that wraps other blocks instead of being a flat text block, fixing two related bugs: a multi-block selection now wraps every selected block into a single quote, and quoting a list keeps the list structure intact. The `NodeSpec` content allows block children (`paragraph`, `heading`, `list_item`, `blockquote`, `horizontal_rule`, `code_block`) and is non-isolating, so the caret flows across the container edges natively. New `commands/ContainerCommands.ts` wraps or lifts the selected top-level block range while preserving block identity: `toggleBlockquote` wraps, or lifts when already quoted; `setBlockquote` wraps. `isActive` is ancestor-based via the new `hasAncestorOfType` / `findAncestorOfType` helpers in `NodeResolver`. The `"> "` input rule wraps the current paragraph into a quote. Container keyboard navigation: `Enter` exits an empty last child, `Backspace` lifts the first child, both dissolving an emptied quote; arrow crossing is native. `DocumentParser` parses `<blockquote>` recursively and preserves `dir` / `align`, and paste routes `<blockquote>` through the container-aware parser so nested content no longer flattens. Undo relies on step composition (no dedicated `WrapStep` needed), verified by linear and intervening-rebase stress tests. The blockquote plugin docs page was rewritten for the container model with a regenerated screenshot.

### Changed

- **`@notectl/angular` is built against Angular 22** — The Angular integration package now compiles with Angular `22.0.0`, `ng-packagr` `22.0.0`, and TypeScript `6.0` (the toolchain floor Angular 22 requires, scoped to `packages/angular` and the Angular example via pnpm so `@notectl/core` keeps building under TypeScript 5.9). The package already used idiomatic signal-based authoring (`input()`, `model()`, `output()`, `viewChild.required`, `afterNextRender`, `effect`, `computed`, `inject`, `DestroyRef`, `makeEnvironmentProviders`), so Angular 22's new defaults forced no migration: `ChangeDetectionStrategy.OnPush` stays explicit (now also the framework default), and the component-scoped `NotectlEditorService` deliberately stays `@Injectable()` rather than the new `@Service()` decorator, which would impose `providedIn: 'root'` and change its single-editor scoping. The `peerDependencies` floor is intentionally kept at `@angular/core`/`@angular/forms` `>=21.0.0`: the emitted partial-Ivy declarations carry a feature-driven `minVersion` of `17.2.0` (signal inputs), and every imported `@angular/core` symbol has existed since 17.x, so the v22-built artifact stays consumable by Angular 21 apps. The `examples/angular` app is upgraded to Angular 22 and verified to build end to end against the package.

- **Clean Code remediation across `plugins/`, `state/`, `serialization/`, and `view/`** — A large behaviour-preserving refactor pass with no public API removed. `CodeBlockPlugin` (793 lines) was decomposed into a ~205-line orchestrator plus single-responsibility collaborators (`TokenCache`, `AutoPairController`, `CodeBlockDecorations`, `CodeBlockSchema`, `CodeBlockHighlighting`), turning `decorations()` into a pure projection. Cross-plugin duplication was lifted into shared helpers: `registerSimpleMark`, `createInlineStyleMarkSpec` (single-CSS-property marks), `patchNodeSpecAttr`, `dispatchIfPresent`, an `isInlineNodeEl` predicate, and a dependency-object registrar. Commands gained `resolvePasteTarget` / `resolveSiblingContext` and a `SelectionDeletion` module for cross-root range deletion; serialization deduplicated its mark serializers and hardened attribute injection; and the inline-content accessors (`getBlockLength`, `getBlockMarksAtOffset`, `blockOffsetToTextOffset`, `walkBlockRange`) now reuse a single `walkInlineContent` generator instead of repeating offset arithmetic.

### Fixed

- **Popups and overlays escape host-page stacking contexts via the top layer (#148)** — Toolbar popups (formula, dropdowns, grid / color pickers, link) and the formula edit overlay are mounted in the editor's shadow DOM with a high `z-index`, but `z-index` cannot lift an element above a sibling once an ancestor forms a stacking context. Embedded in Starlight's docs layout (a `.main-pane` with `isolation: isolate`), the popups were trapped below the fixed table-of-contents sidebar, which painted over their right region and stole the clicks meant to dismiss them. A new `promoteToTopLayer` helper in `plugins/shared/PopupPositioning.ts` promotes the element to the browser's top layer via the Popover API (`popover="manual"` followed by `showPopover()`), so it paints above and receives pointer events ahead of every host-page stacking context regardless of `z-index`. The element keeps living in the shadow DOM so its registered styles still apply; only its paint layer changes. It is promoted before measurement so `offsetWidth` and containing-block reads reflect the displayed box, the UA popover box styles (`inset`, `margin`) are neutralized so the existing positioning logic still controls placement, and the helper no-ops where the Popover API is unavailable (older engines, happy-dom), falling back to plain stacking. Wired into both `PopupManager.show()` and `FormulaOverlay`, covered by a new e2e test.

- **Inline nodes survive external HTML paste (#143)** — The paste pipeline's `HTMLParser` emitted a text-only `ContentSlice`, so a formula (or any inline node) embedded amid text in pasted HTML was flattened to its token text and lost, unless the whole clipboard was a single standalone formula claimed by a paste interceptor. `SliceBlock.segments` now carries `ContentSegment` (text _or_ inline node), the paste parser honours inline `parseHTML` rules the same way `DocumentParser` already did on document load, and `PasteCommand` inserts mixed content by interleaving `insertText` and `insertInlineNode` steps (so undo still composes with no new step type). The internal rich-clipboard reconstruction was lifted into a shared `segmentsToInlineChildren` model helper used by both the paste and selection-copy paths. Text, mark, and `<br>` paste behaviour is unchanged, verified by the full parser/paste suites plus new unit and e2e regression tests.

- **HTML whitespace normalization on import and paste (#137)** — Both HTML parsers previously took text-node content verbatim, treating insignificant HTML whitespace (newlines, tabs, indentation) as significant. Firefox hard-wraps clipboard `text/html` at roughly 72 columns, inserting newlines inside paragraph text that the paste parser then split into extra paragraphs; the same defect left stray newlines and indentation in list items and in `setContentHTML` content. A shared DOM pass (`serialization/HTMLWhitespace.ts`) now implements the CSS `white-space: normal` model: it collapses runs of ASCII whitespace to a single space across inline boundaries, trims at block edges, and exempts `pre` / `textarea` / `white-space: pre*` subtrees so code blocks keep their indentation. It mutates only `Text.data`, leaving marks, block ids, and attributes intact, and is wired into both `HTMLParser.parse()` (paste) and `parseHTMLToDocument()` (`setContentHTML`). Non-breaking spaces are preserved and `<br>` handling is intentionally unchanged.

- **Blockquote wrapping respects `content.allow`** — `wrapSelectionInContainer` previously stuffed every block in the top-level range into the container, but `applyInsertNode` performs no schema validation, so a block not in the container's `content.allow` (for example a table inside a blockquote) was nested into a schema-invalid document on the canonical "select all then Blockquote" path. An optional `isAllowedChild` predicate now breaks the range into maximal runs of wrappable blocks, each wrapped in its own container (`wrapIn`-style), while disallowed blocks stay at the top level; the operation returns `null` when no block in the range is wrappable. `BlockquotePlugin` derives the predicate from the registered `NodeSpec` `content.allow` as a single source of truth, matching both concrete child types and group names.

- **Inline tree-reuse and mid-cluster grapheme bugs** — `mapBlockInChildren` now preserves reference identity for unrelated subtrees (tracking a changed flag) instead of reallocating the entire block tree on every edit, and `nextGraphemeSize` returns the units remaining to the covering cluster's boundary when an offset lands mid-cluster instead of the next cluster's full size. Adds reference-identity and mid-cluster regression tests.

- **Image resize handles are exposed as decorative to assistive tech** — the pointer-only resize grips previously carried `role="separator"` + `aria-label` while being non-focusable, which misrepresents them to screen readers. Keyboard resize is already provided via shortcuts with live-region announcements, so the handles are now `aria-hidden` decorative affordances.

### Security

- **Hardened MathML paste sanitization (formula plugin)** — Untrusted clipboard HTML is parsed into an inert `<template>` (no resource loads, no `onerror`/`onload` firing), matching the core parse path, so a smuggled `<img onerror>` cannot execute before sanitization. `annotation-xml` was dropped from the sanitize allowlist: its `encoding="text/html"` form is an HTML integration point and the classic MathML mutation-XSS surface when a stored string is re-parsed via `innerHTML`, and the converter never emits it. The recursive-descent LaTeX parser gained a depth cap that recovers gracefully instead of overflowing the stack, and now recovers from a stray `}` inside a `\begin…\end` environment instead of hanging. Covered by unit tests plus an e2e test proving a payload smuggled inside pasted `<math>` is neutralized.

## [2.1.3] - 2026-05-18

### Added

- **Toolbar group wrapper exposed as `part="toolbar-group"` with opt-in accessible labels (#125)** — Each visual cluster of toolbar buttons is now wrapped in a real `<div part="toolbar-group" class="notectl-toolbar-group">` flex container in both render paths (`renderItemsByLayout` and `renderItemsByGroup`). Consumers can style groups via `::part(toolbar-group)` directly with `padding` / `background` / `border` — no `display: contents` workaround required, since the wrapper participates in layout (`display: flex; align-items: center; gap: 2px`). `ToolbarLayoutConfig.groups` and the editor-level `ToolbarConfig.groups` now accept a backwards-compatible union per entry: either a `ReadonlyArray<Plugin>` / `ReadonlyArray<string>` (existing tuple form, unchanged) or an object `{ plugins, label? }`. When `label` is set, the wrapper additionally receives `role="group"` and `aria-label="<label>"` so assistive technology announces the cluster by name; without a label the wrapper stays role-less, matching the W3C ARIA APG toolbar example for unlabeled sub-groups. Separators continue to be rendered between groups, never inside, and empty / fully-hidden groups produce no wrapper at all. Stale wrappers are removed on every re-render, so runtime `configurePlugin` toggles cannot accumulate orphan DOM. New `ToolbarGroupConfig` type exported from `@notectl/core` (`packages/core/src/plugins/toolbar/index.ts`) for downstream typing.

- **Structured theming contract: component-scoped tokens + CSS Shadow Parts (#122, resolves #120)** — `<notectl-editor>` now exposes a three-tier theming cascade across every component instead of the previous mix of one global token plus an ad-hoc per-component opt-in. Every CSS rule that previously read `var(--notectl-<global>)` directly is now layered as `var(--notectl-<component>-<prop>, var(--notectl-<global>, <hard-coded-fallback>))`, so consumers can override at exactly the granularity they need: existing global tokens continue to cascade to every component unchanged, new component-scoped tokens (`--notectl-table-border`, `--notectl-table-cell-bg`, `--notectl-table-header-bg`, `--notectl-blockquote-border`, `--notectl-blockquote-bg`, `--notectl-toolbar-button-bg` / `-fg` / `-hover-bg` / `-active-bg` / `-active-fg`) override a single component without touching the rest, and a hard-coded fallback keeps each component usable when neither is set. The per-table inline `--ntbl-border-color` set by the toolbar's "Border color" action retains highest precedence so user customizations survive theme switches. Documented public tokens (`--notectl-bg`, `--notectl-fg`, `--notectl-fg-muted`, `--notectl-border`, `--notectl-border-focus`, `--notectl-primary`, `--notectl-primary-fg`, `--notectl-focus-ring`) are declared with `@property` so DevTools surfaces them as first-class CSS variables and invalid values fall back to a typed `initial-value` instead of silently breaking downstream rules. The editor additionally exposes a stable [CSS Shadow Parts](https://drafts.csswg.org/css-shadow-parts/) surface — `editor`, `content`, `plugin-container` (+ `plugin-container-top` / `plugin-container-bottom` modifiers), `toolbar`, `toolbar-button` (+ `toolbar-button-active` / `toolbar-overflow-button` modifiers), `toolbar-divider`, `table`, `table-row`, `table-cell`, `code-block`, `code-block-header`, `code-block-content`, `blockquote` — so consumers can target structural elements via `::part()` without piercing the shadow DOM or forking the editor. Modifier parts (e.g. `toolbar-button-active`) are kept in sync with their ARIA counterparts (`aria-pressed`) and never drift. A new `@media (forced-colors: active)` block in `editor/styles/base.ts` maps editor borders, focus rings, and node-selection outlines onto Windows High Contrast / system-color palette so the editor stays legible under OS-level accessibility settings. The `--ntbl-border-color` mechanism remains supported as the highest-priority fallback, so the table's "Border color" toolbar action is unaffected. No exports removed, no global tokens renamed, no DOM structure changes outside additive `part` attributes — fully backwards compatible.

- **VS Code–style editing inside code blocks: auto-indent, multi-line indent, and bracket pairing** — `CodeBlockPlugin` gains three coordinated editing behaviors that bring it in line with what users expect from a modern IDE. **Auto-indent on `Enter`** inherits the current line's leading whitespace, adds one extra indent unit after an open bracket / brace / paren, and expands the cursor-between-pair pattern `{|}` into the three-line block form (open brace, indented empty line with the cursor, dedented close brace) — typing a close character on a whitespace-only line dedents by one step, or collapses the gap to consume an auto-paired close if one is in flight. **Multi-line indent** rebinds `Tab` / `Shift-Tab` so a selection spanning ≥ 2 lines indents every covered line (not just the column where the caret happens to sit) while preserving the selection direction; a range within a single line replaces the selection with one indent unit, matching VS Code's behaviour exactly. **Bracket pairing** introduces auto-pair on open, overtype on tracked auto-paired close characters (so the user's `)` is consumed by an existing close instead of producing `))`), wrap-selection (`"foo"` → `("foo")` when typing `(` over a selection), and pair-delete on `Backspace`. Quote handling follows VS Code's heuristics: a stray apostrophe inside an English contraction is not paired, and quotes inside an existing string or comment token are suppressed via the new `SyntaxHighlighterService.getTokenAt(blockId, offset)` lookup so the highlighter and the editor share a single source of truth about token boundaries. Behaviour is configurable per-plugin via `indent.{mode, useSpaces, spaceCount}` and `pairing.{brackets, quotes, overtype, deletePair, surround}`; the legacy top-level `useSpaces` / `spaceCount` options are kept as a fallback. Three plugin-API additions land alongside the feature: `TextInputInterceptor` in `model/` (parallel to `PasteInterceptor`, wired through `PluginContext`, `MiddlewareChain`, and `InputHandler`) lets plugins intercept and rewrite text input before it becomes a transaction; `PluginContext.getCompositionState()` exposes the existing `CompositionState` so plugins can guard against IME suppression; and `pluginHarness` gains a `notifyStateChange` option so `onStateChange`-driven flows (the pair-stack migration in particular) can be tested in isolation. The internal pair-stack uses `Transaction.mapping` with `assoc = +1` to migrate tracked open/close positions through every `StepMap` variant introduced in #118, and a deferred-op queue ensures fresh push/take operations apply in post-transaction position space; the interceptor flushes the queue on entry to drop ops left behind by middleware-suppressed transactions. Accessibility: all new key bindings respect the existing roving-tabindex and screenreader announcement surface; no new focus traps.

- **Generic position-mapping primitive (`StepMap` + `Mapping`)** — Steps now carry their own position-space mapping via a `getMap(docBefore): StepMap` entry in the `StepHandler` registry, covering all 14 step types as a single discriminated union of five categories: `identity` (mark / attribute / schema / block-type / block-insertion), `shift` (`[from, to) → newLen` within a block — unifies `insertText` / `deleteText` / `insertInlineNode` / `removeInlineNode` as one primitive), `split`, `merge`, and `blockRemoval` (walks descendants). `Transaction.mapping: Mapping` is now a required field, populated automatically as steps are appended in `TransactionBuilder.advanceDoc`, and composes per-step maps with `map(pos, assoc?)`, `mapResult(pos, assoc?)`, `mapRange(range, assocFrom?, assocTo?)`, `appendMap`, and `appendMapping`. The `assoc` argument (`-1` sticky-left, `+1` sticky-right) mirrors ProseMirror semantics. `mapSelection(sel, mapping)` exists for all three `EditorSelection` variants (text / node / gap) and collapses-aware (a cursor at a split boundary stays collapsed rather than tearing across two blocks). `HistoryManager` tracks an `interveningMapping` per group — extended on every new-group `push` and via a new `recordIntervening(mapping)` API for out-of-band transactions — so `undo` folds the restored selection through interleaved edits instead of relying on `validateSelection`'s blind numeric clamp. New public exports from `@notectl/core`: `Mapping`, `StepMap`, `IdentityMap` / `ShiftMap` / `SplitMap` / `MergeMap` / `BlockRemovalMap`, `Assoc`, `MapResult`, `PositionRange`, `IDENTITY_MAP`, `mapPositionThroughStep`, `collectRemovedBlockIds`, `mapSelection`, `mapTextSelection`, `getStepMap`. Unblocks comment / annotation anchors, suggestion-mode / track-changes, remote cursors, and selection restoration under collaborative editing; lays groundwork for OT / CRDT rebasing (Phase 3, separate effort).

- **TypeScript / TSX language support (#114)** — `CodeBlockPlugin` now ships with built-in TypeScript syntax highlighting and `SmartPastePlugin` with TypeScript content detection, alongside the existing Java / JSON / XML support. The new `TYPESCRIPT_LANGUAGE` definition covers modern TS — comments, escape-aware strings and template literals, decorators, the full keyword set incl. `satisfies` / `using` / `infer` / `keyof` / `asserts` / `out` / `override`, numeric literals with `_` separators and `BigInt` `n` suffix (hex/octal/binary/decimal/scientific), and modern operators (`=>`, `??`, `??=`, `?.`, `...`, `**=`, `>>>=`, `&&=`, `||=`). Word boundaries are enforced so identifiers like `interfaceName` are not mis-tokenized as keywords. The new `TypeScriptDetector` scores ES imports/exports, `type` / `interface` / `enum` / `namespace` / `declare`, `const` / `let` bindings, arrow functions, optional chaining, nullish coalescing, template literals, type annotations, `async`, decorators and generics; it carries explicit negative signals (`package …;`, `System.out.…`) to avoid misdetecting Java code, and is ReDoS-resistant (50 000-character adversarial inputs complete in < 100 ms). Aliases `ts` and `tsx` resolve to TypeScript in both the language registry and the tokenizer; JSX-specific tags are not parsed as separate token types in this iteration and fall back to standard TypeScript tokenization.

### Fixed
z
- **Inline-node decoration drift in `DecorationSet.map(tr)` (audit A2 / hotfix)** — Mapping decorations through `insertInlineNode` / `removeInlineNode` steps fell into the `default: return deco` arm of `mapInline` / `mapWidget`, so any plugin that cached a `DecorationSet` and incrementally remapped it (instead of rebuilding from `state`) would see decorations drift by one offset per inline-node insertion or deletion. The `hard_break` plugin already emits these steps in production via `Commands.ts`, making the bug reachable as soon as any consumer adopted the cached-set optimization. The two switches now handle inline-node steps with width-1 arithmetic mirroring `insertText` (`len = 1`) and `deleteText` (`from = step.offset, to = step.offset + 1`); regression tests cover both step types × {inline, widget, node} decoration shapes.
- **Sibling-index shift now rebased across structural undo under `recordIntervening` (follow-up to #129)** — `insertNode` / `removeNode` previously kept their `index` field unchanged when an intervening transaction inserted or removed a sibling in the same parent, so undo of a structural edit could remove the wrong block or insert at the wrong slot. The fix introduces a sixth `StepMap` category, `ChildIndexShiftMap { parentPath, fromIndex, delta }`, produced by `getMapInsertNode`, and extends `BlockRemovalMap` with mandatory `parentPath` / `index` fields populated from the `removeNode` step itself. Two new helpers in `Mapping.ts` — `mapChildIndex` (existing-child semantics: `null` when an intervening removal eats the exact slot) and `mapInsertionIndex` (insertion-slot semantics: the slot survives a same-index removal because it names *where to insert*, not an existing block) — drive the rebase. `mapInsertNode` uses the latter; `mapRemoveNode` uses the former, alongside the existing block-still-distinct probe. The `parentPath` is never rebased through structural maps (block identity does not shift in child-slot space), so the existing `parentPathStillValid` check continues to govern ancestor migration. New public exports from `@notectl/core`: `ChildIndexShiftMap`, `mapChildIndex`, `mapInsertionIndex` — the same primitives a future collab / OT layer needs for rebasing structural operations against remote edits. Tests cover `mapChildIndex` and `mapInsertionIndex` matrices in `state/Mapping.test.ts`, per-step rebase under both `childIndexShift` and `blockRemoval` (insertion-slot and existing-child cases) in `state/StepMapping.test.ts`, and end-to-end `insertNode` / `removeNode` undo under intervening sibling edits in `state/History.test.ts`.
- **Undo of `addMark` / `removeMark` over a partially-marked range no longer strips pre-existing marks (#128)** — `AddMarkStep` / `RemoveMarkStep` previously carried only `{ blockId, from, to, mark }` and the symmetric inverse covered the entire user-supplied range. When the action was applied to a range where some positions already carried the mark, the inverse stripped those pre-existing marks on undo (and the mirror case re-added marks to previously-unmarked sub-ranges through `removeMark` → undo), silently corrupting the document. The fix moves planning out of the steps and into the `TransactionBuilder`: `addMark` now walks the working document and emits one `AddMarkStep` per maximal sub-range that does not yet carry the mark type; `removeMark` emits one `RemoveMarkStep` per maximal sub-range that does carry the mark, with each step's `mark` field capturing the actual mark from the document (including attrs) so the inverse restores `link href`, `color` and other attributed marks faithfully. `StepApplication` and `StepInversion` are unchanged — the existing symmetric inverse is now exact because every emitted step accurately describes only the positions it modified. New helpers `findRangesMissingMark` / `findRangesWithMark` in `state/InlineContentOps.ts` are pure and coalesce across `InlineNode`s (which are inert: passed through, never break or start a range), and the builder falls back to a single full-range step when no working document is available (e.g. low-level tests). `AddMarkStep` / `RemoveMarkStep` now document the builder-enforced invariants explicitly. Acceptance criteria from the issue are covered by new tests in `state/MarkUndo.test.ts` (both add and remove polarity, attribute preservation through undo, redo correctness, no-op transactions when the mark already covers / is absent across the entire range, `InlineNode` coalescing, mixed mark types).


### Changed

- **Toolbar overflow is now measured at the group level (#125)** — `ToolbarOverflowController` previously iterated `this.toolbar.children` and resolved each child as either a button or a separator, which split logical clusters mid-group when space ran out. The controller now recognizes `.notectl-toolbar-group` wrappers as the unit of overflow: when any button inside a group would not fit, the entire group moves into the burger menu (every button in it gets `notectl-toolbar-btn--overflow-hidden` for uniform `notifyChange()` filtering, the wrapper itself gets the new `notectl-toolbar-group--overflow-hidden` class to hide via `display: none`). Standalone buttons appended directly to the toolbar — the shape used by the controller's unit tests — are still handled as single-button groups via a fallback branch, so no test refactor was required. Trailing-separator cleanup (`hideTrailingSeparators`) was extended to treat a hidden trailing group identically to a hidden trailing button. Roving tabindex is unaffected — it continues to operate on the flat `this.buttons` array — and the screenshot generator was updated to keep overflow-hidden groups visible in the docs build (`e2e/generate-screenshots.spec.ts`).

- **`decorations/PositionMapping.ts` rewritten on top of the new primitive** — The per-step `mapDecorationThroughStep(deco, step)` switch is now a 5-way dispatch over `StepMap` variants (`mapDecorationThroughStepMap(deco, stepMap)`), with the legacy step-based entry point kept as a thin shim for tests. `DecorationSet.map(tr)` iterates `tr.mapping.maps` rather than `tr.steps`, so selection-only and other identity transactions short-circuit (`tr.mapping.isEmpty`) without rebuilding the set. The only decoration-shape logic that remains in the module is the genuinely decoration-specific concerns: splitting an `InlineDecoration` into two when a `splitBlock` crosses its range, dropping a `NodeDecoration` when its block is merged or removed, and reusing widget `side` as the mapping `assoc`.
- **Step apply / invert dispatch consolidated into a single typed handler registry (#116)** — `state/StepApplication.ts` and `state/StepInversion.ts` previously each owned a 14-case `switch` over `step.type`, encoding the same `Step` discriminated union twice. Adding a new step variant required parallel edits in both files and nothing in the type system enforced that a forgotten half would surface at compile time. The two switches are replaced by a single registry in the new `state/StepHandlers.ts`, keyed by a mapped type `{ readonly [K in Step['type']]: StepHandler<Extract<Step, { readonly type: K }>> }`; introducing a new `Step` member without registering both `apply` and `invert` is now a type error at the registry literal — no runtime exhaustiveness check needed. `StepApplication.ts` and `StepInversion.ts` become pure libraries of per-step functions; dispatch (`applyStep`, `invertStep`, `invertTransaction`) lives in `StepHandlers.ts`. The `setStoredMarks` step gains an explicit `applySetStoredMarks` (a no-op at the document level — stored marks live on `EditorState`) so the registry is uniform. Public API surface (`@notectl/core` exports of `applyStep`, `invertStep`, `invertTransaction`) is unchanged — no migration required for downstream consumers.
- **Smart-paste content detection now lexer-driven (#115)** — The bespoke regex-heuristic detectors `JavaDetector` and `TypeScriptDetector` have been removed and replaced by a single, generic `LexerDetector` that re-uses the same `LanguageDefinition` already used for syntax highlighting. Detection scores combine **byte coverage** (fraction of input recognized by the language's tokenizer) with **relevance density** (per-token-type weights favouring keywords / annotations / tags over universal punctuation), producing calibrated confidences in `[0, 1]` instead of the previous flat `0.8`. Each language bundle additionally declares a small set of *smoking-gun signatures* — patterns that are syntactically impossible in any competing language — which add a confidence bonus when matched. This eliminates the previous ambiguity where Java and TypeScript's regex heuristics could both fire on the same `interface` declaration and the winner depended on registration order; for example `interface User { name: string; id: number; }` now classifies unambiguously as TypeScript because the Java tokenizer leaves `string` / `number` as unrecognized bytes while the TypeScript tokenizer matches them as keywords. `ContentSplitter.detectBest` now resolves exact-confidence ties lexicographically by language id, removing the implicit dependency on detector registration order. Highlighter and detector definitions can no longer drift — anything the highlighter learns to tokenize, the detector learns to recognize. The shared low-level iteration was extracted to `code-block/highlighter/TokenIteration.ts` so both `RegexTokenizer` and `LexerDetector` consume the same generator.


### Security
- **Dependabot bumps in the `npm_and_yarn` group (#131)** — Build-tooling and example-app dependency bumps with no runtime change to `@notectl/core`. `turbo` 2.8.20 → 2.9.14 (root dev-dependency) pulls in three upstream security fixes: GHSA-5xc8-49mv-x4mm (High, Turborepo VS Code extension command injection via unsanitized arguments passed to shell execution), GHSA-hcf7-66rw-9f5r (Low, login callback CSRF / session fixation; the auth callback now validates the `state` parameter against the issued request instead of accepting any value), and GHSA-3qcw-2rhx-2726 (Low, unexpected local code execution during Yarn Berry package-manager detection where a project-local Yarn binary could be picked up and run; detection now avoids project-local Yarn). `@angular/platform-server` 21.2.9 → 21.2.13 is scoped to `examples/angular/package.json` and brings in the Angular 21.2.10 to 21.2.13 patch line (hydration mismatch handling for components with projectable nodes in `LContainer`s, `BEFORE_APP_SERIALIZED` errors now forward to `ErrorHandler` instead of being swallowed, new `allowedHosts` option on `renderModule` / `renderApplication`, origin trailing-slash normalization on URL parsing, and event-replay double-invocation guard during hydration). The Angular bump is example-only and not part of the published `@notectl/core` package; the `turbo` bump is dev-only and never reaches consumers' bundles.

- **`brace-expansion` Dependabot bump in the `npm_and_yarn` group (#126)** — Lockfile-only bump of two parallel release lines pulled in transitively via `minimatch` / `glob` in build tooling; no runtime change to `@notectl/core`. `brace-expansion` 5.0.5 → 5.0.6 (GHSA-jxxr-4gwj-5jf2 / CVE-2026-45149, fixes a DoS where the `max` option was applied to the output-combination step but not to the sequence-generation loop, so `{1..10000000}` with `max=10` still allocated ~505 MB and hung ~800 ms before truncating; one-line fix in `src/index.ts` plus a regression test, the v5.0.6 version-bump commit is GPG-signed and verified as the upstream maintainer). `brace-expansion` 2.0.3 → 2.1.0 (backport of the `max` opt-in to the v2 line; purely additive, default stays unbounded so behaviour is unchanged for existing callers). The PR title's "2.0.3 → 5.0.6" framing is a Dependabot group-update presentation artifact, not an actual major-version jump: both 2.x and 5.x already coexisted in the lockfile because `minimatch@9.x` pins `^2.0.1` while `minimatch@10.x` pins `^5.0.0`, and each line is patched independently.

- **Dependabot transitive bumps in the `npm_and_yarn` group (#119)** — Lockfile-only bumps that pull in upstream security fixes for build-time / docs-site dependencies; no runtime change to `@notectl/core`. `fast-uri` 3.1.0 → 3.1.2 (GHSA-v39h-62p7-jpjc — malformed-fragment decoding is now reported as a parse error instead of throwing). `hono` 4.12.12 → 4.12.18 (GHSA-p77w-8qqv-26rm — Cache Middleware now honours `Vary: Authorization` / `Vary: Cookie` so an authenticated user's response cannot be served to other users; GHSA-qp7p-654g-cw7p — JSX SSR escapes `style` object property names and values to prevent CSS-declaration injection; GHSA-hm8q-7f3q-5f36 — JWT `verify()` now strictly validates `exp` / `nbf` / `iat` NumericDate claims per RFC 7519 instead of silently accepting falsy / non-finite values). `postcss` 8.5.8 → 8.5.14 (GHSA — XSS via unescaped `</style>` in non-bundler stringification; fixes user-CSS file-read regression with new `opts.unsafeMap` opt-out; nested-brackets parsing perf and custom-syntax regression). `devalue` 5.8.0 → 5.8.1 (sparse-array allocation fix). `ip-address` 10.1.0 → 10.2.0.


## [2.1.2] - 2026-05-02

### Fixed

- **CI on `main` red — Bootstrap-modal-like dropdown-position spec failed (#68 regression)** — The vanillajs playground commit `98239d1` added `notectl-editor { height: 100%; min-height: 0; --notectl-content-min-height: 0 }` to make the editor fill a new 700px grid row. Those rules apply globally to the host element, including in `dropdown-position.spec.ts` which reparents `#editor-container` into a Bootstrap-modal-like dialog with no explicit height. There, `height: 100%` resolved to auto, the editor shrank to its content and the heading dropdown popup ended up mispositioned (`gap: -148px`) inside the transformed containing block. The `grid-template-rows: 700px auto` row alone keeps the actions bar pinned and the inspector height-bounded; the editor sizes to its intrinsic height (`--notectl-content-min-height: 460px`) inside the row, identical to v2.0.x behaviour.

## [2.1.1] - 2026-05-02

### Fixed

- **Code-block input rule loses the `language` attribute (#113)** — Typing `` ```<lang> `` + space converts a paragraph to a `code_block` via a single transaction containing both `deleteText` and `setBlockType`. The `TextDirectionAutoPlugin`'s auto-detect middleware appended its own `setNodeAttr` step built from a pre-transaction `block.attrs` snapshot; `applySetNodeAttr` has full-replace semantics, so by application time the snapshot was stale and clobbered the `{ language, backgroundColor }` attrs written by `setBlockType`. The result was a code block with `language: ''`, no language label and no syntax highlighting. Auto-detect now pre-scans the transaction for blocks already targeted by `setBlockType` or `setNodeAttr` and skips its emission for those blocks — symmetrical to the guards already present in the `preserve-dir` and `inherit-dir` middlewares. The next text-only transaction re-detects direction normally. Generally fixes the same data-loss pattern for any future input rule or command that combines text edits with a block-type or attr change in a single atomic transaction.

## [2.1.0] - 2026-05-02

### Added

- **`BidiIsolationPlugin`** (`@notectl/core/plugins/bidi-isolation`) — Inline `<bdi>` mark, `toggleBidi*` / `removeBidi` / `toggleBidiIsolation` commands, inline toolbar dropdown, `Mod-Shift-B`. Works standalone; optionally consumes `TextDirectionService` so `toggleBidiIsolation` picks the direction opposite to the surrounding block.
- **`TextDirectionAutoPlugin`** (`@notectl/core/plugins/text-direction-auto`) — Headless plugin that registers the three transaction middlewares (preserve / auto-detect / inherit) previously fused into the heavy `TextDirectionPlugin`. Hard-depends on `TextDirectionPlugin` via `dependencies = ['text-direction']`. Each middleware can be disabled individually via config.
- **`TextDirectionService`** + `TEXT_DIRECTION_SERVICE_KEY` — Typed service exposing `directableTypes` and `getBlockDir`, registered by `TextDirectionPlugin` for cross-plugin consumption.
- **`makeBlockState` test helper** in `test/TestUtils.ts` — Convenience wrapper around `stateBuilder()` for plugin tests that only need a static document.

### Changed

- **`TextDirectionPlugin` is now lean** (`@notectl/core/plugins/text-direction`) — Owns only the block-level `dir` attribute, toolbar dropdown, `Mod-Shift-D`, and `ShiftDirectionHandler`. Inline bidi and middleware behaviour moved to the two new plugins above. `FullPreset` registers all three so behaviour for preset users is unchanged.
- **Locale split** — `TextDirectionLocale` keeps the 8 block-direction strings; `BidiIsolationLocale` (new) owns the 6 inline-bidi strings. All 9 language files split mechanically.

### Removed (BREAKING)

- **`TextDirectionAdvancedPlugin`** and the `@notectl/core/plugins/text-direction-advanced` subpath export — replace by registering `TextDirectionPlugin` + `BidiIsolationPlugin` + `TextDirectionAutoPlugin` explicitly (or use `createFullPreset`).
- **`TextDirectionCorePlugin`** — `TextDirectionPlugin` is now the lean class; importing `TextDirectionCorePlugin` no longer resolves.
- **Inline bidi capabilities (`<bdi>` mark, `toggleBidi*` commands, `Mod-Shift-B`, auto-detect / inherit / preserve middleware) when only importing `TextDirectionPlugin`** — those moved to the two new plugin entries. Previously the docs claimed the lean and heavy classes were "the same" — they were not, and consumers calling `executeCommand('toggleBidiLTR')` on the lean variant silently received `false`. The new split makes the contract honest.

### Performance

- **`TextDirectionAutoPlugin.handleInsertText`** skips the `getBlockText` string allocation in the early-return path that protects explicit non-auto block direction. Switches the guard to `getBlockLength`, which is O(n) over inline children with no string allocation. Side benefit: blocks whose only inline content is an `InlineNode` are now correctly protected from re-detection.

## [2.0.10] - 2026-04-28

### Added

- **`NotectlEditor.setText(value)`** — Replaces editor content from plain text, splitting on `\n` into paragraphs. Existing top-level block IDs are reused in document order so the caret survives `setText(getText())` round-trips. No-op when `value` equals the current text — selection and history stay untouched.
- **Fixed-size editor with internal scrolling (#107)** — `<notectl-editor>` can now be pinned to a fixed external size while the content area scrolls internally and the toolbar/footer stay pinned. Two opt-in patterns: a `height` on the host (`notectl-editor { height: 500px }`) or the new `--notectl-content-max-height` CSS custom property.
- **`data-block-id` in the HTML wire format** — `getContentHTML` now emits a `data-block-id` attribute on every block; `setContentHTML` adopts it (with safe-pattern + per-document uniqueness checks). External HTML without the attribute still receives fresh IDs, so paste behaviour is unchanged. See [Round-Trip Identity](https://samyssmile.github.io/notectl/guides/content/#round-trip-identity).

### Changed

- **`ServiceKey` / `EventKey` moved to `model/TypedKeys.ts` (#112)** — Resolves a structural layer violation where `i18n/LocaleService` imported `ServiceKey` from `plugins/Plugin`. The classes are pure nominal typed-id wrappers and now live in `model/`, where any layer can construct typed DI keys without depending on `plugins/`. Re-exported from `plugins/Plugin.ts` and `@notectl/core` — no public API change.

### Fixed

- **Signal-form cursor reset on `html` and `text` content formats (#103)** — Extends the 2.0.9 fix to `contentFormat: 'html'` and `'text'`. The caret no longer jumps to the start of the document when an Angular signal form (or any external owner) writes the same content back on every keystroke.
- **Readonly mode now applies to all NodeView interactions (#105)** — Tables, code blocks, and the language picker are no longer mutable via their nested click handlers when `readonlyMode` is true. The guard is enforced centrally in `EditorView.dispatch` instead of relying on individual handlers.

## [2.0.9] - 2026-04-17

### Added

- **`EditorState.withSelection(selection)`** — Returns a new state with the given selection validated and clamped against the current document. Useful for callers that need to adopt an external selection safely.

### Changed

- **`EditorView.replaceState()` preserves the caret.** The prior selection is carried over (validated against the new document) instead of adopting the selection from the incoming state. Undo/redo history is still cleared. This is a behavior change on the public `EditorView` API — any selection carried on the state passed to `replaceState()` is now ignored.

### Fixed

- **Signal-form cursor reset (#103)** — The caret no longer jumps to the start of the document when `setJSON(getJSON())` round-trips unchanged content. This was breaking Angular signal-form bindings, where every keystroke triggers such a round-trip. `setContentHTML()` benefits from the same preservation since it routes through the same code path.

## [2.0.8] - 2026-03-31

### Added

### Changed

### Fixed

### Security

- **Dependabot alerts cleared (17/17, no `pnpm.overrides`)** — Closed all open security advisories via direct dependency bumps and lockfile refreshes within existing ranges.
  - Direct bumps: `@angular/build` / `@angular/cli` 21.2.4 → 21.2.7, `@astrojs/starlight` 0.37.7 → 0.38.3 with `astro` 5.18.1 → 6.1.5, `vite` 8.0.5 → 8.0.8.
  - Transitive refreshes: `hono` 4.12.9 → 4.12.12, `@hono/node-server` 1.19.11 → 1.19.13, `lodash` 4.17.23 → 4.18.1, `brace-expansion` 2.0.2 → 2.0.3, `defu` 6.1.4 → 6.1.7, `picomatch` 4.0.3 → 4.0.4.
  - Closes advisories for vite path traversal / `server.fs.deny` bypass / arbitrary file read via dev server WebSocket, picomatch ReDoS and method injection, defu prototype pollution, hono cookie / `serveStatic` / `ipRestriction` / `toSSG` issues, lodash `_.template` code injection and `_.unset`/`_.omit` prototype pollution, and brace-expansion ReDoS.

## [2.0.7] - 2026-03-30

### Added

- **Inline Code Mark Plugin** — New `InlineCodePlugin` for formatting text as `<code>` inline marks (#88). Includes toggle command (`toggleInlineCode`), keyboard shortcut (`Mod-E`), backtick InputRule (`` `text` `` auto-formats), toolbar button, mark exclusivity middleware (prevents bold/italic/underline inside code, allows link), CSS with custom properties and high-contrast mode support, and i18n for 8 languages.
- **Inline Code Plugin documentation** — Full Starlight docs page with screenshot, sidebar entry, and plugin overview update.

### Fixed

- **Dark mode contrast** — Improved contrast for inline code and code block backgrounds in dark mode.
- **ArrowUp column preservation** — ArrowUp navigation now preserves the cursor column position in Firefox.

## [2.0.6] - 2026-03-27

### Changed

- **Reconciler tests** — Migrate all test calls to use branded types (`nodeType()`, `blockId()`, `markType()`) for type-safe block/node creation
- **VanillaJS example** — Clean up unused `CodeBlockPlugin` import

## [2.0.5] - 2026-03-19

### Fixed

- **Keymap warnings** — Remove misleading "will be overridden" console warnings for same-priority keymap registrations. Multiple handlers per key at the same priority is by design (chain-of-responsibility dispatch tries all handlers in reverse order).

## [2.0.4] - 2026-03-18

### Added

- **Batch list operations** — Support batch list operations (toggle, indent, outdent) on multi-block selections (#68).

### Changed

- **Dependencies** — Patched transitive security vulnerabilities and aligned all Angular packages to 21.2.4.
- **EditorInitializer refactored** — Split the 208-line `initializeEditor()` god function into an `EditorInitSession` class with focused single-responsibility phase methods (`setupTheme`, `setupDOM`, `setupPlugins`, `initPluginsAndView`, `createInputAndView`, `finalizeSetup`).
- **List attrs DRY refactor** — Extracted `buildListItemAttrs()` factory to replace 7 duplicated inline attribute constructions and eliminate `as Record<...>` casts (#73).
- **E2E cursor helpers** — Extracted `moveCursorToOffset()` and `getBlockText()` into `EditorPage`, removing ~20 duplicated patterns from `cursor-list-items.spec.ts` (#75).
- **DomPointUtils DRY refactor** — Extracted `tryCaretFromPoint()` helper to deduplicate the `caretPositionFromPoint`/`caretRangeFromPoint` fallback chain (#74).

### Fixed

- **Dropdown popup positioning** — Correct dropdown popup mispositioning in `transform`/`will-change` containers (#72).
- **List item navigation** — Preserve goal column when navigating between list items with arrow keys (#69).
- **Theme variables** — Use correct surface variables instead of `--notectl-bg` for UI elements (#71).
- **Keymap warnings** — Suppress keymap override warnings for cross-priority registrations (#70).

### Documentation

- Comprehensive documentation audit across 24 files (plugins, API reference, guides, getting started).
- Fixed incorrect keyboard shortcuts in plugin overview (TablePlugin, FontSizePlugin).
- Added missing PluginManager methods to API reference (`registerService`, `isReadonlyBypassed`, `getPasteInterceptors`).
- Fixed CSS variable count in theme docs (26 → 36), added syntax token documentation.
- Corrected TextDirectionPlugin vs TextDirectionAdvancedPlugin distinction.
- Fixed import paths for `FontDefinition` and `TableLocale` types.
- Added missing locale loaders (`loadSmartPasteLocale`, `loadGapCursorLocale`, `loadCaretNavigationLocale`).
- Added code block syntax token CSS properties to styling guide.
- Updated plugin styling examples to use CSP-compliant `registerStyleSheet()` approach.
- Added blockquote keyboard behavior, list multi-block selection, and code block built-in languages documentation.

## [2.0.3] - 2026-03-14

### Changed

- **Vite 8.0** — Upgraded to Vite 8.0 (Rolldown-powered) for faster builds.
- **Angular dependency** — Bumped `@angular/core` to latest.

### Fixed

- **SetBlockType attrs** — Omit `attrs` property in `SetBlockType` when no attrs are provided, preventing empty attribute objects from leaking into transactions.
- **Print XSS** — Sanitize header/footer HTML in `PrintContentPreparer` to prevent XSS injection.

## [2.0.2] - 2026-03-08

### Changed

- **Angular editor wrapper simplified** — Streamlined the Angular component and stabilized reactive forms integration.
- **SRP refactoring** — Extracted focused modules from `NotectlEditor`, `PasteHandler`, `PluginManager`, and `EditorView` for better separation of concerns.

### Fixed

- **Plugin initialization** — Fail fast and rollback on plugin init errors to prevent partial editor state.
- **Editor lifecycle recovery** — Gracefully recover the editor after initialization failures.
- **Rich clipboard** — Hardened clipboard origin detection and inline-node paste roundtrip; handle InlineNodes in clipboard, click-below, and selection sync.
- **Editor state replacement** — Hardened state replacement and `beforeinput` handling to prevent stale state dispatches.
- **Popup and table selection** — Hardened popup lifecycle cleanup and table selection state management.
- **Selection preservation** — Preserve valid selections after structural block removal and maintain undo semantics.
- **Composite selection** — Trim composite selection HTML to the actually selected range.
- **Auto-init** — Defer auto-initialization to preserve manual init configuration.
- **Placeholder** — Restore default placeholder text when the attribute is removed.
- **Security** — Added pnpm overrides for svgo and immutable dependency vulnerabilities.

## [2.0.1] - 2026-03-04

### Added

- **Smart Paste Plugin** — Automatically detects JSON and XML content on paste and applies syntax-highlighted code block formatting.

### Changed

- **Transaction system refactored for SOLID compliance** — Step application, history grouping, and transaction building decomposed into focused, single-responsibility modules.
- **ImagePlugin decomposed** — Extracted `ImagePopup` into its own module for SRP compliance.
- **SchemaRegistry and HTMLUtils** — Extracted shared helpers to reduce duplication.
- **Document model helpers** — Extracted `mapBlockInlineContent`, `optionalPath`, segment extraction, `requireDoc`/`requireBlock`, and removed dead exports.
- **InlineContentOps** — Unified `insertText` and `insertSegments` into a single code path.
- **Block merge operations** — Consolidated `mergeBlockBackward` and `mergeBlockForward`.
- **DomUtils** — Extracted `buildBlockPath` and `findBlockAncestor` helpers.
- **EditorView** — Extracted `reconcileAndSync` and consolidated `viewMove`/`viewExtend`.
- **Plugin helpers** — Extracted `toCommandName`, `ColorMarkType`, and `resolveLocale` utilities.
- **Selection guards** — Replaced `isNodeSelection || isGapCursor` guards with cleaner `isTextSelection` checks.
- **LocaleService** — Fixed duplication and `getSystemTheme` placement in editor.
- **Path utilities** — Extracted `extractParentPath`, `findSiblingIndex`, removed `resolveSiblings`.

### Fixed

- Documentation synced with current codebase.

## [2.0.0] - 2026-03-03

### Breaking Changes

- **`priority` and `separatorAfter` removed from `ToolbarItem`** — Toolbar ordering is now controlled exclusively by registration order and the declarative `ToolbarLayoutConfig`. Remove any `priority` or `separatorAfter` properties from your plugin configurations and toolbar item definitions.
- **`styleMode` config option and `RuntimeStyleMode` type removed** — The editor now always uses the strict token-based stylesheet system. Remove any `styleMode: 'inline'` from your `NotectlEditorConfig`. Elements outside a registered style root fall back to inline styles as a defensive measure.
- **`TextAlignmentPlugin`, `TextAlignmentConfig`, `TextAlignment` exports removed** — Use `AlignmentPlugin`, `AlignmentConfig`, and `BlockAlignment` instead.
- **`MarkType` and `NodeType` type aliases removed** — Use `MarkTypeName` and `NodeTypeName` from `model/TypeBrands` instead.
- **`ToolbarOverflowBehaviorType` re-export removed** — Use `ToolbarOverflowBehavior` (the enum itself) directly.
- **`BlockAlignment` re-export from `AlignmentPlugin` removed** — Import `BlockAlignment` from `@notectl/core` barrel export or `model/BlockAlignment` instead.
- **`CodeBlockPlugin` backward-compat re-exports cleaned up** — `CodeBlockConfig`, `CodeBlockKeymap`, `CodeBlockService`, `SyntaxHighlighter`, `SyntaxToken`, and `CODE_BLOCK_SERVICE_KEY` are now exported from `CodeBlockTypes` (still available from the barrel `@notectl/core`).
- **Legacy `ToolbarPopupController` fallback path removed** — The controller now requires `PopupManager`; the inline-positioning legacy path is gone.
- **Angular wrapper bumped to Angular 21+** — `@notectl/angular` now requires Angular 21 and `@notectl/core ^2.0.0`.

### Migration Guide

#### Toolbar priority → declarative layout

```diff
- // v1.x — priority-based ordering
- registerToolbarItem({ id: 'bold', priority: 10, separatorAfter: true, ... });
+ // v2.0 — registration order + layout config
+ registerToolbarItem({ id: 'bold', group: 'format', ... });
```

Use `ToolbarLayoutConfig` on the editor to control group ordering and separators.

#### StyleRuntime inline mode → strict mode only

```diff
  const editor = document.createElement('notectl-editor');
- editor.config = { styleMode: 'inline' };
+ // No styleMode needed — strict mode is the only mode
  editor.config = {};
```

#### Renamed type exports

```diff
- import { MarkType, NodeType } from '@notectl/core';
+ import { MarkTypeName, NodeTypeName } from '@notectl/core';

- import { TextAlignmentPlugin, TextAlignment } from '@notectl/core';
+ import { AlignmentPlugin, BlockAlignment } from '@notectl/core';

- import type { ToolbarOverflowBehaviorType } from '@notectl/core';
+ import { ToolbarOverflowBehavior } from '@notectl/core';
```

#### BlockAlignment import path

```diff
- import { BlockAlignment } from '@notectl/core/plugins/alignment/AlignmentPlugin';
+ import { BlockAlignment } from '@notectl/core';
```

### Added

- **RTL language support and TextDirectionPlugin** — Full right-to-left text direction support with automatic detection and manual override per block.
- **CSP-compliant HTML export** — New `cssMode: 'classes'` option in `getContentHTML()` returns `{ html, css }` with class-based styling instead of inline styles.
- **`adoptedStyleSheets` API** — New `adoptContentStyles()` method for injecting content styles into shadow roots or documents.
- **Portuguese (pt) locale** — Added localization for all 18 plugins.
- **`serializeDocumentToCSS()` export** — New function for standalone CSS generation from document content.
- **`ContentHTMLOptions` and `ContentCSSResult` types exported** — Full type support for the new HTML export options.

### Changed

- **Bundle system reworked** — Improved internal bundling for smaller output and better tree-shaking.
- **Architecture layer violations resolved** — `HTMLParser` moved to `input/`, `NavigationUtils` moved to `state/`, circular dependencies between `input/` and `view/` eliminated.
- **Reconciler decomposed** — `Reconciler.ts` split into focused view modules for better maintainability.
- **`findNodePath` replaced with `state.getNodePath`** — Plugins now use the state-level API instead of the model-level function.

### Fixed

- Shadow DOM selection reading in Safari via `getComposedRanges`.
- Backward selection direction preserved in Shadow DOM `readComposedSelection`.
- Table border color preserved on cut/paste.
- Enter key now correctly splits blocks inside table cells.
- Clipboard copy/paste reliability improvements.
- Hover styles properly guarded for touch devices.
- Editor focus restored after color picker selection.
- Popup dimensions read after `position: fixed` is applied.
- Double-bundling issue in docs playground resolved.
- i18n violations fixed across multiple plugins.

### Performance

- `ToolbarOverflowController` — eliminated read-write interleave (layout thrashing).
- `PaperLayoutController` — height compensation deferred to `requestAnimationFrame`.

## [1.7.3] - 2026-03-01

_Last release before the 2.0 breaking changes. All deprecated APIs (`TextAlignmentPlugin`, `MarkType`, `NodeType`, `styleMode: 'inline'`, toolbar `priority`/`separatorAfter`) were still available._

### Added

- CSP-compliant `StyleRuntime` — eliminate inline style attributes.

### Fixed

- Restore focus to editor content after color picker selection.
- Apply `position: fixed` before reading popup dimensions.
- Various test fixes.

### Performance

- Coalesce playground output updates on large paste.
- Defer `PaperLayoutController` height compensation to rAF.
- Eliminate read-write interleave in `ToolbarOverflowController`.
