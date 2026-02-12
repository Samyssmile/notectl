# Decorations System

## Was sind Decorations?

Decorations sind **transiente, visuelle Annotationen**, die im DOM gerendert werden, aber **nicht** Teil des Document-Models sind. Sie erzeugen keine Steps, belasten nicht die Undo/Redo-History und existieren nur im Rendering.

Der Unterschied zu Marks:

| | Marks | Decorations |
|---|---|---|
| Persistenz | Im Document gespeichert | Nur im View |
| History | Erzeugen Steps, sind undo-fähig | Kein Einfluss auf History |
| Zweck | Semantische Formatierung (bold, link) | Visuelle Overlays (Highlights, Marker) |

## Wofür braucht man Decorations?

- **Suche & Ersetzen** — Treffer im Text farblich hervorheben
- **Syntax-Highlighting** — Code-Blöcke einfärben
- **Spell-Check** — Fehlerhafte Wörter unterstreichen
- **Diff-Ansicht** — Geänderte Zeilen markieren
- **Collaboration** — Cursor-Positionen anderer User anzeigen
- **Lint-Marker** — Warnungen/Fehler an Blöcken visualisieren

## Decoration-Typen

### InlineDecoration

Wendet CSS-Klassen oder Styles auf einen **Textbereich** innerhalb eines Blocks an.

```typescript
import { inlineDecoration, blockId } from '@notectl/core';

// Hebt Text von Offset 5 bis 12 in Block "b1" gelb hervor
const deco = inlineDecoration(blockId('b1'), 5, 12, {
	class: 'search-highlight',
	style: 'background: yellow',
});
```

Erzeugt im DOM:
```html
<span data-decoration="true" class="search-highlight" style="background: yellow">
	matching text
</span>
```

Die Decoration-Spans wrappen **aussen** um Mark-Elemente. Dadurch bleibt die Mark-Struktur identisch mit/ohne Decorations und SelectionSync funktioniert unverändert.

### NodeDecoration

Wendet CSS-Klassen oder Styles auf ein **ganzes Block-Element** an.

```typescript
import { nodeDecoration, blockId } from '@notectl/core';

// Fügt eine CSS-Klasse zum Block-Element hinzu
const deco = nodeDecoration(blockId('b1'), {
	class: 'active-line',
	style: 'border-left: 3px solid blue',
});
```

### WidgetDecoration (Phase 2)

Fügt ein DOM-Element an einer bestimmten Position ein. Ist definiert, aber das Rendering ist noch nicht implementiert.

## DecorationSet

`DecorationSet` ist ein **immutabler Container** für Decorations, intern indexiert nach BlockId für schnellen Zugriff.

```typescript
import { DecorationSet, inlineDecoration, nodeDecoration, blockId } from '@notectl/core';

// Erstellen
const set = DecorationSet.create([
	inlineDecoration(blockId('b1'), 0, 5, { class: 'highlight' }),
	inlineDecoration(blockId('b1'), 8, 15, { class: 'highlight' }),
	nodeDecoration(blockId('b2'), { class: 'error-line' }),
]);

// Abfragen
set.find(blockId('b1'));        // Alle Decorations für Block b1
set.findInline(blockId('b1')); // Nur InlineDecorations
set.findNode(blockId('b2'));   // Nur NodeDecorations

// Erweitern (gibt neue Instanz zurück)
const extended = set.add([
	inlineDecoration(blockId('b3'), 0, 10, { class: 'new' }),
]);

// Entfernen
const filtered = set.remove((d) => d.type === 'node');

// Mergen
const merged = set1.merge(set2);

// Vergleichen
set1.equals(set2); // Referenz-Check zuerst, dann strukturell

// Leere Instanz
DecorationSet.empty;
set.isEmpty; // boolean
```

## Plugin-Integration

Um Decorations aus einem Plugin bereitzustellen, implementiere die optionale `decorations()` Methode:

```typescript
import type { Plugin, PluginContext, EditorState } from '@notectl/core';
import { DecorationSet, inlineDecoration } from '@notectl/core';

export class SearchHighlightPlugin implements Plugin {
	readonly id = 'search-highlight';
	readonly name = 'Search Highlight';

	private context!: PluginContext;
	private query = '';
	private cachedState: EditorState | null = null;
	private cachedDecos: DecorationSet = DecorationSet.empty;

	init(context: PluginContext): void {
		this.context = context;

		context.registerCommand('search', () => {
			// ... UI öffnen, query setzen
			return true;
		});
	}

	/**
	 * Wird nach jedem state.apply() aufgerufen, VOR der DOM-Reconciliation.
	 * Sollte gecacht werden — nur bei Änderungen neu berechnen.
	 */
	decorations(state: EditorState): DecorationSet {
		if (!this.query) return DecorationSet.empty;

		// Cache: nur neu berechnen wenn sich der State geändert hat
		if (state === this.cachedState) return this.cachedDecos;
		this.cachedState = state;

		const decos: InlineDecoration[] = [];

		for (const block of state.doc.children) {
			const text = getBlockText(block);
			let idx = text.indexOf(this.query);
			while (idx !== -1) {
				decos.push(
					inlineDecoration(block.id, idx, idx + this.query.length, {
						class: 'search-match',
					}),
				);
				idx = text.indexOf(this.query, idx + 1);
			}
		}

		this.cachedDecos = DecorationSet.create(decos);
		return this.cachedDecos;
	}

	setQuery(query: string): void {
		this.query = query;
		// State-Change triggern damit Decorations neu gerendert werden
		const state = this.context.getState();
		const tr = state.transaction('command').build();
		this.context.dispatch(tr);
	}
}
```

## Architektur / Datenfluss

```
Plugin.decorations(state)
    → DecorationSet

PluginManager.collectDecorations(state)
    → merged DecorationSet (alle Plugins)

EditorView: speichert old + new DecorationSet
    → übergibt beide an Reconciler

Reconciler:
    1. blockChanged() prüft ob sich Decorations geändert haben
    2. renderBlock() wendet NodeDecorations auf Block-Elemente an
    3. renderBlockContent() nutzt Segment-Splitting für InlineDecorations

DOM: <span data-decoration="true"> wraps text ranges
```

### Segment-Splitting-Algorithmus (InlineDecorations)

Wenn InlineDecorations vorhanden sind, werden TextNodes in Micro-Segments aufgeteilt:

1. TextNodes werden zu Offset-Ranges flattened: `[{text, marks, from, to}, ...]`
2. Split-Points werden gesammelt (Segment-Grenzen + Decoration-Grenzen)
3. Für jeden Abschnitt zwischen zwei Split-Points wird ein Micro-Segment erzeugt
4. Rendering: `TextNode → Mark-Wrapping (innen) → Decoration-Wrapping (aussen)`

Ohne InlineDecorations wird der bestehende Fast-Path genutzt — kein Performance-Overhead.

## API-Referenz

### Factory Functions

```typescript
// InlineDecoration erstellen
inlineDecoration(blockId: BlockId, from: number, to: number, attrs: DecorationAttrs): InlineDecoration

// NodeDecoration erstellen
nodeDecoration(blockId: BlockId, attrs: DecorationAttrs): NodeDecoration

// WidgetDecoration erstellen (Rendering Phase 2)
widgetDecoration(blockId: BlockId, offset: number, toDOM: () => HTMLElement, options?: {
	side?: -1 | 1;  // -1 = vor dem Offset, 1 = nach dem Offset
	key?: string;
}): WidgetDecoration
```

### DecorationAttrs

```typescript
interface DecorationAttrs {
	class?: string;    // CSS-Klassen (space-separated)
	style?: string;    // Inline-Styles
	nodeName?: string; // HTML-Tag (default: 'span')
	[key: string]: string | undefined; // Weitere HTML-Attribute
}
```

### DecorationSet

| Methode | Beschreibung |
|---|---|
| `DecorationSet.create(decos)` | Erstellt ein Set aus einem Array |
| `DecorationSet.empty` | Leere Singleton-Instanz |
| `set.find(blockId)` | Alle Decorations für einen Block |
| `set.findInline(blockId)` | Nur InlineDecorations |
| `set.findNode(blockId)` | Nur NodeDecorations |
| `set.findWidget(blockId)` | Nur WidgetDecorations |
| `set.add(decos)` | Neue Instanz mit zusätzlichen Decorations |
| `set.remove(predicate)` | Neue Instanz ohne matching Decorations |
| `set.merge(other)` | Zwei Sets zusammenführen |
| `set.equals(other)` | Struktureller Vergleich |
| `set.isEmpty` | `true` wenn keine Decorations enthalten |
| `set.map()` | Offset-Mapping (gibt aktuell `empty` zurück — Plugins recomputen) |

## Noch nicht implementiert (Phase 2)

- **WidgetDecoration-Rendering** — Erfordert SelectionSync-Anpassung (TreeWalker muss Widget-Content skippen)
- **DecorationSet.map()** — Vollständiges Offset-Mapping durch Steps. Aktuell müssen Plugins bei jedem State-Change neu berechnen.
- **Cross-Plugin Decoration-Zugriff** — `getDecorations()` auf PluginContext
