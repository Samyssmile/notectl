/** Color picker popup styles (text-color + highlight plugins). */
export const COLOR_PICKER_CSS = `
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

.notectl-color-picker__grid [role="row"] {
	display: contents;
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
`;
