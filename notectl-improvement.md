# notectl Core Improvements Required for ImagePlugin

## Status: BLOCKING

Die Core-API von notectl bietet eine hervorragende Grundlage (NodeSpec, NodeView, FileHandler, Transaction-System), aber es fehlen entscheidende Extension Points, die ein sauberes ImagePlugin verhindern. Ohne diese Verbesserungen wäre jede Implementierung ein Workaround.

---

## 1. HTML-Serialisierung ist nicht erweiterbar

**Problem:** `NotectlEditor.getHTML()` serialisiert Block-Typen hardcoded (`blockToHTML()`). Es gibt keinen Mechanismus, über den Plugins ihre eigene HTML-Serialisierung registrieren können.

**Betrifft:** Jedes Plugin mit eigenem Block-Typ — nicht nur Image, sondern auch Table.

**Aktueller Code** (`NotectlEditor.ts:579-605`):
```typescript
private blockToHTML(block: BlockNode): string {
    if (block.type === 'horizontal_rule') return '<hr>';
    // ... heading, blockquote hardcoded
    return `<p${style}>${content}</p>`; // Fallback: alles wird <p>
}
```

Ein `image_block` würde als `<p><br></p>` serialisiert — **Datenverlust**.

**Lösung:** `NodeSpec` um eine optionale `toHTML()` Methode erweitern:

```typescript
interface NodeSpec<T extends string = string> {
    // ... bestehende Felder
    /** Serializes the block to an HTML string. Used by getHTML(). */
    toHTML?(node: BlockNode): string;
}
```

Dann in `blockToHTML()`:
```typescript
private blockToHTML(block: BlockNode): string {
    const spec = this.pluginManager?.schemaRegistry.getNodeSpec(block.type);
    if (spec?.toHTML) return spec.toHTML(block);
    // ... bestehende Fallbacks für built-in types
}
```

**Gleiches gilt für InlineNodeSpec** — `textNodeToHTML()` kennt keine InlineNodes. Es braucht:

```typescript
interface InlineNodeSpec<T extends string = string> {
    // ... bestehende Felder
    /** Serializes the inline node to an HTML string. Used by getHTML(). */
    toHTML?(node: InlineNode): string;
}
```

---

## 2. HTML-Parsing ist nicht erweiterbar

**Problem:** `NotectlEditor.setHTML()` und `HTMLParser` erkennen nur hardcoded HTML-Elemente. Plugins können keine eigenen Parse-Regeln registrieren.

**Betrifft:** `<img>`, `<table>` (bereits problematisch), `<video>`, und alle zukünftigen Block-Typen.

**Aktueller Code:**
- `HTMLParser.ts:18-37` — `BLOCK_ELEMENTS` enthält kein `IMG`
- `HTMLParser.ts:39-54` — `INLINE_ELEMENTS` enthält kein `IMG`
- `NotectlEditor.ts:664-722` — `parseHTMLToDocument()` kennt kein `<img>`

Ein `<img src="...">` im HTML wird komplett ignoriert — **Datenverlust**.

**Lösung:** `NodeSpec` und `InlineNodeSpec` um `parseHTML()` erweitern:

```typescript
interface NodeSpec<T extends string = string> {
    // ... bestehende Felder
    /** Declares which HTML elements this spec can parse. */
    parseHTML?: readonly ParseRule[];
}

interface ParseRule {
    /** CSS selector or tag name to match. */
    readonly tag: string;
    /** Extracts attributes from the matched DOM element. */
    getAttrs?(element: HTMLElement): Record<string, unknown> | false;
    /** Priority (higher = tested first). Default: 50. */
    readonly priority?: number;
}
```

Die `HTMLParser` Klasse muss dann Schema-aware werden und registrierte ParseRules berücksichtigen.

---

## 3. DOMPurify-Konfiguration ist nicht erweiterbar

**Problem:** Die `ALLOWED_TAGS` und `ALLOWED_ATTR` Listen in `PasteHandler` und `NotectlEditor` sind hardcoded. Plugins können keine eigenen Tags/Attribute erlauben.

**Betrifft:**
- `PasteHandler.ts:49-51` — HTML-Paste sanitiert mit fixer Allowlist
- `NotectlEditor.ts:297-323` — `getHTML()` sanitiert Output
- `NotectlEditor.ts:328-355` — `setHTML()` sanitiert Input

`<img>` Tags werden bei Paste und setHTML komplett entfernt, selbst wenn ein ImagePlugin registriert ist.

**Lösung:** `SchemaRegistry` um Sanitization-Konfiguration erweitern:

```typescript
class SchemaRegistry {
    // ... bestehende Methoden

    /** Returns merged ALLOWED_TAGS from all registered specs. */
    getAllowedTags(): string[] { /* ... */ }

    /** Returns merged ALLOWED_ATTR from all registered specs. */
    getAllowedAttrs(): string[] { /* ... */ }
}
```

Jeder `NodeSpec`/`InlineNodeSpec` deklariert seine benötigten Tags und Attribute:

```typescript
interface NodeSpec<T extends string = string> {
    // ... bestehende Felder
    /** HTML tags this spec needs allowed through sanitization. */
    readonly sanitize?: {
        readonly tags?: readonly string[];
        readonly attrs?: readonly string[];
    };
}
```

---

## 4. Drop-Position wird nicht extrahiert

**Problem:** `EditorView.onDrop()` übergibt `position: null` an FileHandler, obwohl die `FileHandler`-Signatur eine `Position` akzeptiert. Bei Drag-and-Drop von Bildern wird das Bild an der aktuellen Cursor-Position eingefügt statt an der Drop-Position.

**Aktueller Code** (`EditorView.ts:282-303`):
```typescript
private onDrop(e: DragEvent): void {
    // ...
    const result = handler(files, null); // <- position ist immer null
}
```

**Lösung:** Drop-Position aus Mouse-Koordinaten extrahieren:

```typescript
private onDrop(e: DragEvent): void {
    if (!this.schemaRegistry || !e.dataTransfer) return;

    const files: File[] = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Extract drop position from mouse coordinates
    const position = this.getPositionFromPoint(e.clientX, e.clientY);

    for (const file of files) {
        const handlers = this.schemaRegistry.matchFileHandlers(file.type);
        for (const handler of handlers) {
            const result = handler(files, position);
            // ...
        }
    }
}

private getPositionFromPoint(x: number, y: number): Position | null {
    // Use document.caretPositionFromPoint / caretRangeFromPoint
    // Convert DOM position to editor Position
}
```

---

## Zusammenfassung der Änderungen

| # | Bereich | Datei(en) | Aufwand | Priorität |
|---|---------|-----------|---------|-----------|
| 1 | HTML-Serialisierung | `NodeSpec.ts`, `InlineNodeSpec.ts`, `NotectlEditor.ts` | Mittel | **Kritisch** |
| 2 | HTML-Parsing | `NodeSpec.ts`, `InlineNodeSpec.ts`, `HTMLParser.ts`, `NotectlEditor.ts` | Hoch | **Kritisch** |
| 3 | DOMPurify-Konfiguration | `SchemaRegistry.ts`, `PasteHandler.ts`, `NotectlEditor.ts` | Mittel | **Kritisch** |
| 4 | Drop-Position | `EditorView.ts` | Niedrig | **Wichtig** |

### Reihenfolge der Implementierung

1. **Zuerst** Improvement 1 + 3 — HTML-Serialisierung + Sanitization (ermöglicht `getHTML()`)
2. **Dann** Improvement 2 + 3 — HTML-Parsing + Sanitization (ermöglicht `setHTML()` und Paste)
3. **Dann** Improvement 4 — Drop-Position (verbessert UX bei Drag-and-Drop)

### Hinweis

Diese Verbesserungen sind **nicht nur für das ImagePlugin relevant**. Sie schließen eine allgemeine Architekturlücke:
- Das **TablePlugin** hat dasselbe Problem mit `getHTML()`/`setHTML()`
- Jedes zukünftige Plugin mit eigenem Block-Typ (Video, Embed, CodeBlock, etc.) profitiert davon
- Die Plugin-Architektur wird erst durch diese Erweiterungen wirklich vollständig
