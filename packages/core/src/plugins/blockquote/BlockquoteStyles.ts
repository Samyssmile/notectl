/** Blockquote styles using CSS logical properties for RTL support. */
export const BLOCKQUOTE_CSS = `
.notectl-content blockquote {
	margin: 0;
	padding: 2px 0;
	padding-inline-start: 16px;
	border-inline-start: 3px solid var(--notectl-blockquote-border, var(--notectl-border));
	background: var(--notectl-blockquote-bg, transparent);
	color: var(--notectl-blockquote-fg, inherit);
	min-height: 1.6em;
}
`;
