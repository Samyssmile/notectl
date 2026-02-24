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
