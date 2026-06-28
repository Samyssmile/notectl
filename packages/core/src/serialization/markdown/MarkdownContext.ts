/**
 * Resolved serialization options and the context threaded through the Markdown
 * serializer. Kept separate from the serializer modules so block/inline
 * serializers can share the type without a circular import.
 */

import type { MarkdownExportContext } from '../../model/NodeSpec.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import type { MarkdownSerializeOptions } from '../MarkdownTypes.js';

/** Fully-resolved serialization options (no `undefined`). */
export interface ResolvedSerializeOptions {
	readonly flavor: 'commonmark' | 'gfm';
	readonly gfm: boolean;
	readonly htmlFallback: boolean;
	readonly headingStyle: 'atx' | 'setext';
	readonly bullet: string;
	readonly emphasis: string;
	readonly codeFence: string;
	readonly listIndent: number;
}

/** Internal context shared by all serialization helpers. */
export interface SerContext {
	readonly registry?: SchemaRegistry;
	readonly opts: ResolvedSerializeOptions;
	/** Precomputed mark rank map (built once per pass) for HTML-fallback marks. */
	readonly markOrder?: Map<string, number>;
}

/** Resolves user-facing options into a complete settings object with defaults. */
export function resolveSerializeOptions(
	options?: MarkdownSerializeOptions,
): ResolvedSerializeOptions {
	const flavor: 'commonmark' | 'gfm' = options?.flavor ?? 'gfm';
	return {
		flavor,
		gfm: flavor === 'gfm',
		htmlFallback: options?.htmlFallback !== false,
		headingStyle: options?.headingStyle ?? 'atx',
		bullet: options?.bullet ?? '-',
		emphasis: options?.emphasis ?? '*',
		codeFence: options?.codeFence ?? '```',
		listIndent: options?.listIndent ?? 2,
	};
}

/** Builds the public {@link MarkdownExportContext} passed to per-spec hooks. */
export function exportContext(opts: ResolvedSerializeOptions): MarkdownExportContext {
	return { flavor: opts.flavor, htmlFallback: opts.htmlFallback };
}
