---
title: Internationalization (i18n)
description: Configure the editor language globally or per-plugin. Ships with 9 languages out of the box.
---

notectl ships with built-in support for 9 languages. All user-facing strings in the toolbar, context menus, announcements, and ARIA labels are fully localizable.

## Supported Languages

| Locale | Language | Constant |
|--------|----------|----------|
| `en` | English | `Locale.EN` |
| `de` | German | `Locale.DE` |
| `es` | Spanish | `Locale.ES` |
| `fr` | French | `Locale.FR` |
| `zh` | Chinese (Simplified) | `Locale.ZH` |
| `ru` | Russian | `Locale.RU` |
| `ar` | Arabic | `Locale.AR` |
| `hi` | Hindi | `Locale.HI` |
| `pt` | Portuguese | `Locale.PT` |
| `browser` | Auto-detect | `Locale.BROWSER` |

## Global Locale

Set the editor language via the `locale` config option. All plugins automatically resolve their strings from this setting.

```ts
import { createEditor, Locale } from '@notectl/core';

const editor = await createEditor({
  locale: Locale.DE,
  toolbar: [/* ... */],
});
```

When set to `Locale.BROWSER` (the default), the editor detects the language from `navigator.language` and uses the best available match. If the detected language has no translation, it falls back to English.

### HTML Attribute

```html
<!-- Not yet supported as HTML attribute — use the config option -->
```

## Per-Plugin Locale Override

Every plugin that renders user-facing text accepts an optional `locale` config parameter. This allows overriding the global locale for a specific plugin.

```ts
import { createEditor, Locale } from '@notectl/core';
import { TablePlugin, loadTableLocale } from '@notectl/core/plugins/table';

// Load French locale for the table plugin
const tableFr = await loadTableLocale('fr');

// Editor in German, but table plugin in French
const editor = await createEditor({
  locale: Locale.DE,
  toolbar: [
    [new TablePlugin({ locale: tableFr })],
  ],
});
```

## Locale Resolution

Plugins resolve their locale in this order:

1. **Per-plugin config override** — if provided in the plugin constructor, it wins
2. **Global `LocaleService`** — reads the editor's `locale` setting and loads the matching translation asynchronously
3. **English fallback** — if no translation exists for the resolved language

## Async Locale Loaders

Every plugin exports an async `loadXxxLocale(lang)` function that loads translation data on demand. This keeps locale data out of the main bundle — only the requested language is fetched at runtime.

```ts
import { loadTableLocale } from '@notectl/core/plugins/table';

// Load German table strings (async, code-split)
const deLocale = await loadTableLocale('de');

// Falls back to English for unknown languages
const fallback = await loadTableLocale('unknown'); // → English
```

### Available Loaders

| Plugin | Loader | EN Constant |
|--------|--------|-------------|
| Text Formatting | `loadTextFormattingLocale()` | `TEXT_FORMATTING_LOCALE_EN` |
| Heading | `loadHeadingLocale()` | `HEADING_LOCALE_EN` |
| List | `loadListLocale()` | `LIST_LOCALE_EN` |
| Link | `loadLinkLocale()` | `LINK_LOCALE_EN` |
| Table | `loadTableLocale()` | `TABLE_LOCALE_EN` |
| Code Block | `loadCodeBlockLocale()` | `CODE_BLOCK_LOCALE_EN` |
| Blockquote | `loadBlockquoteLocale()` | `BLOCKQUOTE_LOCALE_EN` |
| Image | `loadImageLocale()` | `IMAGE_LOCALE_EN` |
| Font | `loadFontLocale()` | `FONT_LOCALE_EN` |
| Font Size | `loadFontSizeLocale()` | `FONT_SIZE_LOCALE_EN` |
| Text Color | `loadTextColorLocale()` | `TEXT_COLOR_LOCALE_EN` |
| Alignment | `loadAlignmentLocale()` | `ALIGNMENT_LOCALE_EN` |
| Strikethrough | `loadStrikethroughLocale()` | `STRIKETHROUGH_LOCALE_EN` |
| Superscript / Subscript | `loadSuperSubLocale()` | `SUPER_SUB_LOCALE_EN` |
| Highlight | `loadHighlightLocale()` | `HIGHLIGHT_LOCALE_EN` |
| Horizontal Rule | `loadHorizontalRuleLocale()` | `HORIZONTAL_RULE_LOCALE_EN` |
| Print | `loadPrintLocale()` | `PRINT_LOCALE_EN` |
| Text Direction | `loadTextDirectionLocale()` | `TEXT_DIRECTION_LOCALE_EN` |
| Toolbar | `loadToolbarLocale()` | `TOOLBAR_LOCALE_EN` |

## Custom Locales

You can provide a fully custom locale by implementing the plugin's locale interface:

```ts
import type { TableLocale } from '@notectl/core';

const myTableLocale: TableLocale = {
  insertRowAbove: 'Add row above',
  insertRowBelow: 'Add row below',
  insertColumnLeft: 'Add column left',
  insertColumnRight: 'Add column right',
  deleteRow: 'Remove row',
  deleteColumn: 'Remove column',
  borderColorLabel: 'Border color...',
  deleteTable: 'Remove table',
  tableActions: 'Table actions',
  menuKeyboardHint: 'Arrows to navigate, Enter to select, Esc to close',
  insertRow: 'Insert row',
  insertColumn: 'Insert column',
  addRow: 'Add row',
  addColumn: 'Add column',
  tableActionsHint: 'Table actions (Right-click or Shift+F10)',
  contextMenuHint: 'Right-click or Shift+F10 for table actions',
  borderColor: 'Border color',
  defaultColor: 'Default',
  noBorders: 'No borders',
  borderColorPicker: 'Border color picker',
  announceBorderColorSet: (name) => `Border color set to ${name}`,
  announceBorderReset: 'Borders reset to default',
  borderSwatchLabel: (name) => `Border ${name}`,
  announceRowInsertedAbove: 'Row added above',
  announceRowInsertedBelow: 'Row added below',
  announceColumnInserted: (side) => `Column added ${side}`,
  announceRowDeleted: 'Row removed',
  announceColumnDeleted: 'Column removed',
  announceTableDeleted: 'Table removed',
  insertTable: 'Insert Table',
  tableAriaLabel: (rows, cols) => `Table: ${rows} rows, ${cols} columns`,
  tableAriaDescription: 'Right-click or Shift+F10 for actions',
};

new TablePlugin({ locale: myTableLocale });
```

## Core Exports

| Export | Kind | Description |
|--------|------|-------------|
| `Locale` | Const object | `EN`, `DE`, `ES`, `FR`, `ZH`, `RU`, `AR`, `HI`, `PT`, `BROWSER` |
| `LocaleService` | Class | Resolves the active language from config |
| `LocaleServiceKey` | ServiceKey | Service key for accessing `LocaleService` |
