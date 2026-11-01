---
title: Build custom editor interfaces
description: Render existing actions, observe selection geometry, and open anchored popups from plugins or external controls.
---

Use `@notectl/core/ui` to build your own editor controls. The same service works in a plugin,
in ordinary page elements, and in Angular. It is available without `ToolbarPlugin`.
This API supplies actions, focus helpers and geometry; your application decides placement and visibility.
It does not provide a bubble toolbar preset.

## Connect an external interface

```ts
import { createEditor } from '@notectl/core';
import { FontSizePlugin } from '@notectl/core/plugins/font-size';
import { LinkPlugin } from '@notectl/core/plugins/link';
import { EditorUIServiceKey } from '@notectl/core/ui';

const editor = await createEditor({ plugins: [new LinkPlugin(), new FontSizePlugin()] });
document.querySelector('#editor-host')?.append(editor);
await editor.whenReady();

const ui = editor.getService(EditorUIServiceKey);
if (!ui) throw new Error('Editor UI service unavailable');
const controls = document.createElement('div');
controls.setAttribute('role', 'group');
controls.setAttribute('aria-label', 'Editor actions');
document.body.append(controls);
const unregister = ui.registerInteraction(controls);
```

Supply feature plugins through `plugins`, omitting `toolbar` and `ToolbarPlugin` when you want
only your own interface. Existing feature plugins still register their `ToolbarItem`s.
No second command catalog is needed.

## Render actions and observe their state

`getActions()` returns a frozen array of frozen `EditorAction` objects. Each contains `id`,
`group`, `label`, `tooltip`, `icon`, `active`, `enabled`, `popupType`, and `value` (the current
combobox label, or `null`). Icons use the existing plugin-provided SVG/text convention;
only render markup from plugins you trust. A label-only control is also supported.

Keep DOM nodes stable across notifications, so keyboard focus and text input are preserved:

```ts
const buttons = new Map<string, HTMLButtonElement>();
const unsubscribeActions = ui.subscribeActions((actions) => {
  for (const [id, button] of buttons) {
    if (!actions.some((action) => action.id === id)) {
      button.remove();
      buttons.delete(id);
    }
  }
  for (const action of actions) {
    let button = buttons.get(action.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      const trigger = button;
      button.addEventListener('click', () => {
        if (action.popupType) ui.openAction(action.id, { trigger });
        else ui.executeAction(action.id);
      });
      buttons.set(action.id, button);
      controls.append(button);
    }
    button.textContent = action.value ?? action.label;
    button.setAttribute('aria-label', action.label);
    button.setAttribute('aria-pressed', String(action.active));
    if (action.popupType) button.setAttribute('aria-haspopup', 'true');
    button.title = action.tooltip;
    button.disabled = !action.enabled;
  }
});
```

Subscriptions deliver immediately, then when their snapshot changes. Document, selection,
readonly, composition and registration changes refresh actions. Call `refresh()` when your
plugin predicates depend on application data changed outside an editor transaction.

`executeAction(id)` rechecks availability and executes a registered button command through
the usual command/transaction path. It returns `false` for unknown or disabled actions,
popup actions, active IME composition, and retired services. Readonly commands remain
available only when registered with `readonlyAllowed: true`; transaction guards still apply.

`openAction(id, options)` reuses existing dropdown, grid picker, custom popup and combobox
renderers, including their localization and keyboard handling. It returns a `PopupHandle`
or `null` when unavailable. `trigger` tracks `aria-expanded`; `anchor` may instead be an
element or viewport rectangle. With no explicit anchor, the popup follows the model selection.
An unmeasurable selection prevents opening and closes an already anchored popup.
Removing/disabling the action also closes its popup.

## Selection and viewport geometry

```ts
const unsubscribeSelection = ui.subscribeSelection((selection) => {
  if (!selection.geometry) return;
  const { bounds, rects, anchor, focus } = selection.geometry;
  // Place your interface using CSS pixels in viewport coordinates.
  // `rects` contains the browser's selection fragments, including multiple lines.
});
```

`getSelection()` measures synchronously. Geometry subscriptions coalesce updates into
animation frames after rendering, scrolling, resizing, content/layout mutations, and font/image
loading. Observers are installed lazily and removed after the last subscription is disposed.
Use `invalidateGeometry()` for application-driven movement that produces no DOM/resize event,
such as a transform animation or a stylesheet changed through CSSOM.

| Field | Contract |
| --- | --- |
| `type` | `text`, `node`, `gap`, or `cell` |
| `collapsed` | True for a text caret or gap cursor; false for nodes and cell ranges |
| `geometry` | Frozen measured geometry, or `null` when hidden, detached, composing, or unmappable |
| `bounds` | Union of the measured fragments |
| `rects` | Immutable viewport rectangles; fragments may share a line when marks or bidi text split it |
| `anchor`, `focus` | Directional text endpoint rectangles, preserving backward selections and RTL layout |

Node selections use the node box for both endpoints. Gap selections use a one-pixel strip
at the selected boundary. Table cell selections use selected cell boxes in document order;
their endpoints are the first and last selected cells (the table service normalizes its range).
Offscreen geometry is still viewport geometry and may have negative coordinates. The UI
decides whether to hide itself. No browser selection or Shadow DOM selector is needed.

## Focus and custom popups

Register the root of your controls with `registerInteraction(element)`. Registration includes
descendants and returns an idempotent release function. `focus(element)` moves focus to a
registered, connected control; `focusEditor()` restores the current model selection.
Both return a success flag. Content transactions may update the model while an external
input has focus without overwriting that input's browser selection.

The service does not keep a stale selection bookmark. Actions always read the editor's
current selection, which the transaction system maps through intervening edits. Existing
feature dialogs may additionally reject submissions if their own edited object became stale.
When constructing raw transactions yourself, preserve the existing transaction contract:
set `selectionAfter` through `builder.setSelection()`, using the transaction's `mapping` when
you want to carry a selection across your edits. The UI service does not reinterpret transaction selections.
UI actions and geometry pause during IME composition; applications should avoid moving
focus while composition is active.

```ts
import { PopupServiceKey } from '@notectl/core/ui';

const popups = editor.getService(PopupServiceKey);
const trigger = document.createElement('button');
trigger.textContent = 'Open details';
controls.append(trigger);
trigger.addEventListener('click', () => {
  if (!ui.getSelection().geometry) return;
  popups?.open({
    anchor: ui.createSelectionAnchor('focus'),
    restoreFocusTo: trigger,
    ariaRole: 'dialog',
    ariaLabel: 'Details',
    content(container, close) {
      const label = document.createElement('label');
      label.textContent = 'Description';
      label.append(document.createElement('input'));
      container.append(label);
      // A submit control can call close(), or close({ restoreFocusTo: null }).
    },
  });
});
```

Popups are automatically registered as interaction elements. `createSelectionAnchor()` accepts
`bounds` (default), `anchor`, or `focus`. General `PopupAnchor`s provide `getRect()` and an
optional `subscribe()` returning an unsubscribe function. Handles expose `close()`, `getElement()`
and `updatePosition()`; the service also exposes `reposition(handle)`.

The shared manager handles viewport collisions, scrolling, resizing, Escape and nested popups
(`parent: handle`). Closing a parent disposes descendant popups and calls their `onClose`
callbacks. Escape normally restores `restoreFocusTo`; a feature renderer can explicitly override
this through `PopupCloseOptions`. For example, the link form returns to the editor when cancelled.
Outside presses dismiss without stealing focus from the clicked control. Destroy never restores focus.

## Use the same API in a plugin

Get the service in `onReady()`, when the view and feature registrations are ready. Register your
styles in `init()` through `context.registerStyleSheet()`. Append your controls to the public
`getPluginContainer('top' | 'bottom')` container. Use the same renderer and subscription APIs
shown above, and release them in `destroy()`.

The complete, typechecked [`TechnicalUIPlugin` example](https://github.com/Samyssmile/notectl/blob/main/examples/vanillajs/src/CustomUIControls.ts)
shares its renderer with the external controls. Run `pnpm --filter examples-vanillajs dev` and
open `/custom-ui.html` to inspect actions, a popup and selection geometry. It implements no
automatic bubble visibility or floating toolbar theme.

## Angular

`NotectlEditorComponent.getService()` and `NotectlEditorService.getService()` proxy the same
typed core service. Import the key and types from `@notectl/core/ui` and connect on the
component's `(ready)` output or after `whenReady()`:

```ts
const ui = editorComponent.getService(EditorUIServiceKey);
if (ui) {
  const release = ui.registerInteraction(controlsElement);
  const unsubscribe = ui.subscribeActions((actions) => actionsSignal.set(actions));
  destroyRef.onDestroy(() => { unsubscribe(); release(); });
}
```

Use Angular's `@for (action of actions(); track action.id)` to preserve control identity.
Reconnect and dispose the previous subscriptions if an init-only input creates a new editor
generation. The [complete Angular example](https://github.com/Samyssmile/notectl/blob/main/examples/angular/src/app/custom-ui.component.ts)
does this on every `ready` event. Run the Angular demo and open `/custom-ui`.
Angular does not derive a second formatting or selection state.

## Styling and cleanup

`Theme`, `createTheme()` and the existing `--notectl-*` tokens remain responsible for color.
Use tokens such as `--notectl-fg`, `--notectl-toolbar-bg`, `--notectl-primary` and
`--notectl-focus-ring` in your styles. Styles registered through a plugin apply inside the
editor's Shadow DOM, including its shared popups. They do not style external controls.

For external controls, put your application's token overrides on a common ancestor of both
the controls and editor, or apply the same theme values to their own stylesheet. Variables
defined only inside the editor's shadow tree cannot inherit outward. Use application CSS
or adopted stylesheets for external controls. The core popup positioning uses the existing
CSP-compatible style runtime; no inline style attributes are required.

```ts
unsubscribeActions();
unsubscribeSelection();
unregister();
controls.remove();
await editor.destroy();
```

Before `whenReady()`, the editor's `getService()` returns `undefined`. Plugin initialization
can acquire a service reference, but actions and geometry are usable from `onReady()`.
After destroy, the editor no longer exposes the service. Retained UI references return empty
actions, null geometry, `false` for execution/focus and `null` for opening an action. New
subscriptions are inert; outstanding subscriptions, layout observers and scheduled measurements
are disposed. A retained popup service rejects `open()` after destruction. Reinitialization
creates a fresh service; discard old references.
