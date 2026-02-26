/** Font picker toolbar combobox + popup styles. */
export const FONT_SELECT_CSS = `
/* Font Select — Width overrides for combobox button */
.notectl-toolbar-btn--font {
	min-width: 100px;
	max-width: 160px;
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
`;
