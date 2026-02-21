/**
 * Editor styles using Adopted Stylesheets for Shadow DOM.
 *
 * All colors reference CSS custom properties set by the ThemeEngine.
 * The theme stylesheet is always injected first, providing all --notectl-* values.
 */

const EDITOR_CSS = `
:host {
	display: block;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	font-size: 16px;
	line-height: 1.6;
	color: var(--notectl-fg);
}

.notectl-editor {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	overflow: hidden;
	background: var(--notectl-bg);
}

.notectl-editor:focus-within {
	border-color: var(--notectl-border-focus);
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

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

/* Content Area */
.notectl-content {
	flex: 1;
	padding: 12px 16px;
	outline: none;
	min-height: var(--notectl-content-min-height, 400px);
	cursor: text;
	position: relative;
	white-space: pre-wrap;
	word-wrap: break-word;
	-moz-tab-size: 4;
	tab-size: 4;
}

.notectl-content p {
	margin: 0;
	padding: 2px 0;
	min-height: 1.6em;
}

.notectl-content p + p {
	margin-top: 0;
}

/* List Wrappers — suppress native markers, we use ::before pseudo-elements */
.notectl-list {
	list-style: none;
	margin: 0;
	padding: 0;
}

/* Ordered List — each <ol> wrapper resets the counter */
.notectl-list--ordered {
	counter-reset: notectl-ordered;
}

/* List Items */
.notectl-list-item {
	margin: 0;
	padding: 2px 0 2px 24px;
	min-height: 1.6em;
	position: relative;
}

.notectl-list-item::before {
	position: absolute;
	left: 0;
	display: inline-block;
	width: 24px;
	text-align: center;
}

/* Bullet List */
.notectl-list-item--bullet::before {
	content: '\\2022';
	color: var(--notectl-fg);
}

/* Ordered List — counter increment per item */
.notectl-list-item--ordered {
	counter-increment: notectl-ordered;
}

.notectl-list-item--ordered::before {
	content: counter(notectl-ordered) '.';
	color: var(--notectl-fg);
	font-size: 14px;
}

/* Checklist */
.notectl-list-item--checklist::before {
	content: '\\2610';
	font-size: 16px;
	color: var(--notectl-fg-muted);
	cursor: pointer;
}

.notectl-list-item--checklist[data-checked="true"]::before {
	content: '\\2611';
	color: var(--notectl-success);
}

.notectl-list-item--checklist[data-checked="true"] {
	color: var(--notectl-fg-muted);
	text-decoration: line-through;
}

/* Horizontal Rule */
.notectl-content hr {
	border: none;
	border-top: 1px solid var(--notectl-border);
	margin: 8px 0;
	padding: 0;
	cursor: default;
	user-select: none;
}

/* Image */
.notectl-image {
	margin: 8px 0;
	user-select: none;
	line-height: 0;
}

.notectl-image--center {
	text-align: center;
}

.notectl-image--left {
	text-align: left;
}

.notectl-image--right {
	text-align: right;
}

.notectl-image__container {
	display: inline-block;
	position: relative;
	line-height: 0;
}

.notectl-image__img {
	display: block;
	max-width: 100%;
	border-radius: 4px;
}

.notectl-image--selected .notectl-image__container {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
	border-radius: 6px;
}

/* Alignment toolbar (appears on image selection) */
.notectl-image__align-toolbar {
	display: flex;
	gap: 2px;
	position: absolute;
	top: -36px;
	left: 50%;
	transform: translateX(-50%);
	background: var(--notectl-surface-overlay);
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	padding: 2px;
	box-shadow: 0 2px 8px var(--notectl-shadow);
	z-index: 10;
}

.notectl-image__align-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: none;
	background: transparent;
	border-radius: 4px;
	cursor: pointer;
	color: var(--notectl-fg);
}

.notectl-image__align-btn:hover {
	background: var(--notectl-hover-bg);
}

.notectl-image__align-btn--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

.notectl-image__align-btn svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

/* Upload overlay */
.notectl-image__overlay {
	position: absolute;
	inset: 0;
	display: none;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.8);
	border-radius: 4px;
	font-size: 13px;
	color: var(--notectl-fg-muted);
}

.notectl-image__overlay--uploading {
	display: flex;
}

.notectl-image__overlay--error {
	display: flex;
	background: var(--notectl-danger-muted);
	color: var(--notectl-danger);
}

/* Resize overlay + handles */
.notectl-image__resize-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.notectl-image__resize-handle {
	position: absolute;
	width: 10px;
	height: 10px;
	background: var(--notectl-bg);
	border: 2px solid var(--notectl-primary);
	border-radius: 50%;
	pointer-events: all;
	z-index: 2;
	transition: transform 0.1s, background 0.1s;
}

.notectl-image__resize-handle:hover {
	background: var(--notectl-primary);
	transform: scale(1.3);
}

.notectl-image--resizing .notectl-image__resize-handle {
	background: var(--notectl-primary);
}

.notectl-image__resize-handle--nw {
	top: -5px;
	left: -5px;
	cursor: nwse-resize;
}

.notectl-image__resize-handle--ne {
	top: -5px;
	right: -5px;
	cursor: nesw-resize;
}

.notectl-image__resize-handle--sw {
	bottom: -5px;
	left: -5px;
	cursor: nesw-resize;
}

.notectl-image__resize-handle--se {
	bottom: -5px;
	right: -5px;
	cursor: nwse-resize;
}

/* Size indicator tooltip */
.notectl-image__size-indicator {
	position: absolute;
	bottom: -28px;
	left: 50%;
	transform: translateX(-50%);
	padding: 2px 8px;
	background: var(--notectl-tooltip-bg);
	color: var(--notectl-tooltip-fg);
	font-size: 11px;
	font-weight: 500;
	border-radius: 4px;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s;
	z-index: 3;
}

.notectl-image__size-indicator--visible {
	opacity: 1;
}

/* Keyboard resize hint (shown on selection, hidden during drag) */
.notectl-image__keyboard-hint {
	display: none;
	position: absolute;
	bottom: -28px;
	left: 50%;
	transform: translateX(-50%);
	padding: 2px 8px;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	white-space: nowrap;
	pointer-events: none;
	z-index: 3;
}

.notectl-image--selected .notectl-image__keyboard-hint {
	display: block;
}

.notectl-image--resizing .notectl-image__keyboard-hint {
	display: none;
}

/* Resizing feedback */
.notectl-image--resizing .notectl-image__img {
	opacity: 0.85;
}

/* Placeholder */
.notectl-content.notectl-content--empty::before {
	content: attr(data-placeholder);
	color: var(--notectl-fg-muted);
	pointer-events: none;
	position: absolute;
	top: 12px;
	left: 16px;
}

/* Plugin container bottom */
.notectl-plugin-container--bottom {
	border-top: 1px solid var(--notectl-border);
}

/* Color Picker Popup */
.notectl-color-picker {
	padding: 8px;
	min-width: 240px;
}

.notectl-color-picker__default {
	display: block;
	width: 100%;
	padding: 6px 12px;
	margin-bottom: 8px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
	cursor: pointer;
	font-size: 13px;
	color: var(--notectl-fg);
	text-align: center;
}

.notectl-color-picker__default:hover {
	background: var(--notectl-hover-bg);
}

.notectl-color-picker__grid {
	display: grid;
	grid-template-columns: repeat(10, 1fr);
	gap: 3px;
}

.notectl-color-picker__swatch {
	width: 22px;
	height: 22px;
	border: 1px solid transparent;
	border-radius: 3px;
	padding: 0;
	cursor: pointer;
	transition: transform 0.1s;
}

.notectl-color-picker__swatch:hover,
.notectl-color-picker__swatch:focus-visible {
	transform: scale(1.25);
	z-index: 1;
}

.notectl-color-picker__swatch:focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: 1px;
}

.notectl-color-picker__swatch--active {
	border: 2px solid var(--notectl-primary-fg);
	border-radius: 3px;
}

.notectl-toolbar-btn--textColor .notectl-toolbar-btn__color-indicator {
	display: block;
	width: 16px;
	height: 3px;
	margin-top: 1px;
	border-radius: 1px;
}

/* Font Select — Combobox-style toolbar button */
.notectl-toolbar-btn--font {
	width: auto;
	min-width: 100px;
	max-width: 160px;
	padding: 0 8px;
	gap: 4px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
}

.notectl-toolbar-btn--font:hover {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-fg-muted);
}

.notectl-toolbar-btn--font.notectl-toolbar-btn--active {
	background: var(--notectl-bg);
	border-color: var(--notectl-primary-muted);
}

.notectl-toolbar-btn--font .notectl-toolbar-btn__icon {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	overflow: hidden;
}

.notectl-toolbar-btn--font .notectl-toolbar-btn__icon svg {
	display: none;
}

.notectl-font-select__label {
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

.notectl-font-select__arrow {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	line-height: 30px;
}

/* Font Picker Popup */
.notectl-font-picker {
	min-width: 200px;
	max-height: 320px;
	overflow-y: auto;
}

.notectl-font-picker__list {
	padding: 4px 0;
}

.notectl-font-picker__item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 7px 12px;
	border: none;
	background: none;
	cursor: pointer;
	font-size: 14px;
	color: var(--notectl-fg);
	line-height: 1.4;
	text-align: left;
	white-space: nowrap;
	font-family: inherit;
	transition: background 0.1s;
}

.notectl-font-picker__item:hover {
	background: var(--notectl-hover-bg);
}

.notectl-font-picker__item--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

.notectl-font-picker__item--active:hover {
	background: var(--notectl-active-bg);
}

.notectl-font-picker__check {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	flex-shrink: 0;
	font-size: 13px;
	font-weight: 600;
	color: var(--notectl-primary-fg);
}

.notectl-font-picker__label {
	flex: 1;
}

.notectl-font-picker__separator {
	height: 1px;
	background: var(--notectl-border);
	margin: 4px 8px;
}

/* Heading Select — Combobox-style toolbar button */
.notectl-toolbar-btn--heading {
	width: auto;
	min-width: 100px;
	max-width: 160px;
	padding: 0 8px;
	gap: 4px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
}

.notectl-toolbar-btn--heading:hover {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-fg-muted);
}

.notectl-toolbar-btn--heading.notectl-toolbar-btn--active {
	background: var(--notectl-bg);
	border-color: var(--notectl-primary-muted);
}

.notectl-toolbar-btn--heading .notectl-toolbar-btn__icon {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	overflow: hidden;
}

.notectl-toolbar-btn--heading .notectl-toolbar-btn__icon svg {
	display: none;
}

.notectl-heading-select__label {
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

.notectl-heading-select__arrow {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	line-height: 30px;
}

/* Heading Picker Popup */
.notectl-heading-picker {
	min-width: 200px;
	max-height: 320px;
	overflow-y: auto;
}

.notectl-heading-picker__list {
	padding: 4px 0;
}

.notectl-heading-picker__item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 7px 12px;
	border: none;
	background: none;
	cursor: pointer;
	font-size: 14px;
	color: var(--notectl-fg);
	text-align: left;
	white-space: nowrap;
	font-family: inherit;
	transition: background 0.1s;
}

.notectl-heading-picker__item:hover {
	background: var(--notectl-hover-bg);
}

.notectl-heading-picker__item--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

.notectl-heading-picker__item--active:hover {
	background: var(--notectl-active-bg);
}

.notectl-heading-picker__check {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	flex-shrink: 0;
	font-size: 13px;
	font-weight: 600;
	color: var(--notectl-primary-fg);
}

.notectl-heading-picker__label {
	flex: 1;
}

/* Screen reader announcements */
.notectl-sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

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

/* Font Size Select — Combobox-style toolbar button */
.notectl-toolbar-btn--fontSize {
	width: auto;
	min-width: 60px;
	max-width: 80px;
	padding: 0 8px;
	gap: 4px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-bg);
}

.notectl-toolbar-btn--fontSize:hover {
	background: var(--notectl-hover-bg);
	border-color: var(--notectl-fg-muted);
}

.notectl-toolbar-btn--fontSize.notectl-toolbar-btn--active {
	background: var(--notectl-bg);
	border-color: var(--notectl-primary-muted);
}

.notectl-toolbar-btn--fontSize .notectl-toolbar-btn__icon {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	overflow: hidden;
}

.notectl-toolbar-btn--fontSize .notectl-toolbar-btn__icon svg {
	display: none;
}

.notectl-font-size-select__label {
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

.notectl-font-size-select__arrow {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	line-height: 30px;
}

/* Font Size Picker Popup */
.notectl-font-size-picker {
	min-width: 140px;
	display: flex;
	flex-direction: column;
}

.notectl-font-size-picker__input-wrapper {
	padding: 8px 8px 4px;
}

.notectl-font-size-picker__input {
	width: 100%;
	padding: 6px 8px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	font-size: 13px;
	font-family: inherit;
	color: var(--notectl-fg);
	background: var(--notectl-bg);
	outline: none;
	box-sizing: border-box;
	-moz-appearance: textfield;
}

.notectl-font-size-picker__input::-webkit-inner-spin-button,
.notectl-font-size-picker__input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.notectl-font-size-picker__input:focus {
	border-color: var(--notectl-border-focus);
	box-shadow: 0 0 0 2px var(--notectl-focus-ring);
}

.notectl-font-size-picker__list {
	max-height: 280px;
	overflow-y: auto;
	padding: 4px 0;
}

.notectl-font-size-picker__item {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 7px 12px;
	border: none;
	background: none;
	cursor: pointer;
	font-size: 14px;
	color: var(--notectl-fg);
	line-height: 1.4;
	text-align: left;
	white-space: nowrap;
	font-family: inherit;
	transition: background 0.1s;
	outline: none;
}

.notectl-font-size-picker__item:hover {
	background: var(--notectl-hover-bg);
}

.notectl-font-size-picker__item--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

.notectl-font-size-picker__item--active:hover {
	background: var(--notectl-active-bg);
}

.notectl-font-size-picker__item--focused {
	outline: 2px solid var(--notectl-primary);
	outline-offset: -2px;
}

.notectl-font-size-picker__check {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	flex-shrink: 0;
	font-size: 13px;
	font-weight: 600;
	color: var(--notectl-primary-fg);
}

.notectl-font-size-picker__label {
	flex: 1;
}

/* Code Block — uses theme custom properties */
.notectl-code-block {
	position: relative;
	margin: 8px 0;
	border-radius: 6px;
	background: var(--notectl-code-block-bg);
	color: var(--notectl-code-block-color);
	font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace;
	font-size: 14px;
	line-height: 1.5;
	overflow: hidden;
}

.notectl-code-block__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 12px;
	background: var(--notectl-code-block-header-bg);
	border-bottom: 1px solid var(--notectl-code-block-header-border);
	font-size: 12px;
	color: var(--notectl-code-block-header-color);
	user-select: none;
}

.notectl-code-block__language {
	font-weight: 500;
	letter-spacing: 0.02em;
}

.notectl-code-block__copy {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border: none;
	border-radius: 4px;
	background: transparent;
	color: var(--notectl-code-block-header-color);
	cursor: pointer;
	padding: 0;
	transition: background 0.15s, color 0.15s;
}

.notectl-code-block__copy:hover {
	background: rgba(128, 128, 128, 0.15);
	color: var(--notectl-code-block-color);
}

.notectl-code-block__copy svg {
	fill: currentColor;
}

.notectl-code-block__content {
	display: block;
	padding: 12px 16px;
	white-space: pre-wrap;
	word-wrap: break-word;
	tab-size: 4;
	-moz-tab-size: 4;
	outline: none;
	min-height: 1.5em;
}

.notectl-code-block--selected {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

.notectl-code-block__esc-hint {
	display: none;
	position: absolute;
	bottom: 4px;
	right: 8px;
	font-size: 11px;
	color: var(--notectl-code-block-header-color);
	opacity: 0.5;
	pointer-events: none;
	user-select: none;
	font-family: system-ui, sans-serif;
}

.notectl-code-block--focused .notectl-code-block__esc-hint {
	display: block;
}

/* Node selection */
.notectl-node-selected {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

/* Reduced motion preference (WCAG 2.3.3) */
@media (prefers-reduced-motion: reduce) {
	.notectl-toolbar-btn,
	.notectl-image__resize-handle,
	.notectl-image__size-indicator,
	.notectl-color-picker__swatch,
	.notectl-font-picker__item,
	.notectl-heading-picker__item,
	.notectl-font-size-picker__item,
	.ntbl-handle,
	.ntbl-handle-delete,
	.ntbl-insert-line,
	.ntbl-insert-btn,
	.ntbl-add-zone,
	.ntbl-add-icon,
	.ntbl-col-bar,
	.ntbl-row-bar,
	.ntbl-delete-table-btn,
	.notectl-code-block__copy {
		transition: none !important;
	}
}
`;

let cachedStyleSheet: CSSStyleSheet | null = null;

/** Returns the shared editor stylesheet. */
export function getEditorStyleSheet(): CSSStyleSheet {
	if (!cachedStyleSheet) {
		cachedStyleSheet = new CSSStyleSheet();
		cachedStyleSheet.replaceSync(EDITOR_CSS);
	}
	return cachedStyleSheet;
}
