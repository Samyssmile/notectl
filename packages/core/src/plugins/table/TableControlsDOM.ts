/**
 * Pure DOM factory functions for table controls.
 * No state logic — only element creation and CSS class assignment.
 */

// --- SVG Icons ---

export const PLUS_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 12 12" fill="none">' +
	'<path d="M6 1v10M1 6h10" stroke="currentColor" ' +
	'stroke-width="1.8" stroke-linecap="round"/></svg>';

export const DELETE_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" ' +
	'viewBox="0 0 10 10" fill="none">' +
	'<path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" ' +
	'stroke-width="1.5" stroke-linecap="round"/></svg>';

export const TABLE_DELETE_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 24 24" fill="none">' +
	'<path d="M9 3h6m-9 4h12M10 11v6m4-6v6m-9 3h14l-1-13H6L5 20z" ' +
	'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
	'stroke-linejoin="round"/></svg>';

// --- DOM Factories ---

/** Creates a button with standard table-control setup (mousedown prevention, ARIA). */
export function createButton(
	className: string,
	innerHTML: string,
	title: string,
): HTMLButtonElement {
	const btn: HTMLButtonElement = document.createElement('button');
	btn.className = className;
	btn.innerHTML = innerHTML;
	btn.title = title;
	btn.type = 'button';
	btn.setAttribute('aria-label', title);
	btn.setAttribute('contenteditable', 'false');
	btn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	});
	return btn;
}

/** Builds the insert-line element (horizontal or vertical) with a plus-icon button. */
export function buildInsertLine(
	orientation: 'horizontal' | 'vertical',
	label?: string,
): HTMLDivElement {
	const line: HTMLDivElement = document.createElement('div');
	line.className = `ntbl-insert-line ntbl-insert-line--${orientation}`;
	line.setAttribute('contenteditable', 'false');
	line.setAttribute('data-notectl-no-print', '');

	const title: string = label ?? (orientation === 'horizontal' ? 'Insert row' : 'Insert column');
	const btn: HTMLButtonElement = createButton('ntbl-insert-btn', PLUS_SVG, title);
	line.appendChild(btn);

	return line;
}

/** Builds a zone-button for adding rows or columns at the table edge. */
export function buildAddButton(className: string, title: string): HTMLButtonElement {
	const btn: HTMLButtonElement = document.createElement('button');
	btn.className = `ntbl-add-zone ${className}`;
	btn.type = 'button';
	btn.setAttribute('contenteditable', 'false');
	btn.setAttribute('aria-label', title);
	btn.setAttribute('data-notectl-no-print', '');
	btn.title = title;

	const icon: HTMLSpanElement = document.createElement('span');
	icon.className = 'ntbl-add-icon';
	icon.innerHTML = PLUS_SVG;
	btn.appendChild(icon);

	btn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	});

	return btn;
}

/** Builds a handle-bar container (for column or row handles). */
export function buildHandleBar(className: string): HTMLDivElement {
	const bar: HTMLDivElement = document.createElement('div');
	bar.className = className;
	bar.setAttribute('contenteditable', 'false');
	bar.setAttribute('data-notectl-no-print', '');
	return bar;
}

/** SVG icon for kebab menu (three vertical dots). */
export const ACTIONS_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 24 24" fill="currentColor">' +
	'<circle cx="12" cy="5" r="2"/>' +
	'<circle cx="12" cy="12" r="2"/>' +
	'<circle cx="12" cy="19" r="2"/></svg>';

/** Builds the table actions button (kebab menu icon). */
export function buildActionsButton(label?: string): HTMLButtonElement {
	const btn: HTMLButtonElement = createButton(
		'ntbl-actions-btn',
		ACTIONS_SVG,
		label ?? 'Table actions (Right-click or Shift+F10)',
	);
	btn.setAttribute('data-notectl-no-print', '');
	return btn;
}

/** Builds the context menu discovery hint shown on first focus. */
export function buildContextHint(label?: string): HTMLDivElement {
	const hint: HTMLDivElement = document.createElement('div');
	hint.className = 'ntbl-context-hint';
	hint.setAttribute('aria-hidden', 'true');
	hint.setAttribute('contenteditable', 'false');
	hint.setAttribute('data-notectl-no-print', '');
	hint.textContent = label ?? 'Right-click or Shift+F10 for table actions';
	return hint;
}

/** SVG icon for border/grid. */
export const BORDER_COLOR_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 24 24" fill="none">' +
	'<path d="M3 3h18v18H3V3zm0 6h18M3 15h18M9 3v18M15 3v18" ' +
	'stroke="currentColor" stroke-width="1.5"/></svg>';

/** Builds the border color button with a color indicator swatch. */
export function buildBorderColorButton(currentColor?: string): HTMLButtonElement {
	const btn: HTMLButtonElement = createButton(
		'ntbl-border-color-btn',
		BORDER_COLOR_SVG,
		'Border color',
	);
	btn.setAttribute('data-notectl-no-print', '');

	const swatch: HTMLSpanElement = document.createElement('span');
	swatch.className = 'ntbl-border-color-swatch';
	updateBorderColorSwatch(swatch, currentColor);
	btn.appendChild(swatch);

	return btn;
}

/** Updates the swatch indicator to reflect the current border color. */
export function updateBorderColorSwatch(swatch: HTMLElement, color?: string): void {
	if (color === 'none') {
		swatch.style.backgroundColor = 'transparent';
		swatch.style.border = '1px dashed rgba(128,128,128,0.4)';
	} else if (color) {
		swatch.style.backgroundColor = color;
		swatch.style.border = '1px solid rgba(0,0,0,0.15)';
	} else {
		swatch.style.backgroundColor = 'var(--notectl-border)';
		swatch.style.border = '1px solid rgba(0,0,0,0.15)';
	}
}

/** Builds a single column or row handle with a delete button. */
export function buildHandle(
	className: string,
	index: number,
	deleteLabel: string,
	onDelete: (idx: number) => void,
): HTMLDivElement {
	const handle: HTMLDivElement = document.createElement('div');
	handle.className = `ntbl-handle ${className}`;
	handle.dataset.index = String(index);

	const deleteBtn: HTMLButtonElement = createButton('ntbl-handle-delete', DELETE_SVG, deleteLabel);
	deleteBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onDelete(index);
	});
	handle.appendChild(deleteBtn);

	return handle;
}
