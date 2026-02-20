# Angular module for notectl.

A modern rich text editor built as a Web Component, with native Angular bindings.

## What is notectl?

**notectl** is a modern rich text editor built as a Web Component. It provides everything you'd expect from a professional editor: text formatting, tables, code blocks, images, links, and much more.

With **@notectl/angular**, you get a native Angular integration. No manual Custom Element wiring — just a real Angular component with Inputs, Outputs, Reactive Forms support, and Dependency Injection.

- **npm**: [@notectl/core](https://www.npmjs.com/package/@notectl/core)
- **Live Demo**: [samyssmile.github.io/notectl](https://samyssmile.github.io/notectl/)

---

## Prerequisites

- Angular **21+**
- Node.js **20+**
- pnpm, npm, or yarn

---

## Step 1: Install packages

```bash
npm install @notectl/core @notectl/angular
```

You need both packages: `@notectl/core` contains the editor engine and all plugins, `@notectl/angular` provides the Angular bindings.

---

## Step 2: Register the provider

In your `app.config.ts`, add `provideNotectl()` to the providers array. This initializes the editor service for the entire app.

```typescript
import { type ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNotectl } from '@notectl/angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideNotectl(),
  ],
};
```

---

## Step 3: Use the editor component

Import `NotectlEditorComponent` into your component and configure the plugins you need.

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  NotectlEditorComponent,
  TextFormattingPlugin,
  HeadingPlugin,
  ListPlugin,
  LinkPlugin,
  ThemePreset,
} from '@notectl/angular';
import type { Plugin, StateChangeEvent } from '@notectl/angular';

@Component({
  selector: 'app-editor',
  imports: [NotectlEditorComponent],
  template: `
    <ntl-editor
      [toolbar]="toolbar"
      [plugins]="plugins"
      [theme]="theme()"
      [autofocus]="true"
      (stateChange)="onStateChange($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorComponent {
  protected readonly theme = signal<ThemePreset>(ThemePreset.Light);

  // Toolbar groups: each inner array becomes one group in the toolbar
  protected readonly toolbar: ReadonlyArray<ReadonlyArray<Plugin>> = [
    [new TextFormattingPlugin({ bold: true, italic: true, underline: true })],
    [new HeadingPlugin()],
    [new ListPlugin()],
    [new LinkPlugin()],
  ];

  // Plugins without a toolbar button
  protected readonly plugins: Plugin[] = [];

  protected onStateChange(event: StateChangeEvent): void {
    // Access the new editor state after every change
    console.log('New state:', event.newState);
  }
}
```

---

## Step 4: Done!

That's it. The editor renders with a toolbar and an editable area. Start typing.

---

## Adding more plugins

notectl is fully modular. Just add more plugins to the `toolbar` or `plugins` array:

```typescript
import {
  TextFormattingPlugin,
  HeadingPlugin,
  ListPlugin,
  LinkPlugin,
  BlockquotePlugin,
  CodeBlockPlugin,
  TablePlugin,
  ImagePlugin,
  HorizontalRulePlugin,
  StrikethroughPlugin,
  HighlightPlugin,
  TextColorPlugin,
  FontPlugin,
  FontSizePlugin,
  AlignmentPlugin,
  SuperSubPlugin,
  HardBreakPlugin,
  STARTER_FONTS,
} from '@notectl/angular';
```

Each plugin enables exactly one feature. You decide what your editor can do.

---

## Switching themes

```typescript
// Light theme (default)
this.theme.set(ThemePreset.Light);

// Dark theme
this.theme.set(ThemePreset.Dark);
```

---

## Links

| Resource | URL |
|----------|-----|
| npm | [npmjs.com/package/@notectl/core](https://www.npmjs.com/package/@notectl/core) |
| Live Demo | [samyssmile.github.io/notectl](https://samyssmile.github.io/notectl/) |
| GitHub | [github.com/Samyssmile/notectl](https://github.com/Samyssmile/notectl) |
