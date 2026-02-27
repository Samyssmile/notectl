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
| `--notectl-bg` | `background` | Editor and input background |
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

When a syntax highlighter is configured on the `CodeBlockPlugin`, token classes are applied to code content. Style them to match your theme:

```css
/* Light theme tokens */
notectl-editor .notectl-token--keyword { color: #d73a49; }
notectl-editor .notectl-token--string  { color: #032f62; }
notectl-editor .notectl-token--number  { color: #005cc5; }
notectl-editor .notectl-token--comment { color: #6a737d; font-style: italic; }

/* Dark theme tokens */
@media (prefers-color-scheme: dark) {
  notectl-editor .notectl-token--keyword { color: #c678dd; }
  notectl-editor .notectl-token--string  { color: #98c379; }
  notectl-editor .notectl-token--number  { color: #d19a66; }
  notectl-editor .notectl-token--comment { color: #5c6370; font-style: italic; }
}
```

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
| `createTheme(base, overrides)` | Function | Create custom theme from a base |
| `resolveTheme(preset \| theme)` | Function | Resolve a preset to a full Theme |
| `generateThemeCSS(theme)` | Function | Generate CSS string from a Theme |
| `createThemeStyleSheet(theme)` | Function | Create a `CSSStyleSheet` from a Theme |
| `Theme` | Type | Full theme definition |
| `PartialTheme` | Type | Partial overrides for `createTheme()` |
| `ThemePrimitives` | Type | Primitive color palette |

## For Plugin Authors

Plugins that create UI elements (popups, dialogs, overlays) should reference theme variables instead of hardcoding colors:

```ts
// In your plugin's DOM creation
const popup = document.createElement('div');
popup.style.cssText = `
  background: var(--notectl-surface-overlay);
  border: 1px solid var(--notectl-border);
  color: var(--notectl-fg);
  box-shadow: 0 4px 12px var(--notectl-shadow);
`;
```

This ensures your plugin adapts automatically when the user switches themes.
