# Coding Guidelines — notectl

## TypeScript

- **Strict mode** — `strict: true`, `noUncheckedIndexedAccess`, keine `any`-Typen
- **Immutability first** — `readonly` auf Properties, Arrays und Interfaces; Mutationen erzeugen neue Instanzen
- **`const` over `let`** — `let` nur wenn Reassignment unvermeidbar ist
- **Explizite Return-Types** auf exportierten Funktionen und Methoden
- **Discriminated Unions** statt Typ-Casts oder Type Guards mit `any`
- **Type-only Imports** — `import type { ... }` wenn nur Typen importiert werden
- **Kein `!` (Non-Null Assertion)** — stattdessen narrowen oder optionale Verkettung nutzen
- **Immer Typen nutzen** — alle Variablen, Parameter, Return-Values und Properties explizit typisieren; keine impliziten `any` durch fehlende Typen; generische Typen bevorzugen (`Map<string, Block>` statt untypisierter Collections)

## Clean Code

- **Kleine Dateien** — eine Datei sollte **max ~500 Zeilen** haben; wird sie länger, in kleinere Module aufteilen
- **Kleine Funktionen** — jede Funktion macht genau eine Sache.
- **Single Responsibility** — eine Datei = ein Thema/eine Klasse/ein Modul
- **Sprechende Namen** — Code soll sich wie Prosa lesen; keine kryptischen Abkürzungen
- **Keine tief verschachtelten Blöcke** — Early Returns und Guard Clauses statt verschachtelter `if/else`

## Architektur

- **SOLID** — jedes Modul hat eine klare Verantwortung
- **DRY** — Duplikation extrahieren, aber keine vorzeitige Abstraktion (Rule of Three)
- **Immutable Document Model** — das Dokument ist ein reiner Datenbaum; Änderungen laufen ausschließlich über `Transaction`/`Step`
- **Plugin-System** — neue Features als Plugin implementieren, nicht den Core erweitern.
- **Dependency Injection** über `PluginContext` — Plugins greifen nie direkt auf Interna zu

## Naming

| Element       | Konvention              | Beispiel                  |
| ------------- | ----------------------- | ------------------------- |
| Dateien       | PascalCase              | `EditorState.ts`          |
| Interfaces    | PascalCase, kein `I`    | `Plugin`, `BlockNode`     |
| Types/Enums   | PascalCase              | `NodeType`, `MarkType`    |
| Funktionen    | camelCase               | `applyStep`, `findNode`   |
| Konstanten    | UPPER_SNAKE_CASE        | `MAX_HISTORY_SIZE`        |
| Tests         | `*.test.ts` neben Datei | `Document.test.ts`        |
| Plugin-Ordner | kebab-case              | `text-color/`, `heading/` |

## Formatting (Biome)

- **Tabs** zur Einrückung
- **Single Quotes**, Semicolons
- **Max 100 Zeichen** pro Zeile
- Imports werden automatisch sortiert
- `pnpm lint:fix` vor jedem Commit

## Tests (Vitest)

- Testdateien liegen direkt neben der Implementierung (`Foo.ts` + `Foo.test.ts`)
- **Arrange-Act-Assert** Struktur
- Klare `describe`/`it`-Blöcke — `it` beschreibt erwartetes Verhalten, nicht Implementierung
- Keine gemockten Interna — Tests arbeiten gegen die öffentliche API
- `pnpm test` muss vor jedem Merge grün sein

## Git

- **Conventional Commits** — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Kleine, fokussierte Commits — ein logischer Change pro Commit
- Branch-Name: `feat/kurze-beschreibung`, `fix/kurze-beschreibung`

## Don'ts

- Kein `console.log` (Biome-Regel: Error)
- Kein `any` (Biome-Regel: Error)
- Keine zirkulären Importe zwischen Packages
- Keine DOM-Manipulation außerhalb von `view/`
- Keine Business-Logik in Plugins — Logik gehört in `state/` oder `model/`
