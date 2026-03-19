import { describe, expect, it } from 'vitest';
import type { DetectionResult } from '../SmartPasteTypes.js';
import { JavaDetector } from './JavaDetector.js';

// --- Tests ---

describe('JavaDetector', () => {
	describe('id', () => {
		it('has id "java"', () => {
			const detector = new JavaDetector();

			expect(detector.id).toBe('java');
		});
	});

	describe('detect - valid Java code', () => {
		it('detects Hello World class', () => {
			const detector = new JavaDetector();
			const input = [
				'public class HelloWorld {',
				'    public static void main(String[] args) {',
				'        System.out.println("Hello, World!");',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
			expect(result?.confidence).toBe(0.8);
		});

		it('detects class with package and imports', () => {
			const detector = new JavaDetector();
			const input = [
				'package com.example;',
				'',
				'import java.util.List;',
				'',
				'public class MyService {',
				'    private final List<String> items;',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects interface declaration', () => {
			const detector = new JavaDetector();
			const input = ['public interface Comparable<T> {', '    int compareTo(T other);', '}'].join(
				'\n',
			);

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects enum declaration', () => {
			const detector = new JavaDetector();
			const input = ['public enum Color {', '    RED,', '    GREEN,', '    BLUE;', '}'].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects record declaration', () => {
			const detector = new JavaDetector();
			const input = [
				'public record Point(int x, int y) {',
				'    public double distance() {',
				'        return Math.sqrt(x * x + y * y);',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects code with annotations', () => {
			const detector = new JavaDetector();
			const input = ['@Override', 'public String toString() {', '    return "Hello";', '}'].join(
				'\n',
			);

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects try-catch block', () => {
			const detector = new JavaDetector();
			const input = [
				'try {',
				'    String result = doSomething();',
				'} catch (Exception e) {',
				'    System.err.println(e.getMessage());',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects code with static import', () => {
			const detector = new JavaDetector();
			const input = [
				'import static org.junit.Assert.*;',
				'',
				'public class MyTest {',
				'    public void testSomething() {',
				'        assertEquals(1, 1);',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('preserves original formatting', () => {
			const detector = new JavaDetector();
			const input = [
				'public class Foo {',
				'    public void bar() {',
				'        System.out.println("baz");',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result?.formattedText).toBe(input);
		});
	});

	describe('detect - returns null for non-Java', () => {
		it('returns null for plain text', () => {
			const detector = new JavaDetector();

			const result: DetectionResult | null = detector.detect('Hello World');

			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			const detector = new JavaDetector();

			const result: DetectionResult | null = detector.detect('');

			expect(result).toBeNull();
		});

		it('returns null for single line', () => {
			const detector = new JavaDetector();

			const result: DetectionResult | null = detector.detect('public class Foo {}');

			expect(result).toBeNull();
		});

		it('returns null for JSON', () => {
			const detector = new JavaDetector();

			const result: DetectionResult | null = detector.detect('{"key": "value", "num": 42}');

			expect(result).toBeNull();
		});

		it('returns null for natural language paragraph', () => {
			const detector = new JavaDetector();
			const input = [
				'The quick brown fox jumps over the lazy dog.',
				'This is a second line of regular text.',
				'And here is a third line.',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for markdown', () => {
			const detector = new JavaDetector();
			const input = [
				'# Heading',
				'',
				'Some paragraph text.',
				'- List item one',
				'- List item two',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for CSS', () => {
			const detector = new JavaDetector();
			const input = ['.container {', '    display: flex;', '    color: red;', '}'].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});
	});

	describe('detect - edge cases', () => {
		it('handles leading and trailing whitespace', () => {
			const detector = new JavaDetector();
			const input = [
				'',
				'  public class Foo {',
				'      public void bar() {',
				'          System.out.println("hi");',
				'      }',
				'  }',
				'',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('java');
		});

		it('detects sealed class', () => {
			const detector = new JavaDetector();
			const input = [
				'public sealed class Shape permits Circle, Square {',
				'    public abstract double area();',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
		});

		it('detects code using new keyword', () => {
			const detector = new JavaDetector();
			const input = [
				'List<String> items = new ArrayList<>();',
				'Map<String, Integer> map = new HashMap<>();',
				'items.add("hello");',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
		});
	});

	describe('detect - ReDoS resistance', () => {
		it('handles adversarial input for class declaration pattern', () => {
			const detector = new JavaDetector();
			const input: string = `public${' '.repeat(50_000)}notclass\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('handles adversarial input for method signature pattern', () => {
			const detector = new JavaDetector();
			const input: string = `public ${' '.repeat(50_000)}(\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('handles adversarial input for brace pattern', () => {
			const detector = new JavaDetector();
			const input: string = `${'{'.repeat(50_000)}\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('returns null for input exceeding maximum length', () => {
			const detector = new JavaDetector();
			const input: string = 'public class Foo {\n'.repeat(10_000);
			expect(input.length).toBeGreaterThan(100_000);

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});
	});
});
