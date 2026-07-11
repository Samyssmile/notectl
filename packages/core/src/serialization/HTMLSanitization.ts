/** DOMPurify options required to preserve semantic HTML IDs. */
export interface HTMLIdSanitizeConfig {
	readonly SANITIZE_DOM: false;
	readonly FORBID_ATTR?: string[];
}

/**
 * Builds the shared DOMPurify policy for HTML carrying document-local targets.
 *
 * DOMPurify's `SANITIZE_DOM` option removes otherwise valid IDs such as `target`
 * when their value matches a property on `document` or a form. Those removals
 * break the fragment-link contract. Callers may add attributes that a broad
 * sanitizer pass must always reject; schema-driven allowlists remain authoritative.
 */
export function preserveHTMLIdSanitizeConfig(
	...additionalForbiddenAttrs: readonly string[]
): HTMLIdSanitizeConfig {
	return additionalForbiddenAttrs.length > 0
		? { SANITIZE_DOM: false, FORBID_ATTR: [...additionalForbiddenAttrs] }
		: { SANITIZE_DOM: false };
}
