---
title: Custom CSS Classes
description: Use your application's own CSS classes for alignment, colors, highlights, font sizes and fonts in exported HTML, and read them back on import and paste.
---

[Class-based HTML export](/notectl/guides/content-security-policy/#class-based-html-export-zero-inline-styles)
writes formatting as CSS classes instead of inline styles. By default these are notectl's own
names: `notectl-align-center` for alignment and content-hashed `notectl-s-*` names for colors,
highlights, font sizes and fonts.

If your content has to follow an existing stylesheet, for example of a CMS, a design system or a
previous editor, tell notectl which of your classes stands for which formatting. The exported HTML
then uses your classes, and importing or pasting that HTML restores the formatting without any
extra data.

## Quick Start

Every formatting plugin has the same `styleClasses` option. Its keys are the plugin's own values,
its values are your CSS classes:

```ts
import { AlignmentPlugin } from '@notectl/core/plugins/alignment';
import { FontPlugin } from '@notectl/core/plugins/font';
import { FontSizePlugin } from '@notectl/core/plugins/font-size';
import { HighlightPlugin } from '@notectl/core/plugins/highlight';
import { TextColorPlugin } from '@notectl/core/plugins/text-color';

const BRAND_COLORS = { '#e03131': 'text-red', '#1971c2': 'text-blue' };
const FONTS = [
  { name: 'Inter', family: "'Inter', sans-serif" },
  { name: 'Fira Code', family: "'Fira Code', monospace" },
];

const plugins = [
  new AlignmentPlugin({ styleClasses: { center: 'align-center', end: 'align-end' } }),
  new TextColorPlugin({ colors: Object.keys(BRAND_COLORS), styleClasses: BRAND_COLORS }),
  new HighlightPlugin({ styleClasses: { '#fff3bf': 'mark-yellow' } }),
  new FontSizePlugin({ sizes: [14, 18, 24], styleClasses: { 14: 'text-sm', 18: 'text-lg' } }),
  new FontPlugin({ fonts: FONTS, styleClasses: { Inter: 'font-sans', 'Fira Code': 'font-mono' } }),
];
```

Export, store and load content as usual:

```ts
const { html } = await editor.getContentHTML({ cssMode: 'classes', includeBlockIds: false });
// <p class="align-center"><strong><span class="text-red text-lg">Hello</span></strong></p>

await editor.setContentHTML(html); // no styleMap needed: all formatting is restored
```

The same options work through presets, for example
`createFullPreset({ textColor: { styleClasses: BRAND_COLORS } })`, and in Angular, where you pass
the configured plugin instances to the `plugins` input.

## The Options

| Plugin | Keys | Each class stands for | Example |
|--------|------|-----------------------|---------|
| [AlignmentPlugin](/notectl/plugins/alignment/#custom-css-classes) | `start`, `center`, `end`, `justify` | `text-align: <key>` | `{ center: 'align-center' }` |
| [TextColorPlugin](/notectl/plugins/text-color/#custom-css-classes) | Hex colors | `color: <key>` | `{ '#e03131': 'text-red' }` |
| [HighlightPlugin](/notectl/plugins/highlight/#custom-css-classes) | Hex colors | `background-color: <key>` | `{ '#fff3bf': 'mark-yellow' }` |
| [FontSizePlugin](/notectl/plugins/font-size/#custom-css-classes) | Pixel sizes | `font-size: <key>px` | `{ 18: 'text-lg' }` |
| [FontPlugin](/notectl/plugins/font/#custom-css-classes) | Font names from `fonts` | `font-family: <family of the font>` | `{ 'Fira Code': 'font-mono' }` |

Map only the values your stylesheet knows. Colors and sizes outside the plugin's palette may have a
class too, which helps when stored content uses values the toolbar no longer offers.

## How It Works

A style class stands for exactly one CSS declaration, such as `text-red` for `color: #e03131`.

- **Export** writes your class wherever notectl would write that declaration. Text with several
  formats gets several classes (`class="text-red text-lg"`). Formatting without a class of yours
  keeps one generated class next to yours (`class="text-red notectl-s-g4x198"`).
- **The returned `css` and `styleMap`** list your classes with the declarations they stand for,
  next to the generated ones, so the result renders on its own and re-imports anywhere.
- **Import and paste** read your classes without a `styleMap`: `setContentHTML()`, pasted HTML and
  HTML blocks in Markdown alike.
- **The document stays semantic.** The editor stores a color, a size or an alignment, never a class
  name. Changing the mapping changes only the names of future exports.
- **Values are compared as the browser reads them.** A browser reads an imported `#e03131` back as
  `rgb(224, 49, 49)` and may requote font names. The next export still finds `text-red` and your
  font class.
- **Inline export and the editor are unchanged.** `getContentHTML()` without `cssMode: 'classes'`
  keeps writing `style` attributes, and the editor renders formatting itself, CSP-safe and without
  your stylesheet.

## Import Rules

When imported HTML is ambiguous, notectl follows CSS where it can:

- **An inline style wins over a class** for the same property:
  `<span class="text-red" style="color: blue">` imports blue text.
- **The first listed class wins** when two classes set the same property.
- **A `styleMap` describes the HTML it came with.** When you pass one to `setContentHTML()`, its
  entries win over your configured classes of the same name.
- **Classes stay on the element** after import, so other plugins can still read them.
- **Generated `notectl-s-*` classes need the `styleMap`** returned with the HTML. Your classes and
  `notectl-align-*` never do.

Classes in pasted HTML from other sources become formatting when their names match your classes.
Choose distinctive names (`text-brand-red` rather than `red`) when users paste content from other
websites.

## Rendering the Exported HTML

Your classes describe exported content. Load your own stylesheet where you display it:

```html
<link rel="stylesheet" href="/assets/content.css">
<article><!-- stored html --></article>
```

```css
/* /assets/content.css */
.text-red     { color: #e03131; }
.mark-yellow  { background-color: #fff3bf; }
.text-lg      { font-size: 18px; }
.align-center { text-align: center; }
```

If content can contain formatting without a class of yours, also deliver the returned `css`, for
example with [`adoptContentStyles`](/notectl/guides/content-security-policy/#rendering-on-a-csp-strict-page).
It repeats the declarations of your classes, so both stylesheets agree.

Keep text readable: your stylesheet decides the final colors, so check their contrast against the
background they appear on.

A class stands for its declaration wherever notectl exports it. If a code block background has the
same color as a highlight class, the code block gets that class too.

## Rules for Class Names

The editor checks every class when it initializes. An invalid configuration makes `createEditor()`
(or `init()`) reject with a `TypeError` that names the plugin, the problem and the fix:

- Each value is one CSS class name of letters, digits, `-` and `_` that does not start with a
  digit. Selectors that need escaping (`md:text-center`) and lists of classes (`'a b'`) are not
  supported.
- The prefix `notectl-` is reserved for the classes notectl generates.
- A class stands for one declaration, and a declaration has one class. Using `brand` for a text
  color and a highlight is rejected, because import could not tell them apart.
- Keys must be values of the plugin: logical alignments, hex colors, whole pixel sizes or the names
  of configured fonts.

## Classes for Other Plugins

Plugins register style classes through their [plugin context](/notectl/api/plugin-interface/):

```ts
context.registerStyleClass({ className: 'tracking-wide', declaration: 'letter-spacing: 0.1em' });
```

Any declaration that a plugin exports through `toHTMLStyle()` or `ctx.styleAttr()` can have a class.
An application can do the same for a plugin without a `styleClasses` option, with a small plugin of
its own:

```ts
const appClasses: Plugin = {
  id: 'app-style-classes',
  name: 'Application style classes',
  init(context) {
    context.registerStyleClass({ className: 'tracking-wide', declaration: 'letter-spacing: 0.1em' });
  },
};
```

See [Writing a Plugin](/notectl/guides/writing-plugins/#style-classes) for adding a `styleClasses`
option to your own plugin.

## Migrating Content From Other Editors

Content written by other editors often uses classes for alignment, as TinyMCE's
`formats: { aligncenter: { classes: 'align-center' } }` does. Map the same names and the content
imports as it is:

- Classes on paragraphs, headings, table cells and image figures import directly.
- A class on a wrapper such as `<div class="align-center">` aligns the blocks inside it.
- A class on a standalone `<img class="align-center">` aligns the image.
- An image inside a paragraph (`<p><img class="align-center"></p>`) stays an inline image of that
  paragraph, and its class aligns nothing. Align such paragraphs, or convert the content, before you
  import it.

## Limits

- **Semantic formatting stays semantic.** Bold, italic and similar formats are exported as
  elements such as `<strong>` and `<em>`, which assistive technology understands, not as classes.
- **Free values** without a class, such as a pasted color outside your palette, keep generated
  classes. A browser import turns an unmapped hex color into `rgb()`, so its generated name changes
  on the next export.
- **Structural styles** such as table borders and padding keep generated classes unless a plugin
  registers classes for their declarations.
