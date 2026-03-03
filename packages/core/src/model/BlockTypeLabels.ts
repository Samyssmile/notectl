/**
 * Human-readable labels for block types.
 * Used by accessibility announcements (screen readers) when navigating between blocks.
 */

const BLOCK_TYPE_LABELS: Readonly<Record<string, string>> = {
	paragraph: 'Paragraph',
	heading: 'Heading',
	code_block: 'Code Block',
	blockquote: 'Block Quote',
	list_item: 'List Item',
	horizontal_rule: 'Horizontal Rule',
	image: 'Image',
	table: 'Table',
};

/** Returns a human-readable label for a block type (used in screen reader announcements). */
export function getBlockTypeLabel(typeName: string, attrs?: Record<string, unknown>): string {
	if (typeName === 'heading' && attrs?.level) {
		return `Heading ${attrs.level}`;
	}
	return BLOCK_TYPE_LABELS[typeName] ?? typeName;
}
