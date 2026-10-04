import { describe, expect, it } from 'vitest';
import { BLOCK_ALIGNMENTS, type BlockAlignment } from '../model/BlockAlignment.js';
import { type BlockNode, createBlockNode, createTextNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { nodeType } from '../model/TypeBrands.js';
import {
	type AlignmentExportOptions,
	defaultAlignmentClassName,
	defaultAlignmentDeclaration,
	normalizeAlignment,
	readElementAlignment,
	resolveExportAlignment,
} from './AlignmentHTML.js';

const START_CLASS: AlignmentExportOptions = { startHasClass: true };

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

describe('defaultAlignmentClassName', () => {
	it.each(BLOCK_ALIGNMENTS)('names text-align: %s after notectl', (alignment: BlockAlignment) => {
		expect(defaultAlignmentClassName(`text-align: ${alignment}`)).toBe(
			`notectl-align-${alignment}`,
		);
	});

	it.each(['text-align: left', 'color: red', 'text-align: center; color: red'])(
		'has no class for %j',
		(declaration: string) => {
			expect(defaultAlignmentClassName(declaration)).toBeUndefined();
		},
	);
});

describe('defaultAlignmentDeclaration', () => {
	it.each(BLOCK_ALIGNMENTS)('reads notectl-align-%s', (alignment: BlockAlignment) => {
		expect(defaultAlignmentDeclaration(`notectl-align-${alignment}`)).toBe(
			`text-align: ${alignment}`,
		);
	});

	it('reads legacy physical class names as logical alignments', () => {
		expect(defaultAlignmentDeclaration('notectl-align-left')).toBe('text-align: start');
		expect(defaultAlignmentDeclaration('notectl-align-right')).toBe('text-align: end');
	});

	it.each(['lead', 'align-center', 'notectl-align-', 'notectl-align-constructor'])(
		'ignores %j',
		(className: string) => {
			expect(defaultAlignmentDeclaration(className)).toBeUndefined();
		},
	);
});

describe('readElementAlignment', () => {
	it('reads an inline text-align style', () => {
		expect(readElementAlignment(element('<p style="text-align: center">x</p>'))).toBe('center');
	});

	it('maps a legacy physical style', () => {
		expect(readElementAlignment(element('<p style="text-align: right">x</p>'))).toBe('end');
	});

	it('ignores classes, which import turns into inline styles first', () => {
		expect(readElementAlignment(element('<p class="notectl-align-end">x</p>'))).toBeUndefined();
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
		const options: AlignmentExportOptions = START_CLASS;
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
		const options: AlignmentExportOptions = START_CLASS;

		expect(resolveExportAlignment(block(), spec(), options)).toBeUndefined();
		expect(resolveExportAlignment(block(), undefined, options)).toBeUndefined();
	});

	it('still exports an explicit alignment without a spec', () => {
		expect(resolveExportAlignment(block('center'), undefined)).toBe('center');
		expect(resolveExportAlignment(block('start'), undefined, START_CLASS)).toBe('start');
	});

	describe('inside a container that writes an alignment', () => {
		it.each(BLOCK_ALIGNMENTS)(
			'leaves an implicit default to the inherited %s, even with a start class',
			(inherited: BlockAlignment) => {
				const options: AlignmentExportOptions = { ...START_CLASS, inherited };

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
			const options: AlignmentExportOptions = { ...START_CLASS, inherited: 'center' };

			expect(resolveExportAlignment(block('end'), spec('start'), options)).toBe('end');
			expect(resolveExportAlignment(block('center'), spec('start'), options)).toBe('center');
		});

		it('still exports start for a block that defaults to another alignment', () => {
			const options: AlignmentExportOptions = { inherited: 'end' };

			expect(resolveExportAlignment(block('start'), spec('center'), options)).toBe('start');
		});
	});
});
