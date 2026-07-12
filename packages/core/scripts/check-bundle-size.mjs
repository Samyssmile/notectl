import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build as bundleWithEsbuild } from 'esbuild';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const DIST_DIR = resolve(PACKAGE_ROOT, 'dist');
const STATS_PATH = resolve(PACKAGE_ROOT, '.bundle-stats.json');

/**
 * Initial-download budgets use the real Vite chunk graph. Plugin and preset
 * budgets are marginal to the core entry because those modules cannot power an
 * editor on their own. Dynamic locale alternatives are governed by the
 * package-wide deferred budget below instead of being rebundled into every
 * entry as if all locales loaded at once.
 */
const ENTRY_BUDGETS = [
	['Core', 'src/index.ts', 100],
	['Presets (minimal)', 'src/presets/minimal.ts', 5],
	['Presets (full)', 'src/presets/full.ts', 140],
	['HTML codec', 'src/html.ts', 12],
	['Markdown codec', 'src/markdown.ts', 29],
	['Fonts (compatibility barrel)', 'src/fonts.ts', 555],
	['Fonts (starter)', 'src/fonts/starter.ts', 255],
	['Fonts (math)', 'src/fonts/math.ts', 300],
	['Plugin: Table', 'src/plugins/table/index.ts', 31],
	['Plugin: Text Formatting', 'src/plugins/text-formatting/index.ts', 1],
	['Plugin: Heading', 'src/plugins/heading/index.ts', 4],
	['Plugin: Toolbar', 'src/plugins/toolbar/index.ts', 1],
	['Plugin: Shared', 'src/plugins/shared/index.ts', 6.5],
	['Plugin: Image', 'src/plugins/image/index.ts', 8],
	['Plugin: Formula', 'src/plugins/formula/index.ts', 22],
	['Plugin: Video', 'src/plugins/video/index.ts', 15],
	['Plugin: Code Block', 'src/plugins/code-block/index.ts', 15],
	['Plugin: Smart Paste', 'src/plugins/smart-paste/index.ts', 7],
	['Plugin: Link', 'src/plugins/link/index.ts', 4],
	['Plugin: List', 'src/plugins/list/index.ts', 5.5],
	['Plugin: Blockquote', 'src/plugins/blockquote/index.ts', 3],
	['Plugin: Strikethrough', 'src/plugins/strikethrough/index.ts', 2],
	['Plugin: Inline Code', 'src/plugins/inline-code/index.ts', 3],
	['Plugin: Text Color', 'src/plugins/text-color/index.ts', 7.5],
	['Plugin: Horizontal Rule', 'src/plugins/horizontal-rule/index.ts', 2],
	['Plugin: Alignment', 'src/plugins/alignment/index.ts', 2.5],
	['Plugin: Font', 'src/plugins/font/index.ts', 4.5],
	['Plugin: Font Size', 'src/plugins/font-size/index.ts', 6.5],
	['Plugin: Highlight', 'src/plugins/highlight/index.ts', 7.5],
	['Plugin: Super/Sub', 'src/plugins/super-sub/index.ts', 3],
	['Plugin: Print', 'src/plugins/print/index.ts', 8],
	['Plugin: Hard Break', 'src/plugins/hard-break/index.ts', 1],
	['Plugin: Gap Cursor', 'src/plugins/gap-cursor/index.ts', 0.5],
	['Plugin: Caret Navigation', 'src/plugins/caret-navigation/index.ts', 1],
	['Plugin: Language', 'src/plugins/language/index.ts', 4.5],
	['Plugin: Text Direction', 'src/plugins/text-direction/index.ts', 4],
	['Plugin: Bidi Isolation', 'src/plugins/bidi-isolation/index.ts', 2.5],
	['Plugin: Text Direction Auto', 'src/plugins/text-direction-auto/index.ts', 2.5],
	['Full (kitchen sink)', 'src/full.ts', 800],
];

const DEFERRED_BUDGET_KB = 70;
const UMD_BUDGET_KB = 805;

function collectStaticClosure(startFile, chunksByFile) {
	const files = new Set();
	const visit = (file) => {
		if (files.has(file)) return;
		const chunk = chunksByFile.get(file);
		if (!chunk) return;
		files.add(file);
		for (const importedFile of chunk.imports) visit(importedFile);
	};
	visit(startFile);
	return files;
}

function unionInto(target, source) {
	for (const value of source) target.add(value);
}

async function gzipSize(file) {
	return gzipSync(await readFile(resolve(DIST_DIR, file))).byteLength;
}

async function totalGzipSize(files) {
	const sizes = await Promise.all([...files].map(gzipSize));
	return sizes.reduce((total, size) => total + size, 0);
}

function formatKilobytes(bytes) {
	return `${(bytes / 1_000).toFixed(2)} KB`;
}

function printResult(name, bytes, limitKilobytes) {
	const limitBytes = limitKilobytes * 1_000;
	const passed = bytes <= limitBytes;
	const marker = passed ? '✓' : '✗';
	console.log(
		`${marker} ${name}: ${formatKilobytes(bytes)} / ${limitKilobytes.toFixed(1)} KB`,
	);
	return passed;
}

async function verifyAutomaticRegistrationSurvivesTreeShaking() {
	const result = await bundleWithEsbuild({
		bundle: true,
		format: 'esm',
		logLevel: 'silent',
		stdin: {
			contents: "import '@notectl/core';",
			resolveDir: PACKAGE_ROOT,
			sourcefile: 'consumer.mjs',
		},
		treeShaking: true,
		write: false,
	});
	const code = result.outputFiles[0]?.text ?? '';
	if (!code.includes('customElements.define("notectl-editor"')) {
		throw new Error(
			'Bare root import lost automatic custom-element registration during tree shaking.',
		);
	}
	console.log('✓ Bare root import preserves custom-element registration');
}

async function main() {
	let stats;
	try {
		stats = JSON.parse(await readFile(STATS_PATH, 'utf8'));
	} catch (error) {
		throw new Error('Bundle statistics are missing. Run the core build before the size check.', {
			cause: error,
		});
	}
	if (stats.version !== 1 || !Array.isArray(stats.chunks)) {
		throw new Error('Unsupported bundle statistics format. Rebuild the core package.');
	}

	const chunksByFile = new Map(stats.chunks.map((chunk) => [chunk.file, chunk]));
	const entriesBySource = new Map(
		stats.chunks.filter((chunk) => chunk.entry).map((chunk) => [chunk.entry, chunk]),
	);
	const coreEntry = entriesBySource.get('src/index.ts');
	if (!coreEntry) throw new Error('Missing bundle entry for src/index.ts.');
	const coreFiles = collectStaticClosure(coreEntry.file, chunksByFile);
	const allEntryFiles = new Set();
	let passed = true;

	for (const [name, source, limitKilobytes] of ENTRY_BUDGETS) {
		const entry = entriesBySource.get(source);
		if (!entry) throw new Error(`Missing bundle entry for ${source}.`);
		const files = collectStaticClosure(entry.file, chunksByFile);
		unionInto(allEntryFiles, files);
		const isCoreExtension =
			source.startsWith('src/plugins/') || source.startsWith('src/presets/');
		const budgetedFiles = isCoreExtension
			? new Set([...files].filter((file) => !coreFiles.has(file)))
			: files;
		passed = printResult(name, await totalGzipSize(budgetedFiles), limitKilobytes) && passed;
	}

	const deferredFiles = new Set();
	for (const chunk of stats.chunks) {
		for (const dynamicImport of chunk.dynamicImports) {
			unionInto(deferredFiles, collectStaticClosure(dynamicImport, chunksByFile));
		}
	}
	for (const file of allEntryFiles) deferredFiles.delete(file);
	passed =
		printResult(
			'Deferred-only chunks (all locale alternatives)',
			await totalGzipSize(deferredFiles),
			DEFERRED_BUDGET_KB,
		) && passed;

	const umdBytes = gzipSync(await readFile(resolve(DIST_DIR, 'notectl-core.umd.js'))).byteLength;
	passed = printResult('UMD (single-file)', umdBytes, UMD_BUDGET_KB) && passed;
	await verifyAutomaticRegistrationSurvivesTreeShaking();

	if (!passed) {
		console.error('\nBundle budget exceeded. Reduce the relevant graph or update an intentional baseline.');
		process.exitCode = 1;
	}
}

await main();
