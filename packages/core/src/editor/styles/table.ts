/** Table styles — table layout, selection, context menu, controls, insert lines. */
export const TABLE_CSS = `
/* Table */
.notectl-table-wrapper {
	margin: 8px 0;
	overflow-x: auto;
	position: relative;
}

.notectl-table {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
}

.notectl-table col {
	box-sizing: border-box;
}

/* Border resolution order: per-table local override → theme component token → theme global token.
 * The inline --ntbl-border-color is set by the toolbar's "border color" action and must win
 * over the theme so per-table customizations remain visible after a theme switch.
 */
.notectl-table td {
	border: 1px solid var(--ntbl-border-color, var(--notectl-table-border, var(--notectl-border)));
	background: var(--notectl-table-cell-bg, transparent);
	padding: 8px 12px;
	min-width: var(--ntbl-min-column-width, 60px);
	vertical-align: top;
	min-height: 1.6em;
}

.notectl-table th {
	border: 1px solid var(--ntbl-border-color, var(--notectl-table-border, var(--notectl-border)));
	background: var(--notectl-table-header-bg, var(--notectl-surface-raised));
	padding: 8px 12px;
	min-width: var(--ntbl-min-column-width, 60px);
	vertical-align: top;
	text-align: start;
	font-weight: 600;
}

.notectl-table--borderless td {
	border: 1px dashed rgba(128, 128, 128, 0.15);
}

@media print {
	.notectl-table--borderless td {
		border: none;
	}
}

.notectl-table td:focus-within {
	outline: 2px solid var(--notectl-primary);
	outline-offset: -2px;
}

.notectl-table-cell--selected {
	background: var(--notectl-primary-muted);
}

/* Table Context Menu */
.notectl-table-context-menu {
	background: var(--notectl-surface-overlay);
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	box-shadow: 0 4px 12px var(--notectl-shadow);
	padding: 4px 0;
	min-width: 180px;
	z-index: 10000;
}

.notectl-table-context-menu button {
	display: block;
	width: 100%;
	padding: 8px 12px;
	text-align: start;
	border: none;
	background: none;
	cursor: pointer;
	font-size: 14px;
	color: var(--notectl-fg);
	font-family: inherit;
}

.notectl-table-context-menu button:hover {
	background: var(--notectl-hover-bg);
}

.notectl-table-context-menu hr {
	border: none;
	border-top: 1px solid var(--notectl-border);
	margin: 4px 0;
}

/* === Table Controls === */

/* Outer container for table + controls */
.ntbl-container {
	position: relative;
	margin: 8px 0;
	padding-block-start: 24px;
	padding-inline-start: 24px;
}

.ntbl-container .notectl-table-wrapper {
	margin: 0;
}

.ntbl-container.notectl-table--selected .notectl-table-wrapper {
	outline: 2px solid var(--notectl-primary-fg);
	outline-offset: 2px;
	border-radius: 6px;
}

/* --- Column Handle Bar --- */
.ntbl-col-bar {
	position: absolute;
	top: 0;
	inset-inline-start: 24px;
	height: 20px;
	display: flex;
	opacity: 0;
	transition: opacity 0.2s ease;
	z-index: 3;
	pointer-events: none;
}

.ntbl-container:hover .ntbl-col-bar,
.ntbl-container:focus-within .ntbl-col-bar {
	opacity: 1;
	pointer-events: auto;
}

.ntbl-container.notectl-table--selected .ntbl-col-bar {
	opacity: 1;
	pointer-events: auto;
}

/* --- Row Handle Bar --- */
.ntbl-row-bar {
	position: absolute;
	top: 24px;
	inset-inline-start: 0;
	width: 20px;
	display: flex;
	flex-direction: column;
	opacity: 0;
	transition: opacity 0.2s ease;
	z-index: 3;
	pointer-events: none;
}

.ntbl-container:hover .ntbl-row-bar,
.ntbl-container:focus-within .ntbl-row-bar {
	opacity: 1;
	pointer-events: auto;
}

.ntbl-container.notectl-table--selected .ntbl-row-bar {
	opacity: 1;
	pointer-events: auto;
}

/* --- Handle (shared base) --- */
.ntbl-handle {
	position: absolute;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background 0.15s ease;
	border-radius: 3px;
}

.ntbl-handle-select {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	border: 0;
	border-radius: inherit;
	background: transparent;
	cursor: pointer;
}

.ntbl-handle-select[aria-pressed="true"] {
	background: var(--notectl-primary-muted);
	box-shadow: inset 0 0 0 1px var(--notectl-primary);
}

.ntbl-handle-select:focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-col-handle {
	height: 100%;
	background: var(--notectl-hover-bg);
	border-radius: 4px 4px 0 0;
}

.ntbl-col-handle:hover {
	background: var(--notectl-border);
}

.ntbl-row-handle {
	width: 100%;
	background: var(--notectl-hover-bg);
	border-start-start-radius: 4px;
	border-end-start-radius: 4px;
}

.ntbl-row-handle:hover {
	background: var(--notectl-border);
}

/* --- Handle Delete Button --- */
.ntbl-handle-delete {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border: none;
	background: transparent;
	color: var(--notectl-fg-muted);
	cursor: pointer;
	border-radius: 3px;
	padding: 0;
	opacity: 0;
	transform: scale(0.7);
	transition: opacity 0.15s, transform 0.15s,
		background 0.15s, color 0.15s;
	z-index: 1;
}

/* --- Logical column/row resize separators --- */
.ntbl-col-resize-bar,
.ntbl-row-resize-bar {
	position: absolute;
	inset: 0 auto auto 0;
	z-index: 8;
	pointer-events: none;
}

.ntbl-resize-separator {
	position: absolute;
	display: block;
	margin: 0;
	padding: 0;
	border: 0;
	background: transparent;
	opacity: 0;
	pointer-events: none;
	touch-action: none;
}

.ntbl-resize-separator--column {
	width: 12px;
	transform: translateX(-6px);
	cursor: col-resize;
}

.ntbl-resize-separator--row {
	height: 12px;
	transform: translateY(-6px);
	cursor: row-resize;
}

.ntbl-container:hover .ntbl-resize-separator,
.ntbl-container:focus-within .ntbl-resize-separator,
.ntbl-container.notectl-table--selected .ntbl-resize-separator,
.ntbl-container--resizing-column .ntbl-resize-separator--column,
.ntbl-container--resizing-row .ntbl-resize-separator--row {
	opacity: 1;
	pointer-events: auto;
}

.ntbl-resize-separator::after {
	content: "";
	position: absolute;
	background: var(--notectl-primary);
	opacity: 0.35;
}

.ntbl-resize-separator--column::after {
	inset: 0 auto 0 5px;
	width: 2px;
}

.ntbl-resize-separator--row::after {
	inset: 5px 0 auto 0;
	height: 2px;
}

.ntbl-resize-separator:hover::after,
.ntbl-resize-separator:focus-visible::after {
	opacity: 1;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-resize-separator:focus-visible {
	outline: none;
}

.ntbl-resize-indicator {
	position: absolute;
	display: none;
	z-index: 12;
	padding: 3px 7px;
	border-radius: 4px;
	background: var(--notectl-fg);
	color: var(--notectl-bg);
	font: 12px/1.4 monospace;
	pointer-events: none;
	white-space: nowrap;
}

.ntbl-resize-indicator--visible {
	display: block;
}

.ntbl-container--resizing-column,
.ntbl-container--resizing-column * {
	cursor: col-resize !important;
	user-select: none !important;
}

.ntbl-container--resizing-row,
.ntbl-container--resizing-row * {
	cursor: row-resize !important;
	user-select: none !important;
}

.ntbl-handle:hover .ntbl-handle-delete,
.ntbl-handle:focus-within .ntbl-handle-delete {
	opacity: 1;
	transform: scale(1);
}

.ntbl-handle-delete:hover,
.ntbl-handle-delete:focus-visible {
	background: var(--notectl-danger-muted);
	color: var(--notectl-danger);
}

.ntbl-handle-delete:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

/* --- Insert Lines --- */
.ntbl-insert-line {
	position: absolute;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s ease;
	z-index: 6;
}

.ntbl-insert-line--visible {
	opacity: 1;
	pointer-events: auto;
}

.ntbl-insert-line--horizontal {
	height: 2px;
	background: linear-gradient(
		90deg,
		transparent,
		var(--notectl-primary) 8%,
		var(--notectl-primary) 92%,
		transparent
	);
	box-shadow: 0 0 6px var(--notectl-focus-ring);
}

.ntbl-insert-line--vertical {
	width: 2px;
	background: linear-gradient(
		180deg,
		transparent,
		var(--notectl-primary) 8%,
		var(--notectl-primary) 92%,
		transparent
	);
	box-shadow: 0 0 6px var(--notectl-focus-ring);
}

/* --- Insert Button on Line --- */
.ntbl-insert-btn {
	position: absolute;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: var(--notectl-surface-raised);
	border: 2px solid var(--notectl-primary);
	color: var(--notectl-primary);
	cursor: pointer;
	pointer-events: all;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	box-shadow: 0 2px 8px var(--notectl-focus-ring);
	transition: background 0.15s, color 0.15s,
		transform 0.15s, box-shadow 0.15s;
}

.ntbl-insert-line--horizontal .ntbl-insert-btn {
	left: 50%;
	top: -9px;
	transform: translateX(-50%);
}

.ntbl-insert-line--vertical .ntbl-insert-btn {
	top: 50%;
	inset-inline-start: -9px;
	transform: translateY(-50%);
}

.ntbl-insert-btn:hover,
.ntbl-insert-btn:focus-visible {
	background: var(--notectl-primary);
	color: var(--notectl-primary-fg);
	box-shadow: 0 2px 12px var(--notectl-focus-ring);
}

.ntbl-insert-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-insert-line--horizontal .ntbl-insert-btn:hover {
	transform: translateX(-50%) scale(1.2);
}

.ntbl-insert-line--vertical .ntbl-insert-btn:hover {
	transform: translateY(-50%) scale(1.2);
}

/* --- Add Row / Add Column Zones --- */
.ntbl-add-zone {
	position: absolute;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	user-select: none;
	opacity: 0;
	transition: opacity 0.2s ease, background 0.2s ease,
		border-color 0.2s ease;
}

.ntbl-container:hover .ntbl-add-zone,
.ntbl-container:focus-within .ntbl-add-zone {
	opacity: 1;
}

.ntbl-container.notectl-table--selected .ntbl-add-zone {
	opacity: 1;
}

.ntbl-delete-table-btn {
	position: absolute;
	top: 0;
	inset-inline-start: 0;
	width: 20px;
	height: 20px;
	border: 1px solid var(--notectl-danger);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-danger);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 0.2s ease, background 0.15s, border-color 0.15s;
	z-index: 7;
}

.ntbl-container:hover .ntbl-delete-table-btn,
.ntbl-container:focus-within .ntbl-delete-table-btn,
.ntbl-container.notectl-table--selected .ntbl-delete-table-btn {
	opacity: 1;
}

.ntbl-delete-table-btn:hover,
.ntbl-delete-table-btn:focus-visible {
	background: var(--notectl-danger-muted);
	border-color: var(--notectl-danger);
}

.ntbl-delete-table-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

/* --- Context Menu Discovery Hint --- */
.ntbl-context-hint {
	position: absolute;
	top: 4px;
	inset-inline-end: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	padding: 2px 8px;
	border-radius: 4px;
	opacity: 0;
	transition: opacity 0.2s ease;
	pointer-events: none;
	white-space: nowrap;
	z-index: 5;
}

.ntbl-container:hover .ntbl-context-hint,
.ntbl-container:focus-within .ntbl-context-hint,
.ntbl-container.notectl-table--selected .ntbl-context-hint {
	opacity: 1;
}

/* --- Table Actions Button --- */
.ntbl-actions-btn {
	position: absolute;
	top: 0;
	inset-inline-start: 48px;
	width: 20px;
	height: 20px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg-muted);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 0.2s ease, background 0.15s, border-color 0.15s;
	z-index: 7;
	cursor: pointer;
	padding: 0;
}

.ntbl-container:hover .ntbl-actions-btn,
.ntbl-container:focus-within .ntbl-actions-btn,
.ntbl-container.notectl-table--selected .ntbl-actions-btn {
	opacity: 1;
}

.ntbl-actions-btn:hover,
.ntbl-actions-btn:focus-visible {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-primary);
}

.ntbl-actions-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

/* --- Border Color Button --- */
.ntbl-border-color-btn {
	position: absolute;
	top: 0;
	inset-inline-start: 24px;
	width: 20px;
	height: 20px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg-muted);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	opacity: 0;
	transition: opacity 0.2s ease, background 0.15s, border-color 0.15s;
	z-index: 7;
	cursor: pointer;
	padding: 0;
}

.ntbl-container:hover .ntbl-border-color-btn,
.ntbl-container:focus-within .ntbl-border-color-btn,
.ntbl-container.notectl-table--selected .ntbl-border-color-btn {
	opacity: 1;
}

.ntbl-border-color-btn:hover,
.ntbl-border-color-btn:focus-visible {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-primary);
}

.ntbl-border-color-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-border-color-swatch {
	width: 10px;
	height: 10px;
	border-radius: 2px;
	border: 1px solid rgba(0, 0, 0, 0.15);
}

/* --- Context Menu Keyboard Hint --- */
.notectl-table-context-menu__hint {
	padding: 4px 12px 6px;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	border-top: 1px solid var(--notectl-border);
	margin-top: 4px;
	text-align: center;
	user-select: none;
}

/* --- Context Menu Focus --- */
.notectl-table-context-menu button:focus-visible {
	outline: none;
	background: var(--notectl-primary-muted);
	box-shadow: inset 0 0 0 2px var(--notectl-focus-ring);
}

.notectl-table-context-menu [role="separator"] {
	border: none;
	border-top: 1px solid var(--notectl-border);
	margin: 4px 0;
	height: 0;
}

/* --- Precise size editor --- */
.notectl-table-size-editor {
	box-sizing: border-box;
	width: 340px;
	max-width: calc(100vw - 16px);
	min-width: 260px;
	padding: 12px;
}

.notectl-table-size-editor__title {
	margin-block-end: 10px;
	font-weight: 600;
}

.notectl-table-size-editor__field {
	display: grid;
	gap: 4px;
	margin-block-end: 10px;
	font-size: 13px;
}

.notectl-table-size-editor__input-wrap {
	display: flex;
	align-items: center;
	gap: 6px;
}

.notectl-table-size-editor input {
	box-sizing: border-box;
	min-width: 0;
	width: 100%;
	padding: 6px 8px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
	color: var(--notectl-fg);
	font: inherit;
}

.notectl-table-size-editor input:focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: 1px;
}

.notectl-table-size-editor input[aria-invalid="true"] {
	border-color: var(--notectl-danger);
}

.notectl-table-size-editor__unit {
	color: var(--notectl-fg-muted);
}

.notectl-table-size-editor__error {
	min-height: 1.2em;
	color: var(--notectl-danger);
	font-size: 11px;
}

.notectl-table-size-editor__resets,
.notectl-table-size-editor__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.notectl-table-size-editor__resets {
	padding-block-end: 10px;
	border-block-end: 1px solid var(--notectl-border);
}

.notectl-table-size-editor__actions {
	justify-content: flex-end;
	padding-block-start: 10px;
}

.notectl-table-size-editor button {
	width: auto;
	padding: 6px 8px;
	border-radius: 4px;
	font-size: 12px;
}

.notectl-table-context-menu .notectl-table-size-editor__apply {
	background: var(--notectl-primary);
	color: var(--notectl-primary-fg);
}

.notectl-table-context-menu .notectl-table-size-editor button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

/* Read-only tables keep semantic dimensions but expose no mutation affordances. */
.ntbl-container[data-notectl-table-readonly] {
	padding-block-start: 0;
	padding-inline-start: 0;
}

.ntbl-container[data-notectl-table-readonly] > :is(
	.ntbl-col-bar,
	.ntbl-row-bar,
	.ntbl-col-resize-bar,
	.ntbl-row-resize-bar,
	.ntbl-insert-line,
	.ntbl-add-zone,
	.ntbl-delete-table-btn,
	.ntbl-border-color-btn,
	.ntbl-actions-btn,
	.ntbl-context-hint,
	.ntbl-resize-indicator
) {
	display: none !important;
}

.ntbl-add-row {
	bottom: 0;
	height: 24px;
	border: 1px dashed var(--notectl-border);
	border-end-start-radius: 6px;
	border-end-end-radius: 6px;
	border-block-start: none;
	color: var(--notectl-fg-muted);
	transform: translateY(100%);
}

.ntbl-add-row:hover,
.ntbl-add-row:focus-visible {
	background: var(--notectl-primary-muted);
	border-color: var(--notectl-primary);
	color: var(--notectl-primary);
}

.ntbl-add-row:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-add-col {
	inset-inline-end: 0;
	top: 24px;
	width: 24px;
	border: 1px dashed var(--notectl-border);
	border-start-end-radius: 6px;
	border-end-end-radius: 6px;
	border-inline-start: none;
	color: var(--notectl-fg-muted);
	transform: translateX(100%);
}

[dir="rtl"] .ntbl-add-col {
	transform: translateX(-100%);
}

.ntbl-add-col:hover,
.ntbl-add-col:focus-visible {
	background: var(--notectl-primary-muted);
	border-color: var(--notectl-primary);
	color: var(--notectl-primary);
}

.ntbl-add-col:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.ntbl-add-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	transition: transform 0.2s ease;
}

.ntbl-add-zone:hover .ntbl-add-icon {
	transform: scale(1.15);
}

@media print {
	.notectl-table-wrapper {
		overflow: visible;
	}

	.ntbl-container {
		padding: 0;
	}

	.ntbl-container > [data-notectl-no-print] {
		display: none !important;
	}
}
`;
