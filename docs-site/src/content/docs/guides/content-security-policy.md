---
title: Content Security Policy
description: Run notectl under strict CSP using runtime stylesheet mode and optional nonces.
---

notectl supports strict CSP for runtime rendering.

## Quick Summary

- Default mode is `styleMode: 'strict'`.
- In strict mode, notectl avoids runtime inline `style="..."` mutations and uses a runtime stylesheet.
- Use `styleNonce` when your policy requires nonce'd `<style>` elements.

## Configuration

```ts
import { createEditor } from '@notectl/core';

const editor = await createEditor({
  styleMode: 'strict', // default
  styleNonce: window.__CSP_NONCE__,
});
```

`styleMode` options:

```ts
type RuntimeStyleMode = 'inline' | 'strict';
```

- `strict`: CSP-friendly runtime styling (recommended)
- `inline`: legacy behavior using inline style writes

## Policy Examples

### Strict CSP (recommended)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'nonce-<nonce-value>';
  style-src-attr 'none';
```

Use `styleNonce: '<nonce-value>'` during editor creation.

### Legacy Inline Mode

If you explicitly use `styleMode: 'inline'`, runtime style attributes are used and policy must allow them:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
```

## Nonce Integration

Server-render the nonce once per response and pass it into notectl:

```html
<script nonce="{{nonce}}">
  window.__CSP_NONCE__ = '{{nonce}}';
</script>
```

```ts
await createEditor({ styleMode: 'strict', styleNonce: window.__CSP_NONCE__ });
```

## Important Notes

- `styleMode` and `styleNonce` are evaluated during initialization.
- Runtime strict mode covers editor DOM behavior. If you export HTML (`getContentHTML()`), mark serialization may still include inline style attributes (for example text color or font size), which is independent from runtime rendering CSP.
