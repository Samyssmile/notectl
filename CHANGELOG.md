# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
