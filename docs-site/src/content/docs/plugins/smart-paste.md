---
title: Smart Paste
description: Automatically detects and formats structured content when pasting.
---

The `SmartPastePlugin` detects structured content (JSON, XML) in pasted clipboard text and automatically inserts it as a formatted code block with the detected language.

## Usage

```ts
import { SmartPastePlugin } from '@notectl/core/plugins/smart-paste';

new SmartPastePlugin()
// or with custom detectors:
new SmartPastePlugin({ detectors: [myDetector] })
```

## Dependencies

This plugin requires the [CodeBlockPlugin](/notectl/plugins/code-block/) to be loaded.

## How It Works

When text is pasted, the plugin runs registered content detectors against the plain text. Each detector returns a confidence score (0--1) and a language identifier. The detector with the highest confidence above the threshold wins, and the content is inserted as a code block with the detected language.

If the cursor is already inside a code block, smart paste is skipped.

### Built-in Detectors

| Detector | Language | Description |
|----------|----------|-------------|
| JSON | `json` | Detects valid JSON objects and arrays |
| XML | `xml` | Detects XML documents and fragments |

## Configuration

```ts
interface SmartPasteConfig {
  /** Additional content detectors to register. */
  readonly detectors?: readonly ContentDetector[];
  /** Custom locale strings. */
  readonly locale?: SmartPasteLocale;
}
```

| Option | Type | Description |
|--------|------|-------------|
| `detectors` | `readonly ContentDetector[]` | Additional content detectors to register |
| `locale` | `SmartPasteLocale` | Custom locale strings |

## Custom Detectors

You can add custom detectors via configuration or at runtime via the service.

### Via Configuration

```ts
const myDetector: ContentDetector = {
  id: 'yaml',
  detect(text: string): DetectionResult | null {
    if (looksLikeYaml(text)) {
      return { language: 'yaml', formattedText: text, confidence: 0.8 };
    }
    return null;
  }
};

new SmartPastePlugin({ detectors: [myDetector] })
```

### Via Service

```ts
import { SMART_PASTE_SERVICE_KEY } from '@notectl/core/plugins/smart-paste';

// Inside a plugin's init method:
const smartPaste = context.getService(SMART_PASTE_SERVICE_KEY);
smartPaste?.registerDetector(myDetector);
```

## Accessibility

When structured content is detected and formatted, the plugin announces the detection to screen readers.

## Commands

None.

## Keyboard Shortcuts

None.
