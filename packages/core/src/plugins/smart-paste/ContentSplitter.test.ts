import { describe, expect, it } from 'vitest';
import { mergeAdjacentSegments, splitAndClassify } from './ContentSplitter.js';
import type { ContentDetector, DetectionResult, PasteSegment } from './SmartPasteTypes.js';

// --- Helpers ---

/** Detector that matches text starting with '{' and containing ':'. */
const jsonLikeDetector: ContentDetector = {
	id: 'json',
	detect: (text: string): DetectionResult | null => {
		const trimmed: string = text.trim();
		if (trimmed.startsWith('{') && trimmed.includes(':')) {
			return { language: 'json', formattedText: trimmed, confidence: 0.9 };
		}
		return null;
	},
};

/** Detector that matches text containing 'class ' or 'public '. */
const javaLikeDetector: ContentDetector = {
	id: 'java',
	detect: (text: string): DetectionResult | null => {
		if (/\bclass\s+\w+/.test(text) || /\bpublic\s+/.test(text)) {
			return { language: 'java', formattedText: text.trim(), confidence: 0.8 };
		}
		return null;
	},
};

const bothDetectors: readonly ContentDetector[] = [jsonLikeDetector, javaLikeDetector];

// --- Tests ---

describe('ContentSplitter', () => {
	describe('splitAndClassify', () => {
		it('returns null for plain text without code', () => {
			const result = splitAndClassify('Hello World', bothDetectors);
			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			const result = splitAndClassify('', bothDetectors);
			expect(result).toBeNull();
		});

		it('returns null when all segments are text', () => {
			const result = splitAndClassify('Hello\n\nWorld\n\nFoo bar', bothDetectors);
			expect(result).toBeNull();
		});

		it('returns single segment for pure code', () => {
			const result = splitAndClassify('{ "key": "value" }', bothDetectors);
			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
			expect(result?.[0]?.detection?.language).toBe('json');
		});

		it('splits text + code into two segments', () => {
			const input = 'Lorem Ipsum\n\npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result?.[0]?.detection).toBeNull();
			expect(result?.[0]?.text).toBe('Lorem Ipsum');
			expect(result?.[1]?.detection?.language).toBe('java');
		});

		it('splits code + text into two segments', () => {
			const input = '{ "name": "Alice" }\n\nSome explanation text';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result?.[0]?.detection?.language).toBe('json');
			expect(result?.[1]?.detection).toBeNull();
			expect(result?.[1]?.text).toBe('Some explanation text');
		});

		it('splits text + code + text into three segments', () => {
			const input = 'Before\n\npublic class Bar {}\n\nAfter';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(3);
			expect(result?.[0]?.detection).toBeNull();
			expect(result?.[0]?.text).toBe('Before');
			expect(result?.[1]?.detection?.language).toBe('java');
			expect(result?.[2]?.detection).toBeNull();
			expect(result?.[2]?.text).toBe('After');
		});

		it('handles multiple consecutive blank lines as single boundary', () => {
			const input = 'Hello\n\n\n\npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result?.[0]?.text).toBe('Hello');
			expect(result?.[1]?.detection?.language).toBe('java');
		});

		it('handles blank lines with whitespace', () => {
			const input = 'Hello\n \t \npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
		});

		it('filters out whitespace-only segments', () => {
			const input = '  \n\npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
			expect(result?.[0]?.detection?.language).toBe('java');
		});

		it('keeps single segment when no blank lines exist', () => {
			const input = 'public class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
		});

		it('merges adjacent text segments', () => {
			const input = 'Hello\n\nWorld\n\npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result?.[0]?.detection).toBeNull();
			expect(result?.[0]?.text).toBe('Hello\n\nWorld');
			expect(result?.[1]?.detection?.language).toBe('java');
		});

		it('merges adjacent code segments of the same language', () => {
			const input = 'public class Foo {}\n\npublic class Bar {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
			expect(result?.[0]?.detection?.language).toBe('java');
			expect(result?.[0]?.detection?.formattedText).toContain('Foo');
			expect(result?.[0]?.detection?.formattedText).toContain('Bar');
		});

		it('keeps adjacent code segments of different languages separate', () => {
			const input = '{ "key": "value" }\n\npublic class Foo {}';
			const result = splitAndClassify(input, bothDetectors);

			expect(result).not.toBeNull();
			expect(result).toHaveLength(2);
			expect(result?.[0]?.detection?.language).toBe('json');
			expect(result?.[1]?.detection?.language).toBe('java');
		});

		it('returns null for no detectors', () => {
			const result = splitAndClassify('public class Foo {}', []);
			expect(result).toBeNull();
		});
	});

	describe('mergeAdjacentSegments', () => {
		it('returns single segment unchanged', () => {
			const segments: PasteSegment[] = [{ text: 'Hello', detection: null }];
			const result = mergeAdjacentSegments(segments);
			expect(result).toHaveLength(1);
		});

		it('returns empty array unchanged', () => {
			const result = mergeAdjacentSegments([]);
			expect(result).toHaveLength(0);
		});

		it('merges two text segments', () => {
			const segments: PasteSegment[] = [
				{ text: 'Hello', detection: null },
				{ text: 'World', detection: null },
			];
			const result = mergeAdjacentSegments(segments);

			expect(result).toHaveLength(1);
			expect(result[0]?.text).toBe('Hello\n\nWorld');
			expect(result[0]?.detection).toBeNull();
		});

		it('merges two code segments of the same language', () => {
			const det1: DetectionResult = {
				language: 'java',
				formattedText: 'class A {}',
				confidence: 0.8,
			};
			const det2: DetectionResult = {
				language: 'java',
				formattedText: 'class B {}',
				confidence: 0.7,
			};
			const segments: PasteSegment[] = [
				{ text: 'class A {}', detection: det1 },
				{ text: 'class B {}', detection: det2 },
			];
			const result = mergeAdjacentSegments(segments);

			expect(result).toHaveLength(1);
			expect(result[0]?.detection?.formattedText).toBe('class A {}\n\nclass B {}');
			expect(result[0]?.detection?.confidence).toBe(0.8);
		});

		it('does not merge text and code segments', () => {
			const det: DetectionResult = {
				language: 'java',
				formattedText: 'class Foo {}',
				confidence: 0.8,
			};
			const segments: PasteSegment[] = [
				{ text: 'Hello', detection: null },
				{ text: 'class Foo {}', detection: det },
			];
			const result = mergeAdjacentSegments(segments);

			expect(result).toHaveLength(2);
		});

		it('does not merge code segments of different languages', () => {
			const detJson: DetectionResult = {
				language: 'json',
				formattedText: '{}',
				confidence: 0.9,
			};
			const detJava: DetectionResult = {
				language: 'java',
				formattedText: 'class Foo {}',
				confidence: 0.8,
			};
			const segments: PasteSegment[] = [
				{ text: '{}', detection: detJson },
				{ text: 'class Foo {}', detection: detJava },
			];
			const result = mergeAdjacentSegments(segments);

			expect(result).toHaveLength(2);
		});
	});
});
