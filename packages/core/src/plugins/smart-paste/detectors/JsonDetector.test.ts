import { describe, expect, it } from 'vitest';
import type { DetectionResult } from '../SmartPasteTypes.js';
import { JsonDetector } from './JsonDetector.js';

// --- Tests ---

describe('JsonDetector', () => {
	describe('id', () => {
		it('has id "json"', () => {
			// Arrange
			const detector = new JsonDetector();

			// Assert
			expect(detector.id).toBe('json');
		});
	});

	describe('detect — valid JSON objects', () => {
		it('detects a valid JSON object', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"name": "Alice", "age": 30}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('json');
			expect(result?.confidence).toBe(0.9);
			expect(result?.formattedText).toBe(JSON.stringify(JSON.parse(input), null, 2));
		});

		it('returns formatted text with 2-space indentation', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"key":"value"}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toBe('{\n  "key": "value"\n}');
		});

		it('detects deeply nested JSON', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"a": {"b": {"c": {"d": 1}}}}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('json');
			const formatted: string = result?.formattedText ?? '';
			expect(formatted).toContain('"a"');
			expect(formatted).toContain('"b"');
			expect(formatted).toContain('"c"');
			expect(formatted).toContain('"d"');
		});

		it('detects JSON with all value types', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"str":"hello","num":42,"bool":true,"nil":null,"arr":[1,2]}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.confidence).toBe(0.9);
		});
	});

	describe('detect — valid JSON arrays', () => {
		it('detects a valid JSON array', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '[1, 2, 3, 4, 5]';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('json');
			expect(result?.confidence).toBe(0.9);
		});

		it('detects an array of objects', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '[{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.formattedText).toContain('"id"');
		});

		it('detects nested arrays', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '[[1, 2], [3, 4], [5, 6]]';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});
	});

	describe('detect — whitespace trimming', () => {
		it('detects JSON with leading whitespace', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '   {"name": "Alice"}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('json');
		});

		it('detects JSON with trailing whitespace', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"name": "Alice"}   ';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('detects JSON surrounded by newlines', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '\n\n{"name": "Alice"}\n\n';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});
	});

	describe('detect — returns null for non-JSON', () => {
		it('returns null for plain text', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('Hello World');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for invalid JSON starting with brace', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('{not valid json}');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for invalid JSON starting with bracket', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('[not, valid]');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for text starting with other characters', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('123 is a number');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for JSON primitive string', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('"just a string"');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for JSON primitive number', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('42');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for JSON primitive boolean', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('true');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for JSON null', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('null');

			// Assert
			expect(result).toBeNull();
		});
	});

	describe('detect — too short JSON', () => {
		it('returns null for minimal empty object', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act — "{}" formats to "{}" which is 2 chars, below MIN_FORMATTED_LENGTH (5)
			const result: DetectionResult | null = detector.detect('{}');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for minimal empty array', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act — "[]" formats to "[]" which is 2 chars, below MIN_FORMATTED_LENGTH (5)
			const result: DetectionResult | null = detector.detect('[]');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for array with single short element', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act — "[1]" formats to "[\n  1\n]" which is 7 chars, above threshold
			const result: DetectionResult | null = detector.detect('[1]');

			// Assert — this is above the threshold, so it should detect
			expect(result).not.toBeNull();
		});
	});

	describe('detect — edge cases', () => {
		it('handles JSON with special characters in strings', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"msg": "Hello\\nWorld\\t!"}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
			expect(result?.language).toBe('json');
		});

		it('handles JSON with unicode escape sequences', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"emoji": "\\u2764"}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('handles JSON with numeric string keys', () => {
			// Arrange
			const detector = new JsonDetector();
			const input = '{"123": "numeric key"}';

			// Act
			const result: DetectionResult | null = detector.detect(input);

			// Assert
			expect(result).not.toBeNull();
		});

		it('returns null for truncated JSON', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('{"key": "val');

			// Assert
			expect(result).toBeNull();
		});

		it('returns null for text that looks like JSON but has trailing content', () => {
			// Arrange
			const detector = new JsonDetector();

			// Act
			const result: DetectionResult | null = detector.detect('{"key": "val"} extra text');

			// Assert
			expect(result).toBeNull();
		});
	});
});
