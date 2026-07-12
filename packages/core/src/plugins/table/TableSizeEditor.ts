/** Accessible precise-size editor shared by the table context and actions menus. */

import type { PluginContext } from '../Plugin.js';
import { TABLE_LOCALE_EN, type TableLocale } from './TableLocale.js';
import {
	type TableDimensionState,
	type TableSizeInput,
	type TableSizeState,
	type TableSizeTarget,
	type TableSizingConfig,
	type TableSizingService,
	TableSizingServiceKey,
	resolveTableSizingConfig,
} from './TableSizing.js';

export interface TableSizeEditorOptions {
	readonly target?: TableSizeTarget;
	readonly config?: Partial<TableSizingConfig>;
	readonly onClose: () => void;
}

interface DimensionField {
	readonly input: HTMLInputElement;
	readonly error: HTMLDivElement;
	readonly minimum: number;
	readonly maximum: number;
	dirty: boolean;
}

/** Renders the precise table sizing UI into an existing popup container. */
export function renderTableSizeEditor(
	container: HTMLElement,
	context: PluginContext,
	options: TableSizeEditorOptions,
	locale: TableLocale = TABLE_LOCALE_EN,
): void {
	const service: TableSizingService | undefined = context.getService?.(TableSizingServiceKey);
	const config: TableSizingConfig = resolveTableSizingConfig(options.config ?? {});
	const state: TableSizeState | null = service ? readSize(service, options.target) : null;

	container.classList.add('notectl-table-size-editor');
	container.setAttribute('role', 'dialog');
	container.setAttribute('aria-modal', 'true');
	container.setAttribute('aria-label', locale.sizeDialogLabel);

	const title: HTMLDivElement = document.createElement('div');
	title.className = 'notectl-table-size-editor__title';
	title.textContent = locale.sizeDialogLabel;
	container.appendChild(title);

	const columnField: DimensionField = buildDimensionField(
		container,
		'column-width',
		locale.columnWidthLabel,
		state?.columnWidthPx ?? 'unavailable',
		config.minColumnWidthPx,
		config.maxColumnWidthPx,
		locale,
	);
	const rowField: DimensionField = buildDimensionField(
		container,
		'row-min-height',
		locale.rowMinimumHeightLabel,
		state?.rowMinHeightPx ?? 'unavailable',
		config.minRowHeightPx,
		config.maxRowHeightPx,
		locale,
	);

	const resetGroup: HTMLDivElement = document.createElement('div');
	resetGroup.className = 'notectl-table-size-editor__resets';
	const resetColumn: HTMLButtonElement = buildButton(
		locale.resetColumnWidth,
		'notectl-table-size-editor__reset',
	);
	const resetRow: HTMLButtonElement = buildButton(
		locale.resetRowMinimumHeight,
		'notectl-table-size-editor__reset',
	);
	const resetAll: HTMLButtonElement = buildButton(
		locale.resetAllSizes,
		'notectl-table-size-editor__reset notectl-table-size-editor__reset--all',
	);
	resetColumn.disabled = columnField.input.disabled;
	resetRow.disabled = rowField.input.disabled;
	resetAll.disabled = columnField.input.disabled && rowField.input.disabled;
	resetGroup.append(resetColumn, resetRow, resetAll);
	container.appendChild(resetGroup);

	const actions: HTMLDivElement = document.createElement('div');
	actions.className = 'notectl-table-size-editor__actions';
	const cancel: HTMLButtonElement = buildButton(locale.cancel);
	const apply: HTMLButtonElement = buildButton(locale.apply, 'notectl-table-size-editor__apply');
	apply.disabled = !service || !!context.isReadOnly?.();
	actions.append(cancel, apply);
	container.appendChild(actions);

	columnField.input.addEventListener('input', () => {
		columnField.dirty = true;
		clearError(columnField);
	});
	rowField.input.addEventListener('input', () => {
		rowField.dirty = true;
		clearError(rowField);
	});

	apply.addEventListener('click', () => {
		if (!service || context.isReadOnly?.()) return;
		const input: MutableTableSizeInput = {};
		let valid = true;
		if (columnField.dirty) {
			const value: number | null = parseDimension(columnField, locale);
			if (value === null) valid = false;
			else input.columnWidthPx = value;
		}
		if (rowField.dirty) {
			const value: number | null = parseDimension(rowField, locale);
			if (value === null) valid = false;
			else input.rowMinHeightPx = value;
		}
		if (!valid) return;
		if (!columnField.dirty && !rowField.dirty) {
			options.onClose();
			return;
		}
		if (writeSize(service, options.target, input)) {
			announceAppliedSize(context, options.target, input, locale);
			options.onClose();
		}
	});

	cancel.addEventListener('click', options.onClose);
	resetColumn.addEventListener('click', () => {
		if (!service || !resetSize(service, options.target, 'columnWidthPx')) return;
		setFieldState(columnField, 'auto', locale);
		announceReset(context, options.target, 'columnWidthPx', locale);
	});
	resetRow.addEventListener('click', () => {
		if (!service || !resetSize(service, options.target, 'rowMinHeightPx')) return;
		setFieldState(rowField, 'auto', locale);
		announceReset(context, options.target, 'rowMinHeightPx', locale);
	});
	resetAll.addEventListener('click', () => {
		if (!service || !resetSize(service, options.target)) return;
		if (!columnField.input.disabled) setFieldState(columnField, 'auto', locale);
		if (!rowField.input.disabled) setFieldState(rowField, 'auto', locale);
		context.announce(locale.announceTableSizesReset);
	});

	container.addEventListener('keydown', (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			options.onClose();
			return;
		}
		if (event.key === 'Tab') trapDialogFocus(container, event);
	});

	requestAnimationFrame(() => {
		const firstInput: HTMLInputElement | undefined = [columnField.input, rowField.input].find(
			(input: HTMLInputElement): boolean => !input.disabled,
		);
		(firstInput ?? cancel).focus();
	});
}

function buildDimensionField(
	container: HTMLElement,
	id: string,
	labelText: string,
	state: TableDimensionState,
	minimum: number,
	maximum: number,
	locale: TableLocale,
): DimensionField {
	const group: HTMLDivElement = document.createElement('div');
	group.className = 'notectl-table-size-editor__field';
	const label: HTMLLabelElement = document.createElement('label');
	label.htmlFor = `notectl-table-size-${id}`;
	label.textContent = labelText;
	const inputWrap: HTMLDivElement = document.createElement('div');
	inputWrap.className = 'notectl-table-size-editor__input-wrap';
	const input: HTMLInputElement = document.createElement('input');
	input.id = label.htmlFor;
	input.type = 'number';
	input.inputMode = 'decimal';
	input.step = '1';
	input.min = String(minimum);
	input.max = String(maximum);
	input.setAttribute('aria-describedby', `${input.id}-error`);
	const unit: HTMLSpanElement = document.createElement('span');
	unit.className = 'notectl-table-size-editor__unit';
	unit.textContent = 'px';
	unit.setAttribute('aria-hidden', 'true');
	inputWrap.append(input, unit);
	const error: HTMLDivElement = document.createElement('div');
	error.id = `${input.id}-error`;
	error.className = 'notectl-table-size-editor__error';
	error.setAttribute('role', 'alert');
	group.append(label, inputWrap, error);
	container.appendChild(group);

	const field: DimensionField = { input, error, minimum, maximum, dirty: false };
	setFieldState(field, state, locale);
	return field;
}

function setFieldState(
	field: DimensionField,
	state: TableDimensionState,
	locale: TableLocale,
): void {
	field.input.disabled = state === 'unavailable';
	field.input.value = typeof state === 'number' ? String(state) : '';
	field.input.placeholder = state === 'mixed' ? locale.mixed : locale.automatic;
	field.dirty = false;
	clearError(field);
}

function parseDimension(field: DimensionField, locale: TableLocale): number | null {
	const raw: string = field.input.value.trim();
	const value: number = Number(raw);
	if (raw.length === 0 || !Number.isFinite(value)) {
		field.error.textContent = locale.invalidDimensionRange(field.minimum, field.maximum);
		field.input.setAttribute('aria-invalid', 'true');
		field.input.focus();
		return null;
	}
	const clamped: number = Math.min(field.maximum, Math.max(field.minimum, value));
	field.input.value = String(clamped);
	return clamped;
}

function clearError(field: DimensionField): void {
	field.error.textContent = '';
	field.input.removeAttribute('aria-invalid');
}

function buildButton(label: string, className = ''): HTMLButtonElement {
	const button: HTMLButtonElement = document.createElement('button');
	button.type = 'button';
	button.textContent = label;
	button.className = className;
	return button;
}

/** Keeps Tab focus inside the modal size dialog by wrapping at both ends. */
function trapDialogFocus(container: HTMLElement, event: KeyboardEvent): void {
	const focusable: readonly HTMLElement[] = getFocusableDialogElements(container);
	const first: HTMLElement | undefined = focusable[0];
	const last: HTMLElement | undefined = focusable[focusable.length - 1];
	if (!first || !last) return;
	const active: Element | null = activeElementWithin(container);
	const wrapToLast: boolean = event.shiftKey && (active === first || !container.contains(active));
	const wrapToFirst: boolean = !event.shiftKey && (active === last || !container.contains(active));
	if (!wrapToLast && !wrapToFirst) return;
	event.preventDefault();
	(wrapToLast ? last : first).focus();
}

/** Returns the dialog's enabled, focusable controls in DOM order. */
function getFocusableDialogElements(container: HTMLElement): readonly HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'),
	).filter((element: HTMLInputElement | HTMLButtonElement): boolean => !element.disabled);
}

/** Resolves the active element across a shadow-root or document boundary. */
function activeElementWithin(container: HTMLElement): Element | null {
	const root: Node = container.getRootNode();
	if (root instanceof ShadowRoot || root instanceof Document) return root.activeElement;
	return document.activeElement;
}

function readSize(
	service: TableSizingService,
	target: TableSizeTarget | undefined,
): TableSizeState | null {
	return target ? service.getSize(target) : service.getSelectionSize();
}

function writeSize(
	service: TableSizingService,
	target: TableSizeTarget | undefined,
	input: TableSizeInput,
): boolean {
	return target ? service.setSize(target, input) : service.setSelectionSize(input);
}

function resetSize(
	service: TableSizingService,
	target: TableSizeTarget | undefined,
	dimension?: 'columnWidthPx' | 'rowMinHeightPx',
): boolean {
	return target ? service.resetSize(target, dimension) : service.resetSelectionSize(dimension);
}

function announceAppliedSize(
	context: PluginContext,
	target: TableSizeTarget | undefined,
	input: TableSizeInput,
	locale: TableLocale,
): void {
	const messages: string[] = [];
	if (typeof input.columnWidthPx === 'number') {
		if (target?.kind === 'column' || target?.kind === 'cell') {
			messages.push(locale.announceColumnWidthSet(target.column, input.columnWidthPx));
		} else {
			messages.push(`${locale.columnWidthLabel}: ${String(input.columnWidthPx)}`);
		}
	}
	if (typeof input.rowMinHeightPx === 'number') {
		if (target?.kind === 'row' || target?.kind === 'cell') {
			messages.push(locale.announceRowMinimumHeightSet(target.row, input.rowMinHeightPx));
		} else {
			messages.push(`${locale.rowMinimumHeightLabel}: ${String(input.rowMinHeightPx)}`);
		}
	}
	if (messages.length > 0) context.announce(messages.join(' '));
}

function announceReset(
	context: PluginContext,
	target: TableSizeTarget | undefined,
	dimension: 'columnWidthPx' | 'rowMinHeightPx',
	locale: TableLocale,
): void {
	if (dimension === 'columnWidthPx') {
		if (target?.kind === 'column' || target?.kind === 'cell') {
			context.announce(locale.announceColumnWidthReset(target.column));
		} else {
			context.announce(locale.resetColumnWidth);
		}
		return;
	}
	if (target?.kind === 'row' || target?.kind === 'cell') {
		context.announce(locale.announceRowMinimumHeightReset(target.row));
	} else {
		context.announce(locale.resetRowMinimumHeight);
	}
}

type MutableTableSizeInput = {
	-readonly [Key in keyof TableSizeInput]?: TableSizeInput[Key];
};
