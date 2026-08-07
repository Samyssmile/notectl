import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const STATIC_OR_DYNAMIC_IMPORT = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\1/g;

function productionTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...productionTypeScriptFiles(path));
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			files.push(path);
		}
	}
	return files;
}

function relativeImports(file: string): string[] {
	const source = readFileSync(file, 'utf8');
	return [...source.matchAll(STATIC_OR_DYNAMIC_IMPORT)]
		.map((match) => match[2])
		.filter((specifier): specifier is string => specifier?.startsWith('.') ?? false);
}

describe('architecture boundaries', () => {
	it('detects static side-effect imports when scanning dependencies', () => {
		const source = "import '../editor/EditorInitializer.js';";
		const imports = [...source.matchAll(STATIC_OR_DYNAMIC_IMPORT)].map((match) => match[2]);

		expect(imports).toEqual(['../editor/EditorInitializer.js']);
	});

	it('keeps input independent from editor composition internals', () => {
		const violations: string[] = [];
		for (const file of productionTypeScriptFiles(resolve(SOURCE_ROOT, 'input'))) {
			for (const specifier of relativeImports(file)) {
				const target = resolve(dirname(file), specifier);
				if (target.startsWith(`${resolve(SOURCE_ROOT, 'editor')}/`)) {
					violations.push(`${relative(SOURCE_ROOT, file)} -> ${specifier}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
