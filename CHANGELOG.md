# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
