# Notectl Angular Integration - API Review

**Datum**: 2025-10-09
**Version**: 0.0.2
**Reviewer**: Claude (Anthropic)

---

## Executive Summary

Notectl bietet eine solide Grundlage für einen framework-agnostischen Rich Text Editor mit Plugin-Architektur. Die Integration in Angular v20 ist **möglich**, erfordert aber spezifisches Wissen über die korrekte Initialisierungsreihenfolge. Die API hat Verbesserungspotential in Bezug auf Developer Experience und Dokumentation.

**Gesamtbewertung: 6/10**

---

## ✅ Stärken

### 1. Plugin-Architektur
```typescript
// Saubere Trennung zwischen Core und Plugins
await editor.registerPlugin(new ToolbarPlugin());
await editor.registerPlugin(new TablePlugin());
```

**Vorteile:**
- Modularer Aufbau
- Plugins können unabhängig entwickelt werden
- Klare Plugin-Context API mit `registerCommand()`, `emit()`, `getContainer()`
- Dependency Management zwischen Plugins möglich

### 2. Framework-Agnostik
```typescript
// Web Components funktionieren überall
const editor = document.createElement('notectl-editor');
```

**Vorteile:**
- Keine Framework-Lock-in
- Shadow DOM für Style-Isolation
- Funktioniert in React, Vue, Angular, Svelte, Vanilla JS
- Standard Web Component API

### 3. Event-System
```typescript
editor.on('content-change', (data) => {
  console.log('Content changed:', data);
});
```

**Vorteile:**
- Klares, bekanntes Pattern
- Verschiedene Events: `content-change`, `focus`, `blur`, `ready`, etc.
- Type-safe mit TypeScript
- `on()` / `off()` / `emit()` API

### 4. TypeScript Support
```typescript
import type { Plugin, PluginContext, EditorConfig } from '@notectl/core';
```

**Vorteile:**
- Gute Typisierung für Plugin-Entwicklung
- IntelliSense-Unterstützung
- Type-safe Event-Handling

---

## ⚠️ Schwächen & Verbesserungspotential

### 1. 🔴 KRITISCH: Verwirrende Plugin-Registrierung

**Problem:**
```typescript
// ❌ Intuitiver Ansatz - funktioniert NICHT:
const editor = document.createElement('notectl-editor');
await editor.registerPlugin(new ToolbarPlugin());
container.appendChild(editor);
// → Toolbar erscheint nicht!

// ✅ Funktioniert - aber nicht intuitiv:
const editor = document.createElement('notectl-editor');
container.appendChild(editor); // Erst mounten
await new Promise(r => setTimeout(r, 100)); // ⚠️ Magic number!
await editor.registerPlugin(new ToolbarPlugin()); // Dann Plugin
```

**Warum das problematisch ist:**
- `connectedCallback()` muss aufgerufen werden, bevor Plugins funktionieren
- Plugin-Container (`pluginContainerTop`, `pluginContainerBottom`) existieren erst nach `render()`
- Der 100ms Timeout ist ein Workaround ohne Garantie
- Kein dokumentiertes `ready` Event

**Impact auf Angular:**
```typescript
// Angular Lifecycle macht es kompliziert
async ngOnInit(): Promise<void> {
  this.editor = document.createElement('notectl-editor');

  // Mount first
  this.editorContainer.nativeElement.appendChild(this.editor);

  // Wait for editor to be ready (hacky!)
  await new Promise(resolve => setTimeout(resolve, 100));

  // Now register plugins
  await this.editor.registerPlugin(new ToolbarPlugin());
}
```

**Empfohlene Lösung:**
```typescript
// Option A: Interne Queue für Pre-Mount Registrierung
class NotectlEditor extends HTMLElement {
  private pendingPlugins: Plugin[] = [];

  async registerPlugin(plugin: Plugin): Promise<void> {
    if (!this.isConnected) {
      // Editor noch nicht gemountet - in Queue speichern
      this.pendingPlugins.push(plugin);
      return;
    }
    // Editor ist gemountet - direkt registrieren
    await this.pluginManager.register(plugin, this.createPluginContext());
  }

  connectedCallback(): void {
    this.render();
    // Pending Plugins registrieren
    for (const plugin of this.pendingPlugins) {
      this.registerPlugin(plugin);
    }
    this.pendingPlugins = [];
  }
}

// Usage - funktioniert in jeder Reihenfolge:
const editor = document.createElement('notectl-editor');
await editor.registerPlugin(new ToolbarPlugin()); // Wird in Queue gespeichert
container.appendChild(editor); // Queue wird abgearbeitet
```

```typescript
// Option B: Promise-basiertes Ready System
class NotectlEditor extends HTMLElement {
  private readyPromise: Promise<void>;
  private readyResolve?: () => void;

  constructor() {
    super();
    this.readyPromise = new Promise(resolve => {
      this.readyResolve = resolve;
    });
  }

  connectedCallback(): void {
    this.render();
    this.readyResolve?.();
  }

  async whenReady(): Promise<void> {
    return this.readyPromise;
  }
}

// Usage - explizit und klar:
const editor = document.createElement('notectl-editor');
container.appendChild(editor);
await editor.whenReady(); // Wartet bis connectedCallback fertig
await editor.registerPlugin(new ToolbarPlugin());
```

---

### 2. 🟡 EditorConfig inkonsistent

**Problem:**
```typescript
// configure() akzeptiert 'plugins', aber hat keine Wirkung:
editor.configure({
  placeholder: 'Start typing...',
  plugins: [new ToolbarPlugin()] // ❌ Wird ignoriert!
});

// Man muss separat registerPlugin() aufrufen:
await editor.registerPlugin(new ToolbarPlugin()); // ✅ Funktioniert
```

**Code-Analyse:**
```typescript
// packages/core/src/types/index.ts
export interface EditorConfig {
  placeholder?: string;
  readonly?: boolean;
  plugins?: Plugin[]; // ⚠️ Existiert, wird aber nicht verwendet!
  // ...
}

// packages/core/src/editor/NotectlEditor.ts
configure(config: EditorConfig): void {
  this.config = { ...this.config, ...config };
  // ❌ config.plugins wird nie verarbeitet!

  if (config.readonly !== undefined) {
    this.updateReadonly();
  }
  if (config.placeholder !== undefined) {
    // ...
  }
  // plugins fehlt!
}
```

**Empfohlene Lösung:**
```typescript
// Option 1: plugins in configure() unterstützen
configure(config: EditorConfig): void {
  this.config = { ...this.config, ...config };

  // Neue Logic
  if (config.plugins) {
    for (const plugin of config.plugins) {
      this.registerPlugin(plugin);
    }
  }

  // Rest wie gehabt...
}

// Option 2: plugins aus EditorConfig entfernen
export interface EditorConfig {
  placeholder?: string;
  readonly?: boolean;
  // plugins?: Plugin[]; // ❌ Entfernt - verwirrt nur
}
```

---

### 3. 🟡 Angular Adapter nicht produktionsreif

**Problem:**
```typescript
// @notectl/angular existiert, funktioniert aber nicht:
import { NotectlEditorModule } from '@notectl/angular';
// → Error: Failed to resolve entry for package "@notectl/angular"
```

**Root Cause:**
```json
// packages/adapters/angular/dist/package.json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./dist/index.mjs",  // ❌ Pfad existiert nicht
      "require": "./dist/index.js",  // ❌ Pfad existiert nicht
      "default": "./fesm2022/notectl-angular.mjs"
    }
  }
}
```

**Konsequenz:**
- Kann `NotectlEditorModule` nicht importieren
- Muss Web Component API direkt nutzen
- Framework-Adapter bringt keinen Mehrwert

**Empfohlene Lösung:**
```typescript
// Option A: Angular Adapter fixen
// 1. ng-packagr korrekt konfigurieren
// 2. Exports in package.json korrigieren
// 3. Als standalone Component exportieren (Angular 14+)

// Option B: Web Component als primäre API empfehlen
// Dokumentieren, dass Web Component API der empfohlene Weg ist
// Framework-Adapter als "nice-to-have" behandeln
```

---

### 4. 🟡 Dokumentation fehlt

**Was fehlt:**
1. **Plugin-Lifecycle Dokumentation**
   - Wann werden Plugins initialisiert?
   - Was passiert bei `registerPlugin()` vor/nach Mounting?
   - Welche Reihenfolge ist korrekt?

2. **Framework-Integration Beispiele**
   - Angular: Nur Workaround-Code in README
   - React: Keine Beispiele
   - Vue: Keine Beispiele
   - Svelte: Keine Beispiele

3. **API-Referenz**
   - Welche Events gibt es?
   - Was ist der Unterschied zwischen `getContent()`, `getJSON()`, `getHTML()`?
   - Wann braucht man `await`?

4. **Best Practices**
   - Wie schreibt man eigene Plugins?
   - Wie kommunizieren Plugins untereinander?
   - Performance-Tipps?

**Empfohlene Struktur:**
```
docs/
├── getting-started/
│   ├── installation.md
│   ├── basic-usage.md
│   └── configuration.md
├── frameworks/
│   ├── angular.md    # ← WICHTIG!
│   ├── react.md
│   ├── vue.md
│   └── svelte.md
├── plugins/
│   ├── using-plugins.md
│   ├── writing-plugins.md
│   ├── toolbar.md
│   └── table.md
└── api/
    ├── editor.md
    ├── plugin-context.md
    └── events.md
```

---

### 5. 🟢 Kleinere Verbesserungen

#### A) Magic Numbers vermeiden
```typescript
// ❌ Aktuell
await new Promise(r => setTimeout(r, 100)); // Warum 100?

// ✅ Besser
export const EDITOR_READY_DELAY = 100; // ms - Zeit für connectedCallback
await new Promise(r => setTimeout(r, EDITOR_READY_DELAY));

// ✅ Am Besten
await editor.whenReady(); // Keine Magic Numbers
```

#### B) Error Handling
```typescript
// ❌ Aktuell - Fehler werden verschluckt
try {
  await editor.registerPlugin(new ToolbarPlugin());
} catch (error) {
  // Keine Hilfe für den User
}

// ✅ Besser - Aussagekräftige Fehler
class NotectlEditor extends HTMLElement {
  async registerPlugin(plugin: Plugin): Promise<void> {
    if (!this.isConnected) {
      throw new Error(
        'Cannot register plugin before editor is mounted. ' +
        'Call appendChild() first, or use configure({ plugins: [...] })'
      );
    }
    // ...
  }
}
```

#### C) TypeScript Strict Mode
```typescript
// Viele any-Types im Code:
private blockToHTML(block: any): string { // ❌ any
  // ...
}

// Besser:
interface Block {
  type: string;
  attrs?: Record<string, unknown>;
  children?: Array<Block | TextNode>;
}

private blockToHTML(block: Block): string { // ✅ typed
  // ...
}
```

---

## 📊 Praktische Integration: Angular v20

### Funktionierende Lösung

```typescript
// app.component.ts
import { Component, OnInit, ElementRef, ViewChild, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { NotectlEditor } from '@notectl/core';
import { ToolbarPlugin } from '@notectl/plugin-toolbar';
import { TablePlugin } from '@notectl/plugin-table';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA] // ← WICHTIG für Web Components
})
export class AppComponent implements OnInit {
  @ViewChild('editorContainer', { static: true }) editorContainer?: ElementRef;

  private editor?: NotectlEditor;

  async ngOnInit(): Promise<void> {
    if (this.editorContainer?.nativeElement) {
      try {
        // 1. Editor erstellen
        this.editor = document.createElement('notectl-editor') as NotectlEditor;

        // 2. ZUERST mounten (damit connectedCallback aufgerufen wird)
        this.editorContainer.nativeElement.appendChild(this.editor);

        // 3. Warten bis Editor bereit ist (⚠️ Workaround)
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. DANN Plugins registrieren
        await this.editor.registerPlugin(new ToolbarPlugin());
        await this.editor.registerPlugin(new TablePlugin());

        // 5. Konfigurieren
        this.editor.configure({
          placeholder: 'Start typing...'
        });

        // 6. Events abonnieren
        this.editor.on('content-change', (data: any) => {
          console.log('Content changed:', data.content);
        });
      } catch (error) {
        console.error('Error setting up editor:', error);
      }
    }
  }
}
```

```html
<!-- app.component.html -->
<div class="app-container">
  <h1>Notectl Angular Demo</h1>
  <p>Rich Text Editor mit Toolbar und Table Plugin</p>

  <div class="editor-wrapper">
    <div #editorContainer></div>
  </div>
</div>
```

### Wichtige Erkenntnisse

1. **Reihenfolge ist kritisch:** Mount → Wait → Register → Configure
2. **CUSTOM_ELEMENTS_SCHEMA erforderlich:** Ohne Schema gibt Angular Fehler
3. **100ms Timeout ist notwendig:** Sonst existieren Plugin-Container noch nicht
4. **await für registerPlugin():** API ist async, muss awaited werden
5. **@notectl/angular funktioniert nicht:** Direkt Web Component API nutzen

---

## 💡 Empfehlungen

### Kurzfristig (0.0.3)

1. **Plugin-Queue implementieren**
   - Plugins vor Mounting registrierbar machen
   - Automatisch in `connectedCallback()` initialisieren

2. **`whenReady()` API hinzufügen**
   ```typescript
   const editor = document.createElement('notectl-editor');
   container.appendChild(editor);
   await editor.whenReady();
   await editor.registerPlugin(new ToolbarPlugin());
   ```

3. **Fehlerbehandlung verbessern**
   - Aussagekräftige Fehlermeldungen
   - Prüfung ob Editor gemountet ist

4. **EditorConfig konsistent machen**
   - Entweder `plugins` in `configure()` unterstützen
   - Oder `plugins` aus Interface entfernen

### Mittelfristig (0.1.0)

1. **Dokumentation schreiben**
   - Framework-Integration Guides (Angular, React, Vue)
   - Plugin-Development Guide
   - API-Referenz mit allen Events

2. **Angular Adapter fixen oder deprecaten**
   - Entweder Package korrigieren
   - Oder offiziell Web Component API empfehlen

3. **Beispiel-Repository**
   - Funktionierende Beispiele für alle Frameworks
   - CodeSandbox/StackBlitz Templates

### Langfristig (1.0.0)

1. **TypeScript Strict Mode**
   - `any` Types eliminieren
   - Bessere Type-Inferenz

2. **Testing**
   - Unit Tests für Plugin-System
   - Integration Tests mit verschiedenen Frameworks
   - E2E Tests für Toolbar/Table Plugins

3. **Performance**
   - Virtual Scrolling für lange Dokumente
   - Lazy Loading für Plugins
   - Optimierte Re-Renders

---

## 🎯 Fazit

**Notectl hat großes Potential**, leidet aber unter typischen "Early Stage"-Problemen:
- ✅ Architektur ist gut
- ✅ Plugin-System ist flexibel
- ⚠️ Developer Experience braucht Arbeit
- ⚠️ Dokumentation fehlt
- ⚠️ Framework-Adapter nicht produktionsreif

**Für Production würde ich empfehlen:**
1. Direkt Web Component API nutzen (nicht `@notectl/angular`)
2. Plugin-Registrierung nach dem Mounting
3. 100ms Timeout als Workaround akzeptieren
4. Umfangreiche Tests für eigene Use Cases

**Gesamtbewertung: 6/10**
- **+2 Punkte möglich** mit besserer DX (Plugin-Queue, whenReady())
- **+2 Punkte möglich** mit guter Dokumentation

---

## 📝 Anhang: Getestete Versionen

```json
{
  "@notectl/core": "0.0.2",
  "@notectl/plugin-toolbar": "0.0.2",
  "@notectl/plugin-table": "0.0.2",
  "@notectl/angular": "0.0.2",
  "@angular/core": "^19.0.0",
  "typescript": "~5.6.2"
}
```

**Test-Setup:**
- Angular v20 (standalone components)
- TypeScript 5.6
- Development Server (ng serve)
- Browser: Chrome/Firefox

**Ergebnis:**
✅ Editor funktioniert
✅ Toolbar wird angezeigt
✅ Table Plugin funktioniert
⚠️ Nur mit spezifischem Setup-Code

---

**Kontakt für Rückfragen:** Claude (Anthropic)
**Review-Datum:** 9. Oktober 2025
