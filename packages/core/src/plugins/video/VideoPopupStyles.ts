/** Styles for the video insert/edit overlay panel and its form. */
export const VIDEO_POPUP_CSS = `
.notectl-video-overlay {
	position: fixed;
	z-index: 1000;
	box-sizing: border-box;
	min-width: 300px;
	max-width: 92vw;
	padding: 12px;
	border: 1px solid var(--notectl-border);
	border-radius: 8px;
	background: var(--notectl-surface-overlay);
	color: var(--notectl-fg);
	box-shadow: 0 6px 24px var(--notectl-shadow);
}

.notectl-video-popup {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.notectl-video-popup__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.notectl-video-popup__label {
	font-size: 12px;
	font-weight: 600;
	color: var(--notectl-fg-muted);
}

.notectl-video-popup__input,
.notectl-video-popup__select {
	width: 100%;
	padding: 6px 8px;
	box-sizing: border-box;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
	font: inherit;
}

.notectl-video-popup__input:focus-visible,
.notectl-video-popup__select:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 1px;
}

.notectl-video-popup__hint {
	margin: 0;
	font-size: 11px;
	color: var(--notectl-fg-muted);
}

.notectl-video-popup__error:not(:empty) {
	margin: 0;
	padding: 6px 8px;
	border-radius: 4px;
	background: var(--notectl-danger-muted);
	color: var(--notectl-danger);
	font-size: 12px;
}

.notectl-video-popup__actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 2px;
}

.notectl-video-popup__cancel,
.notectl-video-popup__submit {
	padding: 7px 14px;
	cursor: pointer;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
	font: inherit;
}

.notectl-video-popup__submit {
	border-color: var(--notectl-primary);
	background: var(--notectl-primary);
	color: var(--notectl-primary-fg);
	font-weight: 600;
}

.notectl-video-popup__cancel:focus-visible,
.notectl-video-popup__submit:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

/* Ask-first paste affordance */
.notectl-video-embed-prompt {
	position: fixed;
	z-index: 1000;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px 6px 12px;
	border: 1px solid var(--notectl-border);
	border-radius: 8px;
	background: var(--notectl-surface-overlay);
	color: var(--notectl-fg);
	box-shadow: 0 4px 16px var(--notectl-shadow);
	font-size: 13px;
}

.notectl-video-embed-prompt__text {
	margin-inline-end: 4px;
}

.notectl-video-embed-prompt__embed,
.notectl-video-embed-prompt__dismiss {
	padding: 4px 10px;
	cursor: pointer;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
	font: inherit;
}

.notectl-video-embed-prompt__embed {
	border-color: var(--notectl-primary);
	background: var(--notectl-primary);
	color: var(--notectl-primary-fg);
	font-weight: 600;
}

.notectl-video-embed-prompt__embed:focus-visible,
.notectl-video-embed-prompt__dismiss:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

@media (forced-colors: active) {
	.notectl-video-overlay,
	.notectl-video-embed-prompt {
		border: 1px solid CanvasText;
	}
	.notectl-video-popup__submit,
	.notectl-video-embed-prompt__embed {
		border: 1px solid ButtonText;
	}
}
`;
