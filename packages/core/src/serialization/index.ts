/**
 * Public API for the serialization layer.
 *
 * Internal helpers (e.g. CSSClassCollector) are intentionally excluded.
 * Cross-layer consumers (input/, editor/) should import from this barrel
 * to avoid coupling to internal implementation details.
 */

export type {
	CSSMode,
	ContentHTMLOptions,
	ContentCSSResult,
	SetContentHTMLOptions,
} from './ContentHTMLTypes.js';

export {
	serializeDocumentToHTML,
	serializeDocumentToCSS,
	VALID_ALIGNMENTS,
	VALID_DIRECTIONS,
} from './DocumentSerializer.js';

export { parseHTMLToDocument, type ParseHTMLOptions } from './DocumentParser.js';

export {
	buildMarkOrder,
	serializeMarksToHTML,
	serializeMarksToClassHTML,
} from './MarkSerializer.js';
