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
export function buildInsertLine(orientation: 'horizontal' | 'vertical'): HTMLDivElement {
	const line: HTMLDivElement = document.createElement('div');
	line.className = `ntbl-insert-line ntbl-insert-line--${orientation}`;
	line.setAttribute('contenteditable', 'false');

	const title: string = orientation === 'horizontal' ? 'Insert row' : 'Insert column';
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
	return bar;
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
