import { describe, expect, it } from 'vitest';
import type { DetectionResult } from '../SmartPasteTypes.js';
import { XmlDetector } from './XmlDetector.js';

// --- Tests ---

describe('XmlDetector', () => {
	describe('id', () => {
		it('has id "xml"', () => {
			// Arrange
			const detector = new XmlDetector();

			// Assert
			expect(detector.id).toBe('xml');
		});
	});

	describe('detect — valid XML documents', () => {
		it('detects a simple XML element', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><child>text</child></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('xml');
			expect(result?.confidence).toBe(0.85);
		});

		it('returns formatted text with 2-space indentation', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><child><item>text</item></child></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toBe(
				'<root>\n  <child>\n    <item>text</item>\n  </child>\n</root>',
			);
		});

		it('detects XML with declaration', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<?xml version="1.0" encoding="UTF-8"?><root><item/></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('xml');
			expect(result?.formattedText).toContain('<?xml');
		});

		it('detects deeply nested XML', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<a><b><c><d>deep</d></c></b></a>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			const formatted: string = result?.formattedText ?? '';
			expect(formatted).toContain('<a>');
			expect(formatted).toContain('  <b>');
			expect(formatted).toContain('    <c>');
			expect(formatted).toContain('      <d>');
		});

		it('detects XML with attributes', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<person name="Alice" age="30"><email>a@b.com</email></person>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('name="Alice"');
		});

		it('detects XML with self-closing tags', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<config><setting key="theme" value="dark"/></config>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('/>');
		});

		it('detects XML with namespaced elements', () => {
			// Arrange
			const detector = new XmlDetector();
			const input =
				'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="test"/></xs:schema>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('xs:schema');
		});

		it('detects XML with comments', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><!-- a comment --><child/></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('<!-- a comment -->');
		});

		it('detects XML with CDATA section', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><![CDATA[some <raw> data]]></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('<![CDATA[');
		});
	});

	describe('detect — whitespace trimming', () => {
		it('detects XML with leading whitespace', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '   <root><child/></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('xml');
		});

		it('detects XML with trailing whitespace', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><child/></root>   ';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('detects XML surrounded by newlines', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '\n\n<root><child/></root>\n\n';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});
	});

	describe('detect — returns null for non-XML', () => {
		it('returns null for plain text', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('Hello World');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for JSON', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('{"key": "value"}');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for unclosed tags', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('<root><child>text</child>');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for mismatched tags', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('<root><child>text</other></root>');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for text starting with < but not a valid tag', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('< not xml >');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for HTML fragments without closing tags', () => {
			// Arrange
			const detector = new XmlDetector();

			// Act
			const result: DetectionResult | null = detector.detect('<br><hr>');

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('detect — edge cases', () => {
		it('detects single self-closing element', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<empty-element attr="value"/>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('xml');
		});

		it('detects XML with mixed content', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<doc><para>Some text with <bold>emphasis</bold> inside.</para></doc>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('detects XML with processing instructions', () => {
			// Arrange
			const detector = new XmlDetector();
			const input =
				'<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="style.xsl"?><root/>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('handles XML with single quotes in attributes', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = "<root attr='value'><child/></root>";

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('has lower confidence than JSON detector', () => {
			// Arrange
			const detector = new XmlDetector();
			const input = '<root><child>text</child></root>';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert — XML confidence (0.85) is lower than JSON (0.9)
			expect(result?.confidence).toBe(0.85);
		});
	});
});
