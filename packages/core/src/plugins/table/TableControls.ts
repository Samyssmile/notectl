/**
 * Interactive table controls orchestrator.
 * Wires DOM elements (from TableControlsDOM) with layout logic (from TableControlsLayout)
 * and shared transaction builders (from TableCommands) to produce the interactive overlay.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockChildren } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import {
	removeStyleProperty,
	setStyleProperties,
	setStyleProperty,
} from '../../style/StyleRuntime.js';
import type { PluginContext } from '../Plugin.js';
import { getTableBorderColor, renderBorderColorPicker } from './TableBorderColor.js';
import {
	buildDeleteColumnTransaction,
	buildDeleteRowTransaction,
	buildInsertColumnTransaction,
	buildInsertRowTransaction,
	createDeleteTableTransaction,
} from './TableCommands.js';
import { type TableContextMenuHandle, createTableContextMenu } from './TableContextMenu.js';
import {
	TABLE_DELETE_SVG,
	buildActionsButton,
	buildAddButton,
	buildBorderColorButton,
	buildContextHint,
	buildHandle,
	buildHandleBar,
	buildInsertLine,
	buildResizeIndicator,
	buildResizeSeparator,
	createButton,
	updateBorderColorSwatch,
} from './TableControlsDOM.js';
import {
	BORDER_THRESHOLD,
	type BorderInfo,
	findNearestBorder,
	getTableOffset,
	measureColBorders,
	measureColumnBoxes,
	measureRowBorders,
	positionAddButtons,
	positionColHandles,
	positionRowHandles,
} from './TableControlsLayout.js';
import { createTableGrid } from './TableGrid.js';
import { TABLE_LOCALE_EN, type TableLocale } from './TableLocale.js';
import { type TableSelectionService, TableSelectionServiceKey } from './TableSelection.js';
import {
	DEFAULT_TABLE_SIZING_CONFIG,
	type TableSizingConfig,
	type TableSizingService,
	TableSizingServiceKey,
	readTableColumnWidthsPx,
	readTableRowMinHeightPx,
	resolveTableSizingConfig,
} from './TableSizing.js';

// --- Types ---

export interface TableControlsHandle {
	update(node: BlockNode): void;
	setReadOnly(readonly: boolean): void;
	destroy(): void;
}

export interface TableControlsConfig extends TableSizingConfig {
	readonly directResize: boolean;
}

const DEFAULT_CONTROLS_CONFIG: TableControlsConfig = {
	...DEFAULT_TABLE_SIZING_CONFIG,
	directResize: true,
};

interface ResizeSession {
	readonly kind: 'column' | 'row';
	readonly index: number;
	readonly pointerId: number;
	readonly startCoordinate: number;
	readonly startSize: number;
	currentSize: number;
}

// --- Class ---

class TableControls implements TableControlsHandle {
	private tableId: BlockId;
	private numRows: number;
	private numCols: number;
	private currentNode: BlockNode;
	private readOnly = false;
	private activeRowIndex = -1;
	private activeColIndex = -1;
	private resizeSession: ResizeSession | null = null;

	private readonly colBar: HTMLDivElement;
	private readonly rowBar: HTMLDivElement;
	private readonly colResizeBar: HTMLDivElement;
	private readonly rowResizeBar: HTMLDivElement;
	private readonly resizeIndicator: HTMLDivElement;
	private readonly insertLineH: HTMLDivElement;
	private readonly insertLineV: HTMLDivElement;
	private readonly addRowZone: HTMLButtonElement;
	private readonly addColZone: HTMLButtonElement;
	private readonly deleteTableBtn: HTMLButtonElement;
	private readonly borderColorBtn: HTMLButtonElement | null;
	private readonly actionsBtn: HTMLButtonElement | null;
	private readonly contextHint: HTMLDivElement;
	private readonly observer: ResizeObserver;
	private readonly wrapperEl: HTMLElement | null;
	private borderColorPopup: HTMLDivElement | null = null;
	private activeContextMenu: TableContextMenuHandle | null = null;

	private readonly container: HTMLElement;
	private readonly tableEl: HTMLTableElement;
	private readonly getState: () => EditorState;
	private readonly dispatchFn: (tr: Transaction) => void;
	private readonly pluginContext: PluginContext | null;
	private readonly locale: TableLocale;
	private readonly config: TableControlsConfig;
	private readonly onWrapperScroll = (): void => this.positionControls();
	private readonly onPointerMove = (event: PointerEvent): void => this.moveResize(event);
	private readonly onPointerUp = (event: PointerEvent): void => this.finishResize(event);
	private readonly onPointerCancel = (event: PointerEvent): void => this.cancelResize(event);
	private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape' || !this.resizeSession) return;
		event.preventDefault();
		event.stopPropagation();
		this.cancelActiveResize();
	};

	private readonly onMouseMove = (e: MouseEvent): void => {
		if (this.readOnly || this.resizeSession) return;
		const tableRect: DOMRect = this.tableEl.getBoundingClientRect();
		const x: number = e.clientX - tableRect.left;
		const y: number = e.clientY - tableRect.top;

		const inTable: boolean =
			x >= -BORDER_THRESHOLD &&
			x <= tableRect.width + BORDER_THRESHOLD &&
			y >= -BORDER_THRESHOLD &&
			y <= tableRect.height + BORDER_THRESHOLD;

		if (!inTable) {
			this.hideInsertLines();
			return;
		}

		const rowBorders: BorderInfo[] = measureRowBorders(this.tableEl);
		const colBorders: BorderInfo[] = measureColBorders(this.tableEl, this.numCols);
		const result = findNearestBorder(x, y, rowBorders, colBorders);

		if (result.type === 'row' && result.border) {
			this.showHorizontalLine(result.border);
			this.hideVerticalLine();
		} else if (result.type === 'col' && result.border) {
			this.showVerticalLine(result.border);
			this.hideHorizontalLine();
		} else {
			this.hideInsertLines();
		}
	};

	private readonly onMouseLeave = (): void => {
		this.hideInsertLines();
	};

	constructor(
		container: HTMLElement,
		tableEl: HTMLTableElement,
		initialNode: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
		pluginContext?: PluginContext,
		locale: TableLocale = TABLE_LOCALE_EN,
		config: Partial<TableControlsConfig> = DEFAULT_CONTROLS_CONFIG,
	) {
		this.container = container;
		this.tableEl = tableEl;
		this.getState = getState;
		this.dispatchFn = dispatch;
		this.pluginContext = pluginContext ?? null;
		this.locale = locale;
		this.config = {
			...resolveTableSizingConfig(config),
			directResize: config.directResize ?? true,
		};
		this.wrapperEl = tableEl.closest('.notectl-table-wrapper');

		this.tableId = initialNode.id;
		this.currentNode = initialNode;
		this.numRows = createTableGrid(initialNode).rowCount;
		this.numCols = this.countCols(initialNode);

		// Create DOM elements
		this.colBar = buildHandleBar('ntbl-col-bar');
		this.rowBar = buildHandleBar('ntbl-row-bar');
		this.colResizeBar = buildHandleBar('ntbl-col-resize-bar');
		this.rowResizeBar = buildHandleBar('ntbl-row-resize-bar');
		this.resizeIndicator = buildResizeIndicator();
		this.insertLineH = buildInsertLine('horizontal', locale.insertRow);
		this.insertLineV = buildInsertLine('vertical', locale.insertColumn);
		this.addRowZone = buildAddButton('ntbl-add-row', locale.addRow);
		this.addColZone = buildAddButton('ntbl-add-col', locale.addColumn);
		this.deleteTableBtn = createButton(
			'ntbl-delete-table-btn',
			TABLE_DELETE_SVG,
			locale.deleteTable,
		);
		this.deleteTableBtn.setAttribute('data-notectl-no-print', '');

		// Border color button and actions button (only when plugin context available)
		if (pluginContext) {
			const currentColor: string | undefined = getTableBorderColor(getState(), this.tableId);
			this.borderColorBtn = buildBorderColorButton(locale.borderColor, currentColor);
			this.actionsBtn = buildActionsButton(locale.tableActionsHint);
		} else {
			this.borderColorBtn = null;
			this.actionsBtn = null;
		}

		container.append(
			this.colBar,
			this.rowBar,
			this.insertLineH,
			this.insertLineV,
			this.addRowZone,
			this.addColZone,
			this.deleteTableBtn,
		);
		if (this.config.directResize) {
			container.append(this.colResizeBar, this.rowResizeBar, this.resizeIndicator);
		}
		if (this.borderColorBtn) {
			container.appendChild(this.borderColorBtn);
		}
		if (this.actionsBtn) {
			container.appendChild(this.actionsBtn);
		}

		this.contextHint = buildContextHint(locale.contextMenuHint);
		container.appendChild(this.contextHint);

		this.rebuildColHandles();
		this.rebuildRowHandles();
		this.rebuildResizeSeparators();
		this.bindEventListeners();
		this.setReadOnly(pluginContext?.isReadOnly?.() ?? false);

		this.observer = new ResizeObserver(() => {
			this.positionControls();
		});
		this.observer.observe(tableEl);
		if (this.wrapperEl) {
			this.observer.observe(this.wrapperEl);
			this.wrapperEl.addEventListener('scroll', this.onWrapperScroll, { passive: true });
		}
		requestAnimationFrame(() => this.positionControls());
	}

	update(node: BlockNode): void {
		this.tableId = node.id;
		this.currentNode = node;
		const newRows: number = createTableGrid(node).rowCount;
		const newCols: number = this.countCols(node);

		if (newRows !== this.numRows || newCols !== this.numCols) {
			this.numRows = newRows;
			this.numCols = newCols;
			this.rebuildColHandles();
			this.rebuildRowHandles();
			this.rebuildResizeSeparators();
		}
		this.updateHandleSelectionState();

		// Update border color swatch
		if (this.borderColorBtn) {
			const swatch = this.borderColorBtn.querySelector('.ntbl-border-color-swatch');
			if (swatch) {
				const color: string | undefined = node.attrs?.borderColor as string | undefined;
				updateBorderColorSwatch(swatch as HTMLElement, color);
			}
		}

		requestAnimationFrame(() => this.positionControls());
	}

	setReadOnly(readonly: boolean): void {
		this.readOnly = readonly;
		this.container.toggleAttribute('data-notectl-table-readonly', readonly);
		const roots: readonly HTMLElement[] = [
			this.colBar,
			this.rowBar,
			this.colResizeBar,
			this.rowResizeBar,
			this.addRowZone,
			this.addColZone,
			this.deleteTableBtn,
			this.insertLineH,
			this.insertLineV,
			...(this.borderColorBtn ? [this.borderColorBtn] : []),
			...(this.actionsBtn ? [this.actionsBtn] : []),
		];
		for (const root of roots) {
			if (root instanceof HTMLButtonElement) root.disabled = readonly;
			for (const button of root.querySelectorAll('button')) button.disabled = readonly;
		}
		if (readonly) {
			this.hideInsertLines();
			this.cancelActiveResize();
			this.activeContextMenu?.close();
			this.activeContextMenu = null;
			this.closeBorderColorPopup();
		}
	}

	destroy(): void {
		this.cancelActiveResize();
		this.activeContextMenu?.destroy();
		this.closeBorderColorPopup();
		this.observer.disconnect();
		this.wrapperEl?.removeEventListener('scroll', this.onWrapperScroll);
		this.container.removeEventListener('mousemove', this.onMouseMove);
		this.container.removeEventListener('mouseleave', this.onMouseLeave);
		this.colBar.remove();
		this.rowBar.remove();
		this.colResizeBar.remove();
		this.rowResizeBar.remove();
		this.resizeIndicator.remove();
		this.insertLineH.remove();
		this.insertLineV.remove();
		this.addRowZone.remove();
		this.addColZone.remove();
		this.deleteTableBtn.remove();
		this.borderColorBtn?.remove();
		this.actionsBtn?.remove();
		this.contextHint.remove();
	}

	private bindEventListeners(): void {
		const insertBtnH = this.insertLineH.querySelector('.ntbl-insert-btn') as HTMLButtonElement;
		const insertBtnV = this.insertLineV.querySelector('.ntbl-insert-btn') as HTMLButtonElement;

		insertBtnH.addEventListener('click', () => {
			if (this.activeRowIndex >= 0) {
				this.dispatchTransaction(
					buildInsertRowTransaction(this.getState(), this.tableId, this.activeRowIndex),
				);
			}
		});

		insertBtnV.addEventListener('click', () => {
			if (this.activeColIndex >= 0) {
				this.dispatchTransaction(
					buildInsertColumnTransaction(this.getState(), this.tableId, this.activeColIndex),
				);
			}
		});

		this.addRowZone.addEventListener('click', () => {
			this.dispatchTransaction(
				buildInsertRowTransaction(this.getState(), this.tableId, this.numRows),
			);
		});

		this.addColZone.addEventListener('click', () => {
			this.dispatchTransaction(
				buildInsertColumnTransaction(this.getState(), this.tableId, this.numCols),
			);
		});

		this.deleteTableBtn.addEventListener('click', () => {
			this.dispatchTransaction(createDeleteTableTransaction(this.getState(), this.tableId));
		});

		if (this.borderColorBtn && this.pluginContext) {
			const ctx = this.pluginContext;
			this.borderColorBtn.addEventListener('click', () => {
				this.toggleBorderColorPopup(ctx);
			});
		}

		if (this.actionsBtn && this.pluginContext) {
			const ctx = this.pluginContext;
			this.actionsBtn.addEventListener('click', () => {
				this.openActionsMenu(ctx);
			});
		}

		this.container.addEventListener('mousemove', this.onMouseMove);
		this.container.addEventListener('mouseleave', this.onMouseLeave);
	}

	private openActionsMenu(context: PluginContext): void {
		if (this.readOnly || context.isReadOnly?.()) return;
		if (this.activeContextMenu?.isOpen()) {
			this.activeContextMenu.close();
			this.activeContextMenu = null;
			return;
		}

		if (!this.actionsBtn) return;

		const rect: DOMRect = this.actionsBtn.getBoundingClientRect();

		this.activeContextMenu = createTableContextMenu(
			this.container,
			context,
			this.tableId,
			rect,
			() => {
				this.activeContextMenu = null;
			},
			this.locale,
			undefined,
			{
				sizingConfig: this.config,
				restoreFocusTo: this.actionsBtn,
			},
		);
	}

	private toggleBorderColorPopup(context: PluginContext): void {
		if (this.readOnly || context.isReadOnly?.()) return;
		if (this.borderColorPopup) {
			this.closeBorderColorPopup();
			return;
		}

		this.borderColorPopup = document.createElement('div');
		this.borderColorPopup.className = 'notectl-table-context-menu';
		setStyleProperties(this.borderColorPopup, {
			position: 'absolute',
			top: '24px',
			left: '24px',
			zIndex: '10000',
		});
		this.borderColorPopup.setAttribute('contenteditable', 'false');

		renderBorderColorPicker(
			this.borderColorPopup,
			context,
			this.tableId,
			() => {
				this.closeBorderColorPopup();
			},
			this.locale,
		);

		this.container.appendChild(this.borderColorPopup);
	}

	private closeBorderColorPopup(): void {
		if (this.borderColorPopup) {
			this.borderColorPopup.remove();
			this.borderColorPopup = null;
		}
	}

	private dispatchTransaction(tr: Transaction | null): void {
		if (tr && !this.readOnly && !this.pluginContext?.isReadOnly?.()) this.dispatchFn(tr);
	}

	private countCols(node: BlockNode): number {
		return createTableGrid(node).columnCount;
	}

	private positionControls(): void {
		const offset = getTableOffset(this.tableEl, this.container);
		const tableRect: DOMRect = this.tableEl.getBoundingClientRect();
		setStyleProperties(this.colBar, {
			left: `${String(offset.left)}px`,
			top: `${String(offset.top - 24)}px`,
		});
		setStyleProperty(this.rowBar, 'top', `${String(offset.top)}px`);
		positionColHandles(this.colBar, this.tableEl, this.numCols);
		positionRowHandles(this.rowBar, this.tableEl);
		positionAddButtons(this.addRowZone, this.addColZone, this.tableEl, this.container);
		if (this.config.directResize) {
			this.positionResizeSeparators(offset, tableRect);
		}
	}

	private positionResizeSeparators(
		offset: { readonly top: number; readonly left: number },
		tableRect: DOMRect,
	): void {
		setStyleProperties(this.colResizeBar, {
			left: `${String(offset.left)}px`,
			top: `${String(offset.top)}px`,
			width: `${String(tableRect.width)}px`,
			height: `${String(tableRect.height)}px`,
		});
		setStyleProperties(this.rowResizeBar, {
			left: `${String(offset.left)}px`,
			top: `${String(offset.top)}px`,
			width: `${String(tableRect.width)}px`,
			height: `${String(tableRect.height)}px`,
		});

		const rtl: boolean = getComputedStyle(this.tableEl).direction === 'rtl';
		const boxes = measureColumnBoxes(this.tableEl, this.numCols);
		for (let index = 0; index < this.colResizeBar.children.length; index++) {
			const separator = this.colResizeBar.children[index] as HTMLButtonElement;
			const box = boxes[index];
			if (!box) continue;
			const boundary: number = rtl ? box.position : box.position + box.width;
			setStyleProperties(separator, {
				left: `${String(boundary)}px`,
				top: '0px',
				height: `${String(tableRect.height)}px`,
			});
			this.updateSeparatorValue(separator, 'column', index, box.width);
		}

		const rows: readonly HTMLTableRowElement[] = Array.from(
			this.tableEl.querySelectorAll(':scope > tbody > tr'),
		);
		for (let index = 0; index < this.rowResizeBar.children.length; index++) {
			const separator = this.rowResizeBar.children[index] as HTMLButtonElement;
			const row: HTMLTableRowElement | undefined = rows[index];
			if (!row) continue;
			const rect: DOMRect = row.getBoundingClientRect();
			const boundary: number = rect.bottom - tableRect.top;
			setStyleProperties(separator, {
				left: '0px',
				top: `${String(boundary)}px`,
				width: `${String(tableRect.width)}px`,
			});
			this.updateSeparatorValue(separator, 'row', index, rect.height || row.offsetHeight);
		}
	}

	private updateSeparatorValue(
		separator: HTMLButtonElement,
		kind: 'column' | 'row',
		index: number,
		value: number,
	): void {
		const minimum: number =
			kind === 'column' ? this.config.minColumnWidthPx : this.config.minRowHeightPx;
		const maximum: number =
			kind === 'column' ? this.config.maxColumnWidthPx : this.config.maxRowHeightPx;
		const rounded: number = Math.round(value);
		separator.setAttribute('aria-valuemin', String(minimum));
		separator.setAttribute('aria-valuemax', String(maximum));
		separator.setAttribute('aria-valuenow', String(rounded));
		separator.setAttribute('aria-valuetext', `${String(rounded)} px`);
		separator.dataset.index = String(index);
	}

	private startResize(event: PointerEvent, kind: 'column' | 'row', index: number): void {
		if (
			this.readOnly ||
			this.pluginContext?.isReadOnly?.() ||
			(event.button !== 0 && event.pointerType !== 'touch')
		) {
			return;
		}
		const size: number | null = this.getRenderedDimension(kind, index);
		if (size === null) return;
		event.preventDefault();
		event.stopPropagation();
		this.cancelActiveResize();
		this.resizeSession = {
			kind,
			index,
			pointerId: event.pointerId,
			startCoordinate: kind === 'column' ? event.clientX : event.clientY,
			startSize: size,
			currentSize: size,
		};
		(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
		document.addEventListener('pointermove', this.onPointerMove);
		document.addEventListener('pointerup', this.onPointerUp);
		document.addEventListener('pointercancel', this.onPointerCancel);
		document.addEventListener('keydown', this.onDocumentKeyDown, true);
		this.container.classList.add(`ntbl-container--resizing-${kind}`);
		this.updateResizeIndicator(size, event.clientX, event.clientY);
	}

	private moveResize(event: PointerEvent): void {
		const session: ResizeSession | null = this.resizeSession;
		if (!session || session.pointerId !== event.pointerId) return;
		event.preventDefault();
		const coordinate: number = session.kind === 'column' ? event.clientX : event.clientY;
		let delta: number = coordinate - session.startCoordinate;
		if (session.kind === 'column' && getComputedStyle(this.tableEl).direction === 'rtl') {
			delta *= -1;
		}
		const next: number = this.clampDimension(session.kind, session.startSize + delta);
		session.currentSize = next;
		this.applyResizePreview(session.kind, session.index, next);
		this.updateResizeIndicator(next, event.clientX, event.clientY);
		this.positionControls();
	}

	private finishResize(event: PointerEvent): void {
		const session: ResizeSession | null = this.resizeSession;
		if (!session || session.pointerId !== event.pointerId) return;
		(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
		this.resizeSession = null;
		this.detachResizeListeners();
		this.hideResizeIndicator();
		const value: number = Math.round(session.currentSize);
		const service: TableSizingService | undefined = this.getSizingService();
		const changed: boolean =
			session.kind === 'column'
				? (service?.setSize(
						{ kind: 'column', tableId: this.tableId, column: session.index },
						{ columnWidthPx: value },
					) ?? false)
				: (service?.setSize(
						{ kind: 'row', tableId: this.tableId, row: session.index },
						{ rowMinHeightPx: value },
					) ?? false);
		if (!changed) this.restoreCanonicalDimensions();
		else if (session.kind === 'column') {
			this.pluginContext?.announce(this.locale.announceColumnWidthSet(session.index, value));
		} else {
			this.pluginContext?.announce(this.locale.announceRowMinimumHeightSet(session.index, value));
		}
	}

	private cancelResize(event: PointerEvent): void {
		if (this.resizeSession?.pointerId !== event.pointerId) return;
		this.cancelActiveResize();
	}

	private cancelActiveResize(): void {
		if (!this.resizeSession) return;
		this.resizeSession = null;
		this.detachResizeListeners();
		this.hideResizeIndicator();
		this.restoreCanonicalDimensions();
		this.positionControls();
	}

	private detachResizeListeners(): void {
		document.removeEventListener('pointermove', this.onPointerMove);
		document.removeEventListener('pointerup', this.onPointerUp);
		document.removeEventListener('pointercancel', this.onPointerCancel);
		document.removeEventListener('keydown', this.onDocumentKeyDown, true);
		this.container.classList.remove('ntbl-container--resizing-column');
		this.container.classList.remove('ntbl-container--resizing-row');
	}

	private getRenderedDimension(kind: 'column' | 'row', index: number): number | null {
		if (kind === 'column')
			return measureColumnBoxes(this.tableEl, this.numCols)[index]?.width ?? null;
		const row: HTMLTableRowElement | undefined = Array.from(
			this.tableEl.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'),
		)[index];
		if (!row) return null;
		const rect: DOMRect = row.getBoundingClientRect();
		return rect.height || row.offsetHeight || null;
	}

	private clampDimension(kind: 'column' | 'row', value: number): number {
		const minimum: number =
			kind === 'column' ? this.config.minColumnWidthPx : this.config.minRowHeightPx;
		const maximum: number =
			kind === 'column' ? this.config.maxColumnWidthPx : this.config.maxRowHeightPx;
		return Math.min(maximum, Math.max(minimum, value));
	}

	private applyResizePreview(kind: 'column' | 'row', index: number, value: number): void {
		if (kind === 'column') {
			const column = this.tableEl.querySelectorAll(':scope > colgroup > col')[index] as
				| HTMLTableColElement
				| undefined;
			if (!column) return;
			// A temporary presentation attribute drives native table layout during
			// pointer movement. Removing the persisted runtime width avoids a stale
			// CSS declaration winning the cascade; no document transaction occurs.
			removeStyleProperty(column, 'width');
			column.setAttribute('width', String(value));
			const widths: readonly (number | null)[] = readTableColumnWidthsPx(
				this.currentNode,
				this.numCols,
			);
			const minimumTableWidth: number = widths.reduce<number>(
				(total: number, width: number | null, columnIndex: number): number =>
					total + (columnIndex === index ? value : (width ?? this.config.minColumnWidthPx)),
				0,
			);
			setStyleProperty(this.tableEl, 'minWidth', `${String(minimumTableWidth)}px`);
			if (
				widths.length >= this.numCols &&
				widths.every(
					(width: number | null, columnIndex: number): boolean =>
						columnIndex === index || width !== null,
				)
			) {
				setStyleProperty(this.tableEl, 'width', `${String(minimumTableWidth)}px`);
			} else {
				removeStyleProperty(this.tableEl, 'width');
			}
			return;
		}
		const row = this.tableEl.querySelectorAll(':scope > tbody > tr')[index] as
			| HTMLTableRowElement
			| undefined;
		if (!row) return;
		removeStyleProperty(row, 'height');
		row.setAttribute('height', String(value));
	}

	private restoreCanonicalDimensions(): void {
		const widths: readonly (number | null)[] = readTableColumnWidthsPx(
			this.currentNode,
			this.numCols,
		);
		const columns: readonly HTMLTableColElement[] = Array.from(
			this.tableEl.querySelectorAll(':scope > colgroup > col'),
		);
		let minimumTableWidth = 0;
		for (let index = 0; index < columns.length; index++) {
			const column: HTMLTableColElement | undefined = columns[index];
			if (!column) continue;
			const width: number | null = widths[index] ?? null;
			column.removeAttribute('width');
			if (width === null) {
				removeStyleProperty(column, 'width');
				column.removeAttribute('data-notectl-width-px');
			} else {
				setStyleProperty(column, 'width', `${String(width)}px`);
				column.setAttribute('data-notectl-width-px', String(width));
			}
			minimumTableWidth += width ?? this.config.minColumnWidthPx;
		}
		setStyleProperty(this.tableEl, 'minWidth', `${String(minimumTableWidth)}px`);
		if (widths.length >= this.numCols && widths.every((width) => width !== null)) {
			setStyleProperty(this.tableEl, 'width', `${String(minimumTableWidth)}px`);
		} else {
			removeStyleProperty(this.tableEl, 'width');
		}

		const rowNodes: readonly BlockNode[] = getBlockChildren(this.currentNode);
		const rows: readonly HTMLTableRowElement[] = Array.from(
			this.tableEl.querySelectorAll(':scope > tbody > tr'),
		);
		for (let index = 0; index < rows.length; index++) {
			const row: HTMLTableRowElement | undefined = rows[index];
			const rowNode: BlockNode | undefined = rowNodes[index];
			if (!row || !rowNode) continue;
			row.removeAttribute('height');
			const height: number | null = readTableRowMinHeightPx(rowNode);
			if (height === null) {
				removeStyleProperty(row, 'height');
				row.removeAttribute('data-notectl-min-height-px');
			} else {
				setStyleProperty(row, 'height', `${String(height)}px`);
				row.setAttribute('data-notectl-min-height-px', String(height));
			}
		}
	}

	private updateResizeIndicator(value: number, clientX: number, clientY: number): void {
		const containerRect: DOMRect = this.container.getBoundingClientRect();
		this.resizeIndicator.textContent = `${String(Math.round(value))} px`;
		setStyleProperties(this.resizeIndicator, {
			left: `${String(clientX - containerRect.left + this.container.scrollLeft + 12)}px`,
			top: `${String(clientY - containerRect.top + this.container.scrollTop + 12)}px`,
		});
		this.resizeIndicator.classList.add('ntbl-resize-indicator--visible');
	}

	private hideResizeIndicator(): void {
		this.resizeIndicator.classList.remove('ntbl-resize-indicator--visible');
	}

	private showHorizontalLine(border: BorderInfo): void {
		this.activeRowIndex = border.index;
		const offset = getTableOffset(this.tableEl, this.container);
		setStyleProperties(this.insertLineH, {
			top: `${offset.top + border.position - 1}px`,
			left: `${offset.left}px`,
			width: `${this.tableEl.offsetWidth}px`,
		});
		this.insertLineH.classList.add('ntbl-insert-line--visible');
	}

	private showVerticalLine(border: BorderInfo): void {
		this.activeColIndex = border.index;
		const offset = getTableOffset(this.tableEl, this.container);
		setStyleProperties(this.insertLineV, {
			left: `${offset.left + border.position - 1}px`,
			top: `${offset.top}px`,
			height: `${this.tableEl.offsetHeight}px`,
		});
		this.insertLineV.classList.add('ntbl-insert-line--visible');
	}

	private hideInsertLines(): void {
		this.hideHorizontalLine();
		this.hideVerticalLine();
	}

	private hideHorizontalLine(): void {
		this.insertLineH.classList.remove('ntbl-insert-line--visible');
		this.activeRowIndex = -1;
	}

	private hideVerticalLine(): void {
		this.insertLineV.classList.remove('ntbl-insert-line--visible');
		this.activeColIndex = -1;
	}

	private rebuildColHandles(): void {
		this.colBar.innerHTML = '';
		for (let i = 0; i < this.numCols; i++) {
			const handle: HTMLDivElement = buildHandle(
				'ntbl-col-handle',
				i,
				this.locale.deleteColumn,
				(idx: number) => {
					this.dispatchTransaction(
						buildDeleteColumnTransaction(this.getState(), this.tableId, idx),
					);
				},
				{
					label: this.locale.selectColumnLabel(i),
					onSelect: (idx: number) => this.selectColumn(idx),
				},
			);
			this.colBar.appendChild(handle);
		}
	}

	private rebuildRowHandles(): void {
		this.rowBar.innerHTML = '';
		for (let i = 0; i < this.numRows; i++) {
			const handle: HTMLDivElement = buildHandle(
				'ntbl-row-handle',
				i,
				this.locale.deleteRow,
				(idx: number) => {
					this.dispatchTransaction(buildDeleteRowTransaction(this.getState(), this.tableId, idx));
				},
				{
					label: this.locale.selectRowLabel(i),
					onSelect: (idx: number) => this.selectRow(idx),
				},
			);
			this.rowBar.appendChild(handle);
		}
	}

	private rebuildResizeSeparators(): void {
		this.colResizeBar.innerHTML = '';
		this.rowResizeBar.innerHTML = '';
		if (!this.config.directResize) return;
		const keyboardHint: string = this.locale.resizeKeyboardHint(
			this.config.keyboardResizeStepPx,
			this.config.keyboardResizeLargeStepPx,
		);
		for (let index = 0; index < this.numCols; index++) {
			const separator: HTMLButtonElement = buildResizeSeparator(
				'column',
				index,
				this.locale.resizeColumnSeparatorLabel(index),
				keyboardHint,
			);
			separator.addEventListener('pointerdown', (event: PointerEvent) =>
				this.startResize(event, 'column', index),
			);
			separator.addEventListener('keydown', (event: KeyboardEvent) =>
				this.resizeFromKeyboard(event, 'column', index),
			);
			this.colResizeBar.appendChild(separator);
		}
		for (let index = 0; index < this.numRows; index++) {
			const separator: HTMLButtonElement = buildResizeSeparator(
				'row',
				index,
				this.locale.resizeRowSeparatorLabel(index),
				keyboardHint,
			);
			separator.addEventListener('pointerdown', (event: PointerEvent) =>
				this.startResize(event, 'row', index),
			);
			separator.addEventListener('keydown', (event: KeyboardEvent) =>
				this.resizeFromKeyboard(event, 'row', index),
			);
			this.rowResizeBar.appendChild(separator);
		}
		this.setReadOnly(this.readOnly);
	}

	private resizeFromKeyboard(event: KeyboardEvent, kind: 'column' | 'row', index: number): void {
		if (this.readOnly || this.pluginContext?.isReadOnly?.()) return;
		const service: TableSizingService | undefined = this.getSizingService();
		if (!service) return;
		const separator: HTMLButtonElement = event.currentTarget as HTMLButtonElement;

		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			event.stopPropagation();
			const target =
				kind === 'column'
					? ({ kind: 'column', tableId: this.tableId, column: index } as const)
					: ({ kind: 'row', tableId: this.tableId, row: index } as const);
			const dimension = kind === 'column' ? 'columnWidthPx' : 'rowMinHeightPx';
			if (service.resetSize(target, dimension)) {
				this.restoreKeyboardResizeFocus(separator);
				this.pluginContext?.announce(
					kind === 'column'
						? this.locale.announceColumnWidthReset(index)
						: this.locale.announceRowMinimumHeightReset(index),
				);
			}
			return;
		}

		const decrementKey: string = kind === 'column' ? 'ArrowLeft' : 'ArrowUp';
		const incrementKey: string = kind === 'column' ? 'ArrowRight' : 'ArrowDown';
		if (event.key !== decrementKey && event.key !== incrementKey) return;
		event.preventDefault();
		event.stopPropagation();
		const current: number | null = this.getRenderedDimension(kind, index);
		if (current === null) return;
		const step: number = event.shiftKey
			? this.config.keyboardResizeLargeStepPx
			: this.config.keyboardResizeStepPx;
		let direction: 1 | -1 = event.key === incrementKey ? 1 : -1;
		if (kind === 'column' && getComputedStyle(this.tableEl).direction === 'rtl') {
			direction = direction === 1 ? -1 : 1;
		}
		const value: number = Math.round(this.clampDimension(kind, current + step * direction));
		const changed: boolean =
			kind === 'column'
				? service.setSize(
						{ kind: 'column', tableId: this.tableId, column: index },
						{ columnWidthPx: value },
					)
				: service.setSize(
						{ kind: 'row', tableId: this.tableId, row: index },
						{ rowMinHeightPx: value },
					);
		if (!changed) return;
		this.restoreKeyboardResizeFocus(separator);
		this.pluginContext?.announce(
			kind === 'column'
				? this.locale.announceColumnWidthSet(index, value)
				: this.locale.announceRowMinimumHeightSet(index, value),
		);
		this.updateSeparatorValue(separator, kind, index, value);
	}

	private restoreKeyboardResizeFocus(separator: HTMLButtonElement): void {
		if (separator.isConnected) separator.focus({ preventScroll: true });
	}

	private selectColumn(index: number): void {
		if (this.readOnly || this.numRows === 0) return;
		this.getSelectionService()?.setSelectedRange({
			tableId: this.tableId,
			fromRow: 0,
			fromCol: index,
			toRow: this.numRows - 1,
			toCol: index,
		});
		this.updateHandleSelectionState();
	}

	private selectRow(index: number): void {
		if (this.readOnly || this.numCols === 0) return;
		this.getSelectionService()?.setSelectedRange({
			tableId: this.tableId,
			fromRow: index,
			fromCol: 0,
			toRow: index,
			toCol: this.numCols - 1,
		});
		this.updateHandleSelectionState();
	}

	private updateHandleSelectionState(): void {
		const range = this.getSelectionService()?.getSelectedRange();
		for (let index = 0; index < this.colBar.children.length; index++) {
			const selected: boolean =
				!!range &&
				range.tableId === this.tableId &&
				Math.min(range.fromCol, range.toCol) === index &&
				Math.max(range.fromCol, range.toCol) === index &&
				Math.min(range.fromRow, range.toRow) === 0 &&
				Math.max(range.fromRow, range.toRow) === this.numRows - 1;
			this.colBar.children[index]
				?.querySelector('.ntbl-handle-select')
				?.setAttribute('aria-pressed', selected ? 'true' : 'false');
		}
		for (let index = 0; index < this.rowBar.children.length; index++) {
			const selected: boolean =
				!!range &&
				range.tableId === this.tableId &&
				Math.min(range.fromRow, range.toRow) === index &&
				Math.max(range.fromRow, range.toRow) === index &&
				Math.min(range.fromCol, range.toCol) === 0 &&
				Math.max(range.fromCol, range.toCol) === this.numCols - 1;
			this.rowBar.children[index]
				?.querySelector('.ntbl-handle-select')
				?.setAttribute('aria-pressed', selected ? 'true' : 'false');
		}
	}

	private getSizingService(): TableSizingService | undefined {
		return this.pluginContext?.getService?.(TableSizingServiceKey);
	}

	private getSelectionService(): TableSelectionService | undefined {
		return this.pluginContext?.getService?.(TableSelectionServiceKey);
	}
}

// --- Factory ---

/** Creates table controls for the given table element. */
export function createTableControls(
	container: HTMLElement,
	tableEl: HTMLTableElement,
	initialNode: BlockNode,
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	pluginContext?: PluginContext,
	locale?: TableLocale,
	config?: Partial<TableControlsConfig>,
): TableControlsHandle {
	return new TableControls(
		container,
		tableEl,
		initialNode,
		getState,
		dispatch,
		pluginContext,
		locale,
		config,
	);
}
