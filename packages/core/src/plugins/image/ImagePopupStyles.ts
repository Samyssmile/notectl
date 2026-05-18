/** Image insert popup styles (file upload + URL input). */
export const IMAGE_POPUP_CSS = `
.notectl-image-popup {
	padding: 8px;
	min-width: 240px;
}

.notectl-image-popup__file-input {
	position: absolute;
	width: 0;
	height: 0;
	overflow: hidden;
	opacity: 0;
}

.notectl-image-popup__upload-btn {
	display: block;
	width: 100%;
	padding: 8px 12px;
	cursor: pointer;
	text-align: center;
	box-sizing: border-box;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
}

.notectl-image-popup__separator {
	display: flex;
	align-items: center;
	margin: 8px 0;
	color: var(--notectl-fg-muted);
	font-size: 12px;
}

.notectl-image-popup__separator-line {
	flex: 1;
	height: 1px;
	background: var(--notectl-border);
}

.notectl-image-popup__separator-text {
	padding: 0 8px;
}

.notectl-image-popup__url-input {
	width: 100%;
	padding: 6px 8px;
	box-sizing: border-box;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-overlay);
	color: var(--notectl-fg);
}

.notectl-image-popup__insert-btn {
	width: 100%;
	padding: 8px 12px;
	margin-top: 4px;
	cursor: pointer;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
}
`;
