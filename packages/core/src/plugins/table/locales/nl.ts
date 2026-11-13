import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
	insertRowAbove: 'Rij boven invoegen',
	insertRowBelow: 'Rij onder invoegen',
	insertColumnLeft: 'Kolom links invoegen',
	insertColumnRight: 'Kolom rechts invoegen',
	deleteRow: 'Rij verwijderen',
	deleteColumn: 'Kolom verwijderen',
	borderColorLabel: 'Randkleur...',
	deleteTable: 'Tabel verwijderen',

	tableActions: 'Tabelacties',
	menuKeyboardHint: '↑↓ Navigeren · Enter Selecteren · Esc Sluiten',

	insertRow: 'Rij invoegen',
	insertColumn: 'Kolom invoegen',
	addRow: 'Rij toevoegen',
	addColumn: 'Kolom toevoegen',
	tableActionsHint: 'Tabelacties (rechtsklikken of Shift+F10)',
	contextMenuHint: 'Rechtsklikken of Shift+F10 voor tabelacties',
	borderColor: 'Randkleur',

	sizeLabel: 'Grootte...',
	sizeDialogLabel: 'Tabelgrootte',
	columnWidthLabel: 'Kolombreedte (px)',
	rowMinimumHeightLabel: 'Minimale rijhoogte (px)',
	automatic: 'Automatisch',
	mixed: 'Gemengd',
	apply: 'Toepassen',
	cancel: 'Annuleren',
	resetColumnWidth: 'Kolombreedte terugzetten',
	resetRowMinimumHeight: 'Minimale rijhoogte terugzetten',
	resetAllSizes: 'Alle groottes terugzetten',
	invalidDimensionRange: (minimum: number, maximum: number) =>
		`Voer een waarde in van ${minimum} tot ${maximum} px.`,
	selectRowLabel: (rowIndex: number) => `Rij ${rowIndex + 1} selecteren`,
	selectColumnLabel: (columnIndex: number) => `Kolom ${columnIndex + 1} selecteren`,
	resizeColumnSeparatorLabel: (columnIndex: number) =>
		`Breedte van kolom ${columnIndex + 1} wijzigen`,
	resizeRowSeparatorLabel: (rowIndex: number) => `Hoogte van rij ${rowIndex + 1} wijzigen`,
	resizeKeyboardHint: (step: number, largeStep: number) =>
		`Pijltjestoetsen wijzigen de grootte met ${step} px; houd Shift ingedrukt voor ${largeStep} px.`,
	announceColumnWidthSet: (columnIndex: number, valuePx: number) =>
		`Breedte van kolom ${columnIndex + 1} ingesteld op ${valuePx} px.`,
	announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) =>
		`Minimale hoogte van rij ${rowIndex + 1} ingesteld op ${valuePx} px.`,
	announceColumnWidthReset: (columnIndex: number) =>
		`Breedte van kolom ${columnIndex + 1} teruggezet naar automatisch.`,
	announceRowMinimumHeightReset: (rowIndex: number) =>
		`Minimale hoogte van rij ${rowIndex + 1} teruggezet naar automatisch.`,
	announceTableSizesReset:
		'Kolombreedtes en minimale rijhoogtes van de tabel teruggezet naar automatisch.',

	defaultColor: 'Standaard',
	noBorders: 'Geen randen',
	borderColorPicker: 'Randkleurkiezer',
	announceBorderColorSet: (colorName: string) => `Randkleur van de tabel ingesteld op ${colorName}`,
	announceBorderReset: 'Tabelranden teruggezet naar standaard',
	borderSwatchLabel: (colorName: string) => `Rand ${colorName}`,

	announceRowInsertedAbove: 'Rij boven ingevoegd',
	announceRowInsertedBelow: 'Rij onder ingevoegd',
	announceColumnInserted: (side: string) => {
		const sides: Record<string, string> = { left: 'links', right: 'rechts' };
		return `Kolom ${sides[side] ?? side} ingevoegd`;
	},
	announceRowDeleted: 'Rij verwijderd',
	announceColumnDeleted: 'Kolom verwijderd',
	announceTableDeleted: 'Tabel verwijderd',

	insertTable: 'Tabel invoegen',

	tableAriaLabel: (rows: number, cols: number) =>
		`Tabel met ${rows} ${rows === 1 ? 'rij' : 'rijen'} en ${cols} ${cols === 1 ? 'kolom' : 'kolommen'}`,
	tableAriaDescription: 'Rechtsklikken of Shift+F10 voor tabelacties',
};

export default locale;
