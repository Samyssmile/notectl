/** Registry-owned iframe security policy for the video NodeSpec. */

import type { ElementSanitizeValidator } from '../../model/SanitizeConfig.js';
import { isAllowedEmbedSrc } from './VideoProviders.js';

/**
 * Creates an owner-specific validator. The host set is defensively copied so a
 * caller cannot widen the policy after the schema has been finalized.
 */
export function createVideoIframeSanitizeValidator(
	hosts: ReadonlySet<string>,
): ElementSanitizeValidator {
	const allowedHosts = new Set(hosts);
	return (element: Element): boolean => {
		if (element.hasAttribute('srcdoc')) return false;
		return isAllowedEmbedSrc(element.getAttribute('src') ?? '', allowedHosts);
	};
}
