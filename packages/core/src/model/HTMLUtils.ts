/**
 * HTML string escaping utilities shared across serialization and parsing.
 */

/** Escapes special HTML characters in text content. */
export function escapeHTML(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
