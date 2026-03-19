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

Syntax highlighting color tokens for code blocks:

```ts
interface ThemeSyntax {
  readonly keyword: string;
  readonly string: string;
  readonly comment: string;
  readonly number: string;
  readonly function: string;
  readonly operator: string;
  readonly punctuation: string;
  readonly boolean: string;
  readonly null: string;
  readonly property: string;
}
```

| CSS Variable | Fallback |
|-------------|----------|
| `--notectl-code-block-bg` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-color` | `var(--notectl-fg)` |
| `--notectl-code-block-header-bg` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-header-color` | `var(--notectl-fg-muted)` |
| `--notectl-code-block-header-border` | `var(--notectl-border)` |

### ThemeSyntax CSS Variables

When syntax tokens are not explicitly set, they fall back to `--notectl-code-block-color`:

| CSS Variable | Fallback |
|-------------|----------|
| `--notectl-code-token-keyword` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-string` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-comment` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-number` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-function` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-operator` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-punctuation` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-boolean` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-null` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-property` | `var(--notectl-code-block-color)` |

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

All 36 CSS custom properties generated by the theme system:

**Primitives (17):**
`--notectl-bg`, `--notectl-fg`, `--notectl-fg-muted`, `--notectl-border`, `--notectl-border-focus`, `--notectl-primary`, `--notectl-primary-fg`, `--notectl-primary-muted`, `--notectl-surface-raised`, `--notectl-surface-overlay`, `--notectl-hover-bg`, `--notectl-active-bg`, `--notectl-danger`, `--notectl-danger-muted`, `--notectl-success`, `--notectl-shadow`, `--notectl-focus-ring`

**Toolbar (2):**
`--notectl-toolbar-bg`, `--notectl-toolbar-border`

**Code Block (5):**
`--notectl-code-block-bg`, `--notectl-code-block-color`, `--notectl-code-block-header-bg`, `--notectl-code-block-header-color`, `--notectl-code-block-header-border`

**Syntax Tokens (10):**
`--notectl-code-token-keyword`, `--notectl-code-token-string`, `--notectl-code-token-comment`, `--notectl-code-token-number`, `--notectl-code-token-function`, `--notectl-code-token-operator`, `--notectl-code-token-punctuation`, `--notectl-code-token-boolean`, `--notectl-code-token-null`, `--notectl-code-token-property`

**Tooltip (2):**
`--notectl-tooltip-bg`, `--notectl-tooltip-fg`

---

## Related

- [Theming Guide](/notectl/guides/styling/) — practical guide to styling the editor
- [NotectlEditor](/notectl/api/editor/) — the `theme` configuration property
