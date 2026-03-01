/** Heading picker toolbar combobox + popup styles. */
export const HEADING_SELECT_CSS = `
/* Heading Select — Width overrides for combobox button */
.notectl-toolbar-btn--heading {
	min-width: 100px;
	max-width: 160px;
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

@media (hover: hover) {
	.notectl-heading-picker__item:hover {
		background: var(--notectl-hover-bg);
	}
}

.notectl-heading-picker__item--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

@media (hover: hover) {
	.notectl-heading-picker__item--active:hover {
		background: var(--notectl-active-bg);
	}
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
