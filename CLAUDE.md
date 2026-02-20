# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**notectl** is a rich text editor shipped as a Web Component. It is State of the  Art in terms of architecture and code quality, with a strict layered architecture, immutable data structures, a powerful plugin system, and comprehensive test coverage. The codebase is designed for maintainability, extensibility, and performance.
Beside of being a text editor, notectl bring all capabilites to be a IDE. So syntax highlighting, code formating are all in scope.

## Commands

```bash
# Build (all packages via turbo)
pnpm build

# Unit tests (vitest + happy-dom)
pnpm test                          # all tests
pnpm --filter @notectl/core test -- Document.test.ts   # single file
pnpm --filter @notectl/core test:watch                 # watch mode

# E2E tests (playwright, needs build first)
pnpm test:e2e                      # all e2e
pnpm test:e2e -- basic-editing     # single spec

# Lint & format (biome)
pnpm lint                          # check
pnpm lint:fix                      # auto-fix
pnpm format                        # format

# Type checking
pnpm typecheck
```

## Architecture

**notectl** is a rich text editor shipped as a Web Component (`<notectl-editor>`). Single package at `packages/core`.

### Data Flow

```
Input Event → InputHandler/KeyboardHandler
  → TransactionBuilder creates Transaction with Steps
  → PluginManager.dispatchWithMiddleware() (priority-ordered middleware chain)
  → EditorState.apply(tr) → new immutable EditorState
  → Reconciler patches DOM (block-level diffing)
  → SelectionSync updates cursor
  → Plugins notified via onStateChange()
```

### Layer Separation

- **`model/`** — Immutable data types (`Document`, `BlockNode`, `TextNode`, `Mark`, `Selection`, `Schema`). All deeply `readonly`. Mutations always create new instances.
- **`state/`** — `EditorState` (immutable container), `Transaction` (atomic step-based changes), `StepApplication` (pure functions), `History` (undo/redo grouping via transaction inversion).
- **`view/`** — `EditorView` (orchestrates dispatch, reconciliation, input), `Reconciler` (block-level DOM diffing), `SelectionSync`, `NodeView` interface.
- **`input/`** — `InputHandler` (beforeinput → commands), `KeyboardHandler` (keymap dispatch), `PasteHandler`, `InputRule` (pattern-based transforms like `# ` → heading).
- **`commands/`** — High-level commands (`toggleMark`, `insertText`, `splitBlock`, `deleteBackward`).
- **`plugins/`** — Plugin system + all feature plugins. Each plugin folder: implementation + co-located tests.
- **`editor/`** — `NotectlEditor` Web Component (public API, DOM setup).

### Plugin System

All editor features are plugins. Plugins register capabilities during `init(context: PluginContext)`:
- `registerNodeSpec()` / `registerMarkSpec()` — schema extensions
- `registerCommand()` / `registerKeymap()` — commands and shortcuts
- `registerInputRule()` — pattern-based text transforms
- `registerToolbarItem()` — toolbar UI
- `registerMiddleware()` — transaction middleware
- `registerService()` — typed services via `ServiceKey<T>`

Plugins never access core internals directly — everything goes through `PluginContext`.

### Transaction System

Changes are expressed as **Steps** (`InsertTextStep`, `DeleteTextStep`, `SplitBlockStep`, `MergeBlocksStep`, `AddMarkStep`, `RemoveMarkStep`, `SetBlockTypeStep`, etc.). Every step stores enough data to be inverted for undo. Built via `state.transaction('input').insertText(...).build()`.

## Code Style

Enforced via `biome.json` and `code-style-requirements.md`:

- **TypeScript strict mode** — no `any` (biome error), no `console.log` (biome error), `readonly` everywhere
- **Tabs**, single quotes, semicolons, max 100 chars/line
- **Explicit types** on all variables, parameters, return values, properties
- **`import type`** for type-only imports
- **Files max ~500 lines**, small single-responsibility functions, early returns over nesting
- **Naming**: files=PascalCase, interfaces=PascalCase (no `I` prefix), functions=camelCase, constants=UPPER_SNAKE_CASE, plugin folders=kebab-case
- **Tests** co-located (`Foo.ts` + `Foo.test.ts`), Arrange-Act-Assert, test public API not internals
- **Commits**: conventional (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)

## Clean Code Principles
The Code follows always follow clean code principles, such as:
- SOLID
- DRY
- TESTABILITY
- SEPARATION OF CONCERNS
- Always avoid big classes/files. If something is getting too big or complex, it's a sign that it should be refactored into smaller, more focused modules or functions.

## Accessibility
- All interactive elements must be keyboard accessible (tab order, ARIA roles/labels)
- All new Plugins/Features must be accessible by default, with no extra configuration needed
- 
## Key Constraints

- DOM manipulation only in `view/` — model and state are DOM-free
- Business logic belongs in `state/` or `model/`, not in plugins
- No circular imports between layers
- `NodeSpec.toDOM()` must set `data-block-id` on the root element
- Reconciler works at block granularity — text rendering rebuilds inline content fully

## Writing Tests

Test utilities live in `packages/core/src/test/`. Use them to reduce boilerplate.

### State Creation — `stateBuilder()`

Use `stateBuilder()` instead of manual `createDocument` + `EditorState.create`:

```typescript
import { stateBuilder } from '../../test/TestUtils.js';

// Collapsed cursor
const state = stateBuilder()
  .paragraph('Hello', 'b1')
  .cursor('b1', 3)
  .schema(['paragraph'], ['bold', 'italic'])
  .build();

// Range selection
const state = stateBuilder()
  .paragraph('Hello', 'b1')
  .selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
  .schema(['paragraph'], ['bold'])
  .build();

// Custom block types
const state = stateBuilder()
  .block('list_item', 'item text', 'b1', { attrs: { listType: 'bullet', indent: 0 } })
  .cursor('b1', 0)
  .schema(['paragraph', 'list_item'], ['bold'])
  .build();
```

**Important**: `stateBuilder().schema([...]).build()` creates zero blocks. Always add at least one block. Include all required mark/node types in `.schema()`.

### Plugin Tests — `pluginHarness()`

Use `pluginHarness()` for plugin test setup. Access everything via the `h.` harness object:

```typescript
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';

const state = stateBuilder().paragraph('hello', 'b1').cursor('b1', 0).build();
const h = await pluginHarness(new MyPlugin(), state);

h.getMarkSpec('bold');           // MarkSpec | undefined
h.getNodeSpec('heading');        // NodeSpec | undefined
h.getToolbarItem('bold');        // ToolbarItem | undefined
h.executeCommand('toggleBold');  // boolean
h.getKeymaps();                  // KeymapEntry[]
h.getInputRules();               // InputRule[]
h.getState();                    // current EditorState
h.dispatch;                      // vi.fn() spy
```

### Assertion Helpers — `PluginTestUtils.ts`

Use assertion helpers for common plugin checks:

```typescript
import {
  expectMarkSpec, expectToolbarItem, expectToolbarActive,
  expectKeyBinding, expectCommandRegistered, expectCommandDispatches,
} from '../../test/PluginTestUtils.js';

expectMarkSpec(h, 'bold', { tag: 'STRONG', rank: 1 });
expectToolbarItem(h, 'bold', { group: 'format', label: 'Bold', command: 'toggleBold' });
expectToolbarActive(h, 'bold', true);
expectKeyBinding(h, 'Mod-b');
expectCommandRegistered(h, 'toggleBold');
expectCommandDispatches(h, 'toggleBold');
```

### When NOT to use these utilities

Low-level tests for `model/`, `state/`, and `view/` layers should create state directly — they test primitives and need explicit control over data structures.

## Code Changes
After code changes, always run unit tests, e2e tests and biom linting.
After writing new features or fixing bugs, please add tests to cover the new code paths. Aim for high coverage, but prioritize meaningful tests over 100% coverage.
Never do bad workarounds or hacks. If something is hard to implement, it's likely a sign of a design issue. Refactor the architecture or data structures as needed to support the feature cleanly.



## Git
- git commit messages  should follow conventional commits format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, etc.