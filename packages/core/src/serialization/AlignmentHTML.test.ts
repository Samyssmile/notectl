import { describe, expect, it } from 'vitest';
import type { AlignmentClassNames } from '../model/AlignmentClassNames.js';
import { BLOCK_ALIGNMENTS, type BlockAlignment } from '../model/BlockAlignment.js';
import { type BlockNode, createBlockNode, createTextNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { nodeType } from '../model/TypeBrands.js';
import {
	type AlignmentExportOptions,
	alignmentDeclaration,
	alignmentSemanticClassNames,
	normalizeAlignment,
	readElementAlignment,
	resolveExportAlignment,
} from './AlignmentHTML.js';

const CLASS_NAMES: AlignmentClassNames = { start: 'text-start', center: 'text-center' };

function element(html: string): HTMLElement {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	const el: Element | null = template.content.firstElementChild;
	if (!(el instanceof HTMLElement)) throw new Error(`No element in ${html}`);
	return el;
}

function spec(defaultAlign?: string): NodeSpec {
	return {
		type: 'paragraph',
		toDOM: () => document.createElement('p'),
		...(defaultAlign ? { attrs: { align: { default: defaultAlign } } } : {}),
	};
}

function block(align?: string): BlockNode {
	return createBlockNode(
		nodeType('paragraph'),
		[createTextNode('text')],
		undefined,
		align ? { align } : undefined,
	);
}

describe('normalizeAlignment', () => {
	it.each(['start', 'center', 'end', 'justify'])('keeps the logical value %s', (value) => {
		expect(normalizeAlignment(value)).toBe(value);
	});

	it('maps legacy physical values to logical ones', () => {
		expect(normalizeAlignment('left')).toBe('start');
		expect(normalizeAlignment('right')).toBe('end');
	});

	it.each(['', 'middle', 'constructor', 'toString', 42, undefined])('rejects %j', (value) => {
		expect(normalizeAlignment(value)).toBeUndefined();
	});
});

describe('alignmentSemanticClassNames', () => {
	it("names every alignment declaration after notectl's defaults", () => {
		expect([...alignmentSemanticClassNames()]).toEqual([
			['text-align: start', 'notectl-align-start'],
			['text-align: center', 'notectl-align-center'],
			['text-align: end', 'notectl-align-end'],
			['text-align: justify', 'notectl-align-justify'],
		]);
	});

	it('uses registered classes and keeps defaults for the rest', () => {
		const names: ReadonlyMap<string, string> = alignmentSemanticClassNames(CLASS_NAMES);

		expect(names.get(alignmentDeclaration('start'))).toBe('text-start');
		expect(names.get(alignmentDeclaration('center'))).toBe('text-center');
		expect(names.get(alignmentDeclaration('end'))).toBe('notectl-align-end');
	});
});

describe('readElementAlignment', () => {
	it('reads an inline text-align style', () => {
		expect(readElementAlignment(element('<p style="text-align: center">x</p>'))).toBe('center');
	});

	it('maps a legacy physical style', () => {
		expect(readElementAlignment(element('<p style="text-align: right">x</p>'))).toBe('end');
	});

	it('reads a registered class', () => {
		expect(readElementAlignment(element('<p class="text-center">x</p>'), CLASS_NAMES)).toBe(
			'center',
		);
	});

	it('ignores a registered class when no class names are passed', () => {
		expect(readElementAlignment(element('<p class="text-center">x</p>'))).toBeUndefined();
	});

	it("reads notectl's default and legacy classes alongside registered ones", () => {
		expect(readElementAlignment(element('<p class="notectl-align-end">x</p>'), CLASS_NAMES)).toBe(
			'end',
		);
		expect(readElementAlignment(element('<p class="notectl-align-left">x</p>'))).toBe('start');
	});

	it('lets the inline style win over a class, as it does in CSS', () => {
		const el: HTMLElement = element('<p class="text-center" style="text-align: end">x</p>');

		expect(readElementAlignment(el, CLASS_NAMES)).toBe('end');
	});

	it('takes the first class that names an alignment', () => {
		const el: HTMLElement = element('<p class="lead text-start notectl-align-end">x</p>');

		expect(readElementAlignment(el, CLASS_NAMES)).toBe('start');
	});

	it('ignores unrelated and malformed classes', () => {
		const el: HTMLElement = element(
			'<p class="lead notectl-align-constructor notectl-align-">x</p>',
		);

		expect(readElementAlignment(el, CLASS_NAMES)).toBeUndefined();
	});
});

describe('resolveExportAlignment', () => {
	it('omits start-aligned blocks, which browsers render by default', () => {
		expect(resolveExportAlignment(block('start'), spec('start'))).toBeUndefined();
		expect(resolveExportAlignment(block(), spec('start'))).toBeUndefined();
	});

	it.each(['center', 'end', 'justify'])('exports %s', (align: string) => {
		expect(resolveExportAlignment(block(align), spec('start'))).toBe(align);
	});

	it('maps legacy values and drops invalid ones', () => {
		expect(resolveExportAlignment(block('right'), spec('start'))).toBe('end');
		expect(resolveExportAlignment(block('diagonal'), spec('start'))).toBeUndefined();
	});

	it('exports start when the block defaults to another alignment, so import restores it', () => {
		expect(resolveExportAlignment(block('start'), spec('center'))).toBe('start');
	});

	it('exports the spec default of an alignable block without its own alignment', () => {
		expect(resolveExportAlignment(block(), spec('center'))).toBe('center');
	});

	it('exports start for alignable blocks that inherit nothing once start has a class', () => {
		const options: AlignmentExportOptions = { classNames: CLASS_NAMES };
		const explicit: BlockAlignment | undefined = resolveExportAlignment(
			block('start'),
			spec('start'),
			options,
		);
		const implicit: BlockAlignment | undefined = resolveExportAlignment(
			block(),
			spec('start'),
			options,
		);

		expect([explicit, implicit]).toEqual(['start', 'start']);
	});

	it('leaves blocks whose spec declares no alignment untouched', () => {
		const options: AlignmentExportOptions = { classNames: CLASS_NAMES };

		expect(resolveExportAlignment(block(), spec(), options)).toBeUndefined();
		expect(resolveExportAlignment(block(), undefined, options)).toBeUndefined();
	});

	it('still exports an explicit alignment without a spec', () => {
		expect(resolveExportAlignment(block('center'), undefined)).toBe('center');
		expect(resolveExportAlignment(block('start'), undefined, { classNames: CLASS_NAMES })).toBe(
			'start',
		);
	});

	describe('inside a container that writes an alignment', () => {
		it.each(BLOCK_ALIGNMENTS)(
			'leaves an implicit default to the inherited %s, even with a start class',
			(inherited: BlockAlignment) => {
				const options: AlignmentExportOptions = { classNames: CLASS_NAMES, inherited };

				expect(resolveExportAlignment(block(), spec('start'), options)).toBeUndefined();
				expect(resolveExportAlignment(block('start'), spec('start'), options)).toBe('start');
			},
		);

		it('exports explicit start against an inherited alignment without configured classes', () => {
			expect(resolveExportAlignment(block('start'), spec('start'), { inherited: 'center' })).toBe(
				'start',
			);
		});

		it('still exports an alignment of its own', () => {
			const options: AlignmentExportOptions = { classNames: CLASS_NAMES, inherited: 'center' };

			expect(resolveExportAlignment(block('end'), spec('start'), options)).toBe('end');
			expect(resolveExportAlignment(block('center'), spec('start'), options)).toBe('center');
		});

		it('still exports start for a block that defaults to another alignment', () => {
			const options: AlignmentExportOptions = { inherited: 'end' };

			expect(resolveExportAlignment(block('start'), spec('center'), options)).toBe('start');
		});
	});
});
