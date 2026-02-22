/** Heading picker toolbar combobox + popup styles. */
export const HEADING_SELECT_CSS = `
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
`;
