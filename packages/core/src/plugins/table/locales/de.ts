import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
	insertRowAbove: 'Zeile oberhalb einf\u00fcgen',
	insertRowBelow: 'Zeile unterhalb einf\u00fcgen',
	insertColumnLeft: 'Spalte links einf\u00fcgen',
	insertColumnRight: 'Spalte rechts einf\u00fcgen',
	deleteRow: 'Zeile l\u00f6schen',
	deleteColumn: 'Spalte l\u00f6schen',
	borderColorLabel: 'Rahmenfarbe\u2026',
	deleteTable: 'Tabelle l\u00f6schen',

	tableActions: 'Tabellenaktionen',
	menuKeyboardHint:
		'\u2191\u2193 Navigieren \u00b7 Eingabe Ausw\u00e4hlen \u00b7 Esc Schlie\u00dfen',

	insertRow: 'Zeile einf\u00fcgen',
	insertColumn: 'Spalte einf\u00fcgen',
	addRow: 'Zeile hinzuf\u00fcgen',
	addColumn: 'Spalte hinzuf\u00fcgen',
	tableActionsHint: 'Tabellenaktionen (Rechtsklick oder Umschalt+F10)',
	contextMenuHint: 'Rechtsklick oder Umschalt+F10 f\u00fcr Tabellenaktionen',
	borderColor: 'Rahmenfarbe',

	defaultColor: 'Standard',
	noBorders: 'Keine Rahmen',
	borderColorPicker: 'Rahmenfarbe ausw\u00e4hlen',
	announceBorderColorSet: (colorName: string) => `Tabellenrahmenfarbe auf ${colorName} gesetzt`,
	announceBorderReset: 'Tabellenrahmen auf Standard zur\u00fcckgesetzt',
	borderSwatchLabel: (colorName: string) => `Rahmen ${colorName}`,

	announceRowInsertedAbove: 'Zeile oberhalb eingef\u00fcgt',
	announceRowInsertedBelow: 'Zeile unterhalb eingef\u00fcgt',
	announceColumnInserted: (side: string) => `Spalte ${side} eingef\u00fcgt`,
	announceRowDeleted: 'Zeile gel\u00f6scht',
	announceColumnDeleted: 'Spalte gel\u00f6scht',
	announceTableDeleted: 'Tabelle gel\u00f6scht',

	insertTable: 'Tabelle einf\u00fcgen',

	tableAriaLabel: (rows: number, cols: number) => `Tabelle mit ${rows} Zeilen und ${cols} Spalten`,
	tableAriaDescription: 'Rechtsklick oder Umschalt+F10 f\u00fcr Tabellenaktionen',
};

export default locale;
