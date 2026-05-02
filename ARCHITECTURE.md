# notectl Architecture Guide

This document is the authoritative onboarding reference for architecture decisions in the `notectl` monorepo.

Goal: New features should be implemented without layer violations, without bundle regressions, and without i18n/CSP breakage.

## 1. Architecture Principles (non-negotiable)

1. **State-first, not DOM-first**
   Every content change goes through `Transaction` + `EditorState.apply()`, never through direct DOM manipulation as data source.

2. **Immutability by default**
   `model/` and `state/` are immutable. No in-place mutation of `Document`, `Selection`, or `EditorState`.

3. **Unidirectional data flow**
   Input -> Transaction -> Middleware -> State -> Reconciler -> SelectionSync -> Plugin callbacks.

4. **Strict layer boundaries**
   Dependencies flow downward. Higher layers must not deviate from the lower layer design rules (see Layer Matrix).

5. **Plugin lifecycle and registration exclusively via `PluginContext`**
   Direct imports from `model/`, `state/`, `commands/`, `decorations/`, and `platform/` are permitted for types, pure utilities, and command factories. No coupling to internal editor instances or private fields.

6. **CSP-first styling**
   Prefer `StyleRuntime` and `registerStyleSheet()` for plugin CSS. For dynamic per-node styles in `toDOM()`, use `ctx.styleAttr()` to ensure CSS-class-mode compatibility.

7. **Security by sanitization**
   Always sanitize HTML import/export (DOMPurify + schema-derived allowlist).

8. **Preserve tree-shakeability**
   Do not undermine subpath exports and modular entry points (no unnecessary imports from `full`).

## 2. Layer Model

```text
editor/           -> Web Component API + orchestration
plugins/          -> Feature modules
commands/input/   -> High-level operations, input processing
view/             -> DOM reconciliation, selection sync
decorations/      -> Transient view annotations (inline, node, widget decorations)
state/            -> Transactions, undo/redo, immutable state
serialization/    -> HTML import/export (DocumentSerializer, DocumentParser, CSSClassCollector)
style/            -> CSP-safe runtime styling (StyleRuntime, styleAttr)
i18n/             -> Locale service and resolution
model/            -> Document model, schema, selections
platform/         -> Browser & platform detection utilities
```

### Layer Responsibilities

- **`model/`** — Immutable data types (`Document`, `BlockNode`, `TextNode`, `InlineNode`, `Mark`, `Selection`, `Schema`, `SchemaRegistry`), registries (`InputRuleRegistry`, `KeymapRegistry`, `FileHandlerRegistry`), handler signatures (`InputRule`), and typed nominal keys (`TypedKeys.ts` — canonical home for `ServiceKey<T>` / `EventKey<T>` so any layer can construct typed DI keys without depending on `plugins/`). All deeply `readonly`. Mutations always create new instances.
- **`state/`** — `EditorState` (immutable container), `Transaction` (atomic step-based changes), `StepApplication` (pure functions), `History` (undo/redo grouping via transaction inversion).
- **`decorations/`** — Transient view annotations that do not modify the document model. Three types: `InlineDecoration` (text range styling), `NodeDecoration` (whole-block styling), `WidgetDecoration` (injected DOM elements). Managed via `DecorationSet` with position mapping through transactions.
- **`platform/`** — Pure utility functions for browser and OS detection: `isMac()`, `isFirefox()`, `isWebKit()`, `getTextDirection()`, `isRtlContext()`. No dependencies on other layers. Results are cached after first call.
- **`serialization/`** — HTML import/export. `DocumentSerializer` produces sanitized HTML (inline-style or CSS-class mode). `DocumentParser` parses sanitized HTML back into `Document` using schema parse rules. `CSSClassCollector` generates deterministic class names (FNV-1a hash) for the CSS-class export mode.
- **`style/`** — `StyleRuntime` for CSP-safe adopted stylesheets and token-based styling. `styleAttr()` for inline-to-class-mode compatibility in `toDOM()`.
- **`i18n/`** — `LocaleService` (global service), locale types, browser-locale resolution. Registered before plugin init.
- **`view/`** — `EditorView` (orchestrates dispatch, reconciliation, input), `Reconciler` (block-level DOM diffing with decoration support), `SelectionSync`, `NodeView` interface.
- **`input/`** — `InputHandler` (beforeinput -> commands), `KeyboardHandler` (keymap dispatch), `PasteHandler`, `ClipboardHandler`, `CompositionTracker` (IME handling).
- **`commands/`** — High-level editing commands (`toggleMark`, `insertText`, `splitBlock`, `deleteBackward`, `deleteWordForward`, etc.).
- **`plugins/`** — Plugin system + all feature plugins. Each plugin folder contains implementation + co-located tests.
- **`editor/`** — `NotectlEditor` Web Component (public API, DOM setup, composition root).

## 3. Allowed Dependencies (Guardrail)

| Layer | Responsibility | May import | Must NOT import |
|---|---|---|---|
| `model/` | Data model, types, specs | other `model/*` ¹ | `state/`, `view/`, `input/`, `plugins/`, `editor/` |
| `platform/` | Browser/OS detection | — (no dependencies) | everything else |
| `state/` | Transaction/History/State | `model/*` | `view/`, `input/`, `plugins/`, `editor/` |
| `decorations/` | View annotations | `model/*`, `state/*` | `view/`, `input/`, `plugins/`, `editor/` |
| `serialization/` | HTML import/export | `model/*` | `state/`, `view/`, `input/`, `plugins/`, `editor/` |
| `style/` | CSP-safe styling | `model/*` (types only) | `state/`, `view/`, `plugins/`, `editor/` |
| `i18n/` | Locale resolution | — (no runtime deps) | `state/`, `view/`, `plugins/`, `editor/` |
| `commands/` | Editing operations | `model/*`, `state/*` | `editor/*` |
| `input/` | Browser input -> commands | `commands/*`, `model/*`, `state/*`, `serialization/*` (clipboard) | `editor/*` internals |
| `view/` | DOM rendering + SelectionSync | `model/*`, `state/*`, `decorations/*` | `editor/*` internals |
| `plugins/` | Features via `PluginContext` | `commands/*`, `model/*`, `state/*`, `view/*` (targeted), `decorations/*`, `platform/*`, `i18n/*`, `editor/styles/*` | direct use of private editor fields |
| `editor/` | Composition root (`NotectlEditor`) | all lower layers | cyclic back-references into deep layers |

¹ `model/` files may use `import type` from `state/` for handler signatures (e.g. `EditorState`, `Transaction` in `InputRule`). These are type-only imports with zero runtime coupling.

Rule: If a feature can work without the DOM, it does not belong in `view/`.

## 4. Data Flow Reference

1. Browser event (`beforeinput`, `keydown`, paste, drop)
2. `InputHandler` / `KeyboardHandler` / `PasteHandler`
3. Command builds `Transaction` (via `state.transaction(origin)`)
4. `PluginManager.dispatchWithMiddleware()`
5. `EditorState.apply(transaction)` produces new immutable state
6. `Plugin.decorations?(state, tr)` — plugins produce transient decoration sets
7. `Reconciler` patches DOM at block granularity (with decoration diffing)
8. `SelectionSync` synchronizes browser selection
9. `PluginManager.notifyStateChange(...)` — plugins notified via `onStateChange()`

Readonly guard:
- Mutating transactions are blocked in readonly mode, unless explicitly allowed (`readonlyAllowed`).

## 5. Core Systems

### 5.1 Model + State

- `SchemaRegistry` is the single source of truth for registered Node/Mark/Inline specs, including parse rules (sorted by priority) and sanitization config.
- `EditorState` remains immutable; caches (`_blockMap`, `_blockOrder`) are internal and derived only.
- Every new step type must be invertible (`invertStep`) or be explicitly documented as exempt.
- 14 step types: `InsertTextStep`, `DeleteTextStep`, `SplitBlockStep`, `MergeBlocksStep`, `AddMarkStep`, `RemoveMarkStep`, `SetStoredMarksStep`, `SetBlockTypeStep`, `InsertNodeStep`, `RemoveNodeStep`, `SetNodeAttrStep`, `InsertInlineNodeStep`, `RemoveInlineNodeStep`, `SetInlineNodeAttrStep`.
- Transaction origins: `'input'`, `'paste'`, `'command'`, `'history'`, `'api'`.

### 5.2 Decorations

- Three decoration types: `InlineDecoration` (text range), `NodeDecoration` (whole block), `WidgetDecoration` (injected DOM element at a position).
- `DecorationSet` is the container: supports `create()`, `add()`, `remove()`, `merge()`, `map(tr)` (position mapping through transaction steps).
- Plugins produce decorations via `Plugin.decorations?(state, tr?) => DecorationSet`, called after `state.apply()` but before DOM reconciliation.
- The `Reconciler` applies inline/node/widget decorations during block rendering and diffs old vs. new decoration sets for efficient updates.

### 5.3 View + Input

- `EditorView` orchestrates the update cycle, history, and reconciliation.
- `InputManager` encapsulates the input handler lifecycle. New input handlers are integrated there, not ad-hoc in `NotectlEditor`.
- `Reconciler` works at block granularity: builds a block map from `data-block-id` elements, diffs changed blocks (including decoration changes), delegates to `NodeView.update()` where possible, and falls back to full `renderBlock()` replacement. List items are unwrapped before reconciliation and re-wrapped after.
- `InputHandler` maps `beforeinput` event types to commands and checks `InputRuleRegistry` after text insertion.
- `KeyboardHandler` processes keydown events with priority: NodeSelection navigation -> plugin keymaps -> built-in shortcuts (undo/redo/selectAll) -> GapCursor navigation.
- IME composition is handled natively — both handlers pass through to the browser during active composition.

### 5.4 Serialization

- `DocumentSerializer.serializeDocumentToHTML()` produces DOMPurify-sanitized HTML with inline styles.
- `DocumentSerializer.serializeDocumentToCSS()` produces `{ html, css, styleMap }` with deterministic CSS class names (via `CSSClassCollector`).
- `DocumentParser.parseHTMLToDocument()` sanitizes input first, then walks the DOM using block/mark/inline parse rules from the `SchemaRegistry`. Handles lists, tables, headings, blockquotes, code blocks, images, and horizontal rules. Falls back to paragraph for unknown elements.
- Round-trip fidelity: the class-mode `styleMap` can be passed back to `parseHTMLToDocument()` for lossless import.

### 5.5 Editor Shell (`NotectlEditor`)

- `NotectlEditor` is the composition root.
- Initialization order is fixed:
  1. Theme/Styles
  2. DOM
  3. `PluginManager` + global services (`LocaleService`)
  4. Built-in specs
  5. Toolbar processing / plugin registration
  6. Plugin `init()`
  7. Schema -> `EditorState` -> `EditorView`
  8. Plugin `onReady()`
- `registerPlugin()` only before `init()`.

## 6. Plugin System Best Practices

### 6.1 Lifecycle

- Required: `id`, `name`, `init(context)`.
- Optional: `priority`, `destroy`, `onReady`, `onStateChange`, `onConfigure`, `decorations`, `onReadOnlyChange`, `dependencies`.
- `priority?: number` — execution priority; lower values run first.
- Declare dependencies via `dependencies: string[]`, do not rely on implicit ordering.

### 6.2 Registration Rules

Use only `PluginContext` APIs. The full surface, grouped by category:

**State & Dispatch**
- `getState()` — current `EditorState`
- `dispatch(transaction)` — dispatch through middleware chain

**DOM Access**
- `getContainer()` — editor's root element
- `getPluginContainer(position: 'top' | 'bottom')` — positioned plugin container

**Command System**
- `registerCommand(name, handler, options?)` — register a named command (`options.readonlyAllowed` for readonly-safe commands)
- `executeCommand(name)` — execute a registered command by name

**Event System**
- `getEventBus()` — returns `PluginEventBus` for `emit`/`on`/`off` with typed `EventKey<T>`

**Middleware**
- `registerMiddleware(middleware, options?)` — intercept transactions (`options.name`, `options.priority`)

**Services**
- `registerService<T>(key: ServiceKey<T>, service)` — register a typed service
- `getService<T>(key: ServiceKey<T>)` — retrieve a typed service

**Config**
- `updateConfig(config)` — update plugin configuration at runtime

**Schema Extension**
- `registerNodeSpec(spec)` — register a block node type
- `registerMarkSpec(spec)` — register an inline mark type
- `registerInlineNodeSpec(spec)` — register an atomic inline node type
- `registerNodeView(type, factory)` — register a custom `NodeView` for a block type

**Input & Keymap**
- `registerKeymap(keymap, options?)` — register keyboard shortcuts
- `registerInputRule(rule)` — register a pattern-based text transform
- `registerFileHandler(pattern, handler)` — register a file drop/paste handler
- `registerPasteInterceptor(interceptor, options?)` — register a paste interceptor with priority

**UI**
- `registerToolbarItem(item)` — register a toolbar button/dropdown
- `registerBlockTypePickerEntry(entry)` — register a block type picker option

**Styling**
- `registerStyleSheet(css)` — inject plugin CSS (CSP-safe via `StyleRuntime`)

**Registry Access**
- `getSchemaRegistry()` — access `SchemaRegistry` for spec lookups
- `getKeymapRegistry()` — access registered keymaps
- `getInputRuleRegistry()` — access registered input rules
- `getFileHandlerRegistry()` — access registered file handlers
- `getNodeViewRegistry()` — access registered node views
- `getToolbarRegistry()` — access registered toolbar items
- `getBlockTypePickerRegistry()` — access registered block type picker entries

**Accessibility & State**
- `isReadOnly()` — check readonly state
- `announce(text)` — announce text to screen readers via live region
- `hasAnnouncement()` — check if an announcement is pending

### 6.3 Teardown & Error Isolation

- Everything registered via `PluginContext` is automatically cleaned up by `PluginManager`.
- `destroy()` is only for own resources (timers, observers, DOM outside context registries, external services).
- Plugin errors must not crash the editor; `PluginManager` isolates errors per plugin.

### 6.4 Toolbar Integration

- When using `NotectlEditorConfig.toolbar`, `ToolbarPlugin` is created internally.
- Do **not** additionally register a `ToolbarPlugin` manually in `plugins`.

### 6.5 Readonly Behavior

- Commands are not readonly-capable by default.
- Only explicitly allowed commands should be marked with `readonlyAllowed`.
- Mutating plugin logic should additionally guard with `context.isReadOnly()`.

### 6.6 Accessibility

- Toolbar/popups must be keyboard-navigable (roving tabindex, Esc/Arrow patterns).
- Use ARIA labels and announcements via `context.announce()`.

### 6.7 Registry Patching (Advanced)

Plugins may patch existing NodeSpecs via `getSchemaRegistry()` (e.g., AlignmentPlugin wraps `toDOM()` to inject alignment styles). Use sparingly — prefer composition over mutation. Always re-register the full spec via `removeNodeSpec()` + `registerNodeSpec()`.

## 7. i18n Best Practices

### 7.1 Global Model

- Editor locale is set globally via `NotectlEditorConfig.locale`.
- `LocaleService` is registered as a global service before plugin init.
- Default is `browser` (`navigator.language`-based), fallback English.

Current locale keys:
`en`, `de`, `es`, `fr`, `zh`, `ru`, `ar`, `hi`, `pt`, `browser`.

### 7.2 Plugin Locale Resolution (Pattern)

In every localizable plugin, the following priority applies:
1. Explicit `config.locale`
2. `LocaleServiceKey` (`context.getService(...)`)
3. English fallback

### 7.3 File Structure for Localized Plugins

Recommended layout:

```text
plugins/<plugin>/
  <Plugin>Locale.ts
  locales/
    de.ts
    es.ts
    ...
```

`<Plugin>Locale.ts` should contain:
- `interface <Plugin>Locale`
- `const <PLUGIN>_LOCALE_EN`
- `load<Plugin>Locale(lang)` with `import.meta.glob('./locales/*.ts')`
- Robust fallback to EN on missing/broken locale

### 7.4 i18n Do/Don't

Do:
- Localize all UI strings and ARIA texts.
- Model dynamic texts as functions in the locale interface (e.g., `tooltip(shortcut)`).

Don't:
- Scatter hard-coded string literals in the plugin flow.
- Synchronously import all locales on the main path (bundle bloat).

## 8. Bundle System Best Practices

The bundle system is based on modular entry points + subpath exports.

### 8.1 Public Entry Points (`@notectl/core`)

- `.` -> `notectl-core.mjs` (Core API)
- `./full` -> Kitchen sink + UMD bridge
- `./html` -> Parser/Serializer separately
- `./presets`, `./presets/minimal`, `./presets/full`
- `./fonts` -> Large font data separated
- `./plugins/<name>` -> Per-plugin tree-shakeable entry

### 8.2 Rules for Tree-Shakeable Changes

- No unnecessary imports of heavy modules in `src/index.ts`.
- Use async `import()` for infrequent paths (e.g., HTML serializer/parser, auto-registration).
- Place cross-plugin helpers in dedicated modules (`plugins/shared`), do not duplicate.
- Consumers should primarily use subpath imports (`@notectl/core/plugins/...`, `@notectl/core/presets/...`).

### 8.3 Mandatory Checklist for Adding a New Plugin

1. Create plugin folder + `index.ts`.
2. Add to Vite multi-entry (`packages/core/vite.config.ts`, `pluginEntries`).
3. Add `exports` in `packages/core/package.json` (`./plugins/<name>`).
4. If desired in kitchen sink: add export in `packages/core/src/full.ts`.
5. If desired in full preset: update `FullPreset.ts` + `PresetTypes.ts`.
6. Update bundle limits (`size-limit` entry in `packages/core/package.json`).
7. Add docs/examples (docs-site, examples if applicable).

### 8.4 Barrel and Deep Import Rules

- Do not consume internal modules via deep imports when a public barrel/subpath exists.
- Keep plugin-internal imports within the plugin module.
- Target: stable import boundaries so that refactors do not cause external breaks.

## 9. CSP, Styling, and HTML Export

- Runtime styling via `StyleRuntime` + token attributes (`data-notectl-style-token`), not via direct inline styles as the primary path.
- Plugin CSS via `context.registerStyleSheet(...)`.
- For `toHTML()` on style-based nodes, use `ctx.styleAttr(...)` so `cssMode: 'classes'` works correctly.
- Every new HTML structure must extend `sanitize.tags` and optionally `sanitize.attrs`, otherwise round-trip fidelity is lost.

### 9.1 Content Round-Trip Identity Contract

For every public format pair `(getX, setX)` in `NotectlEditor`, the round-trip
`setX(getX(state))` must preserve **block identity** — i.e. the `BlockId`s in
the resulting document match those of `state` for blocks whose textual content
is unchanged. This is what allows the caret-preserving `EditorView.replaceState()`
to keep the cursor on the right block when an external owner (Angular signal
form, RxJS pipe, …) round-trips the content on every keystroke (#103).

| Pair | Identity carrier |
|---|---|
| `getJSON` / `setJSON` | block IDs are part of the JSON shape |
| `getContentHTML` / `setContentHTML` | `data-block-id` attribute, emitted centrally by the serializer and adopted by the parser with format validation + uniqueness |
| `getText` / `setText` | `setText` reuses existing top-level block IDs in document order; new lines beyond the existing block count get fresh IDs |

Identity is best-effort, not guaranteed: when block content changes the block
may legitimately end up with a different `BlockId`. Identity matters only for
the no-op or content-equivalent case, which is the common case for form sync.

When adding a new (`getX`, `setX`) pair, document and uphold the same contract,
otherwise the caret will reset on round-trip.

## 10. Angular Integration Rules (`packages/angular`)

- The Angular package is an adapter layer, not a second editor engine.
- `NotectlEditorComponent` proxies the Web Component API; no duplication of core logic.
- Forms integration runs through `NotectlValueAccessorDirective`; content format via token (`json|html|text`).
- Core architecture rules apply unchanged when using Angular.

## 11. Common Architecture Violations

1. Direct DOM mutation as data source instead of Transaction.
2. Plugin accesses private editor fields or constructs EditorState/EditorView directly instead of using `PluginContext`.
3. New UI texts without locale fallback.
4. New plugin code only in `full.ts` but without a subpath export.
5. `toHTML()` with hard-coded `style="..."` instead of `ctx.styleAttr(...)`.
6. Missing `sanitize` allowlist extension for new tags/attrs.
7. Feature logic in `editor/` instead of plugin/state/command layers.

## 12. Architecture Review Checklist (PR Gate)

Before merge, all answers must be **Yes**:

1. Does every content change go through Transaction/State instead of direct DOM mutation?
2. Are layer dependencies respected per the matrix?
3. Does new plugin code exclusively use `PluginContext`?
4. Is i18n complete (EN default, lazy loader, fallback)?
5. Does the bundle remain tree-shakeable (subpath export, no unnecessary main-entry imports)?
6. Are serializer/parser/sanitize consistent for new nodes/marks?
7. Are readonly and accessibility cases addressed?
8. Are unit tests plus relevant E2E tests added?
