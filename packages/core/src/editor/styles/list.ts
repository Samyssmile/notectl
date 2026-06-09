/** Width of the list marker / checkbox area in pixels. */
export const LIST_MARKER_WIDTH = 24;

/** List styles — bullet, ordered, checklist items. */
export const LIST_CSS = `
/* List Wrappers — suppress native markers, we use ::before pseudo-elements */
.notectl-list {
	list-style: none;
	margin: 0;
	padding: 0;
}

/* Ordered List — each <ol> wrapper resets the counter */
.notectl-list--ordered {
	counter-reset: notectl-ordered;
}

/* List Items */
.notectl-list-item {
	margin: 0;
	padding: 2px 0;
	padding-inline-start: ${LIST_MARKER_WIDTH}px;
	min-height: 1.6em;
	position: relative;
}

.notectl-list-item::before {
	position: absolute;
	inset-inline-start: 0;
	display: inline-block;
	width: ${LIST_MARKER_WIDTH}px;
	text-align: center;
	-webkit-user-select: none;
	user-select: none;
	pointer-events: none;
}

/* Bullet List */
.notectl-list-item--bullet::before {
	content: '\\2022';
	color: var(--notectl-fg);
}

/* Ordered List — counter increment per item */
.notectl-list-item--ordered {
	counter-increment: notectl-ordered;
}

.notectl-list-item--ordered::before {
	content: counter(notectl-ordered) '.';
	color: var(--notectl-fg);
	font-size: 14px;
}

/* Checklist — the marker is a real role="checkbox" element (see ListMarker.ts)
   positioned over the reserved marker zone. inline-block keeps the parent's
   line-through (on checked items) from striking the glyph. */
.notectl-checklist-marker {
	position: absolute;
	inset-inline-start: 0;
	display: inline-block;
	width: ${LIST_MARKER_WIDTH}px;
	text-align: center;
	font-size: 16px;
	color: var(--notectl-fg-muted);
	cursor: pointer;
	text-decoration: none;
	-webkit-user-select: none;
	user-select: none;
}

.notectl-checklist-marker::before {
	content: '\\2610';
}

.notectl-list-item--checklist[data-checked="true"] .notectl-checklist-marker {
	color: var(--notectl-success);
}

.notectl-list-item--checklist[data-checked="true"] .notectl-checklist-marker::before {
	content: '\\2611';
}

.notectl-list-item--checklist[data-checked="true"] {
	color: var(--notectl-fg-muted);
	text-decoration: line-through;
}
`;
