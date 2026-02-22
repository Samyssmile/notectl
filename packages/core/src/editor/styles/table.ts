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

.notectl-table td {
	border: 1px solid var(--notectl-border);
	padding: 8px 12px;
	min-width: 60px;
	vertical-align: top;
	min-height: 1.6em;
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
	position: fixed;
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
	text-align: left;
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
	padding: 24px 0 0 24px;
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
	left: 24px;
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
	left: 0;
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
	border-radius: 4px 0 0 4px;
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
	background: var(--notectl-bg);
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
	left: -9px;
	transform: translateY(-50%);
}

.ntbl-insert-btn:hover,
.ntbl-insert-btn:focus-visible {
	background: var(--notectl-primary);
	color: var(--notectl-bg);
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
	left: 0;
	width: 20px;
	height: 20px;
	border: 1px solid var(--notectl-danger);
	border-radius: 4px;
	background: var(--notectl-bg);
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

.ntbl-add-row {
	bottom: 0;
	height: 24px;
	border: 1px dashed var(--notectl-border);
	border-radius: 0 0 6px 6px;
	border-top: none;
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
	right: 0;
	top: 24px;
	width: 24px;
	border: 1px dashed var(--notectl-border);
	border-radius: 0 6px 6px 0;
	border-left: none;
	color: var(--notectl-fg-muted);
	transform: translateX(100%);
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
`;
