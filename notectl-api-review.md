# Notectl API Review

## Einstieg und Gesamteindruck
Das Zusammenspiel aus Web Component (`<notectl-editor>`) und der Hilfsfunktion `createEditor` ermöglicht einen unkomplizierten Einstieg – vor allem für Vanilla-Projekte wie das neue Beispiel unter `examples/vanillajs`. Die Architektur deutet auf ein Delta/State-Modell à la ProseMirror hin, was langfristig viel Flexibilität verspricht. Allerdings bleibt der Wechsel von den aktuellen DOM-basierten Fallbacks (z. B. `execCommand`) hin zu einem reinen Delta-Workflow noch sichtbar und erzeugt gewisse Reibungsverluste.

## Plugin-Schnittstelle
`PluginContext` liefert die wichtigsten Hooks – Zugriff auf den State, Kommandoregistrierung, Event-Bus und DOM-Container. Für fortgeschrittene Features müssen Plugins jedoch häufig auf DOM-Inspektion zurückfallen (z. B. um Tabelle und Zelle herauszufinden). Das ist fehleranfällig. Ein stärker ausgebauter Kontext mit Selektions-Helfern, Node-Abfragen und Mutations-Makros würde Plugins stabiler machen und den eigentlichen Delta-Weg stärken.

## Command-System
Commands werden über String-Keys registriert und liefern `unknown`. Das funktioniert, bietet aber kaum TypeScript-Unterstützung oder IntelliSense. Einheitliche Signaturen bzw. generische Command-Definitionen sowie ein offizielles Command-Registry-Modul (z. B. `format.bold`, `table.insert` etc.) würden Integratoren entlasten und Tippfehler vermeiden.

## State-Synchronisation & Delta-Pipeline
Die Koexistenz von DOM-Manipulation und Delta-State ist der größte Reibungspunkt. Methoden wie `setHTML`, `syncContentToState` oder `insertTableAtCursor` greifen weiterhin direkt ins DOM ein. Solange es keine vollständige Delta-Abbildung für Tabellen, Lists und Inline-Marks gibt, entstehen Inkonsistenzen (z. B. verlorene Tabelleninhalte beim Sync). Ein klarer Migrationspfad – DOM-Fallbacks hinter einem Feature-Flag oder einer Helper-Schicht – würde die Roadmap Richtung Delta-first verdeutlichen.

## Schema- und Dokument-Utilities
Das Schema bietet bereits Factory-Helfer (`nodeFactory`) und `findBlock`, aber Alltagsoperationen (Block vor aktueller Selektion einfügen, Heading toggeln, Mark setzen) fehlen. Ein Utility-Modul, das wiederverwendbare Operationen kapselt, würde App-Teams von Delta-Kleinarbeit befreien und das Risiko für Inkonsistenzen senken.

## Fazit
Für Demos und erste Integrationen wirkt die API zugänglich und flexibel. Produktive Teams brauchen jedoch mehr Determinismus und Typsicherheit:

- **Delta-first**: DOM-Fallbacks schrittweise durch Delta-Operationen ersetzen.
- **PluginContext ausbauen**: Selektion, Node-Queries und Mutations als API anbieten, damit Plugins nicht mehr auf DOM-Inspektion zurückgreifen müssen.
- **Commands typisieren**: Einheitliche Signaturen und veröffentlichte Command-Listen bereitstellen.
- **Utilities liefern**: Häufige Editor-Operationen als Helper publizieren.

Mit diesen Schritten wird Notectl deutlich integrationsfreundlicher und kann das versprochene Framework-agnostische Profil konsequent einlösen.
