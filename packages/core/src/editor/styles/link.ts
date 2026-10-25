/** Link preview styles; registered by LinkPlugin, including without a toolbar. */
export const LINK_CSS = `
.notectl-content[contenteditable="false"] a[href]:not([href=""]) {
	cursor: pointer;
}
.notectl-link-preview {
	display: flex;
	align-items: flex-start;
	gap: 4px;
	box-sizing: border-box;
	width: max-content;
	max-width: min(360px, calc(100vw - 16px));
	margin: 0;
	padding: 6px;
	border: 1px solid var(--notectl-border);
	border-radius: 8px;
	background: var(--notectl-surface-overlay);
	color: var(--notectl-fg);
	box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
	font: 14px/1.4 var(--notectl-font-family, sans-serif);
}
.notectl-link-preview__open {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	min-height: 44px;
	box-sizing: border-box;
	padding: 6px 8px;
	border-radius: 4px;
	color: var(--notectl-fg);
	text-decoration: none;
	overflow-wrap: anywhere;
}
.notectl-link-preview__open > :first-child {
	text-decoration: underline;
	text-underline-offset: 2px;
}
.notectl-link-preview__url {
	color: var(--notectl-fg-muted);
	font-size: 12px;
	unicode-bidi: isolate;
}
.notectl-link-preview__close {
	flex: 0 0 44px;
	width: 44px;
	height: 44px;
	padding: 0;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: inherit;
	font-size: 22px;
	cursor: pointer;
}
.notectl-link-preview :focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: -2px;
}
@media (hover: hover) {
	.notectl-link-preview__open:hover,
	.notectl-link-preview__close:hover {
		background: var(--notectl-hover-bg);
	}
}
`;
