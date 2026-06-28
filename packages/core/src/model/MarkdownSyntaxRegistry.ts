/**
 * MarkdownSyntaxRegistry: holds plugin-contributed Markdown grammar extensions
 * (e.g. the formula plugin's `$...$`).
 *
 * Lives in `model/` next to {@link InputRuleRegistry} so plugins can contribute
 * Markdown syntax through `PluginContext` WITHOUT importing the `serialization/`
 * layer (which would invert the dependency matrix). The Markdown engine reads
 * these extensions via the `syntaxExtensions` parse option, threaded in by the
 * editor, so the engine never imports `plugins/` and `SchemaRegistry` stays
 * purely structural (D4).
 */

/**
 * A plugin-contributed Markdown grammar extension (D4). Registered via
 * `PluginContext.registerMarkdownSyntax(...)` and threaded into the parser
 * through `MarkdownParseOptions.syntaxExtensions`, so the core grammar never
 * hard-codes plugin syntax such as `$...$` (formula).
 *
 * Defined in `model/` (not `serialization/`) so this layer stays the dependency
 * floor: `serialization/` re-exports the type, plugins import it from here.
 */
export interface MarkdownSyntaxExtension {
	/** Stable id for the contributing plugin (e.g. `formula`). */
	readonly id: string;
	/**
	 * Matches a plugin inline construct starting at `index` in `text`. Returns the
	 * produced inline-node descriptor plus the number of characters consumed, or
	 * `null` if no match. Must be linear-time (no backtracking regex).
	 */
	readonly matchInline?: (
		text: string,
		index: number,
	) => {
		readonly type: string;
		readonly attrs: Record<string, string | number | boolean>;
		readonly length: number;
	} | null;
	/**
	 * Matches a plugin block construct given the full source lines and the current
	 * line index. Returns the produced block descriptor plus the number of lines
	 * consumed, or `null` if no match.
	 */
	readonly matchBlock?: (
		lines: readonly string[],
		lineIndex: number,
	) => {
		readonly type: string;
		readonly attrs: Record<string, string | number | boolean>;
		readonly linesConsumed: number;
	} | null;
}

export class MarkdownSyntaxRegistry {
	private readonly _extensions: MarkdownSyntaxExtension[] = [];

	register(extension: MarkdownSyntaxExtension): void {
		this._extensions.push(extension);
	}

	getExtensions(): readonly MarkdownSyntaxExtension[] {
		return this._extensions;
	}

	clear(): void {
		this._extensions.length = 0;
	}
}
