---
title: Internationalization (i18n)
description: Configure the editor language globally or per-plugin. Ships with 8 languages out of the box.
---

notectl ships with built-in support for 8 languages. All user-facing strings in the toolbar, context menus, announcements, and ARIA labels are fully localizable.

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
import {
  createEditor,
  Locale,
  TablePlugin,
  TABLE_LOCALE_FR,
} from '@notectl/core';

// Editor in German, but table plugin in French
const editor = await createEditor({
  locale: Locale.DE,
  toolbar: [
    [new TablePlugin({ locale: TABLE_LOCALE_FR })],
  ],
});
```

## Locale Resolution

Plugins resolve their locale in this order:

1. **Per-plugin config override** — if provided in the plugin constructor, it wins
2. **Global `LocaleService`** — reads the editor's `locale` setting
3. **English fallback** — if no translation exists for the resolved language

This is handled internally by the `resolvePluginLocale()` helper:

```ts
import { resolvePluginLocale } from '@notectl/core';

// Inside a plugin's init():
const locale = resolvePluginLocale(MY_LOCALES, context, this.config.locale);
```

## Plugin Locale Exports

Every plugin exports its locale type, default English locale, and a locale map with all translations. The naming pattern is consistent:

| Plugin | Locale Type | Default | Map |
|--------|-------------|---------|-----|
| Text Formatting | `TextFormattingLocale` | `TEXT_FORMATTING_LOCALE_EN` | `TEXT_FORMATTING_LOCALES` |
| Heading | `HeadingLocale` | `HEADING_LOCALE_EN` | `HEADING_LOCALES` |
| List | `ListLocale` | `LIST_LOCALE_EN` | `LIST_LOCALES` |
| Link | `LinkLocale` | `LINK_LOCALE_EN` | `LINK_LOCALES` |
| Table | `TableLocale` | `TABLE_LOCALE_EN` | `TABLE_LOCALES` |
| Code Block | `CodeBlockLocale` | `CODE_BLOCK_LOCALE_EN` | `CODE_BLOCK_LOCALES` |
| Blockquote | `BlockquoteLocale` | `BLOCKQUOTE_LOCALE_EN` | `BLOCKQUOTE_LOCALES` |
| Image | `ImageLocale` | `IMAGE_LOCALE_EN` | `IMAGE_LOCALES` |
| Font | `FontLocale` | `FONT_LOCALE_EN` | `FONT_LOCALES` |
| Font Size | `FontSizeLocale` | `FONT_SIZE_LOCALE_EN` | `FONT_SIZE_LOCALES` |
| Text Color | `TextColorLocale` | `TEXT_COLOR_LOCALE_EN` | `TEXT_COLOR_LOCALES` |
| Alignment | `AlignmentLocale` | `ALIGNMENT_LOCALE_EN` | `ALIGNMENT_LOCALES` |
| Strikethrough | `StrikethroughLocale` | `STRIKETHROUGH_LOCALE_EN` | `STRIKETHROUGH_LOCALES` |
| Superscript / Subscript | `SuperSubLocale` | `SUPER_SUB_LOCALE_EN` | `SUPER_SUB_LOCALES` |
| Highlight | `HighlightLocale` | `HIGHLIGHT_LOCALE_EN` | `HIGHLIGHT_LOCALES` |
| Horizontal Rule | `HorizontalRuleLocale` | `HORIZONTAL_RULE_LOCALE_EN` | `HORIZONTAL_RULE_LOCALES` |
| Print | `PrintLocale` | `PRINT_LOCALE_EN` | `PRINT_LOCALES` |
| Toolbar | `ToolbarLocale` | `TOOLBAR_LOCALE_EN` | `TOOLBAR_LOCALES` |

All exports are available from `@notectl/core`:

```ts
import {
  TABLE_LOCALE_EN,
  TABLE_LOCALE_DE,
  TABLE_LOCALE_ES,
  TABLE_LOCALE_FR,
  TABLE_LOCALE_ZH,
  TABLE_LOCALE_RU,
  TABLE_LOCALE_AR,
  TABLE_LOCALE_HI,
  TABLE_LOCALES,
} from '@notectl/core';
```

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
| `Locale` | Const object | `EN`, `DE`, `ES`, `FR`, `ZH`, `RU`, `AR`, `HI`, `BROWSER` |
| `LocaleService` | Class | Resolves the active language from config |
| `LocaleServiceKey` | ServiceKey | Service key for accessing `LocaleService` |
| `resolvePluginLocale()` | Function | Helper for plugins to resolve their locale |
