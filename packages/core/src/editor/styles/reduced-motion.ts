/** Reduced motion preference (WCAG 2.3.3). */
export const REDUCED_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
	.notectl-toolbar-btn,
	.notectl-image__resize-handle,
	.notectl-image__size-indicator,
	.notectl-color-picker__swatch,
	.notectl-font-picker__item,
	.notectl-heading-picker__item,
	.notectl-font-size-picker__item,
	.ntbl-handle,
	.ntbl-handle-delete,
	.ntbl-insert-line,
	.ntbl-insert-btn,
	.ntbl-add-zone,
	.ntbl-add-icon,
	.ntbl-col-bar,
	.ntbl-row-bar,
	.ntbl-delete-table-btn,
	.notectl-code-block__copy {
		transition: none !important;
	}
}
`;
