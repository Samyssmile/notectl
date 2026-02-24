export {
	TablePlugin,
	type TableConfig,
} from './TablePlugin.js';

export {
	TableSelectionServiceKey,
	type TableSelectionService,
	type CellRange,
} from './TableSelection.js';

export {
	findTableContext,
	isInsideTable,
	type TableContext,
} from './TableHelpers.js';

export {
	type TableContextMenuHandle,
	createTableContextMenu,
} from './TableContextMenu.js';

export {
	BORDER_COLOR_PALETTE,
	getTableBorderColor,
	setTableBorderColor,
	resetTableBorderColor,
} from './TableBorderColor.js';

export {
	TABLE_LOCALE_EN,
	TABLE_LOCALE_DE,
	TABLE_LOCALE_ES,
	TABLE_LOCALE_FR,
	TABLE_LOCALE_ZH,
	TABLE_LOCALE_RU,
	TABLE_LOCALE_AR,
	TABLE_LOCALE_HI,
	type TableLocale,
} from './TableLocale.js';
