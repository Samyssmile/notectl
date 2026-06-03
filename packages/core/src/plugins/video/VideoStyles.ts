/** Video block styles: responsive frame, facade, player, resize, toolbar, caption. */
export const VIDEO_CSS = `
.notectl-video {
	margin: 12px 0;
	position: relative;
	user-select: none;
}

.notectl-video--center { text-align: center; }
.notectl-video--start { text-align: start; }
.notectl-video--end { text-align: end; }

.notectl-video__frame {
	display: inline-block;
	position: relative;
	width: 100%;
	max-width: 100%;
	vertical-align: top;
	overflow: hidden;
	border-radius: 8px;
	background: #000;
	text-align: start;
}

/* Facade (click-to-load) */
.notectl-video__facade {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: 0;
	cursor: pointer;
	background: #14181c;
	color: #fff;
}

.notectl-video__facade:focus-visible {
	outline: 3px solid var(--notectl-primary);
	outline-offset: -3px;
}

.notectl-video__poster {
	position: absolute;
	inset: 0;
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
}

.notectl-video__poster::after {
	content: "";
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.25);
}

.notectl-video__play-icon {
	position: relative;
	z-index: 1;
	display: inline-flex;
	filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
	transition: transform 0.12s ease;
}

.notectl-video__facade:hover .notectl-video__play-icon {
	transform: scale(1.08);
}

.notectl-video__badge {
	position: absolute;
	z-index: 1;
	bottom: 8px;
	inset-inline-start: 8px;
	padding: 2px 6px;
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.65);
	color: #fff;
	font-size: 12px;
	font-weight: 600;
}

/* Player (activated iframe + exit control) */
.notectl-video__player {
	position: absolute;
	inset: 0;
}

.notectl-video__iframe {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	border: 0;
	display: block;
}

.notectl-video__exit {
	position: absolute;
	z-index: 2;
	top: 6px;
	inset-inline-end: 6px;
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 0;
	border-radius: 50%;
	cursor: pointer;
	background: rgba(0, 0, 0, 0.65);
	color: #fff;
}

.notectl-video__exit:focus-visible {
	outline: 2px solid #fff;
	outline-offset: 2px;
}

/* Static fallback link (no-JS / export rehydration) */
.notectl-video__fallback-link {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 8px;
	color: #fff;
	text-decoration: underline;
	text-align: center;
}

/* Caption */
.notectl-video__caption {
	margin-top: 6px;
	font-size: 13px;
	color: var(--notectl-fg-muted);
	text-align: center;
}

/* Selection */
.notectl-video--selected .notectl-video__frame {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

/* Resize overlay + side handles */
.notectl-video__resize-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.notectl-video__resize-handle {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);
	width: 8px;
	height: 44px;
	max-height: 60%;
	border: 2px solid var(--notectl-primary);
	border-radius: 6px;
	background: var(--notectl-surface-raised);
	pointer-events: all;
	cursor: ew-resize;
	z-index: 2;
}

.notectl-video__resize-handle--w { inset-inline-start: -5px; }
.notectl-video__resize-handle--e { inset-inline-end: -5px; }

.notectl-video__size-indicator {
	position: absolute;
	bottom: -28px;
	left: 50%;
	transform: translateX(-50%);
	padding: 2px 8px;
	border-radius: 4px;
	background: var(--notectl-tooltip-bg);
	color: var(--notectl-tooltip-fg);
	font-size: 11px;
	font-weight: 500;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s;
	z-index: 3;
}

.notectl-video__size-indicator--visible { opacity: 1; }

.notectl-video__keyboard-hint {
	display: none;
	position: absolute;
	bottom: -28px;
	left: 50%;
	transform: translateX(-50%);
	padding: 2px 8px;
	font-size: 11px;
	color: var(--notectl-fg-muted);
	white-space: nowrap;
	pointer-events: none;
	z-index: 3;
}

.notectl-video--selected .notectl-video__keyboard-hint { display: block; }
.notectl-video__resize-overlay--active ~ .notectl-video__keyboard-hint,
.notectl-video__resize-overlay--active .notectl-video__keyboard-hint { display: none; }

/* On-selection toolbar */
.notectl-video__toolbar {
	position: absolute;
	top: -44px;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 2px;
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	background: var(--notectl-surface-overlay);
	box-shadow: 0 2px 8px var(--notectl-shadow);
	z-index: 10;
}

.notectl-video__tool {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: none;
	border-radius: 4px;
	background: transparent;
	cursor: pointer;
	color: var(--notectl-fg);
}

.notectl-video__tool:hover { background: var(--notectl-hover-bg); }

.notectl-video__tool--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary);
}

.notectl-video__tool:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 1px;
}

.notectl-video__tool svg { width: 16px; height: 16px; }

.notectl-video__tool-separator {
	width: 1px;
	height: 18px;
	margin: 0 2px;
	background: var(--notectl-border);
}

@media (prefers-reduced-motion: reduce) {
	.notectl-video__play-icon,
	.notectl-video__size-indicator {
		transition: none;
	}
}

@media (forced-colors: active) {
	.notectl-video__frame { outline: 1px solid CanvasText; }
	.notectl-video__facade { border: 1px solid ButtonText; }
	.notectl-video__play-icon { forced-color-adjust: none; }
	.notectl-video__resize-handle { background: ButtonFace; border-color: ButtonText; }
	.notectl-video--selected .notectl-video__frame { outline: 2px solid Highlight; }
}
`;
