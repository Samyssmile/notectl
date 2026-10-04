/**
 * Valid alignment values for block-level nodes.
 *
 * Uses CSS logical values (`start`/`end`) rather than physical
 * (`left`/`right`) for correct behavior with RTL text direction.
 */
export type BlockAlignment = 'start' | 'center' | 'end' | 'justify';

/** Every block alignment, in toolbar order. */
export const BLOCK_ALIGNMENTS: readonly BlockAlignment[] = ['start', 'center', 'end', 'justify'];

/** Narrows an arbitrary value to a {@link BlockAlignment}. */
export function isBlockAlignment(value: unknown): value is BlockAlignment {
	return (BLOCK_ALIGNMENTS as readonly unknown[]).includes(value);
}

/** The CSS declaration that renders `alignment` in HTML, e.g. `text-align: center`. */
export function alignmentDeclaration(alignment: BlockAlignment): string {
	return `text-align: ${alignment}`;
}
