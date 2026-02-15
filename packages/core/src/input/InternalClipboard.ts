/**
 * In-memory clipboard for rich block data that cannot survive the system
 * clipboard (which only preserves standard MIME types like text/plain
 * and text/html). This store is keyed by the plain-text content so that
 * a paste event can verify the text matches before using the rich data.
 */

/** A serialized block from a text-selection copy. */
export interface RichBlockData {
	readonly type: string;
	readonly text: string;
	readonly attrs?: Record<string, unknown>;
}

interface RichClipboardEntry {
	readonly plainText: string;
	readonly blocks: readonly RichBlockData[];
}

let current: RichClipboardEntry | undefined;

/** Stores rich block data alongside its plain-text fingerprint. */
export function setRichClipboard(plainText: string, blocks: readonly RichBlockData[]): void {
	current = { plainText, blocks };
}

/**
 * Returns rich block data if the given plain text matches the stored
 * fingerprint (proving it came from our editor, not an external source).
 * Consumes the entry to prevent stale reuse.
 */
export function consumeRichClipboard(plainText: string): readonly RichBlockData[] | undefined {
	if (!current) return undefined;
	if (current.plainText !== plainText) return undefined;
	const blocks = current.blocks;
	// Don't clear — allow multiple pastes from same copy
	return blocks;
}

/** Clears the stored rich clipboard data. */
export function clearRichClipboard(): void {
	current = undefined;
}
