/** Toolbar styles — buttons, separators, tooltips, popups, dropdowns. */
export const TOOLBAR_CSS = `
/* Toolbar */
.notectl-plugin-container--top {
	display: flex;
	align-items: center;
	flex-wrap: nowrap;
	border-bottom: 1px solid var(--notectl-border);
	background: var(--notectl-toolbar-bg, var(--notectl-surface-raised));
	min-height: 40px;
}

.notectl-toolbar {
	display: flex;
	align-items: center;
	flex-wrap: nowrap;
	overflow: hidden;
	flex: 1;
	min-width: 0;
	gap: 2px;
	padding: 4px 8px;
}

.notectl-toolbar[hidden] {
	display: none;
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
	flex-shrink: 0;
	transition: background 0.1s, border-color 0.1s;
}

@media (hover: hover) {
	.notectl-toolbar-btn:hover {
		background: var(--notectl-hover-bg);
		border-color: var(--notectl-border);
	}
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

@media (hover: hover) {
	.notectl-toolbar-btn:disabled:hover {
		background: transparent;
		border-color: transparent;
	}
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

@media (hover: hover) {
	.notectl-dropdown__item:hover {
		background: var(--notectl-hover-bg);
	}
}

.notectl-dropdown__item:focus-visible {
	background: var(--notectl-hover-bg);
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

/* Overflow behavior: flow mode — toolbar wraps to additional rows */
.notectl-toolbar[data-overflow="flow"] {
	flex-wrap: wrap;
	overflow: visible;
}

/* Overflow behavior: none — toolbar clips without any responsive behavior */
.notectl-toolbar[data-overflow="none"] {
	flex-wrap: nowrap;
	overflow: hidden;
}

/* Overflow: hidden items (burger-menu mode) */
.notectl-toolbar-btn--overflow-hidden,
.notectl-toolbar-separator--overflow-hidden {
	display: none;
}

/* Overflow "more" button */
.notectl-toolbar-overflow-btn {
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
	font-size: 16px;
	line-height: 1;
	padding: 0;
	flex-shrink: 0;
	margin-left: auto;
	transition: background 0.1s, border-color 0.1s;
}

@media (hover: hover) {
	.notectl-toolbar-overflow-btn:hover {
		background: var(--notectl-hover-bg);
		border-color: var(--notectl-border);
	}
}

.notectl-toolbar-overflow-btn--hidden {
	display: none;
}

.notectl-toolbar-overflow-btn:focus-visible {
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
	outline: none;
}

/* Dropdown item states shared by all dropdown menus (including overflow) */
.notectl-dropdown__item:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

@media (hover: hover) {
	.notectl-dropdown__item:disabled:hover {
		background: none;
	}
}

.notectl-dropdown__item--active {
	color: var(--notectl-primary-fg);
}

.notectl-dropdown__item-icon svg {
	display: block;
	width: 16px;
	height: 16px;
	fill: currentColor;
}

.notectl-dropdown__separator {
	height: 1px;
	background: var(--notectl-border);
	margin: 4px 0;
}

/* Combobox-style toolbar buttons (shared base for font, fontSize, heading, etc.) */
.notectl-toolbar-btn[role="combobox"] {
	width: auto;
	padding: 0 8px;
	gap: 4px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
}

@media (hover: hover) {
	.notectl-toolbar-btn[role="combobox"]:hover {
		background: var(--notectl-hover-bg);
		border-color: var(--notectl-fg-muted);
	}
}

.notectl-toolbar-btn[role="combobox"].notectl-toolbar-btn--active {
	background: var(--notectl-bg);
	border-color: var(--notectl-primary-muted);
}

.notectl-toolbar-combobox__label {
	flex: 1;
	font-size: 13px;
	font-weight: 500;
	color: var(--notectl-fg);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: left;
	line-height: 30px;
}

.notectl-toolbar-combobox__arrow {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	line-height: 30px;
}

/* Link Popup */
.notectl-link-popup {
	padding: 8px;
	min-width: 200px;
}

.notectl-link-popup__input {
	width: 100%;
	padding: 4px;
	box-sizing: border-box;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	font-size: 13px;
	color: var(--notectl-fg);
	background: var(--notectl-bg);
}

.notectl-link-popup__input:focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: -1px;
}

.notectl-link-popup__button {
	width: 100%;
	padding: 6px 12px;
	cursor: pointer;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
	color: var(--notectl-fg);
	font-size: 13px;
}

.notectl-link-popup__button--apply {
	margin-top: 4px;
}

@media (hover: hover) {
	.notectl-link-popup__button:hover {
		background: var(--notectl-hover-bg);
	}
}

.notectl-link-popup__button:focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: -1px;
}
`;
