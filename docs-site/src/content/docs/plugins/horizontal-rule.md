---
title: Horizontal Rule Plugin
description: Horizontal divider lines.
---

The `HorizontalRulePlugin` adds horizontal rule (divider) support.

## Usage

```ts
import { HorizontalRulePlugin } from '@notectl/core';

new HorizontalRulePlugin()
```

## Configuration

```ts
interface HorizontalRuleConfig {
  separatorAfter?: boolean;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `insertHorizontalRule` | Insert a horizontal rule followed by a new paragraph |

```ts
editor.executeCommand('insertHorizontalRule');
```

## Input Rules

| Pattern | Result |
|---------|--------|
| `---` (three or more dashes) | Horizontal rule |

## Node Spec

| Type | HTML Tag | Description |
|------|----------|-------------|
| `horizontal_rule` | `<hr>` | Void block (no content) |
