# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.3] - 2026-05-18

### Added

- **Structured theming contract: component-scoped tokens + CSS Shadow Parts (#122, resolves #120)** — `<notectl-editor>` now exposes a three-tier theming cascade across every component instead of the previous mix of one global token plus an ad-hoc per-component opt-in. Every CSS rule that previously read `var(--notectl-<global>)` directly is now layered as `var(--notectl-<component>-<prop>, var(--notectl-<global>, <hard-coded-fallback>))`, so consumers can override at exactly the granularity they need: existing global tokens continue to cascade to every component unchanged, new component-scoped tokens (`--notectl-table-border`, `--notectl-table-cell-bg`, `--notectl-table-header-bg`, `--notectl-blockquote-border`, `--notectl-blockquote-bg`, `--notectl-toolbar-button-bg` / `-fg` / `-hover-bg` / `-active-bg` / `-active-fg`) override a single component without touching the rest, and a hard-coded fallback keeps each component usable when neither is set. The per-table inline `--ntbl-border-color` set by the toolbar's "Border color" action retains highest precedence so user customizations survive theme switches. Documented public tokens (`--notectl-bg`, `--notectl-fg`, `--notectl-fg-muted`, `--notectl-border`, `--notectl-border-focus`, `--notectl-primary`, `--notectl-primary-fg`, `--notectl-focus-ring`) are declared with `@property` so DevTools surfaces them as first-class CSS variables and invalid values fall back to a typed `initial-value` instead of silently breaking downstream rules. The editor additionally exposes a stable [CSS Shadow Parts](https://drafts.csswg.org/css-shadow-parts/) surface — `editor`, `content`, `plugin-container` (+ `plugin-container-top` / `plugin-container-bottom` modifiers), `toolbar`, `toolbar-button` (+ `toolbar-button-active` / `toolbar-overflow-button` modifiers), `toolbar-divider`, `table`, `table-row`, `table-cell`, `code-block`, `code-block-header`, `code-block-content`, `blockquote` — so consumers can target structural elements via `::part()` without piercing the shadow DOM or forking the editor. Modifier parts (e.g. `toolbar-button-active`) are kept in sync with their ARIA counterparts (`aria-pressed`) and never drift. A new `@media (forced-colors: active)` block in `editor/styles/base.ts` maps editor borders, focus rings, and node-selection outlines onto Windows High Contrast / system-color palette so the editor stays legible under OS-level accessibility settings. The `--ntbl-border-color` mechanism remains supported as the highest-priority fallback, so the table's "Border color" toolbar action is unaffected. No exports removed, no global tokens renamed, no DOM structure changes outside additive `part` attributes — fully backwards compatible.

- **VS Code–style editing inside code blocks: auto-indent, multi-line indent, and bracket pairing** — `CodeBlockPlugin` gains three coordinated editing behaviors that bring it in line with what users expect from a modern IDE. **Auto-indent on `Enter`** inherits the current line's leading whitespace, adds one extra indent unit after an open bracket / brace / paren, and expands the cursor-between-pair pattern `{|}` into the three-line block form (open brace, indented empty line with the cursor, dedented close brace) — typing a close character on a whitespace-only line dedents by one step, or collapses the gap to consume an auto-paired close if one is in flight. **Multi-line indent** rebinds `Tab` / `Shift-Tab` so a selection spanning ≥ 2 lines indents every covered line (not just the column where the caret happens to sit) while preserving the selection direction; a range within a single line replaces the selection with one indent unit, matching VS Code's behaviour exactly. **Bracket pairing** introduces auto-pair on open, overtype on tracked auto-paired close characters (so the user's `)` is consumed by an existing close instead of producing `))`), wrap-selection (`"foo"` → `("foo")` when typing `(` over a selection), and pair-delete on `Backspace`. Quote handling follows VS Code's heuristics: a stray apostrophe inside an English contraction is not paired, and quotes inside an existing string or comment token are suppressed via the new `SyntaxHighlighterService.getTokenAt(blockId, offset)` lookup so the highlighter and the editor share a single source of truth about token boundaries. Behaviour is configurable per-plugin via `indent.{mode, useSpaces, spaceCount}` and `pairing.{brackets, quotes, overtype, deletePair, surround}`; the legacy top-level `useSpaces` / `spaceCount` options are kept as a fallback. Three plugin-API additions land alongside the feature: `TextInputInterceptor` in `model/` (parallel to `PasteInterceptor`, wired through `PluginContext`, `MiddlewareChain`, and `InputHandler`) lets plugins intercept and rewrite text input before it becomes a transaction; `PluginContext.getCompositionState()` exposes the existing `CompositionState` so plugins can guard against IME suppression; and `pluginHarness` gains a `notifyStateChange` option so `onStateChange`-driven flows (the pair-stack migration in particular) can be tested in isolation. The internal pair-stack uses `Transaction.mapping` with `assoc = +1` to migrate tracked open/close positions through every `StepMap` variant introduced in #118, and a deferred-op queue ensures fresh push/take operations apply in post-transaction position space; the interceptor flushes the queue on entry to drop ops left behind by middleware-suppressed transactions. Accessibility: all new key bindings respect the existing roving-tabindex and screenreader announcement surface; no new focus traps.

- **Generic position-mapping primitive (`StepMap` + `Mapping`)** — Steps now carry their own position-space mapping via a `getMap(docBefore): StepMap` entry in the `StepHandler` registry, covering all 14 step types as a single discriminated union of five categories: `identity` (mark / attribute / schema / block-type / block-insertion), `shift` (`[from, to) → newLen` within a block — unifies `insertText` / `deleteText` / `insertInlineNode` / `removeInlineNode` as one primitive), `split`, `merge`, and `blockRemoval` (walks descendants). `Transaction.mapping: Mapping` is now a required field, populated automatically as steps are appended in `TransactionBuilder.advanceDoc`, and composes per-step maps with `map(pos, assoc?)`, `mapResult(pos, assoc?)`, `mapRange(range, assocFrom?, assocTo?)`, `appendMap`, and `appendMapping`. The `assoc` argument (`-1` sticky-left, `+1` sticky-right) mirrors ProseMirror semantics. `mapSelection(sel, mapping)` exists for all three `EditorSelection` variants (text / node / gap) and collapses-aware (a cursor at a split boundary stays collapsed rather than tearing across two blocks). `HistoryManager` tracks an `interveningMapping` per group — extended on every new-group `push` and via a new `recordIntervening(mapping)` API for out-of-band transactions — so `undo` folds the restored selection through interleaved edits instead of relying on `validateSelection`'s blind numeric clamp. New public exports from `@notectl/core`: `Mapping`, `StepMap`, `IdentityMap` / `ShiftMap` / `SplitMap` / `MergeMap` / `BlockRemovalMap`, `Assoc`, `MapResult`, `PositionRange`, `IDENTITY_MAP`, `mapPositionThroughStep`, `collectRemovedBlockIds`, `mapSelection`, `mapTextSelection`, `getStepMap`. Unblocks comment / annotation anchors, suggestion-mode / track-changes, remote cursors, and selection restoration under collaborative editing; lays groundwork for OT / CRDT rebasing (Phase 3, separate effort).

### Fixed

- **Inline-node decoration drift in `DecorationSet.map(tr)` (audit A2 / hotfix)** — Mapping decorations through `insertInlineNode` / `removeInlineNode` steps fell into the `default: return deco` arm of `mapInline` / `mapWidget`, so any plugin that cached a `DecorationSet` and incrementally remapped it (instead of rebuilding from `state`) would see decorations drift by one offset per inline-node insertion or deletion. The `hard_break` plugin already emits these steps in production via `Commands.ts`, making the bug reachable as soon as any consumer adopted the cached-set optimization. The two switches now handle inline-node steps with width-1 arithmetic mirroring `insertText` (`len = 1`) and `deleteText` (`from = step.offset, to = step.offset + 1`); regression tests cover both step types × {inline, widget, node} decoration shapes.

### Changed

- **`decorations/PositionMapping.ts` rewritten on top of the new primitive** — The per-step `mapDecorationThroughStep(deco, step)` switch is now a 5-way dispatch over `StepMap` variants (`mapDecorationThroughStepMap(deco, stepMap)`), with the legacy step-based entry point kept as a thin shim for tests. `DecorationSet.map(tr)` iterates `tr.mapping.maps` rather than `tr.steps`, so selection-only and other identity transactions short-circuit (`tr.mapping.isEmpty`) without rebuilding the set. The only decoration-shape logic that remains in the module is the genuinely decoration-specific concerns: splitting an `InlineDecoration` into two when a `splitBlock` crosses its range, dropping a `NodeDecoration` when its block is merged or removed, and reusing widget `side` as the mapping `assoc`.
- **Step apply / invert dispatch consolidated into a single typed handler registry (#116)** — `state/StepApplication.ts` and `state/StepInversion.ts` previously each owned a 14-case `switch` over `step.type`, encoding the same `Step` discriminated union twice. Adding a new step variant required parallel edits in both files and nothing in the type system enforced that a forgotten half would surface at compile time. The two switches are replaced by a single registry in the new `state/StepHandlers.ts`, keyed by a mapped type `{ readonly [K in Step['type']]: StepHandler<Extract<Step, { readonly type: K }>> }`; introducing a new `Step` member without registering both `apply` and `invert` is now a type error at the registry literal — no runtime exhaustiveness check needed. `StepApplication.ts` and `StepInversion.ts` become pure libraries of per-step functions; dispatch (`applyStep`, `invertStep`, `invertTransaction`) lives in `StepHandlers.ts`. The `setStoredMarks` step gains an explicit `applySetStoredMarks` (a no-op at the document level — stored marks live on `EditorState`) so the registry is uniform. Public API surface (`@notectl/core` exports of `applyStep`, `invertStep`, `invertTransaction`) is unchanged — no migration required for downstream consumers.
- **Smart-paste content detection now lexer-driven (#115)** — The bespoke regex-heuristic detectors `JavaDetector` and `TypeScriptDetector` have been removed and replaced by a single, generic `LexerDetector` that re-uses the same `LanguageDefinition` already used for syntax highlighting. Detection scores combine **byte coverage** (fraction of input recognized by the language's tokenizer) with **relevance density** (per-token-type weights favouring keywords / annotations / tags over universal punctuation), producing calibrated confidences in `[0, 1]` instead of the previous flat `0.8`. Each language bundle additionally declares a small set of *smoking-gun signatures* — patterns that are syntactically impossible in any competing language — which add a confidence bonus when matched. This eliminates the previous ambiguity where Java and TypeScript's regex heuristics could both fire on the same `interface` declaration and the winner depended on registration order; for example `interface User { name: string; id: number; }` now classifies unambiguously as TypeScript because the Java tokenizer leaves `string` / `number` as unrecognized bytes while the TypeScript tokenizer matches them as keywords. `ContentSplitter.detectBest` now resolves exact-confidence ties lexicographically by language id, removing the implicit dependency on detector registration order. Highlighter and detector definitions can no longer drift — anything the highlighter learns to tokenize, the detector learns to recognize. The shared low-level iteration was extracted to `code-block/highlighter/TokenIteration.ts` so both `RegexTokenizer` and `LexerDetector` consume the same generator.

### Added

- **TypeScript / TSX language support (#114)** — `CodeBlockPlugin` now ships with built-in TypeScript syntax highlighting and `SmartPastePlugin` with TypeScript content detection, alongside the existing Java / JSON / XML support. The new `TYPESCRIPT_LANGUAGE` definition covers modern TS — comments, escape-aware strings and template literals, decorators, the full keyword set incl. `satisfies` / `using` / `infer` / `keyof` / `asserts` / `out` / `override`, numeric literals with `_` separators and `BigInt` `n` suffix (hex/octal/binary/decimal/scientific), and modern operators (`=>`, `??`, `??=`, `?.`, `...`, `**=`, `>>>=`, `&&=`, `||=`). Word boundaries are enforced so identifiers like `interfaceName` are not mis-tokenized as keywords. The new `TypeScriptDetector` scores ES imports/exports, `type` / `interface` / `enum` / `namespace` / `declare`, `const` / `let` bindings, arrow functions, optional chaining, nullish coalescing, template literals, type annotations, `async`, decorators and generics; it carries explicit negative signals (`package …;`, `System.out.…`) to avoid misdetecting Java code, and is ReDoS-resistant (50 000-character adversarial inputs complete in < 100 ms). Aliases `ts` and `tsx` resolve to TypeScript in both the language registry and the tokenizer; JSX-specific tags are not parsed as separate token types in this iteration and fall back to standard TypeScript tokenization.

### Security

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
