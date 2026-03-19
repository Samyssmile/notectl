---
title: Theming
description: Switch between light and dark mode, create custom themes, and use CSS custom properties to fully control the editor appearance.
---

notectl ships with a complete theming system built on CSS custom properties. Two built-in themes (light & dark), automatic system-preference detection, and full custom-theme support are included out of the box.

For CSP runtime styling and nonce setup, see the [Content Security Policy guide](/notectl/guides/content-security-policy/).

## Quick Start

### Using a Preset

```ts
import { createEditor, ThemePreset } from '@notectl/core';

const editor = await createEditor({
  theme: ThemePreset.Dark,
});
```

Available presets:

| Preset | Value | Description |
|--------|-------|-------------|
| `ThemePreset.Light` | `'light'` | Default light theme |
| `ThemePreset.Dark` | `'dark'` | Dark theme (Catppuccin-inspired) |
| `ThemePreset.System` | `'system'` | Follows OS `prefers-color-scheme` |

### HTML Attribute

```html
<notectl-editor theme="dark"></notectl-editor>
```

### System Preference (Auto)

```ts
const editor = await createEditor({
  theme: ThemePreset.System,
});
```

The editor listens to `prefers-color-scheme` changes and switches automatically.

## Runtime Switching

```ts
// Switch to dark
editor.setTheme(ThemePreset.Dark);

// Read current theme
const current = editor.getTheme(); // 'light' | 'dark' | 'system' | Theme object
```

Toggle example:

```ts
const toggle = document.getElementById('theme-toggle');
toggle.addEventListener('click', () => {
  const next = editor.getTheme() === ThemePreset.Dark
    ? ThemePreset.Light
    : ThemePreset.Dark;
  editor.setTheme(next);
});
```

## Custom Themes

Create a custom theme by extending a built-in base theme with partial overrides:

```ts
import { createTheme, LIGHT_THEME, createEditor } from '@notectl/core';
import type { Theme } from '@notectl/core';

const corporate: Theme = createTheme(LIGHT_THEME, {
  name: 'corporate',
  primitives: {
    primary: '#6B21A8',
    primaryForeground: '#6B21A8',
    primaryMuted: 'rgba(107, 33, 168, 0.15)',
    borderFocus: '#6B21A8',
    focusRing: 'rgba(107, 33, 168, 0.2)',
  },
});

const editor = await createEditor({ theme: corporate });
```

Only specify the values you want to change — everything else falls back to the base theme.

### Overriding Component Tokens

Component-level tokens (toolbar, code block, tooltip) can be overridden independently:

```ts
const myTheme: Theme = createTheme(DARK_THEME, {
  name: 'custom-dark',
  codeBlock: {
    background: '#0d1117',
    foreground: '#c9d1d9',
  },
  tooltip: {
    background: '#21262d',
    foreground: '#f0f6fc',
  },
});
```

### Sharing Themes

Themes are plain objects — export them from a package:

```ts
// my-theme-package/index.ts
import { createTheme, DARK_THEME } from '@notectl/core';
import type { Theme } from '@notectl/core';

export const OCEAN_THEME: Theme = createTheme(DARK_THEME, {
  name: 'ocean',
  primitives: {
    primary: '#06b6d4',
    background: '#0c1222',
    surfaceRaised: '#1a2332',
    surfaceOverlay: '#1a2332',
  },
});
```

## CSS Custom Properties Reference

The theme engine sets all properties on `:host` inside the Shadow DOM. Every color in the editor references these variables.

### Primitives

These are the core tokens that all components derive their colors from.

| CSS Property | Token | Description |
|---|---|---|
| `--notectl-bg` | `background` | Editor canvas background |
| `--notectl-fg` | `foreground` | Main text color |
| `--notectl-fg-muted` | `mutedForeground` | Secondary text (placeholders, labels, arrows) |
| `--notectl-border` | `border` | Default borders (editor, toolbar, inputs, separators) |
| `--notectl-border-focus` | `borderFocus` | Focus state border |
| `--notectl-primary` | `primary` | Accent color (selection outlines, insert lines, active states) |
| `--notectl-primary-fg` | `primaryForeground` | Text on primary-tinted backgrounds |
| `--notectl-primary-muted` | `primaryMuted` | Subtle primary background (active toolbar button, selected cells) |
| `--notectl-surface-raised` | `surfaceRaised` | Elevated surfaces (toolbar background) |
| `--notectl-surface-overlay` | `surfaceOverlay` | Overlay surfaces (popups, context menus, dropdowns) |
| `--notectl-hover-bg` | `hoverBackground` | Hover state background |
| `--notectl-active-bg` | `activeBackground` | Active/pressed state background |
| `--notectl-danger` | `danger` | Delete and error color |
| `--notectl-danger-muted` | `dangerMuted` | Subtle danger background |
| `--notectl-success` | `success` | Checked/success color (checklist checkmarks) |
| `--notectl-shadow` | `shadow` | Box-shadow color |
| `--notectl-focus-ring` | `focusRing` | Focus ring shadow (typically semi-transparent) |

### Component: Toolbar

| CSS Property | Token | Fallback |
|---|---|---|
| `--notectl-toolbar-bg` | `toolbar.background` | `var(--notectl-surface-raised)` |
| `--notectl-toolbar-border` | `toolbar.borderColor` | `var(--notectl-border)` |

### Component: Code Block

| CSS Property | Token | Fallback |
|---|---|---|
| `--notectl-code-block-bg` | `codeBlock.background` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-color` | `codeBlock.foreground` | `var(--notectl-fg)` |
| `--notectl-code-block-header-bg` | `codeBlock.headerBackground` | `var(--notectl-surface-raised)` |
| `--notectl-code-block-header-color` | `codeBlock.headerForeground` | `var(--notectl-fg-muted)` |
| `--notectl-code-block-header-border` | `codeBlock.headerBorder` | `var(--notectl-border)` |

### Component: Code Block Syntax Tokens

When a `ThemeSyntax` object is provided in `codeBlock.syntax`, token colors are emitted as CSS custom properties. Each falls back to `var(--notectl-code-block-color)` when not set. There are 16 canonical token types; the theme engine derives all variables automatically from the `SYNTAX_TOKEN_TYPES` list.

| CSS Property | Token | Fallback |
|---|---|---|
| `--notectl-code-token-keyword` | `codeBlock.syntax.keyword` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-string` | `codeBlock.syntax.string` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-comment` | `codeBlock.syntax.comment` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-number` | `codeBlock.syntax.number` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-function` | `codeBlock.syntax.function` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-operator` | `codeBlock.syntax.operator` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-punctuation` | `codeBlock.syntax.punctuation` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-boolean` | `codeBlock.syntax.boolean` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-null` | `codeBlock.syntax.null` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-property` | `codeBlock.syntax.property` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-type` | `codeBlock.syntax.type` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-annotation` | `codeBlock.syntax.annotation` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-tag` | `codeBlock.syntax.tag` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-attribute` | `codeBlock.syntax.attribute` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-constant` | `codeBlock.syntax.constant` | `var(--notectl-code-block-color)` |
| `--notectl-code-token-regex` | `codeBlock.syntax.regex` | `var(--notectl-code-block-color)` |

Tokens whose value is a `TokenStyle` object (rather than a plain color string) additionally emit font-style and font-weight variables when those fields are set:

| CSS Property pattern | Emitted when |
|---|---|
| `--notectl-code-token-<type>-font-style` | `TokenStyle.fontStyle` is set |
| `--notectl-code-token-<type>-font-weight` | `TokenStyle.fontWeight` is set |

The built-in light and dark themes both include full syntax token definitions for all 16 types, so code blocks are styled automatically.

### Component: Tooltip

| CSS Property | Token | Fallback |
|---|---|---|
| `--notectl-tooltip-bg` | `tooltip.background` | `var(--notectl-fg)` |
| `--notectl-tooltip-fg` | `tooltip.foreground` | `var(--notectl-bg)` |

### Other

| CSS Property | Description |
|---|---|
| `--notectl-content-min-height` | Minimum height of the content area (default: `400px`) |

## Syntax Highlighting Tokens

When a syntax highlighter is configured on the `CodeBlockPlugin`, token classes are applied to code content. The built-in light and dark themes include full syntax color definitions via CSS custom properties (see the [Code Block Syntax Tokens](#component-code-block-syntax-tokens) reference above), so code blocks are styled automatically.

To customize syntax colors, override the `codeBlock.syntax` section in your custom theme. Each token accepts either a plain color string or a `TokenStyle` object for full font-weight and font-style control:

```ts
import { createTheme, LIGHT_THEME } from '@notectl/core';
import type { Theme } from '@notectl/core';

const myTheme: Theme = createTheme(LIGHT_THEME, {
  name: 'custom-syntax',
  codeBlock: {
    syntax: {
      keyword:     '#d73a49',
      string:      '#032f62',
      number:      '#005cc5',
      comment:     { color: '#6a737d', fontStyle: 'italic' },
      function:    '#6f42c1',
      operator:    '#d73a49',
      punctuation: '#24292e',
      boolean:     '#005cc5',
      null:        '#005cc5',
      property:    '#005cc5',
      // New in 16-token system:
      type:        '#e36209',
      annotation:  '#6f42c1',
      tag:         '#22863a',
      attribute:   '#6f42c1',
      constant:    '#005cc5',
      regex:       '#032f62',
    },
  },
});
```

You only need to specify tokens you want to override — unspecified tokens inherit from the base theme.

## Theme API Types

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

/** Per-token style: color plus optional font weight and style. */
interface TokenStyle {
  readonly color: string;
  readonly fontWeight?: 'normal' | 'bold';
  readonly fontStyle?: 'normal' | 'italic';
}

/** A token style value is either a plain color string or a full TokenStyle object. */
type TokenStyleValue = string | TokenStyle;

/**
 * Syntax highlighting styles for all 16 canonical token types.
 * Derived automatically from SYNTAX_TOKEN_TYPES — adding a new token type
 * here propagates to CSS variables and theme validation.
 */
type ThemeSyntax = { readonly [K in SyntaxTokenType]: TokenStyleValue };

// The 16 canonical token types:
// 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator'
// | 'punctuation' | 'boolean' | 'null' | 'property'
// | 'type' | 'annotation' | 'tag' | 'attribute' | 'constant' | 'regex'

interface ThemeCodeBlock {
  readonly background: string;
  readonly foreground: string;
  readonly headerBackground: string;
  readonly headerForeground: string;
  readonly headerBorder: string;
  readonly syntax?: ThemeSyntax;
}

interface Theme {
  readonly name: string;
  readonly primitives: ThemePrimitives;
  readonly toolbar?: Partial<ThemeToolbar>;
  readonly codeBlock?: Partial<ThemeCodeBlock>;
  readonly tooltip?: Partial<ThemeTooltip>;
}
```

### Exports

All theme-related exports from `@notectl/core`:

| Export | Kind | Description |
|--------|------|-------------|
| `ThemePreset` | Enum object | `Light`, `Dark`, `System` |
| `LIGHT_THEME` | Constant | Built-in light theme |
| `DARK_THEME` | Constant | Built-in dark theme |
| `SYNTAX_TOKEN_TYPES` | Constant | Tuple of all 16 canonical token type names |
| `createTheme(base, overrides)` | Function | Create custom theme from a base |
| `resolveTheme(preset \| theme)` | Function | Resolve a preset to a full Theme |
| `generateThemeCSS(theme)` | Function | Generate CSS string from a Theme |
| `createThemeStyleSheet(theme)` | Function | Create a `CSSStyleSheet` from a Theme |
| `Theme` | Type | Full theme definition |
| `PartialTheme` | Type | Partial overrides for `createTheme()` |
| `ThemePrimitives` | Type | Primitive color palette |
| `ThemeToolbar` | Type | Toolbar color overrides |
| `ThemeCodeBlock` | Type | Code block color overrides (includes `syntax`) |
| `ThemeSyntax` | Type | Syntax token styles — mapped type over all 16 token types |
| `ThemeTooltip` | Type | Tooltip color overrides |
| `SyntaxTokenType` | Type | Union of all 16 token type name strings |
| `TokenStyle` | Type | Per-token style with color, optional fontWeight and fontStyle |
| `TokenStyleValue` | Type | `string \| TokenStyle` — accepted by every syntax token slot |

## For Plugin Authors

Plugins that create UI elements (popups, dialogs, overlays) should reference theme variables instead of hardcoding colors. Use `context.registerStyleSheet()` to inject CSS that references the theme custom properties:

```ts
// Register a stylesheet during plugin init()
context.registerStyleSheet(`
  .my-popup {
    background: var(--notectl-surface-overlay);
    border: 1px solid var(--notectl-border);
    color: var(--notectl-fg);
    box-shadow: 0 4px 12px var(--notectl-shadow);
  }
`);
```

This ensures your plugin adapts automatically when the user switches themes, and remains CSP-compliant since all styles are injected via adopted stylesheets rather than inline `style` attributes.
