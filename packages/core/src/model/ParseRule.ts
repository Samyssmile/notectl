/**
 * ParseRule: describes how an HTML element maps to a document node or mark.
 * Used by plugins to declare their HTML parsing behavior.
 */

export interface ParseRule {
	readonly tag: string;
	readonly getAttrs?: (el: HTMLElement) => Record<string, unknown> | false;
	/** Higher priority rules are matched first. Default: 50. */
	readonly priority?: number;
}
