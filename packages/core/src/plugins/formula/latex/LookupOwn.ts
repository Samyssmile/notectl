/**
 * Looks up a registered LaTeX table value without consulting its prototype.
 * Use Object.hasOwn directly for membership when undefined is a valid value.
 */
export function lookupOwn<T>(table: Readonly<Record<string, T>>, name: string): T | undefined {
	return Object.hasOwn(table, name) ? table[name] : undefined;
}
