/** Link bubble styles; registered by LinkPlugin, including without a toolbar. */
export const LINK_CSS = `
.notectl-content[contenteditable="false"] a[href]:not([href=""]) {
	cursor: pointer;
}
.notectl-link-bubble {
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
	font: inherit;
	font-size: 14px;
	line-height: 1.4;
}
.notectl-link-bubble__open {
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
.notectl-link-bubble__open > :first-child {
	text-decoration: underline;
	text-underline-offset: 2px;
}
.notectl-link-bubble__url {
	color: var(--notectl-fg-muted);
	font-size: 12px;
	unicode-bidi: isolate;
}
.notectl-link-bubble__close {
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
.notectl-link-bubble .notectl-link-popup__button { min-height: 44px; }
.notectl-link-bubble__close { min-width: 44px; }
.notectl-link-bubble input { box-sizing: border-box; max-width: 100%; }
.notectl-link-bubble > div { min-width: 0; }
.notectl-link-bubble :focus-visible {
	outline: 2px solid var(--notectl-focus-ring);
	outline-offset: -2px;
}
@media (hover: hover) {
	.notectl-link-bubble__open:hover,
	.notectl-link-bubble__close:hover {
		background: var(--notectl-hover-bg);
	}
}
.notectl-link-popup {
	min-width: min(200px, calc(100vw - 16px));
}

.notectl-link-popup__input {
	width: 100%;
	padding: 4px;
	box-sizing: border-box;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	font-size: 13px;
	color: var(--notectl-fg);
	background: var(--notectl-surface-overlay);
}


.notectl-link-popup__button {
	width: 100%;
	padding: 6px 12px;
	cursor: pointer;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-overlay);
	color: var(--notectl-fg);
	font-size: 13px;
}

.notectl-link-popup__button--apply {
	margin-top: 4px;
}

@media (hover: hover) {
	.notectl-link-popup__button:hover {
		background: var(--notectl-hover-bg);
	}
}


`;
