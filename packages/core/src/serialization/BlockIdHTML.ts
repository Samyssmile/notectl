/**
 * Shared rules for the `data-block-id` HTML wire format.
 *
 * Block identity round-trips through `getContentHTML` → `setContentHTML` so the
 * caret-preserving `EditorView.replaceState()` keeps the cursor on the same block
 * across content sync (Angular signal forms, RxJS pipes — see ARCHITECTURE §9.1).
 * Both serializer and parser must agree on the same shape; this module is the
 * single source of truth.
 */

import { type BlockId, blockId } from '../model/TypeBrands.js';

/**
 * Conservative pattern for `data-block-id` values: alphanumeric, underscore,
 * hyphen, max 64 chars. Defense-in-depth — IDs flow in-memory only, but we keep
 * the wire shape narrow to rule out attribute-injection vectors and to allow
 * `escapeAttr` to be a no-op for valid IDs.
 */
export const SAFE_BLOCK_ID_PATTERN: RegExp = /^[A-Za-z0-9_-]{1,64}$/;

/** True if `value` is shaped like a safe `data-block-id`. */
export function isSafeBlockId(value: string): boolean {
	return SAFE_BLOCK_ID_PATTERN.test(value);
}

/**
 * Adopts the `data-block-id` attribute from a parsed element so that block
 * identity survives an HTML round-trip. Returns `undefined` (caller generates
 * a fresh ID) when:
 *   - the attribute is missing (e.g. user-pasted external HTML),
 *   - the value is malformed,
 *   - or the value collides with an already-adopted ID in this parse pass
 *     (e.g. concatenated HTML from two documents).
 */
export function adoptBlockId(el: Element, used: Set<string>): BlockId | undefined {
	const raw: string | null = el.getAttribute('data-block-id');
	if (!raw) return undefined;
	if (!isSafeBlockId(raw)) return undefined;
	if (used.has(raw)) return undefined;
	used.add(raw);
	return blockId(raw);
}
