# Caret Movement in Rich Text Editors: Analysis & Strategy for notectl

## Inhaltsverzeichnis

1. [Warum Caret Movement so schwierig ist](#1-warum-caret-movement-so-schwierig-ist)
2. [Ist-Zustand in notectl](#2-ist-zustand-in-notectl)
3. [Wie andere Editoren es loesen](#3-wie-andere-editoren-es-loesen)
4. [Vergleichstabelle](#4-vergleichstabelle)
5. [Best-Practice-Empfehlung fuer notectl](#5-best-practice-empfehlung-fuer-notectl)
6. [Design-Entscheidungen und Trade-offs](#6-design-entscheidungen-und-trade-offs)
7. [Implementierungsplan](#7-implementierungsplan)

---

## 1. Warum Caret Movement so schwierig ist

Caret Movement ist eines der komplexesten Probleme in Custom Rich Text Editoren.
Die Schwierigkeit entsteht durch die Kombination folgender Faktoren:

### 1.1 Browser-Inkonsistenzen

Jeder Browser implementiert `contentEditable` anders:

- **Firefox**: Cursor verschwindet neben `contenteditable="false"` Elementen
- **Chrome/Safari**: Fuegen "Phantom-Cursor-Positionen" um inline non-editable Nodes ein
- **Safari**: Down-Arrow versagt bei inline non-editable Nodes am Zeilenanfang
- **Android Chrome**: `selectionchange` feuert vor dem ersten Input-Event mit falschen Daten

### 1.2 Logische vs. visuelle Position

Der Cursor hat zwei Identitaeten, die nicht immer uebereinstimmen:

- **Logische Position**: Offset im Datenmodell (z.B. Block `b1`, Offset 5)
- **Visuelle Position**: Pixel-Koordinate auf dem Bildschirm

Probleme entstehen bei:
- **Zeilenumbruch**: Ende von Zeile N = Anfang von Zeile N+1 (gleicher Offset, andere Pixel-Position)
- **BiDi-Text**: "Links" im Layout ist nicht immer "rueckwaerts" im Offset-Raum
- **Inline-Nodes**: Ein `contenteditable="false"` Element unterbricht den Text-Flow

### 1.3 Unsichtbare Positionen

Bestimmte Dokument-Positionen sind fuer den Browser schlicht unerreichbar:

- Zwischen zwei benachbarten `contenteditable="false"` Block-Nodes
- Vor/nach einem Void-Block am Dokumentanfang/-ende
- An Mark-Grenzen (ist der Cursor in `**bold**` oder in `plain`?)

### 1.4 IME/Composition

CJK-Input und Android-Keyboards erfordern, dass waehrend der Composition weder DOM noch
Selection veraendert werden. Das macht Caret Movement waehrend Composition zur "Nightmare
Difficulty" (Lexical-Team).

### 1.5 Cursor-Affinitaet (Bias)

Am Soft-Wrap-Punkt hat ein einzelner logischer Offset zwei visuelle Positionen:
- Ende von Zeile N (rechter Rand)
- Anfang von Zeile N+1 (linker Rand)

Der Browser loest das implizit -- wenn der User Arrow-Right drueckt und am Wrap ankommt,
steht der Cursor am Anfang der naechsten Zeile. Drueckt er End, steht er am Ende der
aktuellen. Der **gleiche Offset** hat zwei visuelle Darstellungen.

ProseMirror hat dafuer kein explizites Konzept. Slate ebenso wenig. Einige Editoren
(CodeMirror, VS Code) modellieren das als `assoc: -1 | 1` auf der Position. Fuer notectl
ist die pragmatische Loesung: den Browser entscheiden lassen (indem wir `Selection.modify()`
nutzen statt eigene Positionen zu berechnen, wo immer moeglich).

---

## 2. Ist-Zustand in notectl

### 2.1 Selection Model

notectl modelliert die Selection als immutable Datenstruktur in einer Discriminated Union:

```typescript
// model/Selection.ts
interface Position {
  readonly blockId: BlockId;
  readonly offset: number;
  readonly path?: readonly BlockId[];  // fuer nested Structures (Tables)
}

interface Selection {           // TextSelection (kein type-Feld)
  readonly anchor: Position;
  readonly head: Position;
}

interface NodeSelection {       // Void-Block-Selection
  readonly type: 'node';
  readonly nodeId: BlockId;
  readonly path: readonly BlockId[];
}

type EditorSelection = Selection | NodeSelection;
```

Type Guards: `isNodeSelection(sel)` prueft `'type' in sel && sel.type === 'node'`,
`isTextSelection(sel)` ist die Negation. Die Discriminated Union nutzt das
Vorhandensein/Fehlen des `type`-Feldes als Diskriminator.

Offsets werden in "Inline Content Width" gemessen:
- Textzeichen = String-Laenge
- InlineNodes (z.B. Hard Break) = Width 1
- Marks haben keinen Einfluss auf den Offset

### 2.2 Aktuelle Caret-Movement-Architektur

```
Arrow Key Press
  |
  v
KeyboardHandler.onKeydown()
  |
  +-- 1. handleNodeSelectionKeys(): Wenn NodeSelection aktiv
  |     -> navigateArrowIntoVoid() fuer Arrows
  |     -> deleteNodeSelection() fuer Backspace/Delete
  |     -> splitBlockCommand() fuer Enter
  |
  +-- 2. handleArrowIntoVoid(): Wenn Void-Block adjacent
  |     -> navigateArrowIntoVoid() -> dispatch Transaction
  |     -> NUR unmodifizierte Arrow Keys (kein Shift/Ctrl/Alt/Meta)
  |
  +-- 3. Plugin-Keymaps (Reverse-Iteration: letzter registrierter gewinnt)
  |     -> code_block: Arrow-Handling an Zeilengrenzen
  |     -> table: Tab/Arrow/Enter-Handling zwischen Zellen
  |
  +-- 4. Built-in Shortcuts (Mod+Z Undo, Mod+A Select All)
  |
  +-- 5. Browser handled nativ
       |
       v
  selectionchange Event
       |
       v
  EditorView.syncSelectionFromDOM()
       |
       v
  readSelectionFromDOM() [DOM -> State via TreeWalker]
       |
       v
  Transaction mit neuer Selection -> applyUpdate -> reconcile -> syncSelectionToDOM
```

### 2.3 Bidirektionale Selection-Sync

**State -> DOM** (`syncSelectionToDOM` in `SelectionSync.ts`):
- `statePositionToDOM()` wandelt (blockId, offset) in (DOMNode, DOMOffset) um
- Traversiert Inline Content via TreeWalker (Text + InlineNodes)
- Handelt leere Paragraphen mit `<br>` Elementen
- Unterstuetzt `contentDOM`-Resolution fuer NodeView-Blocks (`data-content-dom`)
- Fallback auf Block-Ende bei Fehlern

**DOM -> State** (`readSelectionFromDOM` in `SelectionSync.ts`):
- `domPositionToState()` nutzt `createInlineContentWalker()` mit Custom-Filter
- Filter akzeptiert: Text Nodes + `contenteditable="false"` Inline-Elemente
- Filter ueberspringt: Mark-Wrapper, Decoration-Wrapper (FILTER_SKIP -> descend)
- Filter rejected: Nested Blocks (`data-block-id`), Inline-Element-Children (FILTER_REJECT -> skip subtree)
- Zaehlt InlineNode-Widths korrekt (Width 1 pro Inline-Element)
- Baut Block-Path aus `data-block-id` Ancestors

### 2.4 Keymap-System (Ist-Zustand)

```typescript
// input/Keymap.ts
type KeymapHandler = () => boolean;
type Keymap = Readonly<Record<string, KeymapHandler>>;
```

Registrierung via `PluginContext.registerKeymap(keymap)` -- Keymaps werden in einem
Array in `SchemaRegistry._keymaps` gespeichert. `KeyboardHandler` iteriert dieses
Array **rueckwaerts** (Zeile 73: `for (let i = keymaps.length - 1; i >= 0; i--)`),
sodass spaeter registrierte Keymaps Vorrang haben.

**Kritisch**: Es gibt **keine expliziten Prioritaeten**. Die Reihenfolge wird durch
die Plugin-Init-Reihenfolge bestimmt (topologisch sortiert via Kahn's-Algorithmus in
`PluginManager`). Das ist fuer Mark-Shortcuts (Mod-B, Mod-I) ausreichend, aber nicht
fuer Navigation, wo Kontext-Keymaps (table, code_block) und globale Navigation
konkurrieren.

### 2.5 Composition-Handling (Ist-Zustand)

`InputHandler.ts` managed Composition mit einem privaten `composing`-Flag:

```
compositionstart -> this.composing = true
  Browser-DOM-Aenderungen laufen nativ (beforeinput mit insertCompositionText -> return early)
compositionend   -> this.composing = false
  Finaler Text via e.data -> insertTextCommand() -> dispatch
```

**Luecken im aktuellen Composition-Handling:**

| Komponente | Composition-aware? | Problem |
|------------|--------------------|---------|
| `InputHandler` | Ja (`composing` Flag) | Nur `beforeinput` ist geschuetzt |
| `KeyboardHandler` | **Nein** | Arrow Keys waehrend Composition werden normal verarbeitet |
| `EditorView.syncSelectionFromDOM()` | **Nein** | `selectionchange` waehrend Composition wird normal verarbeitet |
| `Reconciler` | **Nein** | Reconcile waehrend Composition kann Browser-IME-State zerstoeren |
| `SelectionSync` | **Nein** | Read/Write waehrend Composition kann Composition abbrechen |

Das `composing`-Flag in InputHandler ist **privat** und nicht fuer andere Komponenten
zugaenglich. Fuer sichere Caret-Navigation muss dieser Status zentral verfuegbar sein.

### 2.6 Bestehende Luecken (vollstaendig)

| Luecke | Beschreibung | Schweregrad |
|--------|-------------|-------------|
| Keine expliziten Movement-Commands | Kein `moveLeft`, `moveRight`, `moveUp`, `moveDown` | Mittel |
| Keine Word-Navigation | `moveWordForward`/`moveWordBackward` fehlen (nur Delete-Varianten existieren in Commands.ts) | Mittel |
| Kein `endOfTextblock`-Check | Keine Layout-aware Pruefung "ist Cursor am visuellen Block-Ende?" | **Hoch** |
| Keine GapCursor-Logik | Positionen zwischen nicht-editierbaren Blocks unerreichbar | **Hoch** |
| Keine Selection-Extension Commands | Shift+Arrow ist rein browser-gesteuert, keine programmatische API | Niedrig |
| Keine Mark-Boundary-Logik | Kein Cursor-Wrapper fuer Stored Marks | Mittel |
| Keine BiDi-Unterstuetzung | Fehlende RTL/LTR-Awareness bei Navigation | Niedrig |
| InlineNode-Stepping fehlt | Kein explizites Skip-Over fuer InlineNodes bei Arrow Left/Right | **Hoch** |
| Keine Keymap-Prioritaeten | Reverse-Array-Iteration statt expliziter Priority-Stufen | **Hoch** |
| Composition-Guardrails unvollstaendig | `composing`-Flag ist privat in InputHandler, nicht zentral verfuegbar | **Hoch** |
| Selection-Union zu schmal | `TextSelection | NodeSelection` -- Gap-Zustaende nicht modelliert | Mittel |
| Kein `Selection.modify()` | Browser-API fuer Word/Line-Boundaries nicht genutzt | Mittel |
| Kein goalColumn | Up/Down-Navigation verliert visuelle Spaltenposition | Niedrig |
| Keine Cursor-Affinitaet | Soft-Wrap-Ambiguitaet nicht modelliert | Niedrig |

---

## 3. Wie andere Editoren es loesen

### 3.1 ProseMirror

**Philosophie**: Hybrid-Ansatz -- Browser handelt innerhalb von Textbloecken, PM uebernimmt an Grenzen.

**Position Model**: Flat Integer Token-System (jede Position = ein Integer-Index in einer Token-Sequenz). `ResolvedPos` reichert rohe Positionen mit Tree-Kontext an (depth, parent, parentOffset, nodeAfter, nodeBefore).

**Key Mechanisms**:

1. **`endOfTextblock(direction)`**: Layout-aware Check ob der Cursor den aktuellen Textblock verlassen wuerde. Nutzt die Browser-Layout-Engine (nicht nur Character-Offsets), was BiDi korrekt behandelt.

2. **`capturekeys.ts`**: Intercepted Arrow Keys nur an Block-Grenzen und bei Special Nodes:
   - `selectHorizontally()`: Bei Block-Grenze -> `moveSelectionBlock()` -> `NodeSelection` oder `Selection.near()`
   - `selectVertically()`: Nutzt `endOfTextblock("up"/"down")` -> Block-Navigation
   - Browser-spezifische Workarounds (Safari, Firefox, Chrome)

3. **GapCursor Plugin**: Spezielle Selection fuer Positionen zwischen nicht-editierbaren Blocks. Position = `GapCursor($pos)` wo `$pos` zwischen Blocks liegt. Rendering via CSS (blinkende Linie). Intercepted Arrow Keys via `findGapCursorFrom()`.

4. **Selection Mapping**: `StepMap` mit Triples `[start, oldSize, newSize]`. Jede Selection wird automatisch durch Steps gemappt mit `assoc` (Bias) Parameter.

5. **Cursor Wrapper fuer Mark-Grenzen**: Lazy `<span>` mit Zero-Width-Space, erstellt on-demand bei `compositionstart`. Loest das Problem "gehoert getippter Text zum Bold oder zum Plain?".

**Staerken**: Ausgereifte Browser-Workaround-Sammlung, BiDi-Support, GapCursor, Layout-aware Boundary Detection.

**Schwaechen**: Kein echtes Cursor-Associativity (End-of-Line vs Start-of-Next-Line).

### 3.2 Lexical (Meta)

**Philosophie**: Hybrid -- Arrow Keys werden immer intercepted, aber oft an `Selection.modify()` delegiert.

**Position Model**: `PointType { key: NodeKey, offset: number, type: 'text' | 'element' }`. Fuer Text-Nodes ist offset ein Character-Index, fuer Element-Nodes ein Child-Index.

**Key Mechanisms**:

1. **Command-System mit Prioritaeten**: `KEY_ARROW_*_COMMAND` wird dispatched, Handler koennen mit Prioritaet (CRITICAL > HIGH > NORMAL > LOW > EDITOR) registriert werden.

2. **`$shouldOverrideDefaultCharacterSelection()`**: Prueft ob neben dem Cursor ein DecoratorNode liegt. Wenn ja, wird `$moveCharacter()` aufgerufen statt Browser-Default.

3. **`Selection.modify()` API**: Lexical nutzt die non-standard aber breit unterstuetzte Browser-API `window.getSelection().modify(alter, direction, granularity)` fuer die eigentliche Cursor-Bewegung. Das delegiert Line-Wrapping und BiDi an den Browser.

4. **NodeCaret API (v0.25+)**: Neues Traversal-Primitiv mit Origin-Node + Direction + Type. Immutable, richtungsabhaengig, ersetzt das fehleranfaellige manuelle PointType-Recomputing.

5. **Boundary Resolution**: `resolveSelectionPointOnBoundary()` und `$normalizeSelectionPointsForBoundaries()` passen Positionen an Node-Grenzen automatisch an.

**Staerken**: Elegantes Command-System, Selection als First-Class EditorState Member, NodeCaret fuer robustes Traversal.

**Schwaechen**: Caret unsichtbar zwischen adjacent DecoratorNodes, keine eingebaute GapCursor-Loesung, PointType-Ineffizienz (wird durch NodeCaret adressiert).

### 3.3 Slate.js

**Philosophie**: Fast komplett browser-nativ, liest DOM-Selection zurueck.

**Position Model**: `Point { path: number[], offset: number }` -- Path adressiert einen Text-Node im Baum, Offset ist Character-Index. Points referenzieren **immer** Text-Nodes (nie Element-Nodes).

**Key Mechanisms**:

1. **`Editor.positions()` Iterator**: Generator der alle validen Positionen in einem Bereich yielded. Unterstuetzt Units: `offset`, `character`, `word`, `line`, `block`. Void-Nodes werden atomar uebersprungen.

2. **Normalization-Regeln fuer Inline-Nodes**: Slate erzwingt immer `{ text: '' }` Padding-Nodes vor/nach/zwischen Inline-Elementen. Das garantiert Cursor-Landing-Positionen.

3. **Zero-Width Spaces**: Leere Text-Nodes werden mit `\uFEFF` oder `\u200B` gerendert, damit der Browser sie als echte Positionen erkennt.

4. **WeakMap Bidirectional Mapping**: `NODE_TO_ELEMENT`, `ELEMENT_TO_NODE` etc. fuer O(1) DOM<->State Konvertierung.

5. **`Transforms.move()`**: Programmatische Cursor-Bewegung mit `distance`, `unit`, `reverse`, `edge` Parametern. Nutzt intern `Editor.positions()`.

**Staerken**: Einfaches Mental Model (Points immer in Text-Nodes), automatische Selection-Updates bei Transforms, WeakMap-Pattern.

**Schwaechen**: Inline-Void am Zeilenende broken, Word-Boundary-Detection primitiv, Zero-Width-Spaces verursachen Edge Cases (Zeilenumbrueche, Drag-Selection).

---

## 4. Vergleichstabelle

| Aspekt | ProseMirror | Lexical | Slate | notectl (aktuell) |
|--------|------------|---------|-------|--------------------|
| **Position Model** | Flat Integer + ResolvedPos | PointType (key+offset+type) | Path + Point (immer Text-Nodes) | BlockId + Offset |
| **Arrow Keys** | Intercepted an Grenzen, sonst Browser | Immer intercepted, delegiert an Selection.modify() | Fast immer Browser-nativ | Browser-nativ + Void-Handling + Plugin-Keymaps |
| **Cross-Block** | `endOfTextblock()` + `moveSelectionBlock()` | `$getAdjacentNode()` + select methods | `Editor.positions()` cross-block | Basis: `navigateArrowIntoVoid`, plus plugin-spezifisch (code_block, table) |
| **Void/Decorator** | NodeSelection + GapCursor | Override-Detection + NodeSelection | Spacer-Nodes + Zero-Width Spaces | Basis-NodeSelection |
| **GapCursor** | Dediziertes Plugin | Nicht vorhanden | Nicht vorhanden (Zero-Width Workaround) | Nicht vorhanden |
| **Mark Boundaries** | Lazy Cursor Wrapper + Stored Marks | Stored Marks + Format State | Marks als Text-Node-Props | Stored Marks (ohne Wrapper) |
| **BiDi** | Layout-aware via DOM Measurement | Via Selection.modify() | Via Browser-nativ | Nicht vorhanden |
| **IME** | Cursor Wrapper Overhaul, Composition-aware | MutationObserver, deferred application | beforeInput + RestoreDom | Basis beforeInput-Handling (nur InputHandler) |
| **Selection Mapping** | StepMap [start, oldSize, newSize] | Automatisch via EditorState | Automatisch via Operations | Explizit gesetztes `selectionAfter` + `validateSelection` (kein StepMap/assoc) |
| **Inline Node Skip** | Explicit in capturekeys.ts | $shouldOverrideDefaultCharacterSelection | Normalization + Zero-Width | Nicht explizit |
| **Selection.modify()** | Nicht verwendet | Kernstrategie fuer Movement | Nicht verwendet | Nicht verwendet |
| **Keymap Priorities** | Nicht explizit (Plugin-Reihenfolge) | 5-stufig (CRITICAL..EDITOR) | Nicht vorhanden | Nicht explizit (Reverse-Array) |

---

## 5. Best-Practice-Empfehlung fuer notectl

### 5.1 Grundprinzip: Controlled Hybrid

Die uebereinstimmende Erkenntnis aller drei Editoren:

> **Lass den Browser Cursor Movement innerhalb von Text-Blocks handeln. Uebernimm die Kontrolle nur an Block-Grenzen, um Special Nodes (Void, InlineNode) und an unsichtbaren Positionen.**

Das ist der "Controlled Hybrid"-Ansatz. Er vermeidet:
- Das Reimplementieren von Line-Wrapping, BiDi, Font-Metrics
- Browser-spezifische Layout-Bugs
- IME-Konflikte

### 5.2 Kernstrategie: `Selection.modify()` als Implementierungsbasis

Die groesste Erkenntnis aus dem Lexical-Ansatz, die im Originalplan fehlte:

Die Browser-API `window.getSelection().modify(alter, direction, granularity)` ist
non-standard aber seit ueber 10 Jahren in allen Browsern implementiert
(Chrome, Firefox, Safari, Edge). Sie beherrscht:

- **Word-Boundaries**: Korrekt fuer jede Sprache (nutzt ICU/OS-Level Word-Segmentation)
- **Line-Start/End**: Korrekt bei Soft-Wrap, unabhaengig von Font-Metrics
- **BiDi**: Richtungsabhaengig, nutzt den Browser-Layout-Engine
- **Grapheme-Cluster**: Emoji, Combined Characters, Ligatures
- **Selection-Extension**: `alter='extend'` fuer Shift+Arrow-Aequivalent

**Strategie fuer notectl**:

```
Programmatic Movement Request (z.B. moveWordForward)
  |
  v
1. Selection.modify('move', 'forward', 'word')  // Browser bewegt den Cursor
  |
  v
2. readSelectionFromDOM()                        // Ergebnis zuruecklesen
  |
  v
3. Korrektur-Logik:                              // Boundary-Checks
     - InlineNode-Boundaries adjustieren
     - Cross-Block-Transition erkennen
     - GapCursor-Faelle abfangen
  |
  v
4. dispatch Transaction mit korrigierter Selection
```

Dadurch muessen wir Word-Boundary-Detection, Line-Boundaries und BiDi **nicht**
selbst reimplementieren. Die bestehenden `findWordBoundaryForward/Backward`-Funktionen
in Commands.ts bleiben fuer Deletion nuetzlich, aber fuer **Navigation** nutzen wir
den Browser.

### 5.3 Architektur-Empfehlung (korrigiert)

```
Arrow Key Event / Movement Command
  |
  v
KeyboardHandler.onKeydown()
  |
  +-- [1] Composition aktiv? -> SKIP (keine programmatic selection writes)
  |
  +-- [2] Kontext-Keymaps (priority: 'context')
  |     -> table: Arrow/Tab/Enter-Navigation zwischen Zellen
  |     -> code_block: Arrow-Navigation an Zeilengrenzen
  |     -> handled -> stop
  |
  +-- [3] Navigation-Keymaps (priority: 'navigation')
  |     -> NodeSelection / GapCursor Spezialfaelle
  |     -> InlineNode Skip-Over
  |     -> endOfTextblock(direction) pruefen:
  |         +-- Ja: CaretNavigation.navigateAcrossBlocks()
  |         |        -> Void -> NodeSelection
  |         |        -> Text -> TextSelection am Rand
  |         |        -> Kein Landing -> GapCursor
  |         +-- Nein: Browser handelt nativ
  |
  +-- [4] Default-Keymaps (priority: 'default')
  |     -> Mark-Shortcuts (Mod-B, Mod-I, etc.)
  |     -> Other plugin keymaps
  |
  +-- [5] Built-in Shortcuts (Undo, Redo, Select All)
  |
  +-- [6] Browser handled nativ -> selectionchange -> syncSelectionFromDOM
```

### 5.4 Empfohlene Massnahmen (priorisiert)

#### Prioritaet 1: Fundament (muss VOR jeder Navigation stehen)

**0. Guard Rails: Composition-Safety + Keymap-Prioritaeten**

Ohne diese Guard Rails ist jede weitere Navigation auf instabilem Fundament gebaut.

**0a. Composition-Status zentral verfuegbar machen**

```typescript
// Neues zentrales Interface oder Erweiterung von EditorView
interface CompositionState {
  readonly isComposing: boolean;
}
```

Alle Komponenten die Selection-Writes oder DOM-Reconcile machen pruefen
diesen Status:
- `KeyboardHandler`: Arrow Keys waehrend Composition -> skip
- `EditorView.syncSelectionFromDOM()`: Waehrend Composition -> skip
- `Reconciler`: Waehrend Composition -> keine DOM-Updates fuer betroffenen Block

**0b. Keymap-Prioritaeten einfuehren**

Erweiterung der Registrierungs-API:

```typescript
// Erweiterung in PluginContext / SchemaRegistry
type KeymapPriority = 'context' | 'navigation' | 'default';

registerKeymap(keymap: Keymap, options?: { priority?: KeymapPriority }): void;
```

Dispatch-Reihenfolge in KeyboardHandler:
1. `context` (table, code_block) -- hoechste Prioritaet
2. `navigation` (caret movement, gap cursor) -- mittlere Prioritaet
3. `default` (mark shortcuts, andere plugins) -- niedrigste Prioritaet

Innerhalb einer Prioritaetsstufe gilt weiterhin: spaeter registriert gewinnt.

**0c. Baseline-E2E-Tests**

Bevor neue Navigation gebaut wird: E2E-Tests (Playwright) fuer alle bestehenden
Arrow/Tab/Enter-Szenarien als Regression-Netz fixieren.

**1. `endOfTextblock(direction)` implementieren**

Der wichtigste fehlende Baustein. Layout-aware via DOM-Measurement:

```typescript
// view/CaretNavigation.ts (neu)
function endOfTextblock(
  view: EditorView,
  direction: 'left' | 'right' | 'up' | 'down'
): boolean;
```

**Algorithmus** (ProseMirror-bewaehrt):
1. Erstelle DOM Range am aktuellen Cursor
2. `range.getBoundingClientRect()` -> aktuelle Cursor-Position (Rect A)
3. Erstelle zweite Range um 1 Position verschoben via `Selection.modify()`
4. `range.getBoundingClientRect()` -> neue Position (Rect B)
5. Vergleiche:
   - `left/right`: Rect B ausserhalb des Block-Containers? -> true
   - `up`: Rect B.top < Rect A.top UND Rect B ausserhalb Block? -> true
   - `down`: Rect B.bottom > Rect A.bottom UND Rect B ausserhalb Block? -> true
6. Restore Original-Selection

**Wichtig**: Diese Funktion braucht echtes DOM-Layout. Unit-Tests mit happy-dom
koennen nur die Logik-Pfade testen (z.B. "was passiert wenn endOfTextblock true
liefert"). Die eigentliche Boundary-Detection muss in E2E-Tests (Playwright)
verifiziert werden.

**Fallback**: Wenn `getBoundingClientRect()` fehlerhafte Ergebnisse liefert
(z.B. collapsed Range hat zero-size Rect), Fallback auf Offset-basierte Heuristik:
`offset === 0` fuer left/up, `offset === blockLength` fuer right/down.

**2. Explizite Cross-Block Navigation**

Wenn `endOfTextblock()` true liefert:

```typescript
// view/CaretNavigation.ts
function navigateAcrossBlocks(
  view: EditorView,
  direction: 'left' | 'right' | 'up' | 'down'
): Transaction | null;
```

- Finde naechsten/vorherigen Block via `state.getBlockOrder()`
- Void-Block -> `NodeSelection`
- Text-Block -> `TextSelection` am Anfang (right/down) oder Ende (left/up)
- Kein erreichbarer Block -> `null` (Dokument-Grenze) oder GapCursor
- Fuer vertikale Navigation: Visual Column Preservation (siehe Prioritaet 3)

**3. InlineNode Skip-Over**

Wenn der Cursor direkt neben einem InlineNode steht:
- Arrow in Richtung des InlineNode: Ueberspringe den gesamten Node (Width 1)
- Dispatch Transaction mit neuer Position
- Wird als `navigation`-Priority Keymap registriert

```typescript
// Pseudocode
ArrowRight bei Offset N:
  content = getContentAtOffset(block, N)
  if (content?.kind === 'inline') -> setSelection(blockId, N + 1)
```

#### Prioritaet 2: Erweiterungen

**4. GapCursor**

Neue Selection-Variante fuer Positionen zwischen nicht-editierbaren Blocks:

```typescript
// model/Selection.ts (erweitern)
interface GapCursorSelection {
  readonly type: 'gap';
  readonly side: 'before' | 'after';
  readonly blockId: BlockId;
  readonly path: readonly BlockId[];
}

type EditorSelection = Selection | NodeSelection | GapCursorSelection;
```

**Impact-Analyse** -- diese Aenderung betrifft:

| Datei | Aenderung |
|-------|-----------|
| `Selection.ts` | Neuer Typ + `isGapCursor()` Type Guard |
| `EditorState.ts` | `validateSelection()` muss GapCursor validieren |
| `SelectionSync.ts` | `syncSelectionToDOM()`: GapCursor hat kein DOM-Aequivalent, braucht eigenes Rendering |
| `SelectionSync.ts` | `readSelectionFromDOM()`: Kann keinen GapCursor lesen (ist kein DOM-Zustand) |
| `Reconciler.ts` | GapCursor-Rendering (CSS Pseudo-Element, blinkende Linie) |
| `Commands.ts` | Alle Commands muessen GapCursor als Input-Selection handeln |
| `KeyboardHandler.ts` | Arrow Keys von/zu GapCursor |
| Alle Plugins | `onStateChange()` kann GapCursor-Selection erhalten |

**Implementierung als Plugin mit Core-Support**:
- Core: Selection-Typ, Type Guard, Validation
- Plugin (`plugins/gap-cursor/`): Keymap, Rendering (CSS), Middleware

**GapCursor -> TextSelection bei Typing**: Middleware (Priority < 100) die bei
`insertText`-Origin eine aktive GapCursor-Selection in eine TextSelection mit
neuem Paragraph umwandelt.

**5. Mark-Boundary Cursor Wrapper**

Wenn der Cursor an einer Mark-Grenze steht und Stored Marks aktiv sind:
- Erstelle temporaeren `<span>` mit Zero-Width Space im DOM
- Wrap den Span in die korrekten Mark-DOM-Nodes
- Platziere den Browser-Cursor in den Wrapper
- **Lazy-Erstellung** bei `compositionstart` (nicht eager, um IME nicht zu brechen)
- Cleanup nach `compositionend` oder bei naechstem State-Update

**6. Movement Commands API**

Zwei Kategorien von Movement Commands mit unterschiedlichen Signaturen:

```typescript
// --- Model-based Commands (brauchen nur EditorState) ---
// Diese koennen rein ueber Offsets im Datenmodell berechnet werden.

moveCharacterForward(state: EditorState): Transaction | null;
moveCharacterBackward(state: EditorState): Transaction | null;
moveToBlockStart(state: EditorState): Transaction | null;
moveToBlockEnd(state: EditorState): Transaction | null;
moveToDocumentStart(state: EditorState): Transaction | null;
moveToDocumentEnd(state: EditorState): Transaction | null;

// Extend-Varianten (Shift+Arrow Aequivalent)
extendCharacterForward(state: EditorState): Transaction | null;
extendCharacterBackward(state: EditorState): Transaction | null;
extendToBlockStart(state: EditorState): Transaction | null;
extendToBlockEnd(state: EditorState): Transaction | null;

// --- View-based Commands (brauchen DOM fuer Layout-Info) ---
// Diese nutzen Selection.modify() und/oder getBoundingClientRect()
// und muessen im view/ Layer leben, nicht in commands/.

moveWordForward(view: EditorView): Transaction | null;
moveWordBackward(view: EditorView): Transaction | null;
moveToLineStart(view: EditorView): Transaction | null;
moveToLineEnd(view: EditorView): Transaction | null;
moveLineUp(view: EditorView): Transaction | null;
moveLineDown(view: EditorView): Transaction | null;

// Extend-Varianten
extendWordForward(view: EditorView): Transaction | null;
extendWordBackward(view: EditorView): Transaction | null;
extendToLineStart(view: EditorView): Transaction | null;
extendToLineEnd(view: EditorView): Transaction | null;
```

**Warum die Trennung?**

`moveCharacterForward` kann rein ueber `offset + 1` im State berechnet werden
(mit InlineNode-Width-Beruecksichtigung). Aber `moveWordForward` braucht den
Browser fuer korrekte Word-Boundaries (`Selection.modify('move', 'forward', 'word')`),
und `moveLineUp` braucht DOM-Measurement fuer visuelle Zeilen.

Die View-based Commands nutzen `Selection.modify()` intern:
1. Rufe `Selection.modify()` auf (Browser bewegt Cursor)
2. Lese neue Position via `readSelectionFromDOM()`
3. Korrigiere fuer InlineNode-Boundaries und Block-Transitions
4. Dispatch Transaction

#### Prioritaet 3: Fortgeschritten

**7. Visual Column Preservation (goalColumn)**

Bei Up/Down-Navigation merkt sich der Editor die horizontale Pixel-Position:

```typescript
// Neues Feld auf EditorView (nicht im State -- ist ein View-Concern)
private goalColumn: number | null = null;
```

- Beim ersten Up/Down: Speichere `getBoundingClientRect().left` des Cursors
- Bei folgenden Up/Down: Finde im Ziel-Block den Offset mit dem naechsten X-Wert
  via `document.caretPositionFromPoint(goalColumn, targetY)`
- Bei horizontalem Move oder Typing: `goalColumn = null`

**8. BiDi-aware Navigation**

- `endOfTextblock()` mit DOM-Measurement loest die meisten BiDi-Faelle automatisch
- `Selection.modify()` ist BiDi-aware (Browser-Engine handled es)
- Fuer explizite Direction-Erkennung: `getComputedStyle(element).direction`
- Langfristig: `Intl.Segmenter` fuer korrekte Grapheme-Cluster-Navigation

**9. Accessibility: ARIA Live Regions fuer Cursor-Position**

- Announce Cursor-Position-Changes via `aria-live="polite"` Region
- Block-Typ und relative Position ("Heading 2, Zeile 3 von 5")
- Kann `PluginContext.announce()` nutzen (existiert bereits)
- Debounced: nicht bei jedem Tastendruck, sondern nach kurzer Pause (~150ms)

### 5.5 Kritische Learnings aus notectl-Code

1. **Key-Handling-Reihenfolge entscheidet ueber Stabilitaet**
   Aktuell: NodeSelection/Void-Handler (hardcoded) -> Plugin-Keymaps (reverse array) -> Built-in.
   Das reicht fuer den Ist-Zustand, aber nicht fuer globale Navigation neben Kontext-Keymaps.
   Loesung: Explizite Prioritaetsstufen (context > navigation > default).

2. **GapCursor ist kein reines Plugin-Feature**
   Das aktuelle Selection-Model (`Selection | NodeSelection`) nutzt das Vorhandensein des
   `type`-Feldes als Diskriminator. GapCursor braucht `type: 'gap'`, was sauber in die
   bestehende Union passt. Aber alle `isTextSelection()`-Aufrufe im Codebase muessen
   geprueft werden -- aktuell ist `isTextSelection = !isNodeSelection`, was nach der
   Erweiterung falsch waere.

3. **IME first, dann Navigation**
   Das `composing`-Flag in InputHandler ist privat und schuetzt nur `beforeinput`.
   KeyboardHandler, SelectionSync und Reconciler sind ungeschuetzt. Jede neue
   Caret-Logik MUSS den Composition-Status pruefen.

4. **Visuelle Grenzen statt Offset-Heuristik**
   Die aktuelle Void-Navigation basiert auf `offset === 0 | blockLength`. Das funktioniert
   fuer harte Blockgrenzen, aber nicht fuer visuelle Zeilenenden (Soft-Wrap) und BiDi.
   `endOfTextblock()` mit DOM-Measurement ist der Schluessel.

5. **`Selection.modify()` ist der fehlende Baustein**
   notectl hat aktuell keine Nutzung von `Selection.modify()`. Diese API delegiert
   Word/Line/Character-Boundaries an den Browser -- robuster als eigene Implementierung.
   Die bestehenden `findWordBoundary*`-Funktionen in Commands.ts bleiben fuer
   Delete-Commands sinnvoll (dort braucht man den Offset, nicht die Cursor-Position).

---

## 6. Design-Entscheidungen und Trade-offs

### 6.1 Warum `Selection.modify()` statt eigener Offset-Arithmetik?

**Pro**:
- Browser kennt Font-Metrics, Soft-Wraps, BiDi, Grapheme-Cluster
- Keine eigene Word-Boundary-Tabelle noetig (Browser nutzt ICU/OS-Level)
- Alle Sprachen korrekt (CJK Word-Boundaries, Thai ohne Spaces, etc.)
- Weniger Code, weniger Bugs

**Contra**:
- Non-standard API (kein W3C-Spec), koennte theoretisch entfernt werden
- Browsers koennten unterschiedliche Word-Boundaries liefern
- Braucht echtes DOM (kann nicht rein im State-Layer berechnet werden)

**Entscheidung**: Nutzen. Die API existiert seit Safari 1.3 (2004), ist in allen
Browsern implementiert, und Lexical (Meta) setzt produktiv darauf. Das Risiko einer
Entfernung ist minimal. Fuer den Fallback-Fall: `findWordBoundary*` existiert bereits.

### 6.2 Warum Keymap-Prioritaeten statt Event-Phases oder Capture/Bubble?

**Alternativen**:
1. Separate Event-Listener auf capture vs bubble Phase -> fragil, schwer debugbar
2. Command-System mit Prioritaeten (Lexical-Ansatz) -> gross Refactor
3. Einfache Prioritaetsstufen auf registerKeymap -> minimal-invasiv

**Entscheidung**: Option 3. Drei Stufen (`context`, `navigation`, `default`) reichen
fuer den Use-Case. KeyboardHandler gruppiert Keymaps in drei Arrays statt einem.
Innerhalb jeder Gruppe bleibt die bestehende Reverse-Iteration.

### 6.3 Warum GapCursor im Core statt als reines Plugin?

ProseMirror implementiert GapCursor als Plugin, das eine eigene Selection-Subclass
registriert. Das funktioniert, weil PM ein offenes Selection-System hat.

notectl hat eine geschlossene Union (`EditorSelection`). Ohne Core-Erweiterung
muesste ein GapCursor-Plugin die Union per Module Augmentation erweitern --
das fuehrt zu Typ-Unsicherheit und Laufzeit-Ueberraschungen.

**Entscheidung**: `GapCursorSelection` als dritter Arm der Core-Union. Type Guards,
Validation und SelectionSync im Core. Keyboard-Handling und Rendering als Plugin.

### 6.4 Warum View-based Commands statt Commands mit DOM-Parameter?

**Alternativen**:
1. `moveWordForward(state, view)` -> Mischt Layer-Concerns
2. `moveWordForward(view)` -> View-Methode, klare Zugehoerigkeit
3. Command-System mit View-Zugriff (ProseMirror: `(state, dispatch, view)`)

**Entscheidung**: Option 2. View-based Commands leben in `view/CaretNavigation.ts`
und bekommen `EditorView` (das den State enthaelt). Model-based Commands bleiben
in `commands/`. Die Trennung spiegelt eine reale Abhaengigkeit wider: manche
Commands brauchen DOM, manche nicht.

### 6.5 Testbarkeit

| Command-Typ | Unit-Test (happy-dom) | E2E-Test (Playwright) |
|-------------|----------------------|----------------------|
| Model-based (`moveCharacterForward`) | Voll testbar | Nicht noetig |
| View-based (`moveWordForward`) | Logik-Pfade testbar (Mock Selection.modify) | **Pflicht** fuer korrekte Ergebnisse |
| `endOfTextblock()` | Nur Fallback-Pfad testbar | **Pflicht** |
| GapCursor Transitions | State-Transitions testbar | Rendering + Interaktion in E2E |
| Cross-Browser Workarounds | Nicht moeglich | **Pflicht** (Multi-Browser Matrix) |

---

## 7. Implementierungsplan

### Phase 0: Guard Rails (vor jeder neuen Navigation)

**Ziel**: Stabiles Fundament fuer alle folgenden Phasen.

**Dateien:**
- `packages/core/src/input/InputHandler.ts` (composing-Flag exponieren)
- `packages/core/src/input/KeyboardHandler.ts` (Composition-Guard, Priority-Dispatch)
- `packages/core/src/input/Keymap.ts` (Priority-Typ)
- `packages/core/src/model/SchemaRegistry.ts` (Keymap-Storage mit Prioritaet)
- `packages/core/src/view/EditorView.ts` (Composition-Guard in syncSelectionFromDOM)
- `packages/core/src/view/Reconciler.ts` (Composition-Guard)
- `packages/core/src/plugins/Plugin.ts` (registerKeymap-Signatur erweitern)

**Aufgaben:**

1. **Composition-Status zentral verfuegbar machen**
   - Neuer `CompositionTracker` (oder direkt auf EditorView) mit `isComposing` getter
   - InputHandler setzt den Status, alle Komponenten lesen ihn
   - Guard in `syncSelectionFromDOM()`: skip waehrend Composition
   - Guard in `Reconciler`: Block-Update skippen wenn Composition in diesem Block aktiv

2. **Keymap-Prioritaetssystem einfuehren**
   - `KeymapPriority` Typ: `'context' | 'navigation' | 'default'`
   - `registerKeymap(keymap, options?)` mit optionalem `priority` (default: `'default'`)
   - `SchemaRegistry` speichert drei getrennte Arrays statt einem
   - `KeyboardHandler` iteriert: context -> navigation -> default (jeweils reverse)
   - Bestehende Plugin-Keymaps erhalten implizit `'default'` -> keine Breaking Changes
   - Table/Code-Block-Keymaps explizit auf `'context'` setzen

3. **Baseline-E2E-Tests fixieren**
   - Arrow-Navigation: innerhalb Text-Block, ueber Block-Grenzen, in/aus Void-Blocks
   - Tab-Navigation: in Table, in Code-Block, Fallback Tab-Insert
   - IME-Baseline: Composition-Start/End in Paragraph, in Code-Block
   - Shift+Arrow: Selection-Extension innerhalb und ueber Blocks

### Phase 1: Foundation (endOfTextblock + Cross-Block + Selection.modify)

**Ziel**: Robuste Block-Boundary-Detection und Browser-delegierte Navigation.

**Dateien:**
- `packages/core/src/view/CaretNavigation.ts` (neu)
- `packages/core/src/view/EditorView.ts` (erweitern)
- `packages/core/src/input/KeyboardHandler.ts` (erweitern)

**Aufgaben:**

1. **`endOfTextblock(view, direction)` implementieren**
   - DOM Range + `getBoundingClientRect()` Ansatz
   - Fallback auf Offset-Heuristik bei fehlerhaften Rects (zero-size, hidden elements)
   - Caching pro Key-Event (eine Messung pro Event reicht)

2. **`navigateAcrossBlocks(view, direction)` implementieren**
   - Nutzt `state.getBlockOrder()` fuer Block-Traversal
   - Horizontale Navigation: TextSelection am Anfang/Ende des Ziel-Blocks
   - Vertikale Navigation: vorerst einfach (Anfang/Ende), goalColumn kommt in Phase 5
   - Void-Block-Erkennung via Schema (`isVoid`)
   - Void -> NodeSelection, Text -> TextSelection

3. **Navigation-Keymaps registrieren**
   - Neue Navigation-Keymaps mit `priority: 'navigation'`
   - ArrowLeft/Right: `endOfTextblock()` check -> `navigateAcrossBlocks()`
   - ArrowUp/Down: `endOfTextblock()` check -> `navigateAcrossBlocks()`
   - Ersetzt das bisherige hardcoded `handleArrowIntoVoid()` in KeyboardHandler

4. **Tests**
   - Unit: Logik-Pfade (Mock endOfTextblock -> true/false)
   - E2E: TextBlock -> TextBlock, TextBlock -> VoidBlock, VoidBlock -> TextBlock
   - E2E: Erstes/letztes Block (Dokument-Grenze)
   - E2E: Soft-Wrap-Szenarien (endOfTextblock muss korrekt antworten)

### Phase 2: InlineNode-aware Navigation

**Ziel**: Korrekte Cursor-Bewegung um und ueber InlineNodes hinweg.

**Dateien:**
- `packages/core/src/view/CaretNavigation.ts` (erweitern)

**Aufgaben:**

1. **InlineNode-Detection bei Arrow Left/Right**
   - Pruefe `getContentAtOffset(block, offset)` auf `kind === 'inline'`
   - Arrow Right bei InlineNode: Skip ueber Node (offset + 1)
   - Arrow Left vor InlineNode: Skip zurueck (offset - 1)
   - Registriert als `navigation`-Priority Keymap

2. **Browser-spezifische Workarounds**
   - Firefox: Cursor verschwindet neben `contenteditable="false"` -> nach Skip
     explizit `syncSelectionToDOM()` aufrufen
   - Chrome: Phantom-Positionen innerhalb Inline-Elemente -> Position nach Skip
     validieren via `readSelectionFromDOM()` Roundtrip

3. **Tests**
   - Unit: InlineNode an verschiedenen Positionen (Anfang, Mitte, Ende des Blocks)
   - Unit: Adjacent InlineNodes (z.B. zwei Hard Breaks hintereinander)
   - E2E: Cursor-Sichtbarkeit nach Skip (Firefox-Regression)

### Phase 3: GapCursor ✅ IMPLEMENTIERT

**Ziel**: Cursor-Positionen zwischen nicht-editierbaren Blocks ermoeglichen.

**Status**: Vollstaendig implementiert inkl. Review (5 Issues behoben). Alle Unit-Tests (1900) und E2E-Tests bestehen.

**Implementierte Dateien:**
- `packages/core/src/model/Selection.ts` — `GapCursorSelection`, `createGapCursor()`, `isGapCursor()`
- `packages/core/src/state/EditorState.ts` — GapCursor-Validation
- `packages/core/src/view/SelectionSync.ts` — `removeAllRanges()` bei GapCursor
- `packages/core/src/view/CaretNavigation.ts` — `navigateFromGapCursor()`
- `packages/core/src/commands/Commands.ts` — `deleteBackwardAtGap()`, `deleteForwardAtGap()`, GapCursor-Handling in `insertTextCommand()`, `splitBlockCommand()`
- `packages/core/src/input/KeyboardHandler.ts` — `handleGapCursorKeys()` fuer Typing/Enter/Backspace/Delete
- `packages/core/src/plugins/gap-cursor/GapCursorPlugin.ts` — Keymap, CSS-Rendering, ARIA-Announce
- `examples/vanillajs/src/main.ts` — GapCursorPlugin registriert

**Implementierte Aufgaben:**

1. **Core: Selection Model** ✅
   - `GapCursorSelection` Interface mit `type: 'gap'`, `side: 'before' | 'after'`, `blockId`, `path`
   - `isGapCursor()` Type Guard, `isTextSelection()` mit explizitem Check
   - `selectionsEqual()` und `isCollapsed()` erweitert

2. **Core: Validation** ✅
   - `EditorState.validateSelection()`: GapCursor nur valide wenn blockId existiert
   - Fallback: GapCursor -> TextSelection zum naechsten editierbaren Block

3. **Core: SelectionSync** ✅
   - `syncSelectionToDOM()`: Bei GapCursor `removeAllRanges()` (kein DOM-Aequivalent)
   - `readSelectionFromDOM()`: Kann keinen GapCursor zurueckliefern

4. **Core: KeyboardHandler** ✅
   - `handleGapCursorKeys()`: Intercepted Typing, Enter, Backspace, Delete
   - Laesst Arrow Keys, Escape, Tab, Modifier-Combos durch
   - Readonly-Guard: konsumiert Events ohne Dispatch

5. **Core: Commands** ✅
   - `deleteBackwardAtGap()`: side=after loescht Void, side=before navigiert zurueck
   - `deleteForwardAtGap()`: side=before loescht Void, side=after navigiert vorwaerts
   - `insertTextCommand()` / `splitBlockCommand()`: GapCursor -> neuen Paragraph erzeugen

6. **Plugin: GapCursorPlugin** ✅
   - Keymap (`priority: 'navigation'`): Arrow Keys via `navigateFromGapCursor()`
   - CSS: `::before` Pseudo-Element mit blinkender Animation, `prefers-reduced-motion` Respekt
   - ARIA: `announce()` bei GapCursor-Aktivierung

7. **Tests** ✅
   - Unit: 8 Tests in `Commands.test.ts` (deleteBackwardAtGap/deleteForwardAtGap)
   - Unit: 7 Tests in `KeyboardHandler.test.ts` (GapCursor key handling)
   - Unit: 8 Tests in `GapCursorPlugin.test.ts` (navigation, vertical, adjacent voids)
   - E2E: 5 Tests in `arrow-navigation.spec.ts` (typing, Enter, Backspace, Delete, visual indicator)

#### Phase 3 Review — 5 Issues behoben ✅

**Datum:** 2026-02-25

Code-Review der Phase-3-Implementierung ergab 5 Issues (2x High, 2x Medium, 1x Low).
Alle behoben. 1900 Unit-Tests, 56 E2E-Tests bestanden. Build, Typecheck, Lint sauber.

**Issue 1 (High): Mausklick kann GapCursor nicht verlassen** ✅
- **Problem:** `syncSelectionFromDOM()` in `EditorView.ts` kehrte bei aktivem GapCursor
  bedingungslos zurueck. `onMousedown()` setzte nur `pendingNodeSelectionClear` fuer
  NodeSelection, nicht fuer GapCursor. Ergebnis: Klick auf Textblock waehrend GapCursor
  aktiv war tat nichts.
- **Fix:** `pendingGapCursorClear`-Flag eingefuehrt (analog zu `pendingNodeSelectionClear`).
  `onMousedown()` setzt es bei Klick auf nicht-selektierbare Blocks und contentDOM-Bereiche.
  `syncSelectionFromDOM()` prueft das Flag und laesst DOM-Selection bei gesetztem Flag durch.
- **Datei:** `packages/core/src/view/EditorView.ts`

**Issue 2 (High): GapCursor-Sackgasse ohne GapCursorPlugin** ✅
- **Problem:** `CaretNavigation.ts` erzeugt GapCursor-Selections, aber Arrow-Handling
  abhaengig von GapCursorPlugin-Keymaps. Ohne Plugin: User steckt fest.
- **Fix:** `handleGapCursorArrowFallback()` in `KeyboardHandler.ts` eingefuehrt. Laeuft
  NACH den Plugin-Keymaps aber VOR Tab/Escape-Fallbacks. Ruft `navigateFromGapCursor()`
  auf. Wenn GapCursorPlugin registriert ist, greifen dessen Keymaps vorher — der Fallback
  wird nie erreicht. Ohne Plugin faengt der Fallback die Arrow-Keys ab.
- **Datei:** `packages/core/src/input/KeyboardHandler.ts`
- **Tests:** 3 neue Tests (ArrowRight navigiert in Void, ArrowLeft zum vorherigen Block,
  ArrowLeft am Dokumentanfang ist No-Op). 1 bestehender Test aktualisiert.

**Issue 3 (Medium): Paste bei GapCursor inkonsistent** ✅
- **Problem:** Alle drei Paste-Strategien (`pasteInline`, `pasteSingleBlock`, `pasteMultiBlock`)
  gaben No-Op fuer GapCursor zurueck. `PasteHandler` ignorierte `sel.side`.
- **Fix PasteCommand.ts:** `gapInsertIndex()`-Helper bestimmt Einfuegeposition basierend
  auf `side`. `pasteInlineAtGap()` erzeugt neuen Paragraph mit eingefuegtem Text.
  `pasteBlocksAtGap()` fuegt alle Blocks an der Gap-Position ein.
- **Fix PasteHandler.ts:** `handleBlockPaste()` und `insertRichBlocksAtRoot()` nutzen
  side-aware Insert-Offset. Void-Block wird bei GapCursor nicht als leerer Anchor entfernt.
- **Dateien:** `packages/core/src/commands/PasteCommand.ts`,
  `packages/core/src/input/PasteHandler.ts`
- **Tests:** 4 neue Tests (pasteInline before/after, pasteSingleBlock, pasteMultiBlock
  bei GapCursor)

**Issue 4 (Medium): Packaging unvollstaendig** ✅
- **Problem:** Kein Build-Entry und Export fuer gap-cursor Plugin. Docs veraltet.
- **Fix:**
  - `vite.config.ts`: `'plugins/gap-cursor'` Build-Entry hinzugefuegt
  - `package.json`: `./plugins/gap-cursor` Export-Mapping hinzugefuegt
  - `docs-site/src/content/docs/api/selection.md`: `EditorSelection` Union-Typ aktualisiert,
    `GapCursorSelection`-Abschnitt dokumentiert, `createGapCursor` zu Factory-Functions
    hinzugefuegt, `isGapCursor` Type Guard dokumentiert

**Issue 5 (Low): Validation faellt auf ersten Block zurueck statt naechsten editierbaren** ✅
- **Problem:** `validateSelection()` in `EditorState.ts` fiel bei geloeschtem Void-Block
  auf `doc.children[0]` zurueck, das selbst ein Void-Block sein konnte.
- **Fix:** `findFirstLeafBlock()`-Helper eingefuehrt, der rekursiv in verschachtelte
  Strukturen absteigt. `fallbackSelection()` nutzt diesen Helper. Beide
  `NodeSelection`- und `GapCursor`-Validierungszweige verwenden nun `fallbackSelection()`.
- **Datei:** `packages/core/src/state/EditorState.ts`
- **Tests:** 2 neue Tests (GapCursor/NodeSelection auf geloeschtem Block faellt auf
  erstes Leaf-Block zurueck)

**Verifikation:**
- 1900 Unit-Tests bestanden
- 56 E2E-Tests bestanden (arrow-navigation)
- Build sauber (gap-cursor Plugin korrekt gepackt)
- Typecheck sauber
- Lint sauber

### Phase 4: Movement Commands + Mark Boundaries

**Ziel**: Vollstaendige programmatische Navigation-API.

**Dateien:**
- `packages/core/src/commands/MovementCommands.ts` (neu -- model-based)
- `packages/core/src/view/ViewMovementCommands.ts` (neu -- view-based)
- `packages/core/src/view/CursorWrapper.ts` (neu)

**Aufgaben:**

1. **Model-based Movement Commands** (in `commands/`)
   - `moveCharacterForward/Backward`: Offset +/- 1, InlineNode-Width beachten
   - `moveToBlockStart/End`: Offset 0 / blockLength
   - `moveToDocumentStart/End`: Erstes/letztes Block
   - Extend-Varianten: Anchor bleibt, Head bewegt sich

2. **View-based Movement Commands** (in `view/`)
   - `moveWordForward/Backward`: via `Selection.modify('move', dir, 'word')` + readback
   - `moveToLineStart/End`: via `Selection.modify('move', dir, 'lineboundary')` + readback
   - `moveLineUp/Down`: via `Selection.modify('move', dir, 'line')` + readback
   - Extend-Varianten: via `Selection.modify('extend', dir, granularity)` + readback
   - Korrektur-Logik nach jedem `Selection.modify()`:
     - Pruefen ob Block-Transition stattfand
     - InlineNode-Boundaries korrigieren
     - GapCursor-Faelle erkennen

3. **Cursor Wrapper fuer Stored Marks**
   - `CursorWrapper` Klasse in `view/`
   - Erstellt `<span>` mit Zero-Width Space, gewrapped in Mark-DOM-Nodes
   - Lazy-Erstellung: nur bei `compositionstart` wenn Stored Marks aktiv
   - Cleanup: bei `compositionend`, State-Update, oder Selection-Change
   - Reconciler muss CursorWrapper-Spans ignorieren (nicht als Dirty markieren)

4. **Command-Registrierung als Plugin**
   - Neues `caret-navigation` Plugin (oder Erweiterung des bestehenden Systems)
   - Registriert Keymaps fuer: Mod-Left/Right (Word), Home/End (Line), etc.
   - Alle mit `priority: 'navigation'`

### Phase 5: Advanced Features

**Ziel**: Polish und Edge-Case-Handling.

**Dateien:**
- `packages/core/src/view/CaretNavigation.ts` (erweitern)
- `packages/core/src/view/EditorView.ts` (goalColumn)

**Aufgaben:**

1. **Visual Column Preservation (goalColumn)**
   - `goalColumn: number | null` auf EditorView (View-Concern, nicht State)
   - Setzen bei erstem Up/Down via `getBoundingClientRect().left`
   - Nutzen via `document.caretPositionFromPoint(goalColumn, targetY)`
   - Reset bei horizontaler Bewegung, Typing, Mausklick

2. **BiDi-aware Navigation**
   - `endOfTextblock()` + `Selection.modify()` decken die meisten Faelle ab
   - Explizite Direction-Detection: `getComputedStyle(block).direction`
   - `Intl.Segmenter` fuer Grapheme-Cluster (wo `Selection.modify()` nicht reicht)

3. **ARIA Live Region fuer Cursor-Announcements**
   - Nutze bestehendes `PluginContext.announce()`
   - Announce bei Block-Wechsel: "Heading 2" / "Paragraph" / "Code Block"
   - Debounced (150ms) um Spam bei schneller Navigation zu vermeiden

4. **Performance-Optimierung**
   - `endOfTextblock()` Ergebnis pro Key-Event cachen
   - `getBoundingClientRect()` Aufrufe minimieren (Layout Reflow!)
   - Batch DOM-Reads vor DOM-Writes (Read-Write-Separation)

### Phase 6: Hardening & Browser-Matrix

**Ziel**: Produktionsreife Cross-Browser-Qualitaet.

**Aufgaben:**

1. **E2E-Matrix fuer Chrome, Firefox, Safari (Desktop) und Android Chrome**
   - Arrow-Navigation: inline, cross-block, cross-line, mit Soft-Wrap
   - Word/Line-Navigation: Mod+Arrow, Home/End
   - Selection-Extension: Shift+Arrow, Shift+Mod+Arrow

2. **IME-Szenarien**
   - CJK Composition (Pinyin, Hiragana, Hangul)
   - Dead Keys (Akzente auf europaeischen Keyboards)
   - Android GBoard Composition
   - Composition + Mark-Boundary (Cursor Wrapper Interaktion)

3. **Edge-Cases**
   - Adjacent Void-Blocks (GapCursor-Chain)
   - InlineNode am Zeilenanfang/-ende (Firefox Cursor-Disappear)
   - Nested Isolating Nodes (Table -> Cell -> Paragraph)
   - Empty Blocks (nur `<br>`)
   - Mixed BiDi Content

4. **Strict Non-Regression**
   - Alle Phase-0 Baseline-Tests muessen weiterhin bestehen
   - Table/Code-Block Navigation darf nicht regressieren
   - Performance-Baseline: Navigation darf nicht messbar langsamer werden

---

## Quellen

### ProseMirror
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [ProseMirror Reference Manual](https://prosemirror.net/docs/ref/)
- [prosemirror-gapcursor](https://github.com/ProseMirror/prosemirror-gapcursor)
- [prosemirror-view capturekeys.ts](https://github.com/ProseMirror/prosemirror-view/blob/master/src/capturekeys.ts)
- [Cursor Wrapper Overhaul Discussion](https://discuss.prosemirror.net/t/cusor-wrapper-overhaul-please-help-test/2124)
- [Visual Ambiguity with Cursor Position](https://discuss.prosemirror.net/t/visual-ambiguity-with-cursor-position/4601)

### Lexical
- [Lexical Selection Docs](https://lexical.dev/docs/concepts/selection)
- [Lexical NodeCaret Traversals](https://lexical.dev/docs/concepts/traversals)
- [Lexical Commands](https://lexical.dev/docs/concepts/commands)
- [Caret between DecoratorNodes Issue #2285](https://github.com/facebook/lexical/issues/2285)
- [Virtual Cursor Discussion #5219](https://github.com/facebook/lexical/discussions/5219)

### Slate
- [Slate Locations Docs](https://docs.slatejs.org/concepts/03-locations)
- [Slate Transforms API](https://docs.slatejs.org/api/transforms)
- [Editor.positions() source](https://github.com/ianstormtaylor/slate/blob/main/packages/slate/src/interfaces/editor.ts)
- [Android Input Rewrite PR #4988](https://github.com/ianstormtaylor/slate/pull/4988)
- [Inline Void Cursor Issue #4839](https://github.com/ianstormtaylor/slate/issues/4839)

### Selection.modify() Browser-Support
- [MDN: Selection.modify()](https://developer.mozilla.org/en-US/docs/Web/API/Selection/modify)
- Chrome: seit Version 1 (2008)
- Firefox: seit Version 4 (2011)
- Safari: seit Version 1.3 (2004)
- Edge: seit Chromium-basiert (2020)

---

## Implementierungsstatus

### Phase 0: Guard Rails — abgeschlossen

**Datum:** 2026-02-25

Alle drei Aufgaben aus Phase 0 sind vollstaendig implementiert und verifiziert.

#### Aufgabe 1: CompositionTracker zentralisieren — erledigt

- `CompositionTracker` als eigenstaendige Klasse in `packages/core/src/input/CompositionTracker.ts`
- Integriert in `InputHandler`, `KeyboardHandler`, `EditorView`, `Reconciler`
- `InputHandler.composing` (privates Feld) durch geteilten Tracker ersetzt
- Guards implementiert:
  - `KeyboardHandler.onKeydown()`: alle Keys waehrend Composition ignoriert
  - `EditorView.syncSelectionFromDOM()`: keine Selection-Ueberschreibung waehrend Composition
  - `EditorView.applyUpdate()` / `replaceState()`: `syncSelectionToDOM()` waehrend Composition uebersprungen
  - `Reconciler.reconcile()`: composierender Block wird nicht re-gerendert
  - `Reconciler`: `unwrapBlocks()` / `wrapBlocks()` waehrend Composition komplett uebersprungen
- Unit-Tests: 5 Tests fuer CompositionTracker, 2 fuer KeyboardHandler Composition-Guard
- Exportiert in `index.ts`

#### Aufgabe 2: Keymap-Prioritaetssystem — erledigt

- Typen `KeymapPriority` (`'context' | 'navigation' | 'default'`) und `KeymapOptions` in `Keymap.ts`
- `SchemaRegistry`: drei interne Arrays statt eines flachen Arrays
- `getKeymapsByPriority()` returned defensive Kopien (keine internen Arrays exponiert)
- `KeyboardHandler`: Priority-Dispatch (`context > navigation > default`), innerhalb jeder Stufe reverse Iteration (last-registered wins)
- `Plugin.ts` / `PluginManager.ts`: `registerKeymap(keymap, options?)` Signatur erweitert
- `TableNavigation` und `CodeBlockKeyboardHandlers`: auf `priority: 'context'` gesetzt
- Unit-Tests: 8 Tests fuer SchemaRegistry Priorities, 5 Tests fuer KeyboardHandler Priority-Dispatch
- Volle Backward-Kompatibilitaet: `options` ist optional, Default ist `'default'`

#### Aufgabe 3: Baseline-E2E-Tests — erledigt

- `e2e/arrow-navigation.spec.ts` (10 Tests):
  - Within-Block: ArrowRight/Left Zeichenbewegung
  - Cross-Block: ArrowDown/Up ueber Blockgrenzen, drei Blocks navigierbar
  - Void-Blocks: Image Click+Backspace, Arrow-Keys nahe Image ohne Crash
  - Document Boundaries: ArrowRight/Up/Down an Grenzen ohne Crash
- `e2e/selection-extension.spec.ts` (7 Tests):
  - Programmatische Selection-Ersetzung (Anfang, Mitte)
  - Shift+ArrowLeft rueckwaerts selektiert
  - Shift+ArrowDown/Up ueber Blockgrenzen
  - Ctrl+A Select All
  - Shift+Home selektiert ganze Zeile
- `e2e/ime-composition.spec.ts` (3 Tests):
  - Composition start+end produziert korrekten Text
  - Mehrere Composition-Sessions funktionieren
  - Keyboard-Events waehrend Composition unterdrueckt

#### Verifikation

- 1789 Unit-Tests bestanden
- 429 E2E-Tests bestanden
- Typecheck sauber
- Lint sauber

### Phase 1: Caret Movement Foundation — abgeschlossen

**Datum:** 2026-02-25

Layout-aware Caret Movement implementiert: `endOfTextblock()` fuer visuelle
Boundary-Detection, `navigateAcrossBlocks()` fuer Cross-Block-Navigation, und
Navigation-Keymaps mit `priority: 'navigation'`. Ersetzt den hardcoded
`handleArrowIntoVoid()`-Mechanismus in KeyboardHandler.

#### Schritt 1: CaretNavigation.ts — erledigt

- Neue Datei `packages/core/src/view/CaretNavigation.ts`
- `CaretDirection` Typ (`'left' | 'right' | 'up' | 'down'`)
- `endOfTextblock(container, state, direction)`: Prueft ob Cursor am visuellen
  Rand steht. Horizontal: Offset-Check. Vertikal: `Selection.modify` Probing
  mit `getBoundingClientRect` Cross-Check, Fallback auf Offset-Heuristik.
- `navigateAcrossBlocks(state, direction)`: Erstellt Transaction fuer
  Cross-Block-Navigation. Respektiert Isolating-Boundaries, Void-Blocks
  (NodeSelection), Dokument-Grenzen.
- `canCrossBlockBoundary()` (privat): Verhindert Navigation ueber
  Isolating-Boundaries (z.B. Table-Cells).
- `probeVerticalBoundary()` (privat): Selection.modify Probing mit
  getBoundingClientRect Cross-Check. Gibt `false` zurueck wenn DOM-Selection
  nicht verfuegbar (sicherer Default).
- `getCaretRect()`, `findBlockAncestor()` als private Hilfsfunktionen.

#### Schritt 2: isIsolatingBlock exportiert — erledigt

- `isIsolatingBlock` in `Commands.ts` von privat auf `export` geaendert
- Zu Barrel-Exports in `index.ts` hinzugefuegt

#### Schritt 3: getSelection exportiert — erledigt

- `getSelection` in `SelectionSync.ts` von privat auf `export` geaendert
- Von `endOfTextblock()` genutzt fuer Shadow-DOM-aware DOM-Selection-Zugriff

#### Schritt 4: Navigation-Keymaps in EditorView — erledigt

- `registerNavigationKeymaps()`: Registriert ArrowLeft/Right/Up/Down mit
  `priority: 'navigation'` auf `SchemaRegistry`
- `handleNavigationArrow(direction)`: Guards (NodeSelection, non-collapsed),
  prueft `endOfTextblock()`, dispatcht `navigateAcrossBlocks()`
- Aufruf im Konstruktor nach Initial Render
- Keymap-Referenz gespeichert fuer sauberes Cleanup

#### Schritt 5: KeyboardHandler umstrukturiert — erledigt

- `handleArrowIntoVoid()` komplett entfernt (durch Navigation-Keymaps ersetzt)
- Readonly-Guard umstrukturiert: nur `navigation`-priority Keymaps + Escape
  laufen im Readonly-Modus. Context/Default-Keymaps bleiben blockiert.
- `handleNodeSelectionKeys()` bleibt unveraendert (vor Readonly-Guard)
- `navigateArrowIntoVoid` Import beibehalten (wird von
  `handleNodeSelectionKeys` fuer Void→Text Navigation genutzt)

#### Schritt 6: Unit-Tests CaretNavigation — erledigt

- 21 Tests in `packages/core/src/view/CaretNavigation.test.ts`
- `endOfTextblock`: 9 Tests (left/right/up/down, NodeSelection, non-collapsed,
  Fallback-Pfad)
- `navigateAcrossBlocks`: 8 Tests (Text→Text, Text→Void, Document-Grenzen,
  NodeSelection, up/down)
- `canCrossBlockBoundary`: 4 Tests (top-level, isolating target/source,
  indirekt via navigateAcrossBlocks)

#### Schritt 7: KeyboardHandler.test.ts aktualisiert — erledigt

- 3 neue Tests fuer Readonly-Modus:
  - Navigation-Keymaps laufen in Readonly
  - Default-Keymaps blockiert in Readonly
  - Context-Keymaps blockiert in Readonly

#### Schritt 8: E2E-Tests erweitert — erledigt

- 8 neue Tests in `e2e/arrow-navigation.spec.ts`:
  - Cross-Block Text→Text (2): ArrowRight/Left ueber Blockgrenzen
  - Cross-Block Text→Void (2): ArrowRight/Down selektiert naechstes Image
  - Cross-Block Void→Text (2): ArrowRight/Left von NodeSelection in
    Text-Block (via `setHTML()` fuer deterministische Dokumentstruktur)
  - Readonly Navigation (1): Arrow-Keys navigieren in Readonly ohne Crash
  - Soft-Wrap Boundary (1): ArrowDown in Wrapped-Line bleibt im selben Block
- Pre-existing flaky Test stabilisiert mit deterministischen Waits

#### Schritt 9: Barrel-Exports — erledigt

- `endOfTextblock`, `navigateAcrossBlocks` exportiert aus `index.ts`
- `CaretDirection` Typ exportiert aus `index.ts`
- `isIsolatingBlock` zu Commands-Exports hinzugefuegt

#### Schritt 10: Navigation-Keymap Cleanup — erledigt

- `navigationKeymap` Feld in EditorView fuer Referenz-Tracking
- `destroy()` ruft `schemaRegistry.removeKeymap()` auf
- Kein Keymap-Leak bei Editor-Zerstoerung

#### Verifikation

- 1814 Unit-Tests bestanden
- 437 E2E-Tests bestanden (0 flaky)
- Build sauber
- Typecheck sauber
- Lint sauber

### Phase 2: InlineNode-aware Navigation — abgeschlossen

**Datum:** 2026-02-25

Korrekte Cursor-Bewegung um InlineNodes (`contenteditable="false"` Elemente wie
`<br>` von hard_break, Mentions etc.). ArrowLeft/Right ueberspringen InlineNodes
atomar (genau 1 pro Tastendruck), um Cursor-Platzierung zwischen benachbarten
InlineNodes zu ermoeglichen. Browser-Workarounds fuer Firefox-Cursor-Disappear
und Chrome-Phantom-Positionen implementiert.

#### Schritt 1: skipInlineNode in CaretNavigation.ts — erledigt

- `skipInlineNode(state, direction)`: Oeffentliche Entry-Funktion, behandelt
  nur horizontal (left/right), gibt `null` fuer vertical (up/down) zurueck.
  Guards: NodeSelection, non-collapsed.
- `skipInlineNodeRight()` (privat): Prueft `getContentAtOffset(block, offset)`
  auf `kind === 'inline'`, erstellt Transaction zu `offset + 1`.
- `skipInlineNodeLeft()` (privat): Prueft `getContentAtOffset(block, offset - 1)`
  auf `kind === 'inline'`, erstellt Transaction zu `offset - 1`. Guard: offset === 0.
- Beide Funktionen loeschen `storedMarks` via `.setStoredMarks(null, state.storedMarks)`
  um Format-Leak nach Cursorbewegung zu verhindern (analog zu `syncSelectionFromDOM()`
  in EditorView.ts:271).
- Import: `getContentAtOffset` aus `model/Document.ts`

#### Schritt 2: Integration in EditorView.handleNavigationArrow — erledigt

- `skipInlineNode` Import in EditorView.ts
- Aufruf **vor** `endOfTextblock`-Check: InlineNode in Block-Mitte soll uebersprungen
  werden, nicht Cross-Block ausloesen. An Block-Grenzen (offset 0 links, blockLength
  rechts) gibt `skipInlineNode` null zurueck, sodass `endOfTextblock` korrekt greift.
- Nach Skip: `validateSelectionAfterInlineSkip()` Roundtrip

#### Schritt 3: Browser-spezifische Workarounds — erledigt

- `validateSelectionAfterInlineSkip()` (privat in EditorView):
  - Liest DOM-Selection via `readSelectionFromDOM()` zurueck
  - Falls DOM-Selection verloren (Firefox): forciert erneutes `syncSelectionToDOM()`
  - Falls DOM-Position abgewichen (Chrome Phantom): forciert erneutes `syncSelectionToDOM()`
  - Vergleich via `selectionsEqual(domSel, state.selection)`
- `syncSelectionToDOM()` laeuft bereits automatisch via `applyUpdate()` —
  der Roundtrip dient als Validierung und Korrektur bei Browser-Inkonsistenzen

#### Schritt 4: storedMarks-Clearing — erledigt

- Beide Skip-Transaktionen enthalten `.setStoredMarks(null, state.storedMarks)`
- Verhindert Format-Leak: nach Toggle Bold + Arrow-Skip wird nicht mehr
  unerwartet fett getippt
- Analoges Verhalten wie native selectionchange-Handler (EditorView.ts:267-272)
- 2 Unit-Tests verifizieren storedMarks-Clearing nach Skip left/right

#### Schritt 5: Unit-Tests — erledigt

- 20 Tests in `describe('skipInlineNode')` in `CaretNavigation.test.ts`:
  - Skip right/left: Mitte, Anfang, Ende des Blocks (6 Tests)
  - Adjacent InlineNodes: first right, second right, left between (3 Tests)
  - Null-Returns: vertical, kein InlineNode, NodeSelection, non-collapsed,
    Block-Boundaries (8 Tests)
  - Block mit nur einem InlineNode: skip right/left (2 Tests)
  - storedMarks-Clearing: nach Skip right, nach Skip left (2 Tests, neu)
- Alle Assertions mit harten Guards:
  `expect(isNodeSelection(...)).toBe(false)` und
  `expect(isCollapsed(...)).toBe(true)` vor Property-Zugriff
  (kein stilles Durchlaufen bei falschem Selection-Typ)

#### Schritt 6: E2E-Tests — erledigt

- 5 neue Tests in `describe('InlineNode navigation (Phase 2)')` in
  `e2e/arrow-navigation.spec.ts`:
  - ArrowRight ueberspring Hard Break
  - ArrowLeft ueberspringt Hard Break
  - Navigation durch benachbarte Hard Breaks (2x `<br>`)
  - ArrowLeft am Block-Anfang nach InlineNode -> Cross-Block zu vorherigem Block
  - Cursor funktional nach Skip (Typing verifiziert)
- Positionierung via Home + ArrowLeft/Right mit `waitForTimeout(50)` zwischen
  Key-Presses fuer zuverlaessige State-Synchronisation

#### Schritt 7: Firefox-E2E-Projekt — erledigt

- Neues `firefox`-Projekt in `playwright.config.ts` mit `devices['Desktop Firefox']`
- Scoped auf `arrow-navigation.spec.ts` (testMatch)
- Alle 23 Arrow-Navigation-Tests laufen in Chromium **und** Firefox (46 total)
- Firefox-Browser via `playwright install firefox` installiert

#### Schritt 8: Barrel-Exports — erledigt

- `skipInlineNode` exportiert aus `index.ts` (Zeile mit `endOfTextblock`,
  `navigateAcrossBlocks`)

#### Verifikation

- 1835 Unit-Tests bestanden
- 465 E2E-Tests bestanden (Chromium + Firefox + Angular + Touch)
- Build sauber
- Typecheck sauber
- Lint sauber
