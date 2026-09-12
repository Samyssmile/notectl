# Coding Guidelines — notectl

## TypeScript

- **Strict mode** — `strict: true`, `noUncheckedIndexedAccess`, no `any` types
- **Immutability first** — `readonly` on properties, arrays and interfaces; mutations create new instances
- **`const` over `let`** — use `let` only when reassignment is unavoidable
- **Explicit return types** on exported functions and methods
- **Discriminated unions** instead of type casts or type guards that rely on `any`
- **Type-only imports** — `import type { ... }` when only types are imported
- **No `!` (non-null assertion)** — narrow the type or use optional chaining instead
- **Always use types** — type every variable, parameter, return value and property explicitly;
  no implicit `any` through missing annotations; prefer generic types
  (`Map<string, Block>` over untyped collections)

## Clean Code

- **Small files** — a file should have **max ~500 lines**; split it into smaller modules when it grows beyond that
- **Small functions** — every function does exactly one thing
- **Single responsibility** — one file = one topic / one class / one module
- **Meaningful names** — code should read like prose; no cryptic abbreviations
- **No deeply nested blocks** — early returns and guard clauses instead of nested `if/else`

## Architecture

- **SOLID** — every module has one clear responsibility
- **DRY** — extract duplication, but no premature abstraction (rule of three)
- **Immutable document model** — the document is a pure data tree; changes go exclusively through `Transaction`/`Step`
- **Plugin system** — implement new features as plugins instead of extending the core
- **Dependency injection** via `PluginContext` — plugins never access internals directly

## Naming

| Element        | Convention                  | Example                   |
| -------------- | --------------------------- | ------------------------- |
| Files          | PascalCase                  | `EditorState.ts`          |
| Interfaces     | PascalCase, no `I` prefix   | `Plugin`, `BlockNode`     |
| Types/Enums    | PascalCase                  | `NodeType`, `MarkType`    |
| Functions      | camelCase                   | `applyStep`, `findNode`   |
| Constants      | UPPER_SNAKE_CASE            | `MAX_HISTORY_SIZE`        |
| Tests          | `*.test.ts` next to the file | `Document.test.ts`       |
| Plugin folders | kebab-case                  | `text-color/`, `heading/` |

## Formatting (Biome)

- **Tabs** for indentation
- **Single quotes**, semicolons
- **Max 100 characters** per line
- Imports are sorted automatically
- `pnpm lint:fix` before every commit

## Tests (Vitest)

- Test files live next to the implementation (`Foo.ts` + `Foo.test.ts`)
- **Arrange-Act-Assert** structure
- Clear `describe`/`it` blocks — `it` describes expected behaviour, not implementation
- No mocked internals — tests work against the public API
- `pnpm test` must be green before every merge

## Git

- **Conventional Commits** — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
