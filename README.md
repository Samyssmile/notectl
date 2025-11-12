# Notectl - An API Driven Rich Text Editor

> **Status:** Early Development (v0.0.1) - API may change

Notectl is a powerful and flexible rich text editor designed to provide an intuitive user experience while leveraging
the capabilities of modern web technologies. It is built with a focus on extensibility, allowing developers to easily
integrate it into their applications and customize its functionality to meet specific needs.

**Main Goal:** Provide a type-safe, extensible Web Component that delivers a modern rich text editor experience without depending on framework-specific wrappers.

![img.png](img.png)

## 🚀 Quick Start

### Installation

```bash
# Core editor (Web Component)
npm install @notectl/core

# Toolbar plugin (formatting, tables, history, etc.)
npm install @notectl/plugin-toolbar

> Table creation, keyboard navigation, and the contextual menu now live inside the toolbar plugin. Use `createToolbarPlugin({ table: { enabled: boolean, config } })` to turn them on/off or override defaults.
```

### Basic Usage

#### Vanilla JavaScript (Web Component)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="node_modules/@notectl/core/dist/notectl-core.umd.cjs"></script>
  <script src="node_modules/@notectl/plugin-toolbar/dist/toolbar.umd.cjs"></script>
</head>
<body>
<div id="editor"></div>

<script>
  async function initEditor() {
    const editor = new NotectlCore.NotectlEditor();
    document.getElementById('editor').appendChild(editor);

    // Wait for DOM connection
    await new Promise(resolve => setTimeout(resolve, 50));

    // Register plugins
    await editor.registerPlugin(NotectlToolbar.createToolbarPlugin());

    // Listen to changes
    editor.on('change', (data) => {
      console.log('Content changed:', editor.getHTML());
    });
  }

  initEditor().catch(console.error);
</script>
</body>
</html>
```

> ⚠️ Framework-specific adapters have been removed for now. Wrap the Web Component manually (e.g., via custom elements support) until official packages return.

### Examples

- `examples/vanillajs` – Vite-based demo that hot-reloads the editor during development.
- `examples/vanillajs-local` – static HTML example that reads the freshly built local bundles (no npm install required).

## 📦 Monorepo Structure

```
notectl/
├── packages/
│   ├── core/              # Framework-agnostic Web Component + state
│   ├── plugins/
│   │   └── toolbar/       # Toolbar plugin (includes table tools)
│   └── shared/            # Shared configuration/utilities
├── examples/
│   ├── vanillajs/         # Vite demo using workspace packages
│   └── vanillajs-local/   # Zero-registry example bootstrapped from local dist
└── …                      # Specs, design notes, tooling
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd notectl

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Type check
npm run type-check

# Format code
npm run format
```

### Build System

This project uses [Turborepo](https://turbo.build) for efficient monorepo builds:

- **Parallel builds**: All packages build concurrently
- **Caching**: Incremental builds with intelligent caching
- **TypeScript**: Full type generation with `vite-plugin-dts`
- **Bundle formats**: UMD and ESM for maximum compatibility

### Testing

```bash
# Run all tests
npm run test

# Watch mode (development)
npm run dev
```

## 📄 License

MIT - See individual package.json files for details

## Features

- **Toolbar**: A customizable toolbar that provides quick access to common formatting options such as bold, italic,
  underline, and more.
- **API Driven**: A robust API that allows developers to programmatically control the editor's behavior and content.
- **Extensible**: A plugin architecture that enables developers to add new features and functionality to the editor.
- **Cross-Platform**: Compatible with all major browsers and devices, ensuring a consistent experience for users.
- **HTML Support**: Ability to import and export content in HTML format.
- **Custom Fonts and Styles**: Support for custom fonts and styles to match the look and feel of your application.

### Detailed Requirements

#### Toolbar

Notectl must have a plugin system. The toolbar should be implemented as a plugin to allow for easy customization and
extension.

- The toolbar should be fully customizable, allowing developers to add, remove, or modify buttons and their
  functionalities.
- Possibility to add more than one toolbar. And the position of the toolbar should be configurable (top, bottom, left,
  right).
- The toolbar should support grouping of related buttons for better organization.

#### Toolbar Functions

- Basic text formatting options: bold, italic, underline, strikethrough.
- Text alignment options: left, center, right, justify.
- List options: ordered list, unordered list.
- Link insertion and editing.
- Image insertion and editing.
- Undo and redo functionality.
- Font size and color selection.
- Fomt family selection.
- Background color selection.
- Table insertion and editing.
- Code block insertion.

##### Fonts

- It must be possible to add custom fonts.
- It must be possible to add custom font sizes. For Dropdown toolbar menu, where a user can choose from a list of
  predefined font sizes.

#### Table

Table support ships with the toolbar plugin. Configure it through `createToolbarPlugin({ table: { enabled, config } })`
to toggle availability or override defaults (rows, columns, merge/split permissions, menu visibility).

- The editor supports table creation and editing, including adding/removing rows and columns, merging cells, and styling.
- Context menus and keyboard navigation can be enabled/disabled per action via the toolbar `table.menu` configuration.

#### Smart Delta Management

- The editor should maintain a history of changes to support undo and redo operations.
- Changes should be tracked in a way that allows for efficient storage and retrieval.

#### Content Format

- The editor should support importing and exporting content in both HTML formats and json.
- The editor should store, manage content in JSON.

### Accessibility

- The editor should be fully accessible, adhering to WCAG 2.1 AAA guidelines.
- The editor must support full keyboard navigation, provide ARIA labels for all interactive elements, and ensure high
  contrast ratios. (that will be definied in theme)

-

### Internationalization

- The editor should support multiple languages and be easily translatable.
- Right-to-left (RTL) text support.

### Theming

- The editor should support theming, allowing developers to customize the look and feel to match their application's
  design.
- It should be possible to switch between light and dark modes.

### Framework Agnostic

Notectl ships purely as a standards-based Web Component written in TypeScript. Every integration talks to the same DOM
element, regardless of whether you mount it in plain HTML, Astro, Next.js, or a home-grown stack. Lightweight wrappers
can still be authored per project, but they no longer live in this repository—keeping the core lean, predictable, and
100% framework-neutral.

### Non-Functional Requirements

- **Security:** All HTML sanitization must prevent XSS and script injection.
- **Extensibility:** New plugins can be added without modifying the core.

### Architecture Overview

Notectl consists of three layers:

1. **Core Engine** – a framework-agnostic Web Component written in TypeScript, handling the document model, command
   execution, and rendering.
2. **Plugin System** – enables custom extensions such as toolbars, content filters, or converters.
3. **Integration Layer** – optional wrappers/helpers you can build inside your product to better align with its
   framework or state management choices.

# Notectl Delta Design

> **Scope:** This document specifies the delta (change) format used by Notectl to represent edits as small, composable
> operations that can be transported, persisted, merged, and undone/redone across frameworks.

---

## 1) Why a Delta Format?

A delta format encodes *intent* (e.g., insert text, toggle bold, insert a table row) rather than a full document
snapshot. Benefits:

* Efficient bandwidth & storage (send/apply only changes)
* Reliable undo/redo (via inverse ops)
* Realtime collaboration (OT/CRDT friendly)
* Extensibility (new operations and node types)

---

## 2) Design Goals

* **Framework-agnostic:** Works in every environment that can host Web Components (Vanilla JS, Astro, Next.js, etc.).
* **Deterministic & Composable:** Applying the same ordered deltas on the same base produces identical state.
* **Merge-friendly:** Supports operational transformation (OT) *and* CRDT causal ordering.
* **Accessible by design:** Operations can target ARIA/alt attributes and preserve WCAG constraints.
* **Versioned & Evolvable:** Forward/backward compatibility via semantic `schemaVersion` and operation discovery.

---

## 3) Delta Envelope

A delta is a transactional envelope around one or more **atomic operations**.

```json
{
  "txnId": "uuid-v4",
  "clientId": "actor-id",
  "timestamp": "ISO-8601",
  "baseVersion": 41,
  "ltime": 1287,
  "intent": "edit",
  "undoGroup": "grp-2025-10-09T08:15",
  "ops": [
    /* atomic ops */
  ],
  "inverseOps": [
    /* optional for fast undo */
  ],
  "validation": {
    "requiresSchemaVersion": "1.0.0",
    "constraints": [
      "noDanglingRefs",
      "tableGridConsistent"
    ]
  }
}
```

**Fields**

* `txnId` — Idempotency key for deduplication; globally unique.
* `clientId` — The editing actor (for presence, attribution, ACLs).
* `timestamp` — Client wall-clock; informational only.
* `baseVersion` — Linear snapshot version the delta was authored against (OT anchor).
* `ltime` — Logical/Hybrid Lamport time for causal ordering in CRDT scenarios.
* `intent` — High-level purpose (e.g., `edit`, `comment`, `format`, `import`).
* `undoGroup` — Logical grouping for ergonomics (batch undo/redo).
* `ops` — Ordered list of atomic operations.
* `inverseOps` — Optional precomputed inverse; server can compute if omitted.
* `validation` — Schema/constraint expectations for safe application.

---

## 4) Addressing Model

Operations target parts of the document by:

* **Block identity:** `blockId` (stable per node)
* **Text offsets:** `offset` within text-bearing nodes (UTF-16 or code-point; recommend code-point)
* **Ranges:** `{ start: {blockId, offset}, end: {blockId, offset} }`

**Best practice**: All `blockId`s are UUIDs (or ULIDs) generated at creation. Offsets reference a normalized text
representation (see §8).

---

## 5) Operation Taxonomy

Operations are atomic and minimal. The core set covers 95% of editor use-cases and can be extended.

### 5.1 Text Operations

* `insert_text` — Insert `text` (with optional `marks`) at `{blockId, offset}`
* `delete_range` — Delete text across a range
* `apply_mark` — Add/remove a mark over a range `{ mark: {type, attrs?}, add: true|false }`

### 5.2 Block Operations

* `insert_block_before` / `insert_block_after` — Insert a full block node adjacent to a target
* `delete_block` — Remove a block node by `blockId`
* `set_attrs` — Partial update of a node’s `attrs` (e.g., `align`, image `alt`, table metadata)
* `wrap_in` / `lift_out` — Change block structure (e.g., paragraph → list item)

### 5.3 Table Operations

* `table_insert_row` / `table_delete_row`
* `table_insert_col` / `table_delete_col`
* `table_merge_cells` / `table_split_cell`

### 5.4 Selection & Presence

* `update_selection` — Per-actor selection/cursor update (non-content, but essential for UX)

> **Extensibility:** New operations can be added provided they define (1) preconditions, (2) transformation with other
> ops, and (3) inverse semantics.

---

## 6) Operation Schema (Examples)

```json
{
  "op": "insert_text",
  "target": {
    "blockId": "p1",
    "offset": 18
  },
  "text": "powerful ",
  "marks": []
}
```

```json
{
  "op": "apply_mark",
  "range": {
    "start": {
      "blockId": "p1",
      "offset": 18
    },
    "end": {
      "blockId": "p1",
      "offset": 26
    }
  },
  "mark": {
    "type": "bold"
  },
  "add": true
}
```

```json
{
  "op": "insert_block_after",
  "after": "ul1",
  "block": {
    "id": "p4",
    "type": "paragraph",
    "attrs": {
      "align": "left"
    },
    "children": [
      {
        "type": "text",
        "text": "i18n and RTL are supported.",
        "marks": [
          {
            "type": "italic"
          }
        ]
      }
    ]
  }
}
```

```json
{
  "op": "set_attrs",
  "target": {
    "blockId": "img1"
  },
  "attrs": {
    "alt": "Accessible screenshot of Notectl"
  }
}
```

---

## 7) Concurrency & Merging

### 7.1 OT (Operational Transformation)

* **Anchor:** `baseVersion` ties each delta to a known snapshot.
* **Transform:** When `baseVersion` is stale, transform incoming ops against intervening committed ops to produce an
  equivalent delta against the latest version.
* **Ordering:** Server applies deltas in arrival order after transformation.

### 7.2 CRDT (Causal Ordering)

* **Clock:** `ltime` provides a causal order; ties are broken by a total ordering (e.g., `(ltime, clientId, txnId)`).
* **Commutativity:** Define op-specific conflict rules (e.g., text-position bias left/right; attribute last-writer-wins
  or field-wise merge).

> **Hybrid Approach:** Use OT for text precision and CRDT (Lamport/HLC) for causal metadata and offline safety.

---

## 8) Normalization & Offsets

* Normalize text to NFC and count offsets by Unicode **code points** (not UTF-16 units) to avoid surrogate pitfalls.
* Collapse adjacent text nodes with identical mark sets.
* Enforce structural invariants (e.g., list → list_item → paragraph nesting).

---

## 9) Validation

`validation.constraints` advertises expectations the server enforces before commit:

* `noDanglingRefs` — every referenced `blockId` exists
* `tableGridConsistent` — cell spans align to declared row/col counts
* `altOrDecorative` — images must have `alt` or `decorative: true`
* `rtlIntegrity` — bidirectional text nodes maintain correct embedding

Failures return a structured error (see §13).

---

## 10) Undo/Redo

* **Fast path:** apply `inverseOps` if present; else compute inverse by replaying op semantics against current state.
* **User ergonomics:** `undoGroup` lets the client batch small keystrokes or related actions.
* **Permissions:** inverse must be authorized the same way as the original delta.

---

## 11) Selections & Presence

Selections live alongside content edits for a cohesive UX:

* `update_selection` ops are **order-independent** and do not change `version`.
* Presence data (cursors, names, colors) is maintained per `clientId`.

---

## 12) Transport & API Contracts

* **Idempotency:** Servers must treat `(txnId, clientId)` as idempotent.
* **Batching:** Multiple deltas may be batched; server emits the resulting `version`.
* **Subscription:** Clients can subscribe to committed deltas and periodic snapshots.
* **Backpressure:** Server may NAK with `retryAfter` when hot paths are saturated.

---

## 13) Errors & Recovery

Unified error envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Table grid inconsistent",
    "details": {
      "tableId": "tbl1",
      "rowIndex": 2
    }
  }
}
```

Recovery patterns:

* Client fetches latest snapshot + diff, replays local queue, and resubmits.
* Exponential backoff for transient errors.

---

## 14) Security & Integrity

* **AuthZ:** Each delta checked against document ACLs and plugin-level capabilities.
* **Sanitization:** `set_attrs` is HTML-sanitized (no scripts, no `on*` attributes).
* **Integrity:** Optional HMAC over the delta envelope for tamper evidence.

---

## 15) Versioning & Migration

* `requiresSchemaVersion` guards forward-incompatible ops.
* Server advertises supported op types and schema in capabilities.
* Migrations ship as deltas when possible; otherwise as snapshot upgrades.

---

## 16) Storage & Compaction

* Append-only delta log with periodic **compaction** into snapshots (e.g., every N ops or M minutes).
* Index by `version` and `txnId` for fast fetch and dedupe.
* Keep recent inverse deltas for time-bounded undo across sessions.

---

## 17) Accessibility & i18n

* Image/text ops must not violate `altOrDecorative`.
* BiDi safe ranges: selection and mark ops respect grapheme clusters and script boundaries.
* `dir` and `locale` live in state; ops may set attributes that affect assistive tech.

---

## 18) Performance Tips

* Prefer fewer, larger deltas (batch keystrokes ~50–100ms).
* Avoid deep tree churn; use `set_attrs` over delete+insert for minor changes.
* On slow links, compress delta streams (e.g., gzip/brotli) and dedupe marks.

---

## 19) Example Delta (End-to-end)

```json
{
  "txnId": "d8b3f0e9-0e5f-4a33-b6a1-8d5c2a9a1f50",
  "clientId": "u_1",
  "timestamp": "2025-10-09T08:15:20Z",
  "baseVersion": 41,
  "ltime": 1287,
  "intent": "edit",
  "undoGroup": "grp-2025-10-09T08:15",
  "ops": [
    {
      "op": "insert_text",
      "target": {
        "blockId": "p1",
        "offset": 18
      },
      "text": "leistungsfähiger ",
      "marks": []
    },
    {
      "op": "apply_mark",
      "range": {
        "start": {
          "blockId": "p1",
          "offset": 18
        },
        "end": {
          "blockId": "p1",
          "offset": 32
        }
      },
      "mark": {
        "type": "bold"
      },
      "add": true
    },
    {
      "op": "set_attrs",
      "target": {
        "blockId": "img1"
      },
      "attrs": {
        "alt": "Accessible screenshot of Notectl"
      }
    },
    {
      "op": "insert_block_after",
      "after": "ul1",
      "block": {
        "id": "p4",
        "type": "paragraph",
        "attrs": {
          "align": "left"
        },
        "children": [
          {
            "type": "text",
            "text": "Multilingual (i18n) and RTL are supported.",
            "marks": [
              {
                "type": "italic"
              }
            ]
          }
        ]
      }
    },
    {
      "op": "table_insert_row",
      "target": {
        "tableId": "tbl1",
        "rowIndex": 2
      },
      "row": {
        "id": "tr3",
        "type": "table_row",
        "children": [
          {
            "id": "tc5",
            "type": "table_cell",
            "children": [
              {
                "type": "paragraph",
                "children": [
                  {
                    "type": "text",
                    "text": "Accessibility"
                  }
                ]
              }
            ]
          },
          {
            "id": "tc6",
            "type": "table_cell",
            "children": [
              {
                "type": "paragraph",
                "children": [
                  {
                    "type": "text",
                    "text": "WCAG 2.1 AAA"
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    {
      "op": "update_selection",
      "actorId": "u_1",
      "selection": {
        "anchor": {
          "blockId": "p4",
          "offset": 0
        },
        "head": {
          "blockId": "p4",
          "offset": 0
        }
      }
    }
  ],
  "inverseOps": [
    {
      "op": "delete_range",
      "range": {
        "start": {
          "blockId": "p1",
          "offset": 18
        },
        "end": {
          "blockId": "p1",
          "offset": 33
        }
      }
    },
    {
      "op": "apply_mark",
      "range": {
        "start": {
          "blockId": "p1",
          "offset": 18
        },
        "end": {
          "blockId": "p1",
          "offset": 32
        }
      },
      "mark": {
        "type": "bold"
      },
      "add": false
    },
    {
      "op": "set_attrs",
      "target": {
        "blockId": "img1"
      },
      "attrs": {
        "alt": "Screenshot of Notectl"
      }
    },
    {
      "op": "delete_block",
      "target": {
        "blockId": "p4"
      }
    },
    {
      "op": "table_delete_row",
      "target": {
        "tableId": "tbl1",
        "rowIndex": 2
      }
    },
    {
      "op": "update_selection",
      "actorId": "u_1",
      "selection": {
        "anchor": {
          "blockId": "p1",
          "offset": 18
        },
        "head": {
          "blockId": "p1",
          "offset": 24
        }
      }
    }
  ],
  "validation": {
    "requiresSchemaVersion": "1.0.0",
    "constraints": [
      "noDanglingRefs",
      "tableGridConsistent",
      "altOrDecorative"
    ]
  }
}
```

---

## 20) Implementation Checklist (for reference)

* [ ] Define canonical op schemas & transformation rules
* [ ] Decide offset policy (code points) & normalization (NFC)
* [ ] Server: apply-validate-transform pipeline (OT) + causal clock (CRDT)
* [ ] Snapshot + compaction policy
* [ ] Error envelopes & idempotency handling
* [ ] Security: ACL checks, sanitization, optional HMAC
* [ ] Plugin API: register new ops with preconditions, transform, inverse
* [ ] Conformance tests: replay, fuzz, round-trip, cross-client

# notectl
