/**
 * TablePlugin: registers table, table_row, and table_cell node types
 * with NodeSpecs, NodeViews, commands, keyboard navigation, toolbar
 * grid picker, multi-cell selection, and context menu.
 */

import { TABLE_CSS } from '../../editor/styles/table.js';
import { isNodeSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resetTableBorderColor } from './TableBorderColor.js';
import { insertTable, registerTableCommands } from './TableCommands.js';
import { isInsideTable } from './TableHelpers.js';
import { registerTableKeymaps } from './TableNavigation.js';
import {
	createTableCellNodeViewFactory,
	createTableNodeViewFactory,
	createTableRowNodeViewFactory,
} from './TableNodeViews.js';
import {
	type TableSelectionService,
	createTableSelectionService,
	installMouseSelection,
} from './TableSelection.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		table: { borderColor?: string };
		table_row: Record<string, never>;
		table_cell: { colspan?: number; rowspan?: number };
	}
}

// --- Configuration ---

export interface TableConfig {
	/** Maximum rows in grid picker. Defaults to 8. */
	readonly maxPickerRows?: number;
	/** Maximum columns in grid picker. Defaults to 8. */
	readonly maxPickerCols?: number;
	/** When true, a separator is rendered after the table toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: TableConfig = {
	maxPickerRows: 8,
	maxPickerCols: 8,
};

// --- SVG Icon ---

const TABLE_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
	'<path d="M3 3h18v18H3V3zm2 2v4h6V5H5zm8 0v4h6V5h-6zm-8 6v4h6v-4H5z' +
	'm8 0v4h6v-4h-6zm-8 6v4h6v-4H5zm8 0v4h6v-4h-6z"/></svg>';

// --- Plugin ---

export class TablePlugin implements Plugin {
	readonly id = 'table';
	readonly name = 'Table';
	readonly priority = 40;

	private readonly config: TableConfig;
	private selectionService: TableSelectionService | null = null;
	private cleanupMouseSelection: (() => void) | null = null;
	private context: PluginContext | null = null;

	constructor(config?: Partial<TableConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		context.registerStyleSheet(TABLE_CSS);
		this.context = context;

		this.registerNodeSpecs(context);
		this.registerNodeViews(context);
		registerTableCommands(context);
		context.registerCommand('resetTableBorderColor', () => resetTableBorderColor(context));
		registerTableKeymaps(context);
		this.registerToolbarItem(context);
		this.selectionService = createTableSelectionService(context);
	}

	onReady(): void {
		if (this.context && this.selectionService) {
			this.cleanupMouseSelection = installMouseSelection(this.context, this.selectionService);
		}
	}

	destroy(): void {
		this.cleanupMouseSelection?.();
		this.cleanupMouseSelection = null;
		this.selectionService = null;
		this.context = null;
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		// Clear multi-cell selection when cursor moves outside table
		if (this.selectionService?.getSelectedRange()) {
			const sel = newState.selection;
			if (isNodeSelection(sel) || !isInsideTable(newState, sel.anchor.blockId)) {
				this.selectionService.setSelectedRange(null);
			}
		}
	}

	private registerNodeSpecs(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'table',
			group: 'block',
			content: { allow: ['table_row'], min: 1 },
			isolating: true,
			selectable: true,
			toDOM(node) {
				const wrapper: HTMLDivElement = document.createElement('div');
				wrapper.className = 'notectl-table-wrapper';
				wrapper.setAttribute('data-block-id', node.id);
				return wrapper;
			},
		});

		context.registerNodeSpec({
			type: 'table_row',
			group: 'table_content',
			content: { allow: ['table_cell'], min: 1 },
			toDOM(node) {
				const tr: HTMLTableRowElement = document.createElement('tr');
				tr.setAttribute('data-block-id', node.id);
				tr.setAttribute('role', 'row');
				return tr;
			},
		});

		context.registerNodeSpec({
			type: 'table_cell',
			group: 'table_content',
			content: {
				allow: ['paragraph', 'list_item', 'heading', 'blockquote', 'image', 'horizontal_rule'],
			},
			isolating: true,
			toDOM(node) {
				const td: HTMLTableCellElement = document.createElement('td');
				td.setAttribute('data-block-id', node.id);
				td.setAttribute('role', 'cell');
				return td;
			},
		});
	}

	private registerNodeViews(context: PluginContext): void {
		const registry = context.getSchemaRegistry();

		context.registerNodeView('table', createTableNodeViewFactory(registry, context));
		context.registerNodeView('table_row', createTableRowNodeViewFactory(registry));
		context.registerNodeView('table_cell', createTableCellNodeViewFactory(registry));
	}

	private registerToolbarItem(context: PluginContext): void {
		const maxRows: number = this.config.maxPickerRows ?? 8;
		const maxCols: number = this.config.maxPickerCols ?? 8;

		context.registerToolbarItem({
			id: 'table',
			group: 'insert',
			icon: TABLE_ICON,
			label: 'Insert Table',
			tooltip: 'Insert Table',
			command: 'insertTable',
			priority: 80,
			separatorAfter: this.config.separatorAfter,
			popupType: 'gridPicker',
			popupConfig: {
				maxRows,
				maxCols,
				onSelect: (rows: number, cols: number) => {
					insertTable(context, rows, cols);
				},
			},
			isActive: (state: EditorState) => {
				if (isNodeSelection(state.selection)) return false;
				return isInsideTable(state, state.selection.anchor.blockId);
			},
		});
	}
}
