/** Font size picker toolbar combobox + popup styles. */
export const FONT_SIZE_SELECT_CSS = `
/* Font Size Select — Width overrides for combobox button */
.notectl-toolbar-btn--fontSize {
	min-width: 60px;
	max-width: 80px;
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
`;
