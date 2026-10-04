/**
 * CSS declaration lists such as `color: red; font-family: 'A;B', serif`.
 * A semicolon inside quotes or parentheses (`url(data:…;base64,…)`) does not
 * end a declaration.
 */

/** Splits a declaration list into its trimmed, non-empty declarations. */
export function splitDeclarations(declarations: string): string[] {
	const parts: string[] = [];
	let quote: string | undefined;
	let depth = 0;
	let start = 0;
	for (let index = 0; index < declarations.length; index++) {
		const char: string = declarations.charAt(index);
		if (quote) {
			if (char === quote) quote = undefined;
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '(') {
			depth++;
		} else if (char === ')') {
			depth = Math.max(0, depth - 1);
		} else if (char === ';' && depth === 0) {
			parts.push(declarations.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(declarations.slice(start));
	return parts.map((part: string) => part.trim()).filter((part: string) => part.length > 0);
}
