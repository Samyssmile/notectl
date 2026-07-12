/**
 * Locale interface and default English locale for the TablePlugin.
 * Allows full i18n of all user-facing strings in the table feature.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface TableLocale {
	// Context Menu
	readonly insertRowAbove: string;
	readonly insertRowBelow: string;
	readonly insertColumnLeft: string;
	readonly insertColumnRight: string;
	readonly deleteRow: string;
	readonly deleteColumn: string;
	readonly borderColorLabel: string;
	readonly deleteTable: string;

	// Menu A11y
	readonly tableActions: string;
	readonly menuKeyboardHint: string;

	// Controls
	readonly insertRow: string;
	readonly insertColumn: string;
	readonly addRow: string;
	readonly addColumn: string;
	readonly tableActionsHint: string;
	readonly contextMenuHint: string;
	readonly borderColor: string;

	// Sizing
	readonly sizeLabel: string;
	readonly sizeDialogLabel: string;
	readonly columnWidthLabel: string;
	readonly rowMinimumHeightLabel: string;
	readonly automatic: string;
	readonly mixed: string;
	readonly apply: string;
	readonly cancel: string;
	readonly resetColumnWidth: string;
	readonly resetRowMinimumHeight: string;
	readonly resetAllSizes: string;
	readonly invalidDimensionRange: (minimum: number, maximum: number) => string;
	/** Receives a zero-based logical row index and renders it as a one-based label. */
	readonly selectRowLabel: (rowIndex: number) => string;
	/** Receives a zero-based logical column index and renders it as a one-based label. */
	readonly selectColumnLabel: (columnIndex: number) => string;
	/** Receives a zero-based logical column index and renders it as a one-based label. */
	readonly resizeColumnSeparatorLabel: (columnIndex: number) => string;
	/** Receives a zero-based logical row index and renders it as a one-based label. */
	readonly resizeRowSeparatorLabel: (rowIndex: number) => string;
	readonly resizeKeyboardHint: (step: number, largeStep: number) => string;
	/** Receives a zero-based logical column index and announces it as one-based. */
	readonly announceColumnWidthSet: (columnIndex: number, valuePx: number) => string;
	/** Receives a zero-based logical row index and announces it as one-based. */
	readonly announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) => string;
	/** Receives a zero-based logical column index and announces it as one-based. */
	readonly announceColumnWidthReset: (columnIndex: number) => string;
	/** Receives a zero-based logical row index and announces it as one-based. */
	readonly announceRowMinimumHeightReset: (rowIndex: number) => string;
	readonly announceTableSizesReset: string;

	// Border Color Picker
	readonly defaultColor: string;
	readonly noBorders: string;
	readonly borderColorPicker: string;
	readonly announceBorderColorSet: (colorName: string) => string;
	readonly announceBorderReset: string;
	readonly borderSwatchLabel: (colorName: string) => string;

	// Command Announcements
	readonly announceRowInsertedAbove: string;
	readonly announceRowInsertedBelow: string;
	readonly announceColumnInserted: (side: string) => string;
	readonly announceRowDeleted: string;
	readonly announceColumnDeleted: string;
	readonly announceTableDeleted: string;

	// Toolbar
	readonly insertTable: string;

	// NodeView ARIA
	readonly tableAriaLabel: (rows: number, cols: number) => string;
	readonly tableAriaDescription: string;
}

// --- Default English Locale ---

export const TABLE_LOCALE_EN: TableLocale = {
	// Context Menu
	insertRowAbove: 'Insert Row Above',
	insertRowBelow: 'Insert Row Below',
	insertColumnLeft: 'Insert Column Left',
	insertColumnRight: 'Insert Column Right',
	deleteRow: 'Delete Row',
	deleteColumn: 'Delete Column',
	borderColorLabel: 'Border Color...',
	deleteTable: 'Delete Table',

	// Menu A11y
	tableActions: 'Table actions',
	menuKeyboardHint: '\u2191\u2193 Navigate \u00b7 Enter Select \u00b7 Esc Close',

	// Controls
	insertRow: 'Insert row',
	insertColumn: 'Insert column',
	addRow: 'Add row',
	addColumn: 'Add column',
	tableActionsHint: 'Table actions (Right-click or Shift+F10)',
	contextMenuHint: 'Right-click or Shift+F10 for table actions',
	borderColor: 'Border color',

	// Sizing
	sizeLabel: 'Size...',
	sizeDialogLabel: 'Table size',
	columnWidthLabel: 'Column width (px)',
	rowMinimumHeightLabel: 'Row minimum height (px)',
	automatic: 'Automatic',
	mixed: 'Mixed',
	apply: 'Apply',
	cancel: 'Cancel',
	resetColumnWidth: 'Reset column width',
	resetRowMinimumHeight: 'Reset row minimum height',
	resetAllSizes: 'Reset all sizes',
	invalidDimensionRange: (minimum: number, maximum: number) =>
		`Enter a value from ${minimum} to ${maximum} px.`,
	selectRowLabel: (rowIndex: number) => `Select row ${rowIndex + 1}`,
	selectColumnLabel: (columnIndex: number) => `Select column ${columnIndex + 1}`,
	resizeColumnSeparatorLabel: (columnIndex: number) => `Resize column ${columnIndex + 1}`,
	resizeRowSeparatorLabel: (rowIndex: number) => `Resize row ${rowIndex + 1}`,
	resizeKeyboardHint: (step: number, largeStep: number) =>
		`Arrow keys resize by ${step} px; hold Shift for ${largeStep} px.`,
	announceColumnWidthSet: (columnIndex: number, valuePx: number) =>
		`Column ${columnIndex + 1} width set to ${valuePx} px.`,
	announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) =>
		`Row ${rowIndex + 1} minimum height set to ${valuePx} px.`,
	announceColumnWidthReset: (columnIndex: number) =>
		`Column ${columnIndex + 1} width reset to automatic.`,
	announceRowMinimumHeightReset: (rowIndex: number) =>
		`Row ${rowIndex + 1} minimum height reset to automatic.`,
	announceTableSizesReset: 'Table column widths and row minimum heights reset to automatic.',

	// Border Color Picker
	defaultColor: 'Default',
	noBorders: 'No borders',
	borderColorPicker: 'Border color picker',
	announceBorderColorSet: (colorName: string) => `Table border color set to ${colorName}`,
	announceBorderReset: 'Table borders reset to default',
	borderSwatchLabel: (colorName: string) => `Border ${colorName}`,

	// Command Announcements
	announceRowInsertedAbove: 'Row inserted above',
	announceRowInsertedBelow: 'Row inserted below',
	announceColumnInserted: (side: string) => `Column inserted ${side}`,
	announceRowDeleted: 'Row deleted',
	announceColumnDeleted: 'Column deleted',
	announceTableDeleted: 'Table deleted',

	// Toolbar
	insertTable: 'Insert Table',

	// NodeView ARIA
	tableAriaLabel: (rows: number, cols: number) => `Table with ${rows} rows and ${cols} columns`,
	tableAriaDescription: 'Right-click or press Shift+F10 for table actions',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<TableLocale> = import.meta.glob<{
	default: TableLocale;
}>('./locales/*.ts', { eager: false });

export async function loadTableLocale(lang: string): Promise<TableLocale> {
	return loadLocaleModule(localeModules, lang, TABLE_LOCALE_EN);
}
