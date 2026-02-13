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

## Key Constraints

- DOM manipulation only in `view/` — model and state are DOM-free
- Business logic belongs in `state/` or `model/`, not in plugins
- No circular imports between layers
- `NodeSpec.toDOM()` must set `data-block-id` on the root element
- Reconciler works at block granularity — text rendering rebuilds inline content fully

## Code Changes
After code changes, always run unit tests, e2e tests and biom linting.
After writing new features or fixing bugs, please add tests to cover the new code paths. Aim for high coverage, but prioritize meaningful tests over 100% coverage.
Never do bad workarounds or hacks. If something is hard to implement, it's likely a sign of a design issue. Refactor the architecture or data structures as needed to support the feature cleanly.



## Git
- git commit messages  should follow conventional commits format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, etc.