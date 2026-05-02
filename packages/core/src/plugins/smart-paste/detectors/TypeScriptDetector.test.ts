import { describe, expect, it } from 'vitest';
import type { DetectionResult } from '../SmartPasteTypes.js';
import { TypeScriptDetector } from './TypeScriptDetector.js';

// --- Tests ---

describe('TypeScriptDetector', () => {
	describe('id', () => {
		it('has id "typescript"', () => {
			const detector = new TypeScriptDetector();

			expect(detector.id).toBe('typescript');
		});
	});

	describe('detect - valid TypeScript code', () => {
		it('detects interface declaration with imports', () => {
			const detector = new TypeScriptDetector();
			const input = [
				"import type { User } from './user';",
				'',
				'export interface UserService {',
				'    getUser(id: string): Promise<User>;',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
			expect(result?.confidence).toBe(0.8);
		});

		it('detects type alias', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'export type Result<T> = { ok: true; value: T } | { ok: false; error: string };',
				'',
				'export const success = <T>(value: T): Result<T> => ({ ok: true, value });',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects enum declaration', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'export enum Color {',
				'    Red = "red",',
				'    Green = "green",',
				'    Blue = "blue",',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects namespace', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'export namespace Utils {',
				'    export const PI = 3.14;',
				'    export function double(x: number): number { return x * 2; }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects ambient declarations', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'declare const VERSION: string;',
				'declare function init(config: Config): void;',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects async function with template literal', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'export async function fetchUser(id: string): Promise<User> {',
				'    const response = await fetch(`/api/users/${id}`);',
				'    return response.json();',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects arrow function with optional chaining', () => {
			const detector = new TypeScriptDetector();
			const input = [
				"const getName = (user?: User) => user?.profile?.name ?? 'anonymous';",
				'const handler = () => console.log(getName());',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects ES import side-effect', () => {
			const detector = new TypeScriptDetector();
			const input = [
				"import './polyfills';",
				"import 'reflect-metadata';",
				'',
				'export const ready = true;',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('preserves original formatting', () => {
			const detector = new TypeScriptDetector();
			const input = [
				"import { foo } from 'bar';",
				'',
				'export const x: number = 42;',
				'export const y: string = "hello";',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result?.formattedText).toBe(input);
		});
	});

	describe('detect - returns null for non-TypeScript', () => {
		it('returns null for plain text', () => {
			const detector = new TypeScriptDetector();

			const result: DetectionResult | null = detector.detect('Hello World');

			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			const detector = new TypeScriptDetector();

			const result: DetectionResult | null = detector.detect('');

			expect(result).toBeNull();
		});

		it('returns null for single line', () => {
			const detector = new TypeScriptDetector();

			const result: DetectionResult | null = detector.detect("import { x } from './y';");

			expect(result).toBeNull();
		});

		it('returns null for JSON object', () => {
			const detector = new TypeScriptDetector();
			const input = ['{', '    "key": "value",', '    "num": 42', '}'].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for natural language paragraph', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'The quick brown fox jumps over the lazy dog.',
				'This is a second line of regular text.',
				'And here is a third line.',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for markdown', () => {
			const detector = new TypeScriptDetector();
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
			const detector = new TypeScriptDetector();
			const input = ['.container {', '    display: flex;', '    color: red;', '}'].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for Java code (negative signal: package)', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'package com.example;',
				'',
				'public class HelloWorld {',
				'    public static void main(String[] args) {',
				'        System.out.println("Hello");',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});

		it('returns null for Java code (negative signal: System.out)', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'public class Foo {',
				'    public void bar() {',
				'        System.out.println("hi");',
				'    }',
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});
	});

	describe('detect - edge cases', () => {
		it('handles leading and trailing whitespace', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'',
				"  import { foo } from 'bar';",
				'',
				'  export const x: number = 42;',
				'  export const y: string = "hello";',
				'',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects class with decorator', () => {
			const detector = new TypeScriptDetector();
			const input = [
				"import { Component } from '@angular/core';",
				'',
				'@Component({',
				"    selector: 'app-root',",
				'})',
				'export class AppComponent {',
				"    title = 'app';",
				'}',
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});

		it('detects generic function declaration', () => {
			const detector = new TypeScriptDetector();
			const input = [
				'export function identity<T>(value: T): T {',
				'    return value;',
				'}',
				'',
				"const result = identity<string>('hello');",
			].join('\n');

			const result: DetectionResult | null = detector.detect(input);

			expect(result).not.toBeNull();
			expect(result?.language).toBe('typescript');
		});
	});

	describe('detect - ReDoS resistance', () => {
		it('handles adversarial input for import pattern', () => {
			const detector = new TypeScriptDetector();
			const input: string = `import${' '.repeat(50_000)}notvalid\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('handles adversarial input for type alias pattern', () => {
			const detector = new TypeScriptDetector();
			const input: string = `type X${' '.repeat(50_000)}\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('handles adversarial input for arrow function pattern', () => {
			const detector = new TypeScriptDetector();
			const input: string = `${'='.repeat(50_000)}>\n\n`;

			const start: number = performance.now();
			const result: DetectionResult | null = detector.detect(input);
			const elapsed: number = performance.now() - start;

			expect(result).toBeNull();
			expect(elapsed).toBeLessThan(100);
		});

		it('returns null for input exceeding maximum length', () => {
			const detector = new TypeScriptDetector();
			const input: string = "import { x } from './y';\n".repeat(10_000);
			expect(input.length).toBeGreaterThan(100_000);

			const result: DetectionResult | null = detector.detect(input);

			expect(result).toBeNull();
		});
	});
});
