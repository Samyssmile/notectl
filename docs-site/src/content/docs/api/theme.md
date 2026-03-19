---
title: Theme
description: Theme types, built-in presets, factory functions, and CSS custom property generation.
---

The theme system provides type-safe color tokens for the editor UI. Themes are resolved to CSS custom properties and applied via constructable stylesheets.

## ThemePreset

```ts
type ThemePreset = 'light' | 'dark' | 'system';

const ThemePreset = {
  Light: 'light',
  Dark: 'dark',
  System: 'system',
} as const;
```

Use `'system'` to auto-detect from the user's `prefers-color-scheme` media query.

---

## Theme Interface

A complete, resolved theme:

```ts
interface Theme {
  readonly name: string;
  readonly primitives: ThemePrimitives;
  readonly toolbar?: Partial<ThemeToolbar>;
  readonly codeBlock?: Partial<ThemeCodeBlock>;
  readonly tooltip?: Partial<ThemeTooltip>;
}
```

---

## ThemePrimitives

Core color tokens used across the editor:

```ts
interface ThemePrimitives {
  readonly background: string;
  readonly foreground: string;
  readonly mutedForeground: string;
  readonly border: string;
  readonly borderFocus: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly primaryMuted: string;
  readonly surfaceRaised: string;
  readonly surfaceOverlay: string;
  readonly hoverBackground: string;
  readonly activeBackground: string;
  readonly danger: string;
  readonly dangerMuted: string;
  readonly success: string;
  readonly shadow: string;
  readonly focusRing: string;
}
```

| Token | CSS Variable | Description |
|-------|-------------|-------------|
| `background` | `--notectl-bg` | Editor canvas background |
| `foreground` | `--notectl-fg` | Primary text color |
| `mutedForeground` | `--notectl-fg-muted` | Secondary/muted text |
| `border` | `--notectl-border` | Default border color |
| `borderFocus` | `--notectl-border-focus` | Focused element border |
| `primary` | `--notectl-primary` | Accent/primary color |
| `primaryForeground` | `--notectl-primary-fg` | Text on primary background |
| `primaryMuted` | `--notectl-primary-muted` | Muted primary (selection, highlights) |
| `surfaceRaised` | `--notectl-surface-raised` | Elevated surface (toolbar, panels) |
| `surfaceOverlay` | `--notectl-surface-overlay` | Overlay surface (dropdowns, dialogs) |
| `hoverBackground` | `--notectl-hover-bg` | Hover state background |
| `activeBackground` | `--notectl-active-bg` | Active/pressed state background |
| `danger` | `--notectl-danger` | Error/danger color |
| `dangerMuted` | `--notectl-danger-muted` | Muted danger (error backgrounds) |
| `success` | `--notectl-success` | Success indicator |
| `shadow` | `--notectl-shadow` | Box shadow color |
| `focusRing` | `--notectl-focus-ring` | Focus ring color |

---

## Component Overrides

Optional component-specific tokens that fall back to primitives when unset.

### ThemeToolbar

```ts
interface ThemeToolbar {
  readonly background: string;   // fallback: --notectl-surface-raised
  readonly borderColor: string;  // fallback: --notectl-border
}
```

| CSS Variable | Fallback |
|-------------|----------|
| `--notectl-toolbar-bg` | `var(--notectl-surface-raised)` |
| `--notectl-toolbar-border` | `var(--notectl-border)` |

### ThemeCodeBlock

```ts
interface ThemeCodeBlock {
  readonly background: string;        // fallback: --notectl-surface-raised
  readonly foreground: string;         // fallback: --notectl-fg
  readonly headerBackground: string;   // fallback: --notectl-surface-raised
  readonly headerForeground: string;   // fallback: --notectl-fg-muted
  readonly headerBorder: string;       // fallback: --notectl-border
  readonly syntax?: ThemeSyntax;
}
```

### ThemeSyntax

Syntax highlighting styles for all 16 canonical token types. Each value is a `TokenStyleValue` — either a plain color string or a `TokenStyle` object with optional font weight and style overrides:

```ts
/** Per-token style: color plus optional font weight and style. */
interface TokenStyle {
  readonly color: string;
  readonly fontWeight?: 'normal' | 'bold';
  readonly fontStyle?: 'normal' | 'italic';
}

/** A token style value is either a plain color string or a full TokenStyle object. */
type TokenStyleValue = string | TokenStyle;

/** Syntax highlighting token styles — one entry per canonical token type. */
type ThemeSyntax = { readonly [K in SyntaxTokenType]: TokenStyleValue };
```

The 16 supported `SyntaxTokenType` values are exported as the `SYNTAX_TOKEN_TYPES` tuple:

```ts
const SYNTAX_TOKEN_TYPES = [
  'keyword', 'string', 'comment', 'number', 'function',
  'operator', 'punctuation', 'boolean', 'null', 'property',
  'type', 'annotation', 'tag', 'attribute', 'constant', 'regex',
] as const;
```

| CSS Variable | Fallback |
|-------------|----------|
| `--notectl-code-block-bg` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-color` | `var(--notectl-fg)` |
| `--notectl-code-block-header-bg` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-header-color` | `var(--notectl-fg-muted)` |
| `--notectl-code-block-header-border` | `var(--notectl-border)` |

### ThemeSyntax CSS Variables

The theme engine auto-generates CSS variables for every entry in `SYNTAX_TOKEN_TYPES`. When a token is not explicitly set, it falls back to `--notectl-code-block-color`. When a `TokenStyle` object is used, additional `font-style` and `font-weight` variables are emitted only when those fields are set.

| CSS Variable | Token | Fallback |
|-------------|-------|----------|
| `--notectl-code-token-keyword` | `keyword` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-string` | `string` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-comment` | `comment` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-number` | `number` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-function` | `function` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-operator` | `operator` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-punctuation` | `punctuation` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-boolean` | `boolean` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-null` | `null` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-property` | `property` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-type` | `type` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-annotation` | `annotation` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-tag` | `tag` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-attribute` | `attribute` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-constant` | `constant` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-regex` | `regex` | `var(--notectl-code-block-color)` |

For each token that uses a `TokenStyle` object, two additional variables are conditionally emitted:

| CSS Variable pattern | Emitted when |
|---------------------|--------------|
| `--notectl-code-token-<type>-font-style` | `TokenStyle.fontStyle` is set |
| `--notectl-code-token-<type>-font-weight` | `TokenStyle.fontWeight` is set |

For example, the built-in light theme defines `comment` as `{ color: '#6a737d', fontStyle: 'italic' }`, which emits both `--notectl-code-token-comment: #6a737d` and `--notectl-code-token-comment-font-style: italic`.

### ThemeTooltip

```ts
interface ThemeTooltip {
  readonly background: string;   // fallback: --notectl-fg
  readonly foreground: string;   // fallback: --notectl-bg
}
```

| CSS Variable | Fallback |
|-------------|----------|
| `--notectl-tooltip-bg` | `var(--notectl-fg)` |
| `--notectl-tooltip-fg` | `var(--notectl-bg)` |

---

## PartialTheme

Used with `createTheme()` to override specific tokens:

```ts
interface PartialTheme {
  readonly name: string;
  readonly primitives?: Partial<ThemePrimitives>;
  readonly toolbar?: Partial<ThemeToolbar>;
  readonly codeBlock?: Partial<Omit<ThemeCodeBlock, 'syntax'>> & { readonly syntax?: Partial<ThemeSyntax> };
  readonly tooltip?: Partial<ThemeTooltip>;
}
```

---

## Built-in Themes

### `LIGHT_THEME`

Default light theme with white background and blue accent:

```ts
import { LIGHT_THEME } from '@notectl/core';
// background: '#ffffff', primary: '#4a90d9', ...
```

### `DARK_THEME`

Dark theme inspired by Catppuccin Mocha:

```ts
import { DARK_THEME } from '@notectl/core';
// background: '#1e1e2e', primary: '#89b4fa', ...
```

---

## Factory Functions

### `createTheme(base, overrides)`

Creates a new theme by merging overrides into a base theme:

```ts
import { createTheme, LIGHT_THEME } from '@notectl/core';

const custom = createTheme(LIGHT_THEME, {
  name: 'corporate',
  primitives: {
    primary: '#0052cc',
    primaryForeground: '#003380',
  },
});
```

All unspecified tokens inherit from the base theme.

### `resolveTheme(theme)`

Resolves a `ThemePreset` string or `Theme` object to a full `Theme`:

```ts
import { resolveTheme } from '@notectl/core';

const theme = resolveTheme('dark');     // returns DARK_THEME
const same = resolveTheme(DARK_THEME);  // returns the same object
```

- `'light'` resolves to `LIGHT_THEME`
- `'dark'` resolves to `DARK_THEME`
- `'system'` defaults to `LIGHT_THEME` (the editor component handles `prefers-color-scheme` detection externally)
- A `Theme` object is returned as-is

---

## CSS Generation

### `generateThemeCSS(theme)`

Generates a CSS string containing all theme custom properties scoped to `:host`:

```ts
import { generateThemeCSS, LIGHT_THEME } from '@notectl/core';

const css = generateThemeCSS(LIGHT_THEME);
// :host { --notectl-bg: #ffffff; --notectl-fg: #1a1a1a; ... }
```

Component tokens that are not explicitly set use `var()` fallbacks to primitive tokens.

### `createThemeStyleSheet(theme)`

Creates a `CSSStyleSheet` from a theme, ready to be adopted by the shadow DOM:

```ts
import { createThemeStyleSheet, DARK_THEME } from '@notectl/core';

const sheet = createThemeStyleSheet(DARK_THEME);
shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
```

---

## CSS Variable Reference

The theme engine generates CSS custom properties for all theme tokens. The total count varies depending on which `TokenStyle` objects include `fontStyle` or `fontWeight` overrides.

**Primitives (17):**
`--notectl-bg`, `--notectl-fg`, `--notectl-fg-muted`, `--notectl-border`, `--notectl-border-focus`, `--notectl-primary`, `--notectl-primary-fg`, `--notectl-primary-muted`, `--notectl-surface-raised`, `--notectl-surface-overlay`, `--notectl-hover-bg`, `--notectl-active-bg`, `--notectl-danger`, `--notectl-danger-muted`, `--notectl-success`, `--notectl-shadow`, `--notectl-focus-ring`

**Toolbar (2):**
`--notectl-toolbar-bg`, `--notectl-toolbar-border`

**Code Block (5):**
`--notectl-code-block-bg`, `--notectl-code-block-color`, `--notectl-code-block-header-bg`, `--notectl-code-block-header-color`, `--notectl-code-block-header-border`

**Syntax Tokens — color (16):**
`--notectl-code-token-keyword`, `--notectl-code-token-string`, `--notectl-code-token-comment`, `--notectl-code-token-number`, `--notectl-code-token-function`, `--notectl-code-token-operator`, `--notectl-code-token-punctuation`, `--notectl-code-token-boolean`, `--notectl-code-token-null`, `--notectl-code-token-property`, `--notectl-code-token-type`, `--notectl-code-token-annotation`, `--notectl-code-token-tag`, `--notectl-code-token-attribute`, `--notectl-code-token-constant`, `--notectl-code-token-regex`

**Syntax Tokens — typography (conditional):**
For any token whose value is a `TokenStyle` object, additional variables are emitted when set: `--notectl-code-token-<type>-font-style`, `--notectl-code-token-<type>-font-weight`. The built-in themes emit these for `comment` (italic).

**Tooltip (2):**
`--notectl-tooltip-bg`, `--notectl-tooltip-fg`

---

## Related

- [Theming Guide](/notectl/guides/styling/) — practical guide to styling the editor
- [NotectlEditor](/notectl/api/editor/) — the `theme` configuration property
