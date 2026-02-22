/** Core editor styles — :host, .notectl-editor, .notectl-content, generic utilities. */
export const BASE_CSS = `
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

/* Horizontal Rule */
.notectl-content hr {
	border: none;
	border-top: 1px solid var(--notectl-border);
	margin: 8px 0;
	padding: 0;
	cursor: default;
	user-select: none;
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

/* Node selection */
.notectl-node-selected {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}
`;
