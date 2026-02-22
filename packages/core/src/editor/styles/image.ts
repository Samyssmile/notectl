/** Image styles — display, alignment, resize handles, upload overlay. */
export const IMAGE_CSS = `
/* Image */
.notectl-image {
	margin: 8px 0;
	user-select: none;
	line-height: 0;
}

.notectl-image--center {
	text-align: center;
}

.notectl-image--left {
	text-align: left;
}

.notectl-image--right {
	text-align: right;
}

.notectl-image__container {
	display: inline-block;
	position: relative;
	line-height: 0;
}

.notectl-image__img {
	display: block;
	max-width: 100%;
	border-radius: 4px;
}

.notectl-image--selected .notectl-image__container {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
	border-radius: 6px;
}

/* Alignment toolbar (appears on image selection) */
.notectl-image__align-toolbar {
	display: flex;
	gap: 2px;
	position: absolute;
	top: -36px;
	left: 50%;
	transform: translateX(-50%);
	background: var(--notectl-surface-overlay);
	border: 1px solid var(--notectl-border);
	border-radius: 6px;
	padding: 2px;
	box-shadow: 0 2px 8px var(--notectl-shadow);
	z-index: 10;
}

.notectl-image__align-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: none;
	background: transparent;
	border-radius: 4px;
	cursor: pointer;
	color: var(--notectl-fg);
}

.notectl-image__align-btn:hover {
	background: var(--notectl-hover-bg);
}

.notectl-image__align-btn--active {
	background: var(--notectl-active-bg);
	color: var(--notectl-primary-fg);
}

.notectl-image__align-btn svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

/* Upload overlay */
.notectl-image__overlay {
	position: absolute;
	inset: 0;
	display: none;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.8);
	border-radius: 4px;
	font-size: 13px;
	color: var(--notectl-fg-muted);
}

.notectl-image__overlay--uploading {
	display: flex;
}

.notectl-image__overlay--error {
	display: flex;
	background: var(--notectl-danger-muted);
	color: var(--notectl-danger);
}

/* Resize overlay + handles */
.notectl-image__resize-overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.notectl-image__resize-handle {
	position: absolute;
	width: 10px;
	height: 10px;
	background: var(--notectl-bg);
	border: 2px solid var(--notectl-primary);
	border-radius: 50%;
	pointer-events: all;
	z-index: 2;
	transition: transform 0.1s, background 0.1s;
}

.notectl-image__resize-handle:hover {
	background: var(--notectl-primary);
	transform: scale(1.3);
}

.notectl-image--resizing .notectl-image__resize-handle {
	background: var(--notectl-primary);
}

.notectl-image__resize-handle--nw {
	top: -5px;
	left: -5px;
	cursor: nwse-resize;
}

.notectl-image__resize-handle--ne {
	top: -5px;
	right: -5px;
	cursor: nesw-resize;
}

.notectl-image__resize-handle--sw {
	bottom: -5px;
	left: -5px;
	cursor: nesw-resize;
}

.notectl-image__resize-handle--se {
	bottom: -5px;
	right: -5px;
	cursor: nwse-resize;
}

/* Size indicator tooltip */
.notectl-image__size-indicator {
	position: absolute;
	bottom: -28px;
	left: 50%;
	transform: translateX(-50%);
	padding: 2px 8px;
	background: var(--notectl-tooltip-bg);
	color: var(--notectl-tooltip-fg);
	font-size: 11px;
	font-weight: 500;
	border-radius: 4px;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s;
	z-index: 3;
}

.notectl-image__size-indicator--visible {
	opacity: 1;
}

/* Keyboard resize hint (shown on selection, hidden during drag) */
.notectl-image__keyboard-hint {
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

.notectl-image--selected .notectl-image__keyboard-hint {
	display: block;
}

.notectl-image--resizing .notectl-image__keyboard-hint {
	display: none;
}

/* Resizing feedback */
.notectl-image--resizing .notectl-image__img {
	opacity: 0.85;
}
`;
