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
} from './serialization/ContentHTMLTypes.js';
export {
	serializeDocumentToHTML,
	serializeDocumentToCSS,
	VALID_ALIGNMENTS,
} from './serialization/DocumentSerializer.js';
export { parseHTMLToDocument, type ParseHTMLOptions } from './serialization/DocumentParser.js';
