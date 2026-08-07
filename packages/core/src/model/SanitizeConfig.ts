/** Validates one schema-owned element after DOMPurify has parsed it. */
export type ElementSanitizeValidator = (element: Element) => boolean;

/**
 * SanitizeConfig: declares which HTML tags and attributes a spec needs
 * to survive DOMPurify sanitization.
 *
 * Structural allowlists alone cannot express value-dependent security rules
 * such as an iframe hostname policy. `elementValidators` keeps those rules
 * owned by the same schema registry as the tags they authorize; all validators
 * registered for a tag must pass or the element is removed.
 */

export interface SanitizeConfig {
	readonly tags?: readonly string[];
	readonly attrs?: readonly string[];
	readonly elementValidators?: Readonly<Record<string, ElementSanitizeValidator>>;
}
