/**
 * Resolved parse options and the context threaded through the Markdown parser.
 * Mirrors `MarkdownContext.ts` on the serialize side.
 */

import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import type { MarkdownParseOptions, MarkdownSyntaxExtension } from '../MarkdownTypes.js';

/** Fully-resolved parse options (no `undefined`). */
export interface ResolvedParseOptions {
	readonly flavor: 'commonmark' | 'gfm';
	readonly gfm: boolean;
	readonly extendedInlineSyntax: boolean;
	readonly htmlFallback: boolean;
	readonly syntaxExtensions: readonly MarkdownSyntaxExtension[];
}

/** Internal context shared by the block and inline parsers. */
export interface ParseContext {
	readonly registry?: SchemaRegistry;
	readonly opts: ResolvedParseOptions;
	/** Link reference definitions collected from the source (`[ref]: url "title"`). */
	readonly linkRefs: ReadonlyMap<string, { readonly href: string; readonly title?: string }>;
}

/** Resolves user-facing parse options into a complete settings object with defaults. */
export function resolveParseOptions(options?: MarkdownParseOptions): ResolvedParseOptions {
	const flavor: 'commonmark' | 'gfm' = options?.flavor ?? 'gfm';
	return {
		flavor,
		gfm: flavor === 'gfm',
		extendedInlineSyntax: options?.extendedInlineSyntax ?? false,
		htmlFallback: options?.htmlFallback !== false,
		syntaxExtensions: options?.syntaxExtensions ?? [],
	};
}
