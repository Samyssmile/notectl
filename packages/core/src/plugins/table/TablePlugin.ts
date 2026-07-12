/**
 * TablePlugin: registers table, table_row, and table_cell node types
 * with NodeSpecs, NodeViews, commands, keyboard navigation, toolbar
 * grid picker, multi-cell selection, and context menu.
 */

import type { Decoration, DecorationSet } from '../../decorations/Decoration.js';
import { node as nodeDecoration } from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import { TABLE_CSS } from '../../editor/styles/table.js';
import type { BlockAttrValue, BlockAttrs, BlockNode } from '../../model/Document.js';
import { getBlockChildren } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import { isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import {
	TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE,
	TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE,
	normalizeSerializedTableDimensionPx,
	serializeTableDimensionAttrs,
} from '../../serialization/TableDimensions.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isValidHexColor } from '../shared/ColorValidation.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { resetTableBorderColor } from './TableBorderColor.js';
import { installTableClipboard } from './TableClipboard.js';
import { insertTable, registerTableCommands } from './TableCommands.js';
import { closeTableContextMenus } from './TableContextMenu.js';
import type { TableControlsHandle } from './TableControls.js';
import {
	createTableGrid,
	normalizeTableSpan,
	projectTableColumnWidthsForSlice,
} from './TableGrid.js';
import { isInsideTable } from './TableHelpers.js';
import { TABLE_LOCALE_EN, type TableLocale, loadTableLocale } from './TableLocale.js';
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
import {
	DEFAULT_TABLE_SIZING_CONFIG,
	type TableSizingConfig,
	createTableSizingService,
	readTableColumnWidthsPx,
	resolveTableSizingConfig,
} from './TableSizing.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		table: { borderColor?: string; columnWidthsPx?: readonly (number | null)[] };
		table_row: { minHeightPx?: number };
		table_cell: { colspan?: number; rowspan?: number };
	}
}

// --- Configuration ---

export interface TableConfig {
	/** Maximum rows in grid picker. Defaults to 8. */
	readonly maxPickerRows?: number;
	/** Maximum columns in grid picker. Defaults to 8. */
	readonly maxPickerCols?: number;
	/** Locale for all user-facing strings. Defaults to English. */
	readonly locale?: TableLocale;
	/** Minimum logical column width in CSS pixels. Defaults to 60. */
	readonly minColumnWidthPx?: number;
	/** Minimum logical row height in CSS pixels. Defaults to 24. */
	readonly minRowHeightPx?: number;
	/** Maximum accepted logical column width in CSS pixels. Defaults to 10000. */
	readonly maxColumnWidthPx?: number;
	/** Maximum accepted logical row height in CSS pixels. Defaults to 10000. */
	readonly maxRowHeightPx?: number;
	/** Small keyboard resize step in CSS pixels. Defaults to 8. */
	readonly keyboardResizeStepPx?: number;
	/** Shift-modified keyboard resize step in CSS pixels. Defaults to 32. */
	readonly keyboardResizeLargeStepPx?: number;
	/** Enables pointer and separator-key resizing. Precise UI/API remain available. Defaults to true. */
	readonly directResize?: boolean;
}

interface ResolvedTableConfig extends TableSizingConfig {
	readonly maxPickerRows: number;
	readonly maxPickerCols: number;
	readonly locale?: TableLocale;
	readonly directResize: boolean;
}

const DEFAULT_CONFIG: ResolvedTableConfig = {
	maxPickerRows: 8,
	maxPickerCols: 8,
	...DEFAULT_TABLE_SIZING_CONFIG,
	directResize: true,
};

// --- SVG Icon ---

const TABLE_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
	'<path d="M3 3h18v18H3V3zm2 2v4h6V5H5zm8 0v4h6V5h-6zm-8 6v4h6v-4H5z' +
	'm8 0v4h6v-4h-6zm-8 6v4h6v-4H5zm8 0v4h6v-4h-6z"/></svg>';

// --- Serialization Constants ---

const DEFAULT_BORDER_COLOR = '#d0d0d0';
const TABLE_BASE_STYLE = 'border-collapse: collapse; table-layout: fixed';
const CELL_STYLE = `border: 1px solid var(--ntbl-bc, ${DEFAULT_BORDER_COLOR}); padding: 8px 12px; vertical-align: top`;

// --- Serialization Helpers ---

/** Builds the inline `style` attribute value for the `<table>` element. */
function buildTableStyle(
	borderColor: string | undefined,
	widths: readonly (number | null)[],
	minimumColumnWidthPx: number,
): string {
	const minimumWidthPx: number = widths.reduce<number>(
		(total, width) => total + (width ?? minimumColumnWidthPx),
		0,
	);
	const allColumnsExplicit: boolean =
		widths.length > 0 && widths.every((width): width is number => width !== null);
	const widthStyle: string = allColumnsExplicit
		? `width: ${String(minimumWidthPx)}px`
		: 'width: 100%';
	const baseStyle = `${TABLE_BASE_STYLE}; ${widthStyle}; min-width: ${String(minimumWidthPx)}px`;
	if (!borderColor) return baseStyle;
	if (borderColor === 'none') {
		return `${baseStyle}; --ntbl-bc: transparent`;
	}
	if (isValidHexColor(borderColor)) {
		return `${baseStyle}; --ntbl-bc: ${escapeHTML(borderColor)}`;
	}
	return baseStyle;
}

// --- Plugin ---

export class TablePlugin implements Plugin {
	readonly id = 'table';
	readonly name = 'Table';
	readonly priority = 40;

	private readonly config: ResolvedTableConfig;
	private locale!: TableLocale;
	private selectionService: TableSelectionService | null = null;
	private cleanupMouseSelection: (() => void) | null = null;
	private cleanupClipboard: (() => void) | null = null;
	private context: PluginContext | null = null;
	private readonly controls: Set<TableControlsHandle> = new Set();

	constructor(config?: Partial<TableConfig>) {
		const sizing: TableSizingConfig = resolveTableSizingConfig(config ?? {});
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			...sizing,
			maxPickerRows: normalizePickerSize(config?.maxPickerRows, DEFAULT_CONFIG.maxPickerRows),
			maxPickerCols: normalizePickerSize(config?.maxPickerCols, DEFAULT_CONFIG.maxPickerCols),
			directResize: config?.directResize ?? true,
		};
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			TABLE_LOCALE_EN,
			loadTableLocale,
		);
		context.registerStyleSheet(TABLE_CSS);
		this.context = context;

		this.registerNodeSpecs(context);
		this.registerNodeViews(context);
		registerTableCommands(context, this.locale);
		context.registerCommand('resetTableBorderColor', () =>
			resetTableBorderColor(context, this.locale),
		);
		registerTableKeymaps(context, this.locale, this.config);
		this.registerToolbarItem(context);
		this.selectionService = createTableSelectionService(context);
		createTableSizingService(context, this.config);
	}

	onReady(): void {
		if (this.context && this.selectionService) {
			this.cleanupMouseSelection = installMouseSelection(this.context, this.selectionService);
			this.cleanupClipboard = installTableClipboard(this.context, this.selectionService);
		}
	}

	destroy(): void {
		if (this.context) closeTableContextMenus(this.context);
		this.cleanupMouseSelection?.();
		this.cleanupMouseSelection = null;
		this.cleanupClipboard?.();
		this.cleanupClipboard = null;
		this.selectionService = null;
		this.controls.clear();
		this.context = null;
	}

	onReadOnlyChange(readonly: boolean): void {
		for (const controls of this.controls) controls.setReadOnly(readonly);
		if (readonly && this.context) closeTableContextMenus(this.context);
	}

	decorations(state: EditorState): DecorationSet {
		if (!this.selectionService) return DecorationSetClass.empty;

		const range = this.selectionService.getSelectedRange();
		if (!range) return DecorationSetClass.empty;

		// Side effect: clear stale selection when cursor leaves the table.
		// Uses clearSelectionSilent() (no dispatch) to avoid re-entrancy,
		// since decorations() runs inside the update cycle.
		const sel = state.selection;
		if (!isTextSelection(sel) || !isInsideTable(state, sel.anchor.blockId)) {
			this.selectionService.clearSelectionSilent();
			return DecorationSetClass.empty;
		}

		const cellIds: readonly BlockId[] = this.selectionService.getSelectedCellIds();
		if (cellIds.length === 0) return DecorationSetClass.empty;

		const decorations: Decoration[] = [];
		for (const cellId of cellIds) {
			decorations.push(nodeDecoration(cellId, { class: 'notectl-table-cell--selected' }));
		}

		return DecorationSetClass.create(decorations);
	}

	private registerNodeSpecs(context: PluginContext): void {
		const config: ResolvedTableConfig = this.config;
		context.registerNodeSpec({
			type: 'table',
			attrs: {
				columnWidthsPx: { allowArray: true },
			},
			group: 'block',
			content: { allow: ['table_row'], min: 1 },
			isolating: true,
			selectable: true,
			normalizeAttrs: (node: BlockNode) => normalizeTableAttrs(node, this.config),
			normalizeNode: normalizeTableStructure,
			transformSelectionSlice: projectTableColumnWidthsForSlice,
			toDOM(node) {
				const wrapper: HTMLDivElement = document.createElement('div');
				wrapper.className = 'notectl-table-wrapper';
				wrapper.setAttribute('data-block-id', node.id);
				wrapper.setAttribute('part', 'table');
				return wrapper;
			},
			toHTML(node, content, ctx?: HTMLExportContext) {
				const borderColor: string | undefined = node.attrs?.borderColor as string | undefined;
				const grid = createTableGrid(node);
				const widths = readTableColumnWidthsPx(node, grid.columnCount);
				const style: string = buildTableStyle(borderColor, widths, config.minColumnWidthPx);
				const attr: string = ctx?.styleAttr(style) ?? ` style="${style}"`;
				const columns: string = widths
					.map((width) =>
						width === null
							? '<col>'
							: `<col${serializeTableDimensionAttrs(TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, 'width', width, ctx)}>`,
					)
					.join('');
				return `<table${attr}><colgroup>${columns}</colgroup><tbody>${content}</tbody></table>`;
			},
			sanitize: {
				tags: ['table', 'colgroup', 'col', 'thead', 'tbody', 'tfoot'],
				attrs: [TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE, 'width', 'span'],
			},
		});

		context.registerNodeSpec({
			type: 'table_row',
			group: 'table_content',
			content: { allow: ['table_cell'], min: 0 },
			normalizeAttrs: (node: BlockNode) => normalizeTableRowAttrs(node, this.config),
			toDOM(node) {
				const tr: HTMLTableRowElement = document.createElement('tr');
				tr.setAttribute('data-block-id', node.id);
				tr.setAttribute('role', 'row');
				tr.setAttribute('part', 'table-row');
				return tr;
			},
			toHTML(node, content, ctx?: HTMLExportContext) {
				const attrs: string = serializeTableDimensionAttrs(
					TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE,
					'height',
					node.attrs?.minHeightPx,
					ctx,
				);
				return `<tr${attrs}>${content}</tr>`;
			},
			sanitize: {
				tags: ['tr'],
				attrs: [TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE, 'height'],
			},
		});

		context.registerNodeSpec({
			type: 'table_cell',
			group: 'table_content',
			content: {
				allow: [
					'paragraph',
					'list_item',
					'heading',
					'blockquote',
					'image',
					'video',
					'horizontal_rule',
				],
				min: 1,
			},
			isolating: true,
			normalizeAttrs: normalizeTableCellAttrs,
			toDOM(node) {
				const td: HTMLTableCellElement = document.createElement('td');
				td.setAttribute('data-block-id', node.id);
				td.setAttribute('role', 'cell');
				td.setAttribute('part', 'table-cell');
				return td;
			},
			toHTML(node, content, ctx?: HTMLExportContext) {
				const colspan: number = (node.attrs?.colspan as number) ?? 1;
				const rowspan: number = (node.attrs?.rowspan as number) ?? 1;
				const styleAttr: string = ctx?.styleAttr(CELL_STYLE) ?? ` style="${CELL_STYLE}"`;
				const attrs: string[] = [styleAttr];
				if (colspan > 1) attrs.push(` colspan="${colspan}"`);
				if (rowspan > 1) attrs.push(` rowspan="${rowspan}"`);
				return `<td${attrs.join('')}>${content}</td>`;
			},
			sanitize: { tags: ['td', 'th'], attrs: ['colspan', 'rowspan'] },
		});
	}

	private registerNodeViews(context: PluginContext): void {
		const registry = context.getSchemaRegistry();

		context.registerNodeView(
			'table',
			createTableNodeViewFactory(registry, context, this.locale, this.config, {
				onControlsCreated: (controls: TableControlsHandle): void => {
					this.controls.add(controls);
				},
				onControlsDestroyed: (controls: TableControlsHandle): void => {
					this.controls.delete(controls);
				},
			}),
		);
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
			label: this.locale.insertTable,
			tooltip: this.locale.insertTable,
			command: 'insertTable',
			popupType: 'gridPicker',
			popupConfig: {
				maxRows,
				maxCols,
				onSelect: (rows: number, cols: number) => {
					insertTable(context, rows, cols);
				},
			},
			isActive: (state: EditorState) => {
				if (!isTextSelection(state.selection)) return false;
				return isInsideTable(state, state.selection.anchor.blockId);
			},
		});
	}
}

function normalizePickerSize(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0
		? Math.min(value, 100)
		: fallback;
}

function normalizeTableAttrs(node: BlockNode, config: TableSizingConfig): BlockAttrs | undefined {
	const attrs: MutableBlockAttrs = copyUnrelatedAttrs(node.attrs, [
		'borderColor',
		'columnWidthsPx',
	]);
	const borderColor: unknown = node.attrs?.borderColor;
	if (borderColor === 'none' || (typeof borderColor === 'string' && isValidHexColor(borderColor))) {
		attrs.borderColor = borderColor;
	}

	const grid = createTableGrid(node);
	const rawWidths: unknown = node.attrs?.columnWidthsPx;
	if (Array.isArray(rawWidths) && grid.columnCount > 0) {
		const widths: (number | null)[] = Array.from(
			{ length: grid.columnCount },
			(_unused, column): number | null => {
				const parsed: number | undefined = normalizeSerializedTableDimensionPx(rawWidths[column]);
				if (parsed === undefined) return null;
				return Math.min(config.maxColumnWidthPx, Math.max(config.minColumnWidthPx, parsed));
			},
		);
		if (widths.some((width) => width !== null)) {
			attrs.columnWidthsPx = Object.freeze(widths);
		}
	}
	return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function normalizeTableRowAttrs(
	node: BlockNode,
	config: TableSizingConfig,
): BlockAttrs | undefined {
	const attrs: MutableBlockAttrs = copyUnrelatedAttrs(node.attrs, ['minHeightPx']);
	const parsed: number | undefined = normalizeSerializedTableDimensionPx(node.attrs?.minHeightPx);
	if (parsed !== undefined) {
		attrs.minHeightPx = Math.min(config.maxRowHeightPx, Math.max(config.minRowHeightPx, parsed));
	}
	return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function normalizeTableCellAttrs(node: BlockNode): BlockAttrs | undefined {
	const attrs: MutableBlockAttrs = copyUnrelatedAttrs(node.attrs, ['colspan', 'rowspan']);
	const colspan: number = normalizeTableSpan(node.attrs?.colspan);
	const rowspan: number = normalizeTableSpan(node.attrs?.rowspan);
	if (colspan > 1) attrs.colspan = colspan;
	if (rowspan > 1) attrs.rowspan = rowspan;
	return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/** Clamps row spans to the rows that actually exist, preventing latent spans after insertions. */
function normalizeTableStructure(table: BlockNode): BlockNode {
	const rows: readonly BlockNode[] = getBlockChildren(table);
	let changed = false;
	const normalizedRows: readonly BlockNode[] = rows.map((row: BlockNode, rowIndex: number) => {
		let rowChanged = false;
		const cells: readonly BlockNode[] = getBlockChildren(row).map((cell: BlockNode) => {
			const requested: number = normalizeTableSpan(cell.attrs?.rowspan);
			const effective: number = Math.min(requested, rows.length - rowIndex);
			if (effective === requested) return cell;
			rowChanged = true;
			const { rowspan: _rowspan, ...rest } = cell.attrs ?? {};
			const attrs: MutableBlockAttrs = {
				...rest,
				...(effective > 1 ? { rowspan: effective } : {}),
			};
			const { attrs: _attrs, ...withoutAttrs } = cell;
			return Object.keys(attrs).length > 0 ? { ...withoutAttrs, attrs } : withoutAttrs;
		});
		if (!rowChanged) return row;
		changed = true;
		return { ...row, children: cells };
	});
	return changed ? { ...table, children: normalizedRows } : table;
}

function copyUnrelatedAttrs(
	attrs: BlockAttrs | undefined,
	excluded: readonly string[],
): MutableBlockAttrs {
	const result: MutableBlockAttrs = {};
	for (const [key, value] of Object.entries(attrs ?? {})) {
		if (excluded.includes(key)) continue;
		const normalized: BlockAttrValue | undefined = cloneBlockAttrValue(value);
		if (normalized !== undefined) result[key] = normalized;
	}
	return result;
}

function cloneBlockAttrValue(value: unknown): BlockAttrValue | undefined {
	if (typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (!Array.isArray(value)) return undefined;
	const normalized: (string | number | boolean | null)[] = [];
	for (const entry of value) {
		if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') {
			normalized.push(entry);
		} else if (typeof entry === 'number' && Number.isFinite(entry)) {
			normalized.push(entry);
		} else {
			return undefined;
		}
	}
	return Object.freeze(normalized);
}

type MutableBlockAttrs = Record<string, BlockAttrValue>;
