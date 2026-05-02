import { describe, expect, it } from 'vitest';
import type { LanguageDefinition } from '../../code-block/highlighter/TokenizerTypes.js';
import { JAVA_LANGUAGE } from '../../code-block/highlighter/languages/java.js';
import { TYPESCRIPT_LANGUAGE } from '../../code-block/highlighter/languages/typescript.js';
import { JAVA_SUPPORT } from '../../language/bundles/JavaSupport.js';
import { TYPESCRIPT_SUPPORT } from '../../language/bundles/TypeScriptSupport.js';
import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';
import { LexerDetector } from './LexerDetector.js';

const javaDetector: ContentDetector = JAVA_SUPPORT.detection as ContentDetector;
const typescriptDetector: ContentDetector = TYPESCRIPT_SUPPORT.detection as ContentDetector;

function detectBoth(text: string): { java: DetectionResult | null; ts: DetectionResult | null } {
	return {
		java: javaDetector.detect(text),
		ts: typescriptDetector.detect(text),
	};
}

describe('LexerDetector', () => {
	describe('id', () => {
		it('exposes the language name', () => {
			expect(javaDetector.id).toBe('java');
			expect(typescriptDetector.id).toBe('typescript');
		});
	});

	describe('input gating', () => {
		it('returns null below the minimum line count', () => {
			expect(javaDetector.detect('public class Foo {}')).toBeNull();
			expect(typescriptDetector.detect("import x from 'y';")).toBeNull();
		});

		it('returns null beyond the configured maximum length', () => {
			const tinyLang: LanguageDefinition = {
				name: 'tiny',
				aliases: [],
				patterns: [{ type: 'keyword', pattern: /foo\b/y }],
			};
			const detector = new LexerDetector(tinyLang, { maxLength: 10 });

			expect(detector.detect('foo\nfoo\nfoo\nfoo')).toBeNull();
		});

		it('respects a custom minLines option', () => {
			const detector = new LexerDetector(JAVA_LANGUAGE, {
				minLines: 1,
				signatures: [/\bclass\b/],
			});

			const result: DetectionResult | null = detector.detect('class Foo');

			expect(result).not.toBeNull();
		});
	});

	describe('confidence calibration', () => {
		it('returns higher confidence the more recognized tokens accumulate', () => {
			const minimal: DetectionResult | null = javaDetector.detect(
				'public class Foo {}\npublic class Bar {}',
			);
			const richer: DetectionResult | null = javaDetector.detect(
				[
					'package com.example;',
					'import java.util.List;',
					'public class Foo {',
					'    public static void main(String[] args) {',
					'        System.out.println("Hello");',
					'    }',
					'}',
				].join('\n'),
			);

			expect(minimal).not.toBeNull();
			expect(richer).not.toBeNull();
			if (!minimal || !richer) return;
			expect(richer.confidence).toBeGreaterThan(minimal.confidence);
		});

		it('reaches near-saturated confidence on idiomatic code that triggers a signature', () => {
			const result: DetectionResult | null = javaDetector.detect(
				[
					'package com.example;',
					'public class HelloWorld {',
					'    public static void main(String[] args) {',
					'        System.out.println("Hello, World!");',
					'    }',
					'}',
				].join('\n'),
			);

			expect(result).not.toBeNull();
			expect(result?.confidence ?? 0).toBeGreaterThanOrEqual(0.85);
		});

		it('returns null when no minimum-confidence threshold is met', () => {
			expect(javaDetector.detect('hello world\nthis is plain text')).toBeNull();
			expect(typescriptDetector.detect('hello world\nthis is plain text')).toBeNull();
		});
	});

	describe('disambiguation: TypeScript vs Java on `interface` declarations', () => {
		it('classifies interface with lowercase primitive types as TypeScript, not Java', () => {
			const input = ['interface User {', '  name: string;', '  id: number;', '}'].join('\n');

			const { java, ts } = detectBoth(input);

			expect(ts).not.toBeNull();
			expect(ts?.language).toBe('typescript');
			if (java !== null) {
				expect(ts?.confidence ?? 0).toBeGreaterThan(java.confidence);
			}
		});

		it('classifies Java-style interface with `Type name;` fields as Java', () => {
			const input = ['public interface User {', '    String name();', '    int id();', '}'].join(
				'\n',
			);

			const { java, ts } = detectBoth(input);

			expect(java).not.toBeNull();
			expect(java?.language).toBe('java');
			if (ts !== null) {
				expect(java?.confidence ?? 0).toBeGreaterThan(ts.confidence);
			}
		});

		it('classifies a TypeScript type alias as TypeScript', () => {
			const input = [
				'export type Result<T> = { ok: true; value: T } | { ok: false; error: string };',
				'export const success = <T>(value: T): Result<T> => ({ ok: true, value });',
			].join('\n');

			const { java, ts } = detectBoth(input);

			expect(ts).not.toBeNull();
			expect(ts?.language).toBe('typescript');
			if (java !== null) {
				expect(ts?.confidence ?? 0).toBeGreaterThan(java.confidence);
			}
		});

		it('classifies a Java record declaration as Java', () => {
			const input = [
				'public record Point(int x, int y) {',
				'    public double distance() {',
				'        return Math.sqrt(x * x + y * y);',
				'    }',
				'}',
			].join('\n');

			const { java, ts } = detectBoth(input);

			expect(java).not.toBeNull();
			expect(java?.language).toBe('java');
			if (ts !== null) {
				expect(java?.confidence ?? 0).toBeGreaterThan(ts.confidence);
			}
		});
	});

	describe('rejected non-code inputs', () => {
		it('returns null for plain natural language', () => {
			const input = [
				'The quick brown fox jumps over the lazy dog.',
				'This is a second line of regular text.',
				'And here is a third line.',
			].join('\n');

			expect(javaDetector.detect(input)).toBeNull();
			expect(typescriptDetector.detect(input)).toBeNull();
		});

		it('returns null for markdown', () => {
			const input = ['# Heading', '', 'Some paragraph text.', '- List item'].join('\n');

			expect(javaDetector.detect(input)).toBeNull();
			expect(typescriptDetector.detect(input)).toBeNull();
		});

		it('returns null for CSS', () => {
			const input = ['.container {', '    display: flex;', '    color: red;', '}'].join('\n');

			expect(javaDetector.detect(input)).toBeNull();
			expect(typescriptDetector.detect(input)).toBeNull();
		});
	});

	describe('signature application', () => {
		it('signature-only matches without lexer support stay below threshold', () => {
			const detector = new LexerDetector(TYPESCRIPT_LANGUAGE, {
				signatures: [/^xyz$/m],
				minLines: 2,
				minConfidence: 0.35,
				signatureBonus: 0.3,
			});

			const result: DetectionResult | null = detector.detect('xyz\nxyz');

			expect(result).toBeNull();
		});

		it('signature bonus pushes a moderate lexer score over the threshold', () => {
			const input = ['interface User {', '  name: string;', '}'].join('\n');

			const result: DetectionResult | null = typescriptDetector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.confidence ?? 0).toBeGreaterThanOrEqual(0.35);
		});
	});

	describe('ReDoS resistance', () => {
		it('handles 50k whitespace runs in under 100ms', () => {
			const input: string = `interface${' '.repeat(50_000)}\nfoo`;

			const start: number = performance.now();
			typescriptDetector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
		});

		it('returns null beyond the default 100k length cap', () => {
			const input: string = 'public class Foo {}\n'.repeat(10_000);
			expect(input.length).toBeGreaterThan(100_000);

			expect(javaDetector.detect(input)).toBeNull();
		});
	});
});
