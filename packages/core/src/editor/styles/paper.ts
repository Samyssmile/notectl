/** Paper mode styles — viewport, surface, content overrides, and scale transitions. */

import {
	PAPER_MARGIN_HORIZONTAL_PX,
	PAPER_MARGIN_TOP_PX,
	PAPER_VIEWPORT_PADDING_PX,
} from '../PaperSize.js';

const PT: number = PAPER_MARGIN_TOP_PX;
const PH: number = PAPER_MARGIN_HORIZONTAL_PX;
const VP: number = PAPER_VIEWPORT_PADDING_PX;

export const PAPER_CSS: string = `
/* Paper viewport: scroll container with centered gray background */
.notectl-paper-viewport {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	background: var(--notectl-paper-viewport-bg, #e8e8e8);
	padding: ${VP}px 0;
}

/* Paper surface: white page with shadow, centered */
.notectl-paper-surface {
	margin: 0 auto;
	background: var(--notectl-bg);
	border-radius: 2px;
	box-shadow: 0 2px 8px var(--notectl-shadow, rgba(0, 0, 0, 0.15));
	transform-origin: top center;
	transition: transform 0.15s ease-out;
}

/* Content overrides in paper mode: wider document margins */
.notectl-editor[data-paper-mode] .notectl-content {
	flex: none;
	padding: ${PT}px ${PH}px;
	min-height: auto;
}

/* Placeholder position override for paper mode */
.notectl-editor[data-paper-mode] .notectl-content.notectl-content--empty::before {
	top: ${PT}px;
	left: ${PH}px;
}

/* Dark mode: darker viewport background */
:host([theme="dark"]) .notectl-paper-viewport {
	--notectl-paper-viewport-bg: #181825;
}

@media (prefers-reduced-motion: reduce) {
	.notectl-paper-surface {
		transition: none !important;
	}
}
`;
