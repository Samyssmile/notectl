/**
 * SanitizeConfig: declares which HTML tags and attributes a spec needs
 * to survive DOMPurify sanitization.
 */

export interface SanitizeConfig {
	readonly tags?: readonly string[];
	readonly attrs?: readonly string[];
}
