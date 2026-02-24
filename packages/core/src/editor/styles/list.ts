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
	padding: 2px 0 2px ${LIST_MARKER_WIDTH}px;
	min-height: 1.6em;
	position: relative;
}

.notectl-list-item::before {
	position: absolute;
	left: 0;
	display: inline-block;
	width: ${LIST_MARKER_WIDTH}px;
	text-align: center;
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

/* Checklist */
.notectl-list-item--checklist::before {
	content: '\\2610';
	font-size: 16px;
	color: var(--notectl-fg-muted);
	cursor: pointer;
}

.notectl-list-item--checklist[data-checked="true"]::before {
	content: '\\2611';
	color: var(--notectl-success);
}

.notectl-list-item--checklist[data-checked="true"] {
	color: var(--notectl-fg-muted);
	text-decoration: line-through;
}
`;
