import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentStructure, specHtmlToStructure } from '../test/MarkdownConformanceUtils.js';
import { parseMarkdownToDocument } from './MarkdownParser.js';
import { serializeDocumentToMarkdown } from './MarkdownSerializer.js';
import type { MarkdownParseOptions, MarkdownSerializeOptions } from './MarkdownTypes.js';

/**
 * Official CommonMark + GFM spec conformance gates (D1, #200).
 *
 * Gate A (in-scope correctness, 100%): every example from the official
 * CommonMark 0.31.2 `spec.json` (652 examples) and the GFM spec's extension
 * sections (24 examples: tables, task lists, strikethrough, autolinks) must
 * parse to the structure implied by the spec's expected HTML — except examples
 * that fall outside notectl's model, which are handled explicitly:
 *
 * - Sections "HTML blocks" and "Raw HTML" are out of scope by design (raw HTML
 *   is the `htmlFallback` seam, D3) and run under gate B instead.
 * - Examples whose expected HTML uses constructs the model cannot express
 *   (raw inline HTML in expected output; bare text or trailing blocks after a
 *   hoisted nested list inside an `<li>`) are detected by the converter and
 *   run under gate B. Multi-block list items themselves are in scope (#194).
 * - A small, explicit skip list (below) pins the remaining documented
 *   deviations. Every skipped example is asserted to still fail: the moment
 *   one starts passing, the test demands its removal, so the list only ever
 *   shrinks (a ratchet).
 *
 * Comparison is a normalized structural AST, not byte HTML (notectl emits
 * deliberately different HTML: block IDs, schema tags, flat lists). CommonMark
 * examples parse with `flavor: 'commonmark'` (the spec has no GFM autolinks /
 * tables / strikethrough); GFM extension examples parse with the gfm default.
 *
 * Gate B (out-of-scope safety, 100%): every example NOT compared in gate A —
 * raw-HTML sections, converter-detected unsupported constructs, and the skip
 * list — must parse without throwing and reach a serialization fixpoint
 * (`md → doc → md₂ → doc → md₃` with `md₂ === md₃`): whatever representation
 * the engine chooses, it re-imports losslessly. Nothing is ever dropped or
 * corrupted by a round-trip, even for constructs outside the matrix.
 *
 * Fixtures are dev-only test data (never bundled, hard constraint #1).
 */

interface SpecExample {
	readonly markdown: string;
	readonly html: string;
	readonly example: number;
	readonly section: string;
}

function loadFixture(name: string): SpecExample[] {
	const path = `${process.cwd()}/src/serialization/__fixtures__/${name}`;
	return JSON.parse(readFileSync(path, 'utf8')) as SpecExample[];
}

const COMMONMARK: readonly SpecExample[] = loadFixture('commonmark-spec-0.31.2.json');
const GFM_EXTENSIONS: readonly SpecExample[] = loadFixture('gfm-extension-examples.json');

/** Raw HTML is the htmlFallback seam (D3); these sections run under gate B. */
const OUT_OF_SCOPE_SECTIONS: ReadonlySet<string> = new Set(['HTML blocks', 'Raw HTML']);

const MULTILINE_DEF =
	'link reference definitions with multi-line labels or multi-line titles stay paragraph text';
const RAW_INLINE_HTML =
	'raw inline HTML edge case cannot be represented by the baseline HTML fallback schema';
const TAB_CONTAINER = 'tab-to-column expansion inside container markers is not implemented';
const LAZY_SETEXT = 'a setext underline on a lazy continuation line is read as a heading';

/**
 * Documented deviations, pinned per example (CommonMark example numbers).
 * Ratchet: an entry may only be removed (the "skip list only shrinks" test
 * fails as soon as a skipped example starts passing).
 */
const SKIPPED: ReadonlyMap<number, string> = new Map([
	[6, TAB_CONTAINER],
	[93, LAZY_SETEXT],
	[196, MULTILINE_DEF],
	[208, MULTILINE_DEF],
	[344, RAW_INLINE_HTML],
	[476, RAW_INLINE_HTML],
	[477, RAW_INLINE_HTML],
	[541, MULTILINE_DEF],
	[642, RAW_INLINE_HTML],
	[643, RAW_INLINE_HTML],
]);

const COMMONMARK_OPTIONS: MarkdownParseOptions = { flavor: 'commonmark' };

/** Whether the parsed structure matches the spec's expected structure. */
function matchesSpec(example: SpecExample, options?: MarkdownParseOptions): boolean | null {
	const want = specHtmlToStructure(example.html);
	if ('unsupported' in want) return null;
	// The editor model has no empty document; empty input is one empty paragraph.
	const wantStructure: string = want.structure === '' ? 'paragraph{}' : want.structure;
	const got: string = documentStructure(
		parseMarkdownToDocument(example.markdown, undefined, options),
	);
	return got === wantStructure;
}

/** Gate B: parse must not throw and serialization must reach a fixpoint. */
function roundTripsLosslessly(example: SpecExample, options?: MarkdownParseOptions): boolean {
	const doc = parseMarkdownToDocument(example.markdown, undefined, options);
	const serializeOptions: MarkdownSerializeOptions | undefined = options?.flavor
		? { flavor: options.flavor }
		: undefined;
	const md2: string = serializeDocumentToMarkdown(doc, undefined, serializeOptions);
	const md3: string = serializeDocumentToMarkdown(
		parseMarkdownToDocument(md2, undefined, options),
		undefined,
		serializeOptions,
	);
	return md2 === md3;
}

function describeExample(example: SpecExample): string {
	return `#${example.example} [${example.section}] ${JSON.stringify(example.markdown)}`;
}

describe('Markdown official spec conformance (gates A + B, ratcheted)', () => {
	it('gate A: every in-scope CommonMark spec example matches (100%)', () => {
		const failures: string[] = [];
		for (const example of COMMONMARK) {
			if (OUT_OF_SCOPE_SECTIONS.has(example.section)) continue;
			if (SKIPPED.has(example.example)) continue;
			if (matchesSpec(example, COMMONMARK_OPTIONS) === false) {
				failures.push(describeExample(example));
			}
		}
		expect(failures).toEqual([]);
	});

	it('gate A: every in-scope GFM extension example matches (100%)', () => {
		const failures: string[] = [];
		for (const example of GFM_EXTENSIONS) {
			if (example.section.startsWith('Disallowed Raw HTML')) continue; // tagfilter: gate B
			if (matchesSpec(example) === false) {
				failures.push(describeExample(example));
			}
		}
		expect(failures).toEqual([]);
	});

	it('the skip list only shrinks: every skipped example still fails', () => {
		const nowPassing: string[] = [];
		for (const example of COMMONMARK) {
			if (!SKIPPED.has(example.example)) continue;
			if (matchesSpec(example, COMMONMARK_OPTIONS) === true) {
				nowPassing.push(`${describeExample(example)} — remove it from SKIPPED`);
			}
		}
		expect(nowPassing).toEqual([]);
	});

	it('gate B: every out-of-scope or skipped example parses safely and reaches a serialization fixpoint', () => {
		const failures: string[] = [];
		for (const example of COMMONMARK) {
			const outOfScope: boolean =
				OUT_OF_SCOPE_SECTIONS.has(example.section) ||
				SKIPPED.has(example.example) ||
				matchesSpec(example, COMMONMARK_OPTIONS) === null;
			if (!outOfScope) continue;
			try {
				if (!roundTripsLosslessly(example, COMMONMARK_OPTIONS)) {
					failures.push(describeExample(example));
				}
			} catch (error) {
				failures.push(`${describeExample(example)} threw: ${String(error)}`);
			}
		}
		for (const example of GFM_EXTENSIONS) {
			try {
				if (!roundTripsLosslessly(example)) failures.push(describeExample(example));
			} catch (error) {
				failures.push(`${describeExample(example)} threw: ${String(error)}`);
			}
		}
		expect(failures).toEqual([]);
	});

	it('coverage floors hold (ratchet: these may only go up)', () => {
		let passing = 0;
		let unsupported = 0;
		for (const example of COMMONMARK) {
			if (OUT_OF_SCOPE_SECTIONS.has(example.section) || SKIPPED.has(example.example)) continue;
			const result: boolean | null = matchesSpec(example, COMMONMARK_OPTIONS);
			if (result === null) unsupported++;
			else if (result) passing++;
		}
		// 652 CommonMark examples: 64 raw-HTML (gate B), 11 skipped (documented),
		// 9 converter-detected out-of-model (gate B: 7 raw inline HTML in expected
		// output, 1 bare text after a block inside an <li>, 1 paragraph after a
		// nested list inside an <li> — the flat-sibling hoist cannot keep its
		// item-relative order), 568 compared and passing (#194 brought multi-block
		// list items in scope). Never lower these floors.
		expect(passing).toBeGreaterThanOrEqual(568);
		expect(unsupported).toBeLessThanOrEqual(9);
	});
});
