# Accessibility Bug Report

**Projekt:** notectl

**Datum:** 2026-08-28

**Umfang:** Editor, Toolbar, Popups, Tabellen, Bilder, Checklisten, Themes und HTML-Export

**Ergebnis:** 12 bestätigte Accessibility-Bugs, davon 6 mit hoher und 6 mit mittlerer
Priorität. A11Y-001 ist im aktuellen Arbeitsstand behoben.

## Zusammenfassung

| ID | Priorität | Kurzbeschreibung |
|---|---|---|
| A11Y-001 | Hoch | Geräteunabhängige `click`-Aktivierung vieler Controls funktioniert nicht (behoben) |
| A11Y-002 | Hoch | Fokusindikatoren haben zu wenig Kontrast und verschwinden in Forced Colors |
| A11Y-003 | Hoch | Der Bilddialog fokussiert ein unsichtbares Datei-Input |
| A11Y-004 | Hoch | Tabellen enthalten unsichtbare und funktionslose Tabstopps |
| A11Y-005 | Hoch | Tabellenüberschriften werden beim Import zu normalen Zellen |
| A11Y-006 | Hoch | Neu eingefügte Bilder können keinen Alternativtext erhalten |
| A11Y-007 | Mittel | Popup-Fokus ignoriert die aktuell ausgewählte Option |
| A11Y-008 | Mittel | Der Tabellen-Größenpicker erzeugt ein ungültiges ARIA-Grid |
| A11Y-009 | Mittel | Toolbar-Zustände sind semantisch falsch oder fehlen im Overflow |
| A11Y-010 | Mittel | Rechteckige Mehrzellenauswahl ist mausabhängig und nicht exponiert |
| A11Y-011 | Mittel | Exportierte Checklisten verlieren ihre Listensemantik |
| A11Y-012 | Mittel | Standard-Themes unterschreiten weitere Kontrastanforderungen |

---

## A11Y-001: Geräteunabhängige Aktivierung vieler Controls funktioniert nicht

**Priorität:** Hoch

**Status:** Behoben

**Betroffene Kriterien:** WCAG 2.1.1, 4.1.2

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/plugins/toolbar/ToolbarPlugin.ts:575-578`
- `packages/core/src/plugins/toolbar/ToolbarOverflowController.ts:302-305`
- `packages/core/src/plugins/toolbar/ToolbarOverflowController.ts:402-406`
- `packages/core/src/plugins/heading/HeadingBlockTypePicker.ts:174`
- `packages/core/src/plugins/font/FontPlugin.ts:322`
- `packages/core/src/plugins/font-size/FontSizePopup.ts:92-98`
- `packages/core/src/plugins/shared/ColorPickerPopup.ts:53-59`
- `packages/core/src/plugins/shared/ColorGrid.ts:95-99`
- `packages/core/src/plugins/image/ImagePopup.ts:52-56,121-125`
- `packages/core/src/plugins/link/LinkPlugin.ts:415-421,460-464`
- `packages/core/src/plugins/table/TableBorderColor.ts:154-160,173-179`
- `packages/core/src/plugins/list/ListPlugin.ts:236`

### Beschreibung

Viele echte `<button>`-Elemente und der Checklist-Marker führen ihre eigentliche Aktion
ausschließlich im `mousedown`-Handler aus. Ein `click`-Handler fehlt.

Für physische Enter- und Leertasten existieren teilweise Sonderpfade, die einen Mouse-Press
nachbilden. Geräteunabhängige Aktivierung über die native Click-Aktion wird dadurch aber nicht
abgedeckt. Ein direktes `button.click()` auf dem Heading-Button lässt beispielsweise
`aria-expanded="false"` und öffnet kein Popup, während ein `mousedown` das Popup öffnet.

### Auswirkung

Screenreader, Switch-Control, Sprachsteuerung und andere assistive Technologien können Controls
über die semantische Click-Aktion aktivieren, ohne zuvor ein `mousedown` auszulösen. Betroffene
Buttons reagieren dann nicht, obwohl sie als native Buttons exponiert werden.

Betroffen sind unter anderem:

- Haupt-Toolbar und Overflow-Menü
- Heading-, Font- und Font-Size-Picker
- Text- und Tabellenfarben
- Bild- und Linkdialoge
- Checklist-Checkboxen

### Empfohlene Behebung

Die Aktion muss im `click`-Handler liegen. `mousedown` darf nur `preventDefault()` und gegebenenfalls
`stopPropagation()` aufrufen, um die Editor-Selektion zu schützen. Das im Video-, Formel- und
Tabellen-Control-Code bereits verwendete Muster kann wiederverwendet werden.

### Umgesetzte Behebung

- Alle betroffenen Aktionen laufen über native `click`-Handler.
- `mousedown` verhindert nur noch Fokus- beziehungsweise Selektionsverlust.
- Toolbar-, Overflow- und Popup-Tastaturhandler rufen denselben `click()`-Pfad auf, statt
  `mousedown`/`mouseup` künstlich zu simulieren.
- Checklist-Marker besitzen getrennte MouseDown- und Click-Handler mit symmetrischem Cleanup.
- Unit- und Browser-Regressionen prüfen ausdrücklich programmatic Click, Enter und Leertaste.

---

## A11Y-002: Fokusindikatoren sind zu kontrastarm und verschwinden in Forced Colors

**Priorität:** Hoch

**Betroffene Kriterien:** WCAG 2.4.7, 2.4.11

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/editor/theme/ThemeTokens.ts:118,176`
- `packages/core/src/editor/styles/toolbar.ts:73-76,139-142,245-248,337-340,363-366`
- `packages/core/src/editor/styles/color-picker.ts:48-55`
- `packages/core/src/editor/styles/font-size-select.ts:38-43`
- `packages/core/src/editor/styles/table.ts:192-195,298-305,343-351,424-433`
- `packages/core/src/editor/styles/table.ts:490-498,550-558,588-596,617-621`
- `packages/core/src/editor/styles/table.ts:669-671,756-765,784-793`
- `packages/core/src/editor/styles/base.ts:132-147`

### Beschreibung

Der globale Fokus-Ring ist halbtransparent definiert:

```text
Light Theme: rgba(74, 144, 217, 0.2)
Dark Theme:  rgba(137, 180, 250, 0.25)
```

Viele Controls verwenden diesen Ring als einzigen Fokusindikator und entfernen gleichzeitig den
nativen Outline:

```css
box-shadow: 0 0 0 2px var(--notectl-focus-ring);
outline: none;
```

Der resultierende Kontrast beträgt ungefähr 1,2:1 im Light Theme und 1,6:1 im Dark Theme. Benötigt
werden mindestens 3:1 zwischen fokussiertem und nicht fokussiertem Zustand.

Unter `forced-colors: active` werden Box-Shadows unterdrückt. Die vorhandenen Forced-Colors-Regeln
decken den Editor-Rahmen ab, aber nicht Toolbar-, Popup- und Tabellen-Controls. Für diese Elemente
bleibt daher kein sichtbarer Fokusindikator übrig.

### Auswirkung

Tastaturnutzer können den Fokus auf einem großen Teil der interaktiven Oberfläche nicht zuverlässig
erkennen. In Windows High Contrast ist der Fokus auf mehreren Controls vollständig unsichtbar.

### Empfohlene Behebung

- Einen opaken Fokusfarbwert mit mindestens 3:1 Kontrast verwenden.
- Den transparenten Wert höchstens als zusätzlichen Glow einsetzen.
- Unter `@media (forced-colors: active)` einen Systemfarben-Outline definieren:

```css
outline: 2px solid Highlight;
box-shadow: none;
```

---

## A11Y-003: Der Bilddialog fokussiert ein unsichtbares Datei-Input

**Priorität:** Hoch

**Betroffene Kriterien:** WCAG 2.4.3, 2.4.7, 4.1.2

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/plugins/image/ImagePopup.ts:40-43`
- `packages/core/src/plugins/image/ImagePopupStyles.ts:8-14`
- `packages/core/src/plugins/shared/PopupManager.ts:242-253`

### Beschreibung

Der Bilddialog erzeugt ein normales `<input type="file">`. Es wird lediglich durch CSS auf 0 x 0
Pixel gesetzt und transparent dargestellt. Es bleibt fokussierbar und im Accessibility-Tree.

Der `PopupManager` sucht beim Öffnen zuerst nach `input, textarea`. Da das Datei-Input vor dem
sichtbaren Upload-Button und dem URL-Feld steht, landet der endgültige Initialfokus auf diesem
unsichtbaren Element. Der zuvor per `requestAnimationFrame()` gesetzte Fokus des URL-Feldes wird
überschrieben.

### Auswirkung

Beim Öffnen des Bilddialogs ist der Tastaturfokus nicht sichtbar. Zusätzlich enthält die
Tab-Reihenfolge zwei Upload-Controls: das unsichtbare Datei-Input und den sichtbaren Proxy-Button.
Das Datei-Input hat keine eigene programmatische Beschriftung.

### Empfohlene Behebung

Das über den sichtbaren Button ausgelöste Datei-Input muss aus Fokus- und Accessibility-Tree
entfernt werden, beispielsweise mit `hidden` oder mindestens `tabIndex = -1`. Der Dialog sollte
anschließend gezielt das URL-Feld oder den sichtbaren Upload-Button fokussieren.

---

## A11Y-004: Tabellen enthalten unsichtbare und funktionslose Tabstopps

**Priorität:** Hoch

**Betroffene Kriterien:** WCAG 2.1.1, 2.4.3, 2.4.7

**Konfidenz:** 10/10

### Fundstellen

- `packages/core/src/plugins/table/TableControls.ts:100-101`
- `packages/core/src/plugins/table/TableControls.ts:350-365`
- `packages/core/src/plugins/table/TableControls.ts:782-815`
- `packages/core/src/plugins/table/TableControlsDOM.ts:54-66`
- `packages/core/src/editor/styles/table.ts:353-364`

### Beschreibung

Für interne Zeilen- und Spaltengrenzen werden zwei native Einfüge-Buttons erzeugt. Ihre
Elternelemente haben standardmäßig `opacity: 0` und werden ausschließlich durch eine
mausgesteuerte `notectl-insert-line--visible`-Klasse eingeblendet.

Die Buttons bleiben trotzdem Teil der normalen Tab-Reihenfolge. Da der unsichtbare Elternknoten
keine `:focus-within`-Regel besitzt, bleibt auch der Fokusindikator unsichtbar.

Zusätzlich starten `activeRowIndex` und `activeColIndex` mit `-1`. Die Button-Aktionen führen nur
bei einem nicht negativen Index eine Transaktion aus. Ohne vorherige Mausbewegung bewirkt die
Aktivierung daher nichts.

### Auswirkung

Jede Tabelle enthält zwei unsichtbare Tabstopps. Tastaturnutzer erhalten weder sichtbares Feedback
noch eine funktionierende Aktion und können nicht erkennen, warum der Fokus scheinbar verschwunden
ist.

### Empfohlene Behebung

Die Buttons dürfen nur fokussierbar sein, wenn ein gültiges Ziel feststeht. Alternativ sollten die
mausabhängigen Insert-Lines aus der Tab-Reihenfolge entfernt werden und die bereits vorhandenen
Tabellenaktionen beziehungsweise Kontextmenüs den Tastaturpfad übernehmen.

---

## A11Y-005: Tabellenüberschriften werden beim Import zu normalen Zellen

**Priorität:** Hoch

**Betroffene Kriterien:** WCAG 1.3.1

**Konfidenz:** 10/10

### Fundstellen

- `packages/core/src/serialization/DocumentParser.ts:372-390`
- `packages/core/src/plugins/table/TablePlugin.ts:311-347`
- `packages/core/src/serialization/MarkdownParser.ts:204-226`

### Beschreibung

Der HTML-Parser akzeptiert sowohl `<td>` als auch `<th>`, wandelt beide aber in denselben
`table_cell`-Node ohne Zelltyp um. Der Tabellen-Serializer gibt für jeden `table_cell` ausnahmslos
ein `<td>` aus. Attribute wie `scope`, `headers` oder die ursprüngliche Header-Eigenschaft werden
ebenfalls nicht erhalten.

Beispiel:

```html
<th scope="col">Name</th>
```

wird nach Import und Export zu:

```html
<td><p>Name</p></td>
```

Auch GFM-Tabellen verlieren beim HTML-Export die Semantik ihrer Kopfzeile.

### Auswirkung

Screenreader können Datenzellen nicht mehr ihren Zeilen- oder Spaltenüberschriften zuordnen.
Bereits barrierefreie importierte Tabellen werden durch einen Editor-Roundtrip dauerhaft
verschlechtert.

### Empfohlene Behebung

Das Tabellenmodell muss mindestens Zelltyp und Scope abbilden, beispielsweise über
`header: boolean` und `scope: 'row' | 'col' | 'rowgroup' | 'colgroup'`. Parser, Live-DOM,
Markdown-Import, Sanitizer und HTML-Export müssen diese Attribute konsistent erhalten.

---

## A11Y-006: Neu eingefügte Bilder können keinen Alternativtext erhalten

**Priorität:** Hoch

**Betroffene Kriterien:** WCAG 1.1.1

**Konfidenz:** 10/10

### Fundstellen

- `packages/core/src/plugins/image/ImagePopup.ts:30-131`
- `packages/core/src/plugins/image/ImageCommands.ts:25-35`
- `packages/core/src/plugins/image/ImagePlugin.ts:175-188`
- `packages/core/src/plugins/image/ImagePlugin.ts:385-392`
- `packages/core/src/plugins/image/ImageUpload.ts:16-24`

### Beschreibung

Der Bilddialog bietet nur Datei-Upload und URL-Eingabe. Ein Feld für Alternativtext oder eine
explizite Auswahl "dekoratives Bild" existiert nicht.

Alle UI-Pfade rufen `insertImage()` nur mit `src` auf. Der Command setzt deshalb automatisch
`alt: ''`, und der HTML-Export schreibt ausdrücklich `alt=""`. Auch ein registrierter
`ImageUploadService` kann nur URL und Abmessungen, aber keinen Alternativtext zurückgeben.

Importierte Bilder behalten vorhandenen Alternativtext; betroffen sind neu über die Editor-UI
eingefügte Bilder.

### Auswirkung

Jedes neu eingefügte Bild wird im exportierten Dokument als dekorativ behandelt und von
Screenreadern ignoriert, selbst wenn es relevante Inhalte transportiert.

### Empfohlene Behebung

Der Einfüge- und Bearbeitungsdialog benötigt:

- ein Alternativtext-Feld,
- eine explizite Option für dekorative Bilder,
- Validierung, dass genau eine der beiden Entscheidungen getroffen wurde,
- eine Möglichkeit, den Alternativtext später zu bearbeiten.

---

## A11Y-007: Popup-Fokus ignoriert die aktuell ausgewählte Option

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 2.4.3, 4.1.2

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/plugins/shared/PopupManager.ts:242-253`
- `packages/core/src/plugins/shared/ColorGrid.ts:54-109`
- `packages/core/src/plugins/heading/HeadingBlockTypePicker.ts:115-174`
- `packages/core/src/plugins/font/FontPlugin.ts:260-322`
- `packages/core/src/plugins/font-size/FontSizePopup.ts:90-160`
- `packages/core/src/plugins/code-block/LanguagePicker.ts:30-89`

### Beschreibung

`PopupManager.focusFirstItem()` fokussiert immer die erste passende Option in DOM-Reihenfolge. Ein
bereits gesetztes `tabindex="0"` oder `aria-selected="true"` wird ignoriert.

Bei einem aktuellen H3-Block erhält nach Öffnen des Pickers daher "Paragraph" den Fokus, während
"Heading 3" weiterhin als ausgewählt markiert ist.

Im Farb-Grid ist die Wirkung schwerer: Der interne `focusedIndex` zeigt auf die aktive Farbe,
während der DOM-Fokus auf das erste Farbfeld verschoben wird. Der erste Pfeildruck berechnet seine
Position vom internen Index und kann dadurch über viele Farbfelder springen.

### Auswirkung

Screenreader melden eine andere fokussierte als ausgewählte Option. Tastaturnutzer müssen den
aktuellen Wert erneut suchen oder erleben unerwartete Fokusbewegungen.

### Empfohlene Behebung

Der PopupManager sollte zuerst `[tabindex="0"]`, dann `[aria-selected="true"]` und erst danach das
erste Element fokussieren. Alternativ muss das jeweilige Widget den Initialfokus vollständig selbst
verwalten.

---

## A11Y-008: Der Tabellen-Größenpicker erzeugt ein ungültiges ARIA-Grid

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 1.3.1, 4.1.2

**Konfidenz:** 9/10

### Fundstelle

- `packages/core/src/plugins/toolbar/ToolbarRenderers.ts:24-77`

### Beschreibung

Der Picker erzeugt diese Struktur:

```html
<div role="grid">
  <div role="gridcell"></div>
  <div role="gridcell"></div>
</div>
```

Ein ARIA-Grid benötigt `role="row"` zwischen Grid und Gridcells. Der Farbpicker in
`plugins/shared/ColorGrid.ts` verwendet bereits die korrekte Struktur.

### Auswirkung

Screenreader können die zweidimensionale Struktur und die Zeilen-/Spaltenposition eines Feldes
nicht zuverlässig bestimmen. Die JavaScript-Pfeilnavigation funktioniert zwar, die zugehörige
Semantik im Accessibility-Tree ist aber unvollständig.

### Empfohlene Behebung

Jede visuelle Zeile muss in einen Container mit `role="row"` gelegt werden. Die Gridcells bleiben
Kinder dieser Zeile.

---

## A11Y-009: Toolbar-Zustände sind semantisch falsch oder fehlen im Overflow

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 1.4.1, 4.1.2

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/plugins/toolbar/ToolbarPlugin.ts:536`
- `packages/core/src/plugins/toolbar/ToolbarPlugin.ts:594`
- `packages/core/src/plugins/toolbar/ToolbarOverflowController.ts:204-212`
- `packages/core/src/editor/styles/toolbar.ts:262-264`

### Beschreibung

Die Haupt-Toolbar setzt `aria-pressed` auf jeden Button:

- echte Toggle-Buttons wie Fett,
- Einmalaktionen wie Bild einfügen oder Drucken,
- Popup-Trigger,
- Elemente, deren Rolle anschließend zu `combobox` geändert wird.

Einmalaktionen werden dadurch fälschlich als Toggle-Buttons angekündigt. `aria-pressed` ist zudem
kein unterstützter Zustand für `role="combobox"`.

Im Overflow-Menü passiert das Gegenteil: Der aktive Zustand wird nur über
`notectl-dropdown__item--active` und eine Textfarbe dargestellt. Eine ARIA-Eigenschaft oder ein
nicht farbabhängiges Symbol fehlt.

### Auswirkung

Screenreader erhalten in der Haupt-Toolbar falsche Zustandsinformationen und im Overflow gar keine.
Nutzer mit Farbsehschwäche können aktive Overflow-Einträge ebenfalls nicht zuverlässig erkennen.

### Empfohlene Behebung

`ToolbarItem` sollte den semantischen Control-Typ explizit angeben. `aria-pressed` darf nur auf
echten Toggle-Buttons gesetzt werden. Toggle-Einträge im Overflow sollten beispielsweise
`role="menuitemcheckbox"` mit `aria-checked` und zusätzlich ein sichtbares Check-Symbol verwenden.

---

## A11Y-010: Rechteckige Mehrzellenauswahl ist mausabhängig und nicht exponiert

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 1.4.1, 2.1.1, 4.1.2

**Konfidenz:** 8/10

### Fundstellen

- `packages/core/src/plugins/table/TableSelection.ts:171-280`
- `packages/core/src/plugins/table/TableNavigation.ts:35-54`
- `packages/core/src/plugins/table/TableClipboard.ts:27-90`
- `packages/core/src/plugins/table/TablePlugin.ts:219-243`
- `packages/core/src/editor/styles/table.ts:52-55`

### Beschreibung

Eine beliebige rechteckige `CellRange` wird nur durch Drag oder Shift-Klick erzeugt. Die
Tabellen-Keymap enthält keine Shift+Pfeil-Bindings zum Erweitern einer Zellenauswahl. Die
zugänglichen Zeilen- und Spalten-Buttons können lediglich eine komplette Zeile oder Spalte
markieren.

Der Auswahlzustand wird nur durch die CSS-Klasse `notectl-table-cell--selected` und eine
Hintergrundfarbe visualisiert. `aria-selected`, eine Live-Ansage oder eine vergleichbare
semantische Repräsentation fehlt.

Der spezielle strukturierte Copy-/Cut-Pfad in `TableClipboard.ts` hängt von dieser `CellRange` ab.

### Auswirkung

Tastaturnutzer können beliebige Zellbereiche nicht gleichwertig auswählen und als strukturierten
Tabellenausschnitt kopieren oder ausschneiden. Screenreader erhalten auch bei einer per Maus
erzeugten Auswahl keine Information über den markierten Bereich.

### Empfohlene Behebung

- Shift+Pfeil-Navigation zum Erweitern einer logischen Zellenauswahl ergänzen.
- Ausgewählte Zellen semantisch kennzeichnen.
- Start, Ende und Größe der Auswahl über die Live-Region ansagen.
- Auswahl nicht ausschließlich durch Farbe darstellen.

---

## A11Y-011: Exportierte Checklisten verlieren ihre Listensemantik

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 1.3.1, 4.1.2

**Konfidenz:** 8/10

### Fundstellen

- `packages/core/src/plugins/list/ListPlugin.ts:182-198`
- `packages/core/src/serialization/markdown/MarkdownHTMLRegistry.ts:68-82`

### Beschreibung

Der HTML-Export erzeugt:

```html
<li role="checkbox" aria-checked="true">
  <input type="checkbox" disabled checked>
  Inhalt
</li>
```

`role="checkbox"` überschreibt die native `listitem`-Semantik des `<li>`. Die umgebende
`<ul>`-/`<ol>`-Liste besitzt damit keine gültigen Listeneinträge mehr. Gleichzeitig enthält der
Checkbox-Container ein zweites natives Checkbox-Control.

Der Live-Editor verwendet bereits ein geeigneteres Muster: Das `<li>` bleibt ein Listeneintrag und
enthält einen separaten Checkbox-Marker.

### Auswirkung

Screenreader können Anzahl, Position und Struktur der Checklisteneinträge verlieren oder die
Checkbox-Struktur uneinheitlich ankündigen. Der Fehler betrifft normalen HTML-Export und
Markdown-HTML-Fallback.

### Empfohlene Behebung

Das `<li>` muss seine Listitem-Semantik behalten. Genau ein Kind sollte den Checkbox-Zustand
repräsentieren, entweder ein korrekt beschriftetes natives Input oder ein einzelner
`role="checkbox"`-Marker.

---

## A11Y-012: Standard-Themes unterschreiten weitere Kontrastanforderungen

**Priorität:** Mittel

**Betroffene Kriterien:** WCAG 1.4.3, 1.4.11

**Konfidenz:** 9/10

### Fundstellen

- `packages/core/src/editor/theme/ThemeTokens.ts:97-118`
- `packages/core/src/editor/theme/ThemeTokens.ts:155-176`
- `packages/core/src/plugins/video/VideoPopupStyles.ts:27-57`
- `packages/core/src/plugins/image/ImagePopupStyles.ts:29-40`
- `packages/core/src/editor/styles/toolbar.ts:329-338`
- `packages/core/src/editor/styles/font-size-select.ts:18-28`
- `packages/core/src/editor/styles/table.ts:660-680`

### Gemessene Kontraste

| Kombination | Kontrast | Anforderung |
|---|---:|---:|
| Dark `mutedForeground #7f849c` auf `background #1e1e2e` | 4,44:1 | 4,5:1 |
| Dark `mutedForeground #7f849c` auf `surfaceRaised #313244` | 3,40:1 | 4,5:1 |
| Light `border #d0d0d0` auf Weiß | 1,54:1 | 3:1 |
| Dark `border #45475a` auf `background #1e1e2e` | 1,80:1 | 3:1 |
| Dark `border #45475a` auf `surfaceRaised #313244` | 1,38:1 | 3:1 |

### Beschreibung

Im Dark Theme verwenden mehrere 11- bis 13-Pixel-Texte `mutedForeground` auf
`surfaceRaised` beziehungsweise `surfaceOverlay`. Dazu gehören unter anderem Feldlabels,
Pflichtfeld-Hinweise und Hilfetexte im Videodialog.

Mehrere Formfelder verwenden für Feld und Popup dieselbe Hintergrundfarbe. Ihre schwache Border ist
damit die einzige sichtbare Begrenzung, unterschreitet aber in beiden Standard-Themes deutlich die
für UI-Komponenten erforderlichen 3:1.

### Auswirkung

Nutzer mit eingeschränktem Sehvermögen können kleine Hilfetexte und die Grenzen von Eingabefeldern
nicht zuverlässig erkennen.

### Empfohlene Behebung

- `mutedForeground` im Dark Theme so anheben, dass es auf allen vorgesehenen Flächen mindestens
  4,5:1 erreicht.
- Den Border-Token auf mindestens 3:1 gegenüber `background`, `surfaceRaised` und
  `surfaceOverlay` auslegen.
- Alternativ Formfeldern eine deutlich abgesetzte Füllfarbe geben, sodass ihre Erkennbarkeit nicht
  ausschließlich von der Border abhängt.

---

## Empfohlene Reihenfolge

1. A11Y-001 bis A11Y-004 beheben, da sie die direkte Bedienbarkeit und Fokuswahrnehmung blockieren.
2. A11Y-005 und A11Y-006 beheben, da sie nicht barrierefreie Inhalte erzeugen beziehungsweise
   vorhandene Semantik zerstören.
3. A11Y-007 bis A11Y-011 für konsistente Tastatur- und Screenreader-Bedienung beheben.
4. A11Y-012 zusammen mit A11Y-002 über eine kontrastgeprüfte Token-Überarbeitung lösen.
