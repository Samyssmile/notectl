# Notectl Vanilla Demo

A minimal Vite-powered example that shows how to wire `@notectl/core` together with the official toolbar plugin (including the integrated table tools) in a framework-agnostic setup.

## Getting started

```bash
npm install
npm run dev -- --filter @notectl/example-vanillajs
```

Then open the printed Vite dev server URL (defaults to http://localhost:5173) to try the editor.

## What this demo covers

- Creates a `NotectlEditor` instance via `createEditor` and mounts it into the DOM.
- Registers `@notectl/plugin-toolbar` using the default layout so it matches the official Notectl look & feel.
- Enables the toolbar's built-in table tools so you can insert tables, navigate with the keyboard, and open the contextual menu.
- Logs emitted editor and table events to the inspector panel so you can see how to integrate with your own app state.

## Production build

```bash
npm run build -- --filter @notectl/example-vanillajs
npm run preview -- --filter @notectl/example-vanillajs
```

These commands emit a static build under `examples/vanillajs/dist/` and let you preview the output locally.
