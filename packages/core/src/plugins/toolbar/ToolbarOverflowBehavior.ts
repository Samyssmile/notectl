/**
 * Controls how the toolbar responds when items exceed the available width.
 *
 * @example
 * ```typescript
 * const editor = await createEditor({
 *   toolbar: {
 *     groups: [[BoldPlugin, ItalicPlugin], [HeadingPlugin]],
 *     overflow: ToolbarOverflowBehavior.Flow,
 *   },
 * });
 * ```
 */
export const ToolbarOverflowBehavior = {
	/** Items that don't fit are hidden behind a "..." dropdown button. Default. */
	BurgerMenu: 'burger-menu',
	/** Toolbar wraps to additional rows when items overflow. Pure CSS, no JS measurement. */
	Flow: 'flow',
	/** No responsive behavior; the toolbar clips at the container boundary. */
	None: 'none',
} as const;

export type ToolbarOverflowBehavior =
	(typeof ToolbarOverflowBehavior)[keyof typeof ToolbarOverflowBehavior];
