import createDOMPurify, { type Config, type DOMPurify } from 'dompurify';
import type { ElementSanitizeValidator } from '../model/SanitizeConfig.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';

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

/**
 * Sanitizes HTML in an isolated DOMPurify instance.
 *
 * DOMPurify hooks are mutable instance state. Reusing its module singleton
 * would let one editor widen another editor's policy—or remove a hook owned by
 * unrelated application code. A fresh instance makes the invocation the
 * ownership boundary, while schema validators carry the calling editor's exact
 * plugin policy into that invocation.
 */
export function sanitizeHTML(html: string, config: Config, registry?: SchemaRegistry): string {
	const sanitizer: DOMPurify = createDOMPurify(window);
	const validators: ReadonlyMap<string, readonly ElementSanitizeValidator[]> | undefined =
		registry?.getElementSanitizeValidators?.();

	if (validators && validators.size > 0) {
		sanitizer.addHook('uponSanitizeElement', (node: Node) => {
			if (node.nodeType !== Node.ELEMENT_NODE) return;
			const element = node as Element;
			const elementValidators = validators.get(element.localName.toLowerCase());
			if (!elementValidators) return;

			for (const validate of elementValidators) {
				let valid = false;
				try {
					valid = validate(element);
				} catch {
					// Plugin-provided security validators fail closed.
				}
				if (!valid) {
					element.parentNode?.removeChild(element);
					return;
				}
			}
		});
	}

	return sanitizer.sanitize(html, config);
}
