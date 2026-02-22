/** Code block styles — syntax highlighting container, header, copy button. */
export const CODE_BLOCK_CSS = `
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
`;
