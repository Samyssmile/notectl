/**
 * XML content detector — validates and formats XML for code block insertion.
 */

import { XML_ATTRS, XML_TAG_NAME } from '../../shared/XmlPatterns.js';
import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';

/** Minimum length for formatted XML to be considered meaningful. */
const MIN_FORMATTED_LENGTH = 10;

/** Confidence score for valid XML detected via structural analysis. */
const XML_CONFIDENCE = 0.85;

/** Matches any leading processing instructions like <?xml ...?> or <?xml-stylesheet ...?> */
const LEADING_PIS_PATTERN = /^(<\?[\s\S]*?\?>\s*)+/;

/** Matches an opening tag like <root> or <ns:tag attr="val"> */
const OPENING_TAG_PATTERN = new RegExp(`^<${XML_TAG_NAME}${XML_ATTRS}\\/?>`);

// --- Well-formedness regex (decomposed for readability) ---

const PI_FRAGMENT = '<\\?[^?]*\\?>';
const COMMENT_FRAGMENT = '<!--[\\s\\S]*?-->';
const CDATA_FRAGMENT = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
const CLOSING_TAG_FRAGMENT = `<\\/(${XML_TAG_NAME})>`;
const SELF_CLOSING_TAG_FRAGMENT = `<(${XML_TAG_NAME})${XML_ATTRS}\\/>`;
const OPENING_TAG_FRAGMENT = `<(${XML_TAG_NAME})${XML_ATTRS}>`;

const WELL_FORMED_TAG_PATTERN = new RegExp(
	[
		PI_FRAGMENT,
		COMMENT_FRAGMENT,
		CDATA_FRAGMENT,
		CLOSING_TAG_FRAGMENT,
		SELF_CLOSING_TAG_FRAGMENT,
		OPENING_TAG_FRAGMENT,
	].join('|'),
	'g',
);

/** Matches an inline element where open + close tag appear on the same token. */
const INLINE_ELEMENT_PATTERN = new RegExp(`<\\/${XML_TAG_NAME}>\\s*$`);

/**
 * Detects well-formed XML content and formats it with proper indentation.
 *
 * Detection strategy:
 * 1. Text must start with `<` (after trimming)
 * 2. Must begin with an XML declaration, processing instruction, or opening tag
 * 3. All opened tags must be properly closed (basic well-formedness check)
 * 4. Must contain at least one tag pair or self-closing tag
 */
export class XmlDetector implements ContentDetector {
	readonly id = 'xml';

	detect(text: string): DetectionResult | null {
		const trimmed: string = text.trim();
		if (!trimmed.startsWith('<')) return null;

		// Quick structural check: strip leading PIs, then must start with an opening tag
		const remainder: string = trimmed.replace(LEADING_PIS_PATTERN, '');
		if (!OPENING_TAG_PATTERN.test(remainder)) return null;

		// Validate well-formedness via tag balancing
		if (!this.isWellFormed(trimmed)) return null;

		const formatted: string = this.formatXml(trimmed);
		if (formatted.length <= MIN_FORMATTED_LENGTH) return null;

		return { language: 'xml', formattedText: formatted, confidence: XML_CONFIDENCE };
	}

	/**
	 * Checks basic XML well-formedness by verifying that all opened tags
	 * are properly closed in the correct nesting order.
	 */
	private isWellFormed(xml: string): boolean {
		const tagStack: string[] = [];
		let foundTag = false;

		// Reset lastIndex — RegExp with 'g' flag is stateful
		WELL_FORMED_TAG_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null = WELL_FORMED_TAG_PATTERN.exec(xml);

		while (match) {
			const closingTag: string | undefined = match[1];
			const selfClosingTag: string | undefined = match[2];
			const openingTag: string | undefined = match[3];

			if (closingTag) {
				if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== closingTag) {
					return false;
				}
				tagStack.pop();
				foundTag = true;
			} else if (selfClosingTag) {
				foundTag = true;
			} else if (openingTag) {
				tagStack.push(openingTag);
				foundTag = true;
			}

			match = WELL_FORMED_TAG_PATTERN.exec(xml);
		}

		return foundTag && tagStack.length === 0;
	}

	/**
	 * Formats XML with consistent 2-space indentation.
	 */
	private formatXml(xml: string): string {
		const tokens: string[] = this.splitIntoTokens(xml);
		const parts: string[] = [];
		let indent = 0;
		const INDENT_STEP = 2;

		for (const token of tokens) {
			const kind: XmlTokenKind = classifyXmlToken(token);
			const indentChange: IndentChange = INDENT_BEHAVIOR[kind];

			if (indentChange === 'decrease') {
				indent = Math.max(0, indent - 1);
			}

			parts.push(' '.repeat(indent * INDENT_STEP) + token);

			if (indentChange === 'increase') {
				indent++;
			}
		}

		return parts.join('\n');
	}

	/** Splits XML into line-level tokens by breaking between adjacent tags. */
	private splitIntoTokens(xml: string): string[] {
		return xml
			.replace(/>\s*</g, '>\n<')
			.split('\n')
			.map((line: string) => line.trim())
			.filter((line: string) => line.length > 0);
	}
}

// --- Token Classification ---

type XmlTokenKind =
	| 'pi'
	| 'comment'
	| 'cdata'
	| 'closing'
	| 'selfClosing'
	| 'inline'
	| 'opening'
	| 'text';
type IndentChange = 'increase' | 'decrease' | 'none';

const INDENT_BEHAVIOR: Readonly<Record<XmlTokenKind, IndentChange>> = {
	pi: 'none',
	comment: 'none',
	cdata: 'none',
	closing: 'decrease',
	selfClosing: 'none',
	inline: 'none',
	opening: 'increase',
	text: 'none',
};

function classifyXmlToken(token: string): XmlTokenKind {
	if (token.startsWith('<?')) return 'pi';
	if (token.startsWith('<!--')) return 'comment';
	if (token.startsWith('<![CDATA[')) return 'cdata';
	if (token.startsWith('</')) return 'closing';
	if (token.endsWith('/>')) return 'selfClosing';
	if (token.startsWith('<') && INLINE_ELEMENT_PATTERN.test(token)) return 'inline';
	if (token.startsWith('<')) return 'opening';
	return 'text';
}
