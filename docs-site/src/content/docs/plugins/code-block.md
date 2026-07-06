---
title: Code Block Plugin
description: Fenced code blocks with syntax highlighting, auto-indent, bracket-pairing, language labels, copy button, and customizable theming.
---

The `CodeBlockPlugin` adds fenced code blocks with a non-editable header (language label + copy button), keyboard-driven indentation, auto-indent on Enter, bracket and quote pairing, Markdown input rules, and full color theming.

## Usage

```ts
import { CodeBlockPlugin } from '@notectl/core/plugins/code-block';

// Default (dark theme)
new CodeBlockPlugin()

// Light theme
new CodeBlockPlugin({
  background: '#f8f9fa',
  headerBackground: '#e9ecef',
  textColor: '#212529',
  headerColor: '#868e96',
})
```

## Configuration

```ts
interface CodeBlockConfig {
  /** Optional syntax highlighter implementation. */
  readonly highlighter?: SyntaxHighlighter;
  /** Default language when creating new code blocks. */
  readonly defaultLanguage?: string;
  /** @deprecated Use indent.useSpaces. Read as fallback when indent.useSpaces is unset. */
  readonly useSpaces?: boolean;
  /** @deprecated Use indent.spaceCount. Read as fallback when indent.spaceCount is unset. */
  readonly spaceCount?: number;
  /** Show the copy button in the header (default: true). */
  readonly showCopyButton?: boolean;
  /** Live Markdown shortcut ```` ``` ```` (optionally with a language) to start a code block. Default: true */
  readonly inputRule?: boolean;
  /** Body background color (overrides --notectl-code-block-bg). */
  readonly background?: string;
  /** Header background color (overrides --notectl-code-block-header-bg). */
  readonly headerBackground?: string;
  /** Code text color (overrides --notectl-code-block-color). */
  readonly textColor?: string;
  /** Header/label text color (overrides --notectl-code-block-header-color). */
  readonly headerColor?: string;
  /** Customize keyboard bindings for code block actions. */
  readonly keymap?: CodeBlockKeymap;
  /** Locale override for user-facing strings. */
  readonly locale?: CodeBlockLocale;
  /** Auto-indent settings. */
  readonly indent?: CodeBlockIndentConfig;
  /** Bracket-pairing settings. */
  readonly pairing?: CodeBlockPairingConfig;
}

interface CodeBlockIndentConfig {
  /** 'none' disables Enter-driven indent, 'keep' inherits only,
   *  'brackets' adds an extra step after `{`, `[`, `(`. Default 'brackets'. */
  readonly mode?: 'none' | 'keep' | 'brackets';
  /** Use spaces instead of a literal tab character. Default false. */
  readonly useSpaces?: boolean;
  /** Spaces per indent unit (clamped to [1, 16]). Default 2. */
  readonly spaceCount?: number;
}

interface CodeBlockPairingConfig {
  /** Auto-pair behavior for brackets. Default 'languageDefined'. */
  readonly brackets?: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
  /** Auto-pair behavior for quotes. Default 'languageDefined'. */
  readonly quotes?: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
  /** Skip-over for auto-inserted close chars. Default true. */
  readonly overtype?: boolean;
  /** Backspace removes leftover empty auto-pair. Default true. */
  readonly deletePair?: boolean;
  /** Wrap-selection scope. Default 'languageDefined' (= brackets + quotes). */
  readonly surround?: 'languageDefined' | 'quotes' | 'brackets' | 'never';
}

interface CodeBlockKeymap {
  /** Insert a paragraph below the code block. Default: 'Mod-Enter'. Set to null to disable. */
  readonly insertAfter?: string | null;
  /** Toggle between code block and paragraph. Default: 'Mod-Shift-M'. Set to null to disable. */
  readonly toggle?: string | null;
}
```

### Custom Keybindings

Override or disable the default code block shortcuts:

```ts
new CodeBlockPlugin({
  keymap: {
    insertAfter: 'Mod-Shift-Enter',  // override default Mod-Enter
    toggle: 'Mod-Shift-C',           // override default Mod-Shift-M
  },
})
```

Set a binding to `null` to disable it entirely:

```ts
new CodeBlockPlugin({
  keymap: {
    insertAfter: null,  // disable insert-after shortcut
    toggle: 'Mod-Shift-C',
  },
})
```

`Mod` resolves to Cmd on macOS and Ctrl on Windows/Linux.

## Auto-Indent

When the user presses Enter inside a code block, the new line automatically inherits the leading whitespace of the previous line. If the previous line ends with `{`, `[` or `(` (ignoring trailing whitespace), one extra indent unit is added. Pressing Enter directly between an open/close pair such as `{|}` expands the cursor onto its own indented line with the close char on a final line at the original indent depth.

Typing `}`, `]` or `)` on a whitespace-only line reduces the leading indent by one step before inserting the character.

| Setting | Values | Default | Effect |
|---|---|---|---|
| `indent.mode` | `'none' \| 'keep' \| 'brackets'` | `'brackets'` | `none` only inserts `\n`; `keep` inherits indent only; `brackets` adds extra step + dedents close chars. |
| `indent.useSpaces` | `boolean` | `false` | When `true`, indent unit is `N` spaces; otherwise a literal tab. |
| `indent.spaceCount` | `number` (clamped to `[1, 16]`) | `2` | Spaces per indent unit. |

```ts
new CodeBlockPlugin({
  indent: { mode: 'brackets', useSpaces: true, spaceCount: 4 },
});
```

The legacy top-level `useSpaces` / `spaceCount` fields still apply as a fallback for backwards compatibility, but the nested `indent.*` form takes precedence when both are set.

## Bracket-Pairing

The plugin auto-pairs `()`, `[]`, `{}`, `""`, `''`, and `` `` `` inside code blocks. Behavior is configurable per pair family and matches VS Code's defaults:

- **Auto-Pair** — typing an open char inserts the matching close char and keeps the cursor between them.
- **Overtype** — typing a close char that matches an auto-inserted next char skips over it instead of inserting a duplicate.
- **Wrap-Selection** — typing an open char with a range selection wraps the selection in the pair.
- **Pair-Delete** — Backspace between an empty auto-pair (`(|)`, `[|]`, …) removes both characters.
- **Quote-Suppression** — `'` directly after a word character (`don't`, `it's`) is not paired; quotes inside `string` or `comment` tokens are also suppressed when a syntax highlighter is active.

| Setting | Values | Default |
|---|---|---|
| `pairing.brackets` | `'always' \| 'languageDefined' \| 'beforeWhitespace' \| 'never'` | `'languageDefined'` |
| `pairing.quotes`   | `'always' \| 'languageDefined' \| 'beforeWhitespace' \| 'never'` | `'languageDefined'` |
| `pairing.overtype` | `boolean` | `true` |
| `pairing.deletePair` | `boolean` | `true` |
| `pairing.surround` | `'languageDefined' \| 'quotes' \| 'brackets' \| 'never'` | `'languageDefined'` |

```ts
new CodeBlockPlugin({
  pairing: {
    brackets: 'always',
    quotes: 'beforeWhitespace',
    overtype: true,
    deletePair: true,
    surround: 'brackets',
  },
});
```

The `languageDefined` mode reads the current syntax token at the cursor to decide whether to suppress quote-pairing (e.g. inside an existing string). Falls back to `always` if no highlighter is registered for the language.

## Theming

There are two ways to customize code block colors:

### Option 1: Plugin Config

Pass colors directly in the constructor. Best for fixed application themes.

```ts
new CodeBlockPlugin({
  background: '#f8f9fa',
  headerBackground: '#e9ecef',
  textColor: '#212529',
  headerColor: '#868e96',
})
```

### Option 2: CSS Custom Properties

Set CSS variables on the `<notectl-editor>` element. Best for dynamic theming (dark/light mode toggle, media queries).

```css
notectl-editor {
  --notectl-code-block-bg: #f8f9fa;
  --notectl-code-block-header-bg: #e9ecef;
  --notectl-code-block-color: #212529;
  --notectl-code-block-header-color: #868e96;
  --notectl-code-block-header-border: #dee2e6;
}
```

Or responsive with media queries:

```css
@media (prefers-color-scheme: light) {
  notectl-editor {
    --notectl-code-block-bg: #f8f9fa;
    --notectl-code-block-color: #212529;
    --notectl-code-block-header-bg: #e9ecef;
    --notectl-code-block-header-color: #868e96;
  }
}

@media (prefers-color-scheme: dark) {
  notectl-editor {
    --notectl-code-block-bg: #1e1e2e;
    --notectl-code-block-color: #cdd6f4;
    --notectl-code-block-header-bg: rgba(255, 255, 255, 0.06);
    --notectl-code-block-header-color: #7f849c;
  }
}
```

### Available CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--notectl-code-block-bg` | `#1e1e2e` | Body background |
| `--notectl-code-block-color` | `#cdd6f4` | Code text color |
| `--notectl-code-block-header-bg` | `rgba(255,255,255,0.06)` | Header background |
| `--notectl-code-block-header-color` | `#7f849c` | Header label and copy button color |
| `--notectl-code-block-header-border` | `rgba(255,255,255,0.08)` | Header bottom border |

### Priority

When both methods are used, plugin config wins because it sets inline CSS custom properties on each `<pre>` element:

1. CSS defaults in stylesheet (lowest)
2. External CSS custom properties on `notectl-editor`
3. Plugin config (highest)

### Shadow Parts

The code block exposes structural parts so consumers can target it via `::part()` without forking the plugin:

| Part | Element |
|---|---|
| `code-block` | `<pre>` root |
| `code-block-header` | Header row (language label + actions) |
| `code-block-content` | `<code>` inside |

```css
notectl-editor::part(code-block) { border-radius: 12px; }
notectl-editor::part(code-block-header) { letter-spacing: 0.05em; }
```

See the [Theming guide](/notectl/guides/styling/#shadow-parts) for the full part inventory across all components.

## Commands

| Command | Description | Returns |
|---------|-------------|---------|
| `toggleCodeBlock` | Toggle between paragraph and code block | `boolean` |
| `insertCodeBlock` | Convert the current block to a code block | `boolean` |
| `exitCodeBlock` | Exit the code block (same as Escape) | `boolean` |
| `deleteCodeBlock` | Delete the code block and move cursor to nearest block | `boolean` |
| `setCodeBlockLanguage` | Reserved — use the [Service API](#service-api) instead | `false` |
| `setCodeBlockBackground` | Reserved — use the [Service API](#service-api) instead | `false` |

```ts
editor.executeCommand('toggleCodeBlock');
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Toggle code block (configurable via `keymap.toggle`) |
| `Enter` | Insert newline within code block |
| `Enter` (twice, on empty last line) | Exit code block, create paragraph below |
| `Tab` | Insert indent (tab or spaces) |
| `Shift+Tab` | Remove indent from current line |
| `Ctrl+Enter` / `Cmd+Enter` | Insert paragraph below and move cursor there (configurable via `keymap.insertAfter`) |
| `Escape` | Exit code block to next block or new paragraph |
| `ArrowDown` (on last line) | Exit code block to next block or new paragraph |
| `ArrowUp` (on first line) | Exit to previous block |
| `ArrowRight` (at end) | Exit code block to next block |
| `ArrowLeft` (at start) | Exit code block to previous block |
| `Backspace` (at position 0) | Convert code block back to paragraph |

## Input Rules

| Pattern | Result |
|---------|--------|
| `` ``` `` + Space | Create empty code block |
| `` ```typescript `` + Space | Create code block with language set to "typescript" |

## Toolbar

The code block button appears in the **block** toolbar group with the `</>` icon. It shows as active when the cursor is inside a code block.

## Node Spec

| Type | HTML Tag | Attributes | Description |
|------|----------|-----------|-------------|
| `code_block` | `<pre><code>` | `language`, `backgroundColor` | Fenced code block |

## Service API

The plugin registers a typed service for programmatic access:

```ts
import { CODE_BLOCK_SERVICE_KEY } from '@notectl/core/plugins/code-block';

const service = context.getService(CODE_BLOCK_SERVICE_KEY);

service.setLanguage(blockId, 'python');
service.getLanguage(blockId);        // 'python'
service.setBackground(blockId, '#282c34');
service.getBackground(blockId);      // '#282c34'
service.isCodeBlock(blockId);        // true
service.getSupportedLanguages();     // ['typescript', 'python', ...]
```

## Syntax Highlighting

By default, the plugin ships with a built-in `RegexTokenizer` that supports **JSON**, **XML**, **Java**, and **TypeScript** syntax highlighting out of the box. You can extend it with additional languages or replace it entirely.

### Built-in Languages

JSON, XML, Java, and TypeScript are highlighted automatically when the code block language is set to `json`, `xml`, `java`, or `typescript` (the aliases `ts` and `tsx` resolve to TypeScript as well).

Each language maps source tokens to the canonical `SyntaxTokenType` set:

| Language | Notable token mappings |
|----------|----------------------|
| JSON | `keyword`, `string`, `number`, `boolean`, `null`, `punctuation` |
| XML | Tag names → `tag`, attribute names → `attribute`, string values → `string` |
| Java | Annotations (`@Override`, `@Component`) → `annotation`, types → `type`, keywords → `keyword` |
| TypeScript | Decorators (`@Component`) → `annotation`, template literals → `string`, modern operators (`??`, `?.`, `=>`) → `operator`, `null`/`undefined` → `null` |

The semantic distinction matters for theming: XML tag names use `--notectl-code-token-tag` (not `keyword`), Java/TypeScript annotations and decorators use `--notectl-code-token-annotation` (not `property`), so each construct can be styled independently in your theme.

> **Note on TSX:** The `tsx` alias maps to the TypeScript language definition. JSX-specific tags and attributes are not parsed as separate token types — they fall back to standard TypeScript tokenization.

### Adding Languages at Runtime

Use the `SYNTAX_HIGHLIGHTER_SERVICE_KEY` service to register additional language definitions without replacing the whole highlighter:

```ts
import { SYNTAX_HIGHLIGHTER_SERVICE_KEY } from '@notectl/core/plugins/code-block';

const highlighterService = editor.getService(SYNTAX_HIGHLIGHTER_SERVICE_KEY);
highlighterService.registerLanguage(myLanguageDefinition);
highlighterService.getSupportedLanguages(); // ['json', 'xml', ...]
```

### Custom Highlighter

Provide a full `SyntaxHighlighter` implementation to replace the built-in tokenizer:

```ts
import type { SyntaxTokenType } from '@notectl/core';

interface SyntaxHighlighter {
  tokenize(code: string, language: string): readonly SyntaxToken[];
  getSupportedLanguages(): readonly string[];
}

interface SyntaxToken {
  readonly from: number;
  readonly to: number;
  /**
   * Must be one of the 16 canonical SyntaxTokenType values.
   * The open string union `string & {}` is accepted for forward compatibility,
   * but unrecognized types will not receive theme-driven styling.
   */
  readonly type: SyntaxTokenType | (string & {});
}
```

The 16 valid `type` values are: `keyword`, `string`, `comment`, `number`, `function`, `operator`, `punctuation`, `boolean`, `null`, `property`, `type`, `annotation`, `tag`, `attribute`, `constant`, `regex`. These are exported as the `SYNTAX_TOKEN_TYPES` tuple from `@notectl/core`.

### Token Styling

The plugin generates a CSS class per token type — one class for each of the 16 canonical `SyntaxTokenType` values. Class names follow the pattern `notectl-token--<type>`. Token colors and typography are driven by CSS custom properties emitted by the theme engine, so in most cases you should customize tokens through the `ThemeSyntax` object in your theme rather than writing raw CSS.

Each token class reads from three CSS variables:

```css
.notectl-token--comment {
  color:       var(--notectl-code-token-comment);
  font-style:  var(--notectl-code-token-comment-font-style, normal);
  font-weight: var(--notectl-code-token-comment-font-weight, normal);
}
```

The `font-style` and `font-weight` variables are only emitted by the theme engine when the token's `TokenStyle` object includes those fields — they default to `normal` in the CSS fallback.

To override token styles directly in CSS without touching the theme:

```css
notectl-editor .notectl-token--keyword    { color: #c678dd; }
notectl-editor .notectl-token--string     { color: #98c379; }
notectl-editor .notectl-token--number     { color: #d19a66; }
notectl-editor .notectl-token--comment    { color: #5c6370; font-style: italic; }
notectl-editor .notectl-token--type       { color: #e5c07b; }
notectl-editor .notectl-token--annotation { color: #c678dd; }
notectl-editor .notectl-token--tag        { color: #e06c75; }
notectl-editor .notectl-token--attribute  { color: #d19a66; }
notectl-editor .notectl-token--constant   { color: #d19a66; }
notectl-editor .notectl-token--regex      { color: #98c379; }
```

The 16 token classes are:

| CSS Class | Token Type | Typical Use |
|-----------|-----------|-------------|
| `notectl-token--keyword` | `keyword` | Language keywords (`if`, `class`, `return`) |
| `notectl-token--string` | `string` | String literals |
| `notectl-token--comment` | `comment` | Line and block comments |
| `notectl-token--number` | `number` | Numeric literals |
| `notectl-token--function` | `function` | Function and method names |
| `notectl-token--operator` | `operator` | Operators (`+`, `===`, `=>`) |
| `notectl-token--punctuation` | `punctuation` | Brackets, semicolons, commas |
| `notectl-token--boolean` | `boolean` | `true`, `false` |
| `notectl-token--null` | `null` | `null`, `undefined`, `nil` |
| `notectl-token--property` | `property` | Object properties |
| `notectl-token--type` | `type` | Type names and annotations (TypeScript, Java) |
| `notectl-token--annotation` | `annotation` | Decorator/annotation syntax (`@Override`, `@Component`) |
| `notectl-token--tag` | `tag` | XML/HTML tag names |
| `notectl-token--attribute` | `attribute` | XML/HTML attribute names |
| `notectl-token--constant` | `constant` | Named constants (enum members, `MAX_SIZE`) |
| `notectl-token--regex` | `regex` | Regular expression literals |

## Mark Prevention

The plugin automatically prevents formatting marks (bold, italic, underline, etc.) from being applied inside code blocks via middleware.
