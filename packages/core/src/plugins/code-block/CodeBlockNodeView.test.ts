import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createTextNode } from '../../model/Document.js';
import { blockId, nodeType } from '../../model/TypeBrands.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';
import type { CodeBlockConfig } from './CodeBlockPlugin.js';

const DEFAULT_CONFIG: CodeBlockConfig = {
	showCopyButton: true,
};

function makeCodeBlock(
	attrs: Record<string, string | number | boolean> = {},
	id = 'cb1',
	text = '',
) {
	return createBlockNode(nodeType('code_block'), text ? [createTextNode(text)] : [], blockId(id), {
		language: '',
		backgroundColor: '',
		...attrs,
	});
}

function makeState(text = '', codeBlockAttrs?: Record<string, string | number | boolean>) {
	const attrs = { language: '', backgroundColor: '', ...codeBlockAttrs };
	return stateBuilder()
		.block('code_block', text, 'cb1', { attrs })
		.cursor('cb1', 0)
		.schema(['paragraph', 'code_block'], [])
		.build();
}

describe('CodeBlockNodeView', () => {
	describe('DOM construction', () => {
		it('creates <pre> element with data-block-id', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({}, 'cb1');
			const view = factory(node, () => makeState(), vi.fn());

			expect(view.dom.tagName).toBe('PRE');
			expect(view.dom.getAttribute('data-block-id')).toBe('cb1');
		});

		it('does not set data-selectable (Reconciler sets it from NodeSpec)', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			// data-selectable is set by Reconciler based on NodeSpec.selectable,
			// not by the NodeView itself
			expect(view.dom.getAttribute('data-selectable')).toBeNull();
		});

		it('has notectl-code-block class', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			expect(view.dom.classList.contains('notectl-code-block')).toBe(true);
		});

		it('contains header with contenteditable=false', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			const header = view.dom.querySelector('.notectl-code-block__header');
			expect(header).not.toBeNull();
			expect(header?.getAttribute('contenteditable')).toBe('false');
		});

		it('contains language label', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ language: 'typescript' });
			const view = factory(node, () => makeState(), vi.fn());

			const langLabel = view.dom.querySelector('.notectl-code-block__language');
			expect(langLabel).not.toBeNull();
			expect(langLabel?.textContent).toBe('typescript');
		});

		it('displays "plain" when no language set', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ language: '' });
			const view = factory(node, () => makeState(), vi.fn());

			const langLabel = view.dom.querySelector('.notectl-code-block__language');
			expect(langLabel?.textContent).toBe('plain');
		});

		it('contains copy button with aria-label', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			const copyBtn = view.dom.querySelector('.notectl-code-block__copy');
			expect(copyBtn).not.toBeNull();
			expect(copyBtn?.getAttribute('aria-label')).toBe('Copy code');
		});

		it('hides copy button when showCopyButton is false', () => {
			const factory = createCodeBlockNodeViewFactory({ showCopyButton: false });
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			const copyBtn = view.dom.querySelector('.notectl-code-block__copy');
			expect(copyBtn).toBeNull();
		});

		it('contentDOM is <code> element', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			expect(view.contentDOM).not.toBeNull();
			expect(view.contentDOM?.tagName).toBe('CODE');
			expect(view.contentDOM?.classList.contains('notectl-code-block__content')).toBe(true);
		});

		it('sets data-language on <code> when language provided', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ language: 'python' });
			const view = factory(node, () => makeState(), vi.fn());

			expect(view.contentDOM?.getAttribute('data-language')).toBe('python');
		});

		it('applies background color from attrs', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ backgroundColor: '#1e1e1e' });
			const view = factory(node, () => makeState(), vi.fn());

			expect(view.dom.style.backgroundColor).toBe('#1e1e1e');
		});
	});

	describe('update', () => {
		it('returns true for code_block nodes', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({}, 'cb1');
			const view = factory(node, () => makeState(), vi.fn());

			const updated = makeCodeBlock({ language: 'rust' }, 'cb1');
			expect(view.update?.(updated)).toBe(true);
		});

		it('returns false for non-code_block nodes', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({}, 'cb1');
			const view = factory(node, () => makeState(), vi.fn());

			const paragraph = createBlockNode(
				nodeType('paragraph'),
				[createTextNode('text')],
				blockId('cb1'),
			);
			expect(view.update?.(paragraph)).toBe(false);
		});

		it('updates language label on update', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ language: 'javascript' });
			const view = factory(node, () => makeState(), vi.fn());

			const updated = makeCodeBlock({ language: 'python' });
			view.update?.(updated);

			const langLabel = view.dom.querySelector('.notectl-code-block__language');
			expect(langLabel?.textContent).toBe('python');
		});

		it('updates background color on update', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({ backgroundColor: '' });
			const view = factory(node, () => makeState(), vi.fn());

			const updated = makeCodeBlock({ backgroundColor: '#282c34' });
			view.update?.(updated);

			expect(view.dom.style.backgroundColor).toBe('#282c34');
		});

		it('updates data-block-id on update', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock({}, 'cb1');
			const view = factory(node, () => makeState(), vi.fn());

			const updated = makeCodeBlock({}, 'cb2');
			view.update?.(updated);

			expect(view.dom.getAttribute('data-block-id')).toBe('cb2');
		});
	});

	describe('selectNode / deselectNode', () => {
		it('selectNode adds selected class', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			view.selectNode?.();
			expect(view.dom.classList.contains('notectl-code-block--selected')).toBe(true);
		});

		it('deselectNode removes selected class', () => {
			const factory = createCodeBlockNodeViewFactory(DEFAULT_CONFIG);
			const node = makeCodeBlock();
			const view = factory(node, () => makeState(), vi.fn());

			view.selectNode?.();
			view.deselectNode?.();
			expect(view.dom.classList.contains('notectl-code-block--selected')).toBe(false);
		});
	});
});
