# Anforderung - JSON PASTE

Wenn ein User JSON in notectl rein kopiert, soll es als formatiertes JSON eingefügt werden, anstatt als reiner Text. 

- Als CodeBlock
- Mit Syntax Highlighting (Soll funktionieren auch wenn das Theme wechselt von LIGHT auf Dark z.b. müssen sich die Farben anpassen)
- Formatiert (Einrückungen, Zeilenumbrüche, Pretty JSON halt)


## Zu klären
Eigene Plugin? Mit einer Dependency zu CodeBlockPlugin? Oder Teil von CodeBlockPlugin? Oder ganz anders?



## Hauptziel
Das Hauptuiel ist weniger das JSON Paste feature selbst, als das es die Vorarbeit für 

- https://github.com/Samyssmile/notectl/discussions/61

Sein soll.

# Übergeordnete Ziele

- State of The Art Architektur basis für #61
- State of The Art Interne API für #61
- State of The Art Public API für #61


Es ist wichtig Features zu finden die man jetzt schon implementieren kann, die aber auch in Zukunft bei #61 noch gebraucht werden, weil sie dort Vourassetzung sind.


# Plan 1 JSON (VOLLSTÄNDIG IMPLEMENTIERT)

# JSON Paste — Überarbeiteter Architektur-Plan

## Context

Wenn ein User JSON in notectl einfügt, soll es als formatierter Code-Block mit Syntax-Highlighting erscheinen. Das Feature selbst ist sekundär — der eigentliche Wert liegt in der **Infrastruktur für Discussion #61** (Regex-basiertes Syntax-Highlighting für Java, Python, Go, JS, TS). Ziel: ~80% der #61-Architektur wird hier gebaut.

Der ursprüngliche Plan hatte kritische Schwachstellen (Middleware statt Paste-Hook, kein Language Registry, kein Caching, keine Erweiterungspunkte). Dieser Plan behebt alle identifizierten Issues.

---

## Phase 1: Paste Interceptor API

**Problem:** PasteHandler splittet Multiline-Text in viele Blocks/Steps bevor Middleware es sieht. Rekonstruktion aus Steps ist fragil.

**Lösung:** Neues `registerPasteInterceptor()` API — Interceptors laufen in `PasteHandler.onPaste()` VOR `handleHTMLOrTextPaste()`, erhalten den rohen Text.

### 1.1 Types in `Plugin.ts`

```typescript
export type PasteInterceptor = (
    plainText: string,
    html: string,
    state: EditorState,
) => Transaction | null;

export interface PasteInterceptorOptions {
    readonly name?: string;
    readonly priority?: number; // lower = first, default 100
}
```

Add to `PluginContext`:
```typescript
registerPasteInterceptor(interceptor: PasteInterceptor, options?: PasteInterceptorOptions): void;
```

### 1.2 Storage in PluginManager

- Neues `PasteInterceptorEntry` interface (analog zu `MiddlewareEntry`)
- Array `pasteInterceptors: PasteInterceptorEntry[]` in PluginManager
- Sorted-Cache (invalidiert bei Registration, wie Middleware)
- `PluginRegistrations` erweitern um `pasteInterceptors: PasteInterceptor[]`
- Cleanup in `cleanupRegistrations()` und `destroy()`
- Neue public Method: `getPasteInterceptors(): readonly PasteInterceptorEntry[]`

### 1.3 PasteHandler Integration

`PasteHandlerOptions` erweitern:
```typescript
readonly getPasteInterceptors?: () => readonly PasteInterceptorEntry[];
```

Insertion in `onPaste()` — nach internal/file/rich paste, VOR `handleHTMLOrTextPaste`:
```typescript
// 4. Paste interceptors (plugins can claim the paste)
if (plainText && this.tryPasteInterceptors(plainText, clipboardData.getData('text/html'))) {
    return;
}
// 5. Default: HTML or text paste
this.handleHTMLOrTextPaste(clipboardData, plainText);
```

`tryPasteInterceptors()` iteriert priority-sorted, erster non-null Return → dispatch + return true.

### 1.4 Wiring

- `InputManagerDeps` + `InputManager` constructor: `getPasteInterceptors` durchreichen
- `NotectlEditor.onBeforeReady()`: `getPasteInterceptors: () => pluginMgr.getPasteInterceptors()`

### Dateien

| Aktion | Datei |
|--------|-------|
| MODIFY | `src/plugins/Plugin.ts` — Types + PluginContext |
| MODIFY | `src/plugins/PluginManager.ts` — Registry, Context, Cleanup |
| MODIFY | `src/input/PasteHandler.ts` — Options, tryPasteInterceptors |
| MODIFY | `src/input/InputManager.ts` — Deps durchreichen |
| MODIFY | `src/editor/NotectlEditor.ts` — Wire getPasteInterceptors |
| MODIFY | `src/test/TestUtils.ts` — mockPluginContext erweitern |
| NEW    | `src/input/PasteHandler.test.ts` — Interceptor Unit Tests |

### Tests
- Interceptor returns Transaction → dispatch called, default skipped
- Interceptor returns null → default processing runs
- Priority ordering (lower first)
- Multiple interceptors — first non-null wins
- Cleanup removes interceptor on plugin destroy

---

## Phase 2: Theme Token Colors

**Problem:** `notectl-token--{type}` CSS-Klassen existieren im DOM, aber keine Styles und keine Theme-Tokens.

### 2.1 ThemeSyntax Interface (`ThemeTokens.ts`)

```typescript
export interface ThemeSyntax {
    readonly keyword: string;
    readonly string: string;
    readonly comment: string;
    readonly number: string;
    readonly function: string;
    readonly operator: string;
    readonly punctuation: string;
    readonly boolean: string;
    readonly null: string;
    readonly property: string;
}

export interface ThemeCodeBlock {
    // bestehende 5 Felder...
    readonly syntax?: ThemeSyntax; // NEU
}
```

Light Theme (GitHub-inspiriert):
```
keyword: #d73a49, string: #032f62, comment: #6a737d, number: #005cc5,
function: #6f42c1, operator: #d73a49, punctuation: #24292e,
boolean: #005cc5, null: #005cc5, property: #005cc5
```

Dark Theme (Catppuccin Mocha):
```
keyword: #cba6f7, string: #a6e3a1, comment: #6c7086, number: #fab387,
function: #89b4fa, operator: #89dceb, punctuation: #bac2de,
boolean: #fab387, null: #f38ba8, property: #89b4fa
```

Update `PartialTheme`: `codeBlock` bleibt `Partial<ThemeCodeBlock>`, aber `syntax` muss deep-partial sein.

Update `createTheme()`: Deep-merge für `codeBlock.syntax`:
```typescript
codeBlock: overrides.codeBlock
    ? {
        ...base.codeBlock,
        ...overrides.codeBlock,
        syntax: overrides.codeBlock.syntax
            ? { ...base.codeBlock?.syntax, ...overrides.codeBlock.syntax }
            : base.codeBlock?.syntax,
    }
    : base.codeBlock,
```

### 2.2 ThemeEngine Mappings (`ThemeEngine.ts`)

10 neue Einträge in `VARIABLE_MAP`:
```typescript
['codeBlock.syntax.keyword',     '--notectl-code-token-keyword'],
['codeBlock.syntax.string',      '--notectl-code-token-string'],
['codeBlock.syntax.comment',     '--notectl-code-token-comment'],
['codeBlock.syntax.number',      '--notectl-code-token-number'],
['codeBlock.syntax.function',    '--notectl-code-token-function'],
['codeBlock.syntax.operator',    '--notectl-code-token-operator'],
['codeBlock.syntax.punctuation', '--notectl-code-token-punctuation'],
['codeBlock.syntax.boolean',     '--notectl-code-token-boolean'],
['codeBlock.syntax.null',        '--notectl-code-token-null'],
['codeBlock.syntax.property',    '--notectl-code-token-property'],
```

10 neue Fallbacks in `COMPONENT_FALLBACKS` (alle → `var(--notectl-code-block-color)`).

### 2.3 Token CSS (`code-block.ts`)

Append zu `CODE_BLOCK_CSS`:
```css
.notectl-token--keyword    { color: var(--notectl-code-token-keyword); }
.notectl-token--string     { color: var(--notectl-code-token-string); }
.notectl-token--comment    { color: var(--notectl-code-token-comment); font-style: italic; }
.notectl-token--number     { color: var(--notectl-code-token-number); }
.notectl-token--function   { color: var(--notectl-code-token-function); }
.notectl-token--operator   { color: var(--notectl-code-token-operator); }
.notectl-token--punctuation { color: var(--notectl-code-token-punctuation); }
.notectl-token--boolean    { color: var(--notectl-code-token-boolean); }
.notectl-token--null       { color: var(--notectl-code-token-null); }
.notectl-token--property   { color: var(--notectl-code-token-property); }
```

### Dateien

| Aktion | Datei |
|--------|-------|
| MODIFY | `src/editor/theme/ThemeTokens.ts` — ThemeSyntax, LIGHT/DARK, createTheme |
| MODIFY | `src/editor/theme/ThemeEngine.ts` — VARIABLE_MAP + COMPONENT_FALLBACKS |
| MODIFY | `src/editor/styles/code-block.ts` — Token CSS-Klassen |

### Tests
- ThemeTokens: LIGHT_THEME/DARK_THEME enthalten syntax
- ThemeEngine: `generateThemeCSS()` emittiert 10 neue CSS variables
- ThemeEngine: Fallbacks greifen wenn syntax fehlt
- createTheme: Deep-merge von syntax sub-object

---

## Phase 3: RegexTokenizer + Language Registry

**Problem:** SyntaxHighlighter-Interface existiert, keine Implementierung. Kein Weg für externe Plugins, Sprachen dynamisch zu registrieren.

### 3.1 LanguageDefinition Types (`highlighter/TokenizerTypes.ts`)

```typescript
export interface TokenPattern {
    readonly type: string;
    readonly pattern: RegExp; // Muss ^-anchored sein
}

export interface LanguageDefinition {
    readonly name: string;
    readonly aliases: readonly string[];
    readonly patterns: readonly TokenPattern[];
}
```

### 3.2 RegexTokenizer (`highlighter/RegexTokenizer.ts`)

```typescript
export class RegexTokenizer implements SyntaxHighlighter {
    private readonly languageMap = new Map<string, LanguageDefinition>();

    constructor(languages?: readonly LanguageDefinition[]);

    registerLanguage(def: LanguageDefinition): void;
    tokenize(code: string, language: string): readonly SyntaxToken[];
    getSupportedLanguages(): readonly string[];
}
```

Algorithmus: Linear scan, pro Position Patterns in Prioritätsreihenfolge testen, erster Match gewinnt, Position vorschieben. Kein Match → 1 Char skip.

### 3.3 JSON Language (`highlighter/languages/json.ts`)

```typescript
export const JSON_LANGUAGE: LanguageDefinition = {
    name: 'json',
    aliases: ['jsonc'],
    patterns: [
        { type: 'property',    pattern: /^"(?:[^"\\]|\\.)*"(?=\s*:)/ },
        { type: 'string',      pattern: /^"(?:[^"\\]|\\.)*"/ },
        { type: 'number',      pattern: /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/ },
        { type: 'boolean',     pattern: /^(?:true|false)\b/ },
        { type: 'null',        pattern: /^null\b/ },
        { type: 'punctuation', pattern: /^[{}[\]:,]/ },
    ],
};
```

### 3.4 SyntaxHighlighterService (`CodeBlockTypes.ts`)

```typescript
export interface SyntaxHighlighterService {
    registerLanguage(def: LanguageDefinition): void;
    getSupportedLanguages(): readonly string[];
    tokenize(code: string, language: string): readonly SyntaxToken[];
}

export const SYNTAX_HIGHLIGHTER_SERVICE_KEY =
    new ServiceKey<SyntaxHighlighterService>('syntaxHighlighter');
```

### 3.5 Integration in CodeBlockPlugin

**Default Highlighter:** Wenn `config.highlighter` nicht gesetzt → CodeBlockPlugin erstellt intern `new RegexTokenizer([JSON_LANGUAGE])`. Wenn `config.highlighter` explizit gesetzt → diesen verwenden.

**Service Registration:** CodeBlockPlugin registriert den aktiven Tokenizer als `SYNTAX_HIGHLIGHTER_SERVICE_KEY`. Externe Plugins können `getService(SYNTAX_HIGHLIGHTER_SERVICE_KEY).registerLanguage(javaDef)` aufrufen.

**Kein `builtinHighlighter` Flag** — einfach Default-Verhalten.

### 3.6 Tokenization Cache in `decorations()`

```typescript
private readonly tokenCache = new Map<BlockId, {
    readonly text: string;
    readonly language: string;
    readonly tokens: readonly SyntaxToken[];
}>();
```

Pro Block: nur re-tokenize wenn text oder language sich geändert haben. Stale Entries (Blocks entfernt) werden am Ende von `decorations()` bereinigt.

**Wichtig (dynamische Sprach-Registrierung):**
Bei `registerLanguage()` muss der Cache invalidiert werden, damit bereits vorhandene Code-Blöcke mit der neuen/aktualisierten LanguageDefinition neu tokenized werden.

Strategie (einfach + robust):
- In `CodeBlockPlugin` bei erfolgreichem `syntaxHighlighter.registerLanguage(def)` → `tokenCache.clear()`
- Keine partielle Invalidation nötig in V1; Korrektheit vor Mikro-Optimierung

### 3.7 Cache-Invalidierung Contract

`SyntaxHighlighterService.registerLanguage()` garantiert:
1. Sprache wird im aktiven Highlighter registriert
2. Danach wird der Token-Cache invalidiert (`clear`)
3. Nächster Render von `decorations()` tokenized betroffene Blöcke neu

### Dateien

| Aktion | Datei |
|--------|-------|
| NEW    | `src/plugins/code-block/highlighter/TokenizerTypes.ts` |
| NEW    | `src/plugins/code-block/highlighter/RegexTokenizer.ts` |
| NEW    | `src/plugins/code-block/highlighter/RegexTokenizer.test.ts` |
| NEW    | `src/plugins/code-block/highlighter/languages/json.ts` |
| NEW    | `src/plugins/code-block/highlighter/languages/json.test.ts` |
| NEW    | `src/plugins/code-block/highlighter/languages/index.ts` |
| MODIFY | `src/plugins/code-block/CodeBlockTypes.ts` — Service + ServiceKey |
| MODIFY | `src/plugins/code-block/CodeBlockPlugin.ts` — Default Highlighter, Cache, Service |
| MODIFY | `src/plugins/code-block/index.ts` — Neue Exports |

### Tests
- RegexTokenizer: leerer String, unbekannte Sprache, JSON-Tokens, Performance
- JSON Language: alle Token-Typen, verschachtelt, Edge-Cases (Escapes, Unicode, scientific notation)
- Cache: decorations() mit unverändertem Block → kein Re-Tokenize
- Service: registerLanguage() von externem Plugin aufrufbar
- Cache-Invalidierung: nach `registerLanguage()` wird bei unverändertem Block trotzdem neu tokenized

---

## Phase 4: SmartPastePlugin

**Problem:** Kein automatisches Erkennen und Formatieren von JSON beim Einfügen.

### 4.1 ContentDetector mit Confidence (`SmartPasteTypes.ts`)

```typescript
export interface DetectionResult {
    readonly language: string;
    readonly formattedText: string;
    readonly confidence: number; // 0-1
}

export interface ContentDetector {
    readonly id: string;
    detect(text: string): DetectionResult | null;
}

export interface SmartPasteConfig {
    readonly detectors?: readonly ContentDetector[];
    readonly locale?: SmartPasteLocale;
}

export interface SmartPasteService {
    registerDetector(detector: ContentDetector): void;
}

export const SMART_PASTE_SERVICE_KEY =
    new ServiceKey<SmartPasteService>('smartPaste');
```

**Warum Confidence?** Für #61: Mehrere Detektoren könnten matchen (`{}` = JSON oder JS). Höchster Score gewinnt. JSON.parse-Validierung gibt hohe Confidence (0.9), Heuristik-basierte Erkennung niedrigere.

**Warum `formattedText` im Result?** Vermeidet doppeltes Parsing (detect parst → format parst nochmal).

### 4.2 JsonDetector (`detectors/JsonDetector.ts`)

```typescript
export class JsonDetector implements ContentDetector {
    readonly id = 'json';

    detect(text: string): DetectionResult | null {
        const trimmed = text.trim();
        // Muss mit { oder [ beginnen (nur structured JSON)
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (typeof parsed !== 'object' || parsed === null) return null;
            const formatted = JSON.stringify(parsed, null, 2);
            if (formatted.length <= 4) return null; // {} oder []
            return { language: 'json', formattedText: formatted, confidence: 0.9 };
        } catch {
            return null;
        }
    }
}
```

### 4.3 SmartPastePlugin (`SmartPastePlugin.ts`)

```typescript
export class SmartPastePlugin implements Plugin {
    readonly id = 'smart-paste';
    readonly name = 'Smart Paste';
    readonly dependencies = ['code-block'] as const;
}
```

**init():**
1. Built-in JsonDetector registrieren
2. Config-Detectors hinzufügen
3. `registerPasteInterceptor(this.handlePaste, { name: 'smart-paste', priority: 50 })`
4. `registerService(SMART_PASTE_SERVICE_KEY, { registerDetector })` — externe Erweiterung

**handlePaste(plainText, html, state):**
1. Wenn `html` vorhanden → `null` (HTML-Paste nicht abfangen)
2. Wenn Cursor in code_block → `null` (kein Nested-Code-Block)
3. Alle Detectors laufen lassen, Results sammeln
4. Kein Result → `null` (Passthrough)
5. Höchster Confidence-Score gewinnt
6. Transaction bauen: Code-Block mit formattedText einfügen
7. `context.announce()` für Screen Reader

**buildCodeBlockTransaction(state, detection):**
- `state.transaction('paste')` — Builder mit Working Doc
- Falls Selection nicht collapsed → `addDeleteSelectionSteps()`
- Neuen code_block BlockNode erstellen mit `{ language: detection.language }`
- Insertion Context wie im PasteHandler auflösen (kein root-only Ansatz):
  - `findTableCellAncestor()` + `resolveCellInsertionContext()` für Table-Cells
  - sonst `resolveRootInsertionContext()` für Root/Nesting
- `builder.insertNode(context.parentPath, insertIndex, codeBlock)` — nach Anchor im aufgelösten Parent
- Wenn Anchor leer ist: leeren Anchor-Block entfernen (analog PasteHandler-Verhalten)
- `builder.setSelection(collapsed am Ende des Texts)`
- `.build()` → single Transaction → single Undo

### 4.4 Accessibility
- `context.announce(locale.detectedAsCodeBlock(lang))` nach Einfügen
- Code-Block selbst ist keyboard-accessible (Tab, Escape, Arrows via CodeBlockPlugin)
- Keine neuen interaktiven Elemente

### 4.5 Localization

```
plugins/smart-paste/
    SmartPasteLocale.ts     — Interface + EN default
    locales/de.ts, es.ts, fr.ts, ...
```

### Dateien

| Aktion | Datei |
|--------|-------|
| NEW    | `src/plugins/smart-paste/SmartPastePlugin.ts` |
| NEW    | `src/plugins/smart-paste/SmartPasteTypes.ts` |
| NEW    | `src/plugins/smart-paste/detectors/JsonDetector.ts` |
| NEW    | `src/plugins/smart-paste/detectors/JsonDetector.test.ts` |
| NEW    | `src/plugins/smart-paste/SmartPastePlugin.test.ts` |
| NEW    | `src/plugins/smart-paste/SmartPasteLocale.ts` |
| NEW    | `src/plugins/smart-paste/locales/de.ts` (+ weitere) |
| NEW    | `src/plugins/smart-paste/index.ts` |

### Tests
- JSON paste → Code-Block mit language="json", formatted text, Highlighting
- Nicht-JSON paste → null, default processing
- Paste in bestehenden Code-Block → null, kein nested Block
- JSON paste in Table-Cell → Code-Block wird in derselben Cell eingefügt (nicht auf Root)
- HTML-Paste mit JSON-Inhalt → null, HTML-Handler übernimmt
- Undo → gesamte Paste rückgängig (single Transaction)
- Mehrere Detectors → höchster Confidence gewinnt
- Service: registerDetector() von extern
- Read-only Mode → kein Paste
- Screen Reader Announcement

---

## Phase 5: Bundle, Preset, E2E

### 5.1 Bundle Checklist (ARCHITECTURE.md §8.3)

| Schritt | Datei | Änderung |
|---------|-------|----------|
| Vite Entry | `vite.config.ts` | `'plugins/smart-paste': resolve(...)` |
| Package Exports | `package.json` | `"./plugins/smart-paste"` Entry |
| Full Export | `src/full.ts` | `export * from './plugins/smart-paste/index.js'` |
| FullPreset | `src/presets/FullPreset.ts` | `new SmartPastePlugin(options?.smartPaste)` |
| PresetTypes | `src/presets/PresetTypes.ts` | `smartPaste?: Partial<SmartPasteConfig>` |
| Size Limit | `package.json` | Entry für smart-paste |
| Code-Block Exports | `src/plugins/code-block/index.ts` | Neue Exports (ServiceKey, Types) |

### 5.2 E2E Tests (`e2e/smart-paste.spec.ts`)

- JSON einfügen → Code-Block mit Syntax-Highlighting
- Theme wechseln → Token-Farben aktualisieren
- Normaler Text einfügen → kein Code-Block
- Invalides JSON einfügen → normaler Text
- Undo nach JSON Paste → komplett rückgängig

---

## Phasen-Abhängigkeiten

```
Phase 1 (Paste Interceptor) ─────┐
Phase 2 (Theme Tokens)      ─────┼── Phase 4 (SmartPastePlugin) ── Phase 5 (Bundle)
Phase 3 (RegexTokenizer)    ─────┘
```

Phase 1, 2, 3 sind unabhängig voneinander und können parallel implementiert werden.

---

## Wiederverwendung für #61

| Komponente | Jetzt gebaut | #61 Erweiterung |
|---|---|---|
| Paste Interceptor API | Infrastruktur | SmartPaste + neue Detectors |
| Theme Syntax Tokens | 10 Standard-Tokens | Direkt wiederverwendet |
| RegexTokenizer Engine | Engine + JSON | Neue LanguageDefinitions |
| SyntaxHighlighterService | ServiceKey + registerLanguage() | `getService().registerLanguage(javaDef)` |
| ContentDetector + Confidence | Interface + JSON | Neue Detectors per Service |
| SmartPasteService | registerDetector() | Externe Plugins registrieren |
| Language Picker UI | Nicht nötig | Eigenes Feature in #61 |

---

## Verification

Nach jeder Phase:
```bash
pnpm --filter @notectl/core test          # Unit Tests
pnpm lint                                  # Biome
pnpm typecheck                             # TypeScript strict
pnpm --filter @notectl/core build          # Build
```

Nach Phase 5:
```bash
pnpm build                                 # Full build (all packages)
pnpm test:e2e -- smart-paste               # E2E Tests
```

## PLAN 2 XML

Es muss auch mit XML funktionieren. JSON funktionier ausgezeichnet.