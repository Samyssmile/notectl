/** Toolbar styles — buttons, separators, tooltips, popups, dropdowns. */
export const TOOLBAR_CSS = `
/* Toolbar */
.notectl-plugin-container--top {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	border-bottom: 1px solid var(--notectl-border);
	background: var(--notectl-toolbar-bg, var(--notectl-surface-raised));
	min-height: 40px;
}

.notectl-toolbar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 2px;
	padding: 4px 8px;
}

.notectl-toolbar-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border: 1px solid transparent;
	border-radius: 4px;
	background: transparent;
	cursor: pointer;
	color: var(--notectl-fg);
	font-size: 14px;
	line-height: 1;
	padding: 0;
	transition: background 0.1s, border-color 0.1s;
}

.notectl-toolbar-btn:hover {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-border);
}

.notectl-toolbar-btn--active {
	background: var(--notectl-active-bg);
	border-color: var(--notectl-primary-muted);
	color: var(--notectl-primary-fg);
}

.notectl-toolbar-btn:focus-visible {
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
	outline: none;
}

.notectl-toolbar-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.notectl-toolbar-btn:disabled:hover {
	background: transparent;
	border-color: transparent;
}

.notectl-toolbar-btn__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	pointer-events: none;
}

.notectl-toolbar-btn__icon svg {
	display: block;
	width: 18px;
	height: 18px;
	fill: currentColor;
}

/* Tooltip (rendered as fixed-position element in shadow root) */
.notectl-toolbar-tooltip {
	position: fixed;
	padding: 4px 8px;
	border-radius: 4px;
	background: var(--notectl-tooltip-bg);
	color: var(--notectl-tooltip-fg);
	font-size: 11px;
	font-weight: 500;
	white-space: nowrap;
	pointer-events: none;
	z-index: 10001;
	line-height: 1.4;
	letter-spacing: 0.01em;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.notectl-toolbar-separator {
	display: inline-block;
	width: 1px;
	height: 20px;
	background: var(--notectl-border);
	margin: 0 4px;
	vertical-align: middle;
}

/* Toolbar Popups */
.notectl-toolbar-popup {
	background: var(--notectl-surface-overlay);
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	box-shadow: 0 4px 12px var(--notectl-shadow);
	overflow: hidden;
}

/* Grid Picker */
.notectl-grid-picker__cell:focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: -1px;
}

.notectl-grid-picker__cell--highlighted {
	background: var(--notectl-primary-muted);
	border-color: var(--notectl-primary);
}

/* Dropdown */
.notectl-dropdown {
	min-width: 160px;
	padding: 4px 0;
}

.notectl-dropdown__item {
	display: flex;
	align-items: center;
	width: 100%;
	padding: 8px 12px;
	text-align: left;
	border: none;
	background: none;
	cursor: pointer;
	font-size: 14px;
	color: var(--notectl-fg);
	line-height: 1.4;
	font-family: inherit;
	white-space: nowrap;
}

.notectl-dropdown__item:hover,
.notectl-dropdown__item:focus-visible {
	background: var(--notectl-hover-bg);
}

.notectl-dropdown__item:focus-visible {
	outline: none;
}

.notectl-dropdown__item-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	font-weight: 600;
	color: var(--notectl-fg-muted);
	flex-shrink: 0;
}

.notectl-dropdown__item-label {
	flex: 1;
}
`;
