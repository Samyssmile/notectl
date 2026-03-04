import { describe, expect, it } from 'vitest';
import { RegexTokenizer } from '../RegexTokenizer.js';
import { XML_LANGUAGE } from './xml.js';

// --- Helpers ---

function tokenize(code: string): readonly { from: number; to: number; type: string }[] {
	const tokenizer = new RegexTokenizer([XML_LANGUAGE]);
	return tokenizer.tokenize(code, 'xml');
}

function tokenTypes(code: string): readonly string[] {
	return tokenize(code).map((t) => t.type);
}

// --- Tests ---

describe('XML language definition', () => {
	describe('language metadata', () => {
		it('has name "xml"', () => {
			expect(XML_LANGUAGE.name).toBe('xml');
		});

		it('includes "html" alias', () => {
			expect(XML_LANGUAGE.aliases).toContain('html');
		});

		it('includes "svg" alias', () => {
			expect(XML_LANGUAGE.aliases).toContain('svg');
		});

		it('includes "xhtml" alias', () => {
			expect(XML_LANGUAGE.aliases).toContain('xhtml');
		});

		it('includes "xsl" alias', () => {
			expect(XML_LANGUAGE.aliases).toContain('xsl');
		});
	});

	describe('tag names', () => {
		it('matches opening tag name with < prefix', () => {
			// Arrange & Act
			const tokens = tokenize('<div>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(4);
		});

		it('matches closing tag name with </ prefix', () => {
			// Arrange & Act
			const tokens = tokenize('</div>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(5);
		});

		it('matches namespaced tag name', () => {
			// Arrange & Act
			const tokens = tokenize('<xs:element>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(11);
		});

		it('matches tag name with hyphens', () => {
			// Arrange & Act
			const tokens = tokenize('<my-component>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(13);
		});

		it('matches tag name with dots', () => {
			// Arrange & Act
			const tokens = tokenize('<v1.0>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.to).toBe(5);
		});
	});

	describe('attributes', () => {
		it('matches attribute name followed by =', () => {
			// Arrange & Act — after <div consumed, space skipped, then class=
			const tokens = tokenize('<div class="foo">');

			// Assert
			const propTokens = tokens.filter((t) => t.type === 'property');
			expect(propTokens.length).toBe(1);
			expect(propTokens[0]?.from).toBe(5);
		});

		it('matches attribute name with namespace prefix', () => {
			// Arrange & Act
			const tokens = tokenize('<root xmlns:xs="http://example.com">');

			// Assert
			const propTokens = tokens.filter((t) => t.type === 'property');
			expect(propTokens.length).toBe(1);
		});

		it('matches multiple attributes', () => {
			// Arrange & Act
			const tokens = tokenize('<input type="text" name="field">');

			// Assert
			const propTokens = tokens.filter((t) => t.type === 'property');
			expect(propTokens.length).toBe(2);
		});

		it('matches attribute name with spaces before =', () => {
			// Arrange & Act
			const tokens = tokenize('<div class = "foo">');

			// Assert
			const propTokens = tokens.filter((t) => t.type === 'property');
			expect(propTokens.length).toBe(1);
		});
	});

	describe('attribute values (strings)', () => {
		it('matches double-quoted attribute value', () => {
			// Arrange & Act
			const tokens = tokenize('<div class="foo">');

			// Assert
			const stringTokens = tokens.filter((t) => t.type === 'string');
			expect(stringTokens.length).toBe(1);
		});

		it('matches single-quoted attribute value', () => {
			// Arrange & Act
			const tokens = tokenize("<div class='foo'>");

			// Assert
			const stringTokens = tokens.filter((t) => t.type === 'string');
			expect(stringTokens.length).toBe(1);
		});

		it('matches empty string attribute value', () => {
			// Arrange & Act
			const tokens = tokenize('<div class="">');

			// Assert
			const stringTokens = tokens.filter((t) => t.type === 'string');
			expect(stringTokens.length).toBe(1);
		});
	});

	describe('comments', () => {
		it('matches XML comment', () => {
			// Arrange & Act
			const tokens = tokenize('<!-- comment -->');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(16);
		});

		it('matches comment with special characters', () => {
			// Arrange & Act
			const tokens = tokenize('<!-- <tag> & "quotes" -->');

			// Assert
			expect(tokens[0]?.type).toBe('comment');
		});

		it('matches multi-line comment', () => {
			// Arrange & Act
			const tokens = tokenize('<!--\n  multi\n  line\n-->');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});
	});

	describe('CDATA sections', () => {
		it('matches CDATA section', () => {
			// Arrange & Act
			const tokens = tokenize('<![CDATA[raw content]]>');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(23);
		});

		it('matches CDATA with special characters', () => {
			// Arrange & Act
			const tokens = tokenize('<![CDATA[<tag> & "quotes"]]>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
		});
	});

	describe('processing instructions', () => {
		it('matches XML declaration', () => {
			// Arrange & Act
			const tokens = tokenize('<?xml version="1.0"?>');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(21);
		});

		it('matches processing instruction', () => {
			// Arrange & Act
			const tokens = tokenize('<?xml-stylesheet type="text/xsl"?>');

			// Assert
			expect(tokens[0]?.type).toBe('keyword');
		});
	});

	describe('punctuation', () => {
		it('matches closing angle bracket', () => {
			// Arrange & Act — <div> → keyword(<div) + punctuation(>)
			const tokens = tokenize('<div>');

			// Assert
			const punctTokens = tokens.filter((t) => t.type === 'punctuation');
			expect(punctTokens.length).toBe(1);
			expect(punctTokens[0]?.from).toBe(4);
		});

		it('matches self-closing />', () => {
			// Arrange & Act
			const tokens = tokenize('<br/>');

			// Assert
			const punctTokens = tokens.filter((t) => t.type === 'punctuation');
			expect(punctTokens.some((t) => t.from === 3 && t.to === 5)).toBe(true);
		});

		it('matches equals sign', () => {
			// Arrange & Act
			const tokens = tokenize('<div id="x">');

			// Assert
			const equalsTokens = tokens.filter(
				(t) => t.type === 'punctuation' && t.from === 7 && t.to === 8,
			);
			expect(equalsTokens.length).toBe(1);
		});
	});

	describe('text content', () => {
		it('does not tokenize text content between tags', () => {
			// Arrange & Act
			const tokens = tokenize('<p>hello world</p>');

			// Assert — text "hello world" should not appear as any token
			const textTokens = tokens.filter(
				(t) => t.from >= 3 && t.to <= 14 && t.type !== 'punctuation',
			);
			expect(textTokens).toEqual([]);
		});
	});

	describe('complex XML', () => {
		it('tokenizes a complete XML document', () => {
			// Arrange
			const xml = '<?xml version="1.0"?><root attr="val"><!-- comment --><child/></root>';

			// Act
			const types = tokenTypes(xml);

			// Assert
			expect(types).toContain('keyword');
			expect(types).toContain('property');
			expect(types).toContain('string');
			expect(types).toContain('comment');
			expect(types).toContain('punctuation');
		});

		it('tokenizes nested elements with attributes', () => {
			// Arrange
			const xml = '<parent id="1"><child name="a">text</child></parent>';

			// Act
			const tokens = tokenize(xml);

			// Assert
			const keywordTokens = tokens.filter((t) => t.type === 'keyword');
			// <parent, <child, </child, </parent
			expect(keywordTokens.length).toBe(4);

			const propTokens = tokens.filter((t) => t.type === 'property');
			// id, name
			expect(propTokens.length).toBe(2);
		});

		it('tokenizes self-closing tags correctly', () => {
			// Arrange
			const xml = '<root><empty/><another attr="v"/></root>';

			// Act
			const tokens = tokenize(xml);

			// Assert
			const selfCloseTokens = tokens.filter(
				(t) => t.type === 'punctuation' && xml.slice(t.from, t.to) === '/>',
			);
			expect(selfCloseTokens.length).toBe(2);
		});
	});
});
