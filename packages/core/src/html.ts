/**
 * HTML serialization and parsing entry point.
 *
 * Import from '@notectl/core/html' to access the DocumentSerializer,
 * DocumentParser, and content HTML types without pulling them into the
 * main bundle.
 *
 * @example
 * ```ts
 * import { serializeDocumentToHTML, parseHTMLToDocument } from '@notectl/core/html';
 * ```
 */
export type {
	CSSMode,
	ContentHTMLOptions,
	ContentCSSResult,
	SetContentHTMLOptions,
} from './serialization/index.js';
export {
	serializeDocumentToHTML,
	serializeDocumentToCSS,
	VALID_ALIGNMENTS,
	VALID_DIRECTIONS,
} from './serialization/index.js';
export { parseHTMLToDocument, type ParseHTMLOptions } from './serialization/index.js';
