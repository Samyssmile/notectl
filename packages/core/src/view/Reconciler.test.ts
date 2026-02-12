import { describe, expect, it } from 'vitest';
import { inline as inlineDeco } from '../decorations/Decoration.js';
import type { InlineDecoration } from '../decorations/Decoration.js';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, inlineType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { reconcile, renderBlock, renderBlockContent } from './Reconciler.js';

describe('Reconciler InlineNode support', () => {
	describe('renderBlockContent', () => {
		it('renders text-only content as before', () => {
			const block = createBlockNode('paragraph', [createTextNode('hello')]);
			const container = document.createElement('div');
			renderBlockContent(container, block);
			expect(container.textContent).toBe('hello');
		});

		it('renders empty block as <br>', () => {
			const block = createBlockNode('paragraph', [createTextNode('')]);
			const container = document.createElement('div');
			renderBlockContent(container, block);
			expect(container.innerHTML).toBe('<br>');
		});

		it('renders InlineNode as contentEditable=false element', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('before'),
				createInlineNode(inlineType('image'), { src: 'test.png' }),
				createTextNode('after'),
			]);
			const container = document.createElement('div');
			renderBlockContent(container, block);

			const children = Array.from(container.childNodes);
			expect(children).toHaveLength(3);

			// First: text node
			expect(children[0]?.textContent).toBe('before');

			// Second: inline element
			const inlineEl = children[1] as HTMLElement;
			expect(inlineEl.tagName).toBe('SPAN');
			expect(inlineEl.getAttribute('data-inline-type')).toBe('image');
			expect(inlineEl.getAttribute('contenteditable')).toBe('false');

			// Third: text node
			expect(children[2]?.textContent).toBe('after');
		});

		it('renders InlineNode using InlineNodeSpec.toDOM when available', () => {
			const registry = new SchemaRegistry();
			const spec: InlineNodeSpec = {
				type: 'emoji',
				toDOM(node) {
					const el = document.createElement('span');
					el.className = 'emoji';
					el.textContent = String(node.attrs.name ?? '');
					return el;
				},
			};
			registry.registerInlineNodeSpec(spec);

			const block = createBlockNode('paragraph', [
				createTextNode('hi '),
				createInlineNode(inlineType('emoji'), { name: 'smile' }),
			]);
			const container = document.createElement('div');
			renderBlockContent(container, block, registry);

			const children = Array.from(container.childNodes);
			expect(children).toHaveLength(2);

			const emojiEl = children[1] as HTMLElement;
			expect(emojiEl.className).toBe('emoji');
			expect(emojiEl.textContent).toBe('smile');
			expect(emojiEl.getAttribute('contenteditable')).toBe('false');
		});

		it('renders multiple consecutive InlineNodes', () => {
			const block = createBlockNode('paragraph', [
				createTextNode(''),
				createInlineNode(inlineType('img')),
				createInlineNode(inlineType('img')),
				createTextNode('end'),
			]);
			const container = document.createElement('div');
			renderBlockContent(container, block);

			// Empty text node is not rendered as <br> because there are other children
			const inlineEls = container.querySelectorAll('[contenteditable="false"]');
			expect(inlineEls.length).toBe(2);
			expect(container.textContent).toContain('end');
		});

		it('renders text with marks alongside InlineNodes', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('bold', [{ type: 'bold' }]),
				createInlineNode(inlineType('hr')),
				createTextNode('italic', [{ type: 'italic' }]),
			]);
			const container = document.createElement('div');
			renderBlockContent(container, block);

			// Bold text should be in <strong>
			const strong = container.querySelector('strong');
			expect(strong?.textContent).toBe('bold');

			// InlineNode element
			const inlineEl = container.querySelector('[contenteditable="false"]');
			expect(inlineEl).not.toBeNull();

			// Italic text should be in <em>
			const em = container.querySelector('em');
			expect(em?.textContent).toBe('italic');
		});
	});

	describe('renderBlockContent with decorations', () => {
		it('does not wrap InlineNodes with decorations', () => {
			const bid = blockId('b1');
			const block = createBlockNode(
				'paragraph',
				[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
				bid,
			);
			const container = document.createElement('div');

			// Decoration spanning entire content [0, 5)
			const decos: readonly InlineDecoration[] = [inlineDeco(bid, 0, 5, { class: 'highlight' })];
			renderBlockContent(container, block, undefined, decos);

			// The inline element should NOT be inside a decoration wrapper
			const inlineEl = container.querySelector('[contenteditable="false"]');
			expect(inlineEl).not.toBeNull();
			expect(inlineEl?.parentElement).toBe(container);

			// Text should be wrapped in decoration elements
			const decoEls = container.querySelectorAll('[data-decoration="true"]');
			expect(decoEls.length).toBeGreaterThanOrEqual(1);
		});

		it('applies decorations to text segments around InlineNodes', () => {
			const bid = blockId('b1');
			const block = createBlockNode(
				'paragraph',
				[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
				bid,
			);
			const container = document.createElement('div');

			// Decoration on just the first text [0, 2)
			const decos: readonly InlineDecoration[] = [inlineDeco(bid, 0, 2, { class: 'hl' })];
			renderBlockContent(container, block, undefined, decos);

			const decoEls = container.querySelectorAll('.hl');
			expect(decoEls.length).toBe(1);
			expect(decoEls[0]?.textContent).toBe('ab');
		});
	});

	describe('blockChanged with InlineNodes', () => {
		it('detects InlineNode type change via reconcile', () => {
			const container = document.createElement('div');
			const block1 = createBlockNode(
				'paragraph',
				[createTextNode('a'), createInlineNode(inlineType('image'))],
				'b1',
			);
			const block2 = createBlockNode(
				'paragraph',
				[createTextNode('a'), createInlineNode(inlineType('emoji'))],
				'b1',
			);

			const state1 = EditorState.create({
				doc: createDocument([block1]),
				selection: createCollapsedSelection('b1', 0),
			});
			const state2 = EditorState.create({
				doc: createDocument([block2]),
				selection: createCollapsedSelection('b1', 0),
			});

			reconcile(container, null, state1);
			const firstRender = container.firstChild as HTMLElement;
			const firstInline = firstRender.querySelector('[data-inline-type]');
			expect(firstInline?.getAttribute('data-inline-type')).toBe('image');

			reconcile(container, state1, state2);
			const secondInline = (container.firstChild as HTMLElement).querySelector(
				'[data-inline-type]',
			);
			expect(secondInline?.getAttribute('data-inline-type')).toBe('emoji');
		});

		it('detects InlineNode attrs change via reconcile', () => {
			const container = document.createElement('div');
			const block1 = createBlockNode(
				'paragraph',
				[createInlineNode(inlineType('image'), { src: 'a.png' })],
				'b1',
			);
			const block2 = createBlockNode(
				'paragraph',
				[createInlineNode(inlineType('image'), { src: 'b.png' })],
				'b1',
			);

			const state1 = EditorState.create({
				doc: createDocument([block1]),
				selection: createCollapsedSelection('b1', 0),
			});
			const state2 = EditorState.create({
				doc: createDocument([block2]),
				selection: createCollapsedSelection('b1', 0),
			});

			reconcile(container, null, state1);
			reconcile(container, state1, state2);

			// Block should have been re-rendered (new DOM element)
			const inlineEl = (container.firstChild as HTMLElement).querySelector(
				'[data-inline-type="image"]',
			);
			expect(inlineEl).not.toBeNull();
		});

		it('does not re-render when InlineNode is unchanged', () => {
			const container = document.createElement('div');
			const inline = createInlineNode(inlineType('img'), { src: 'x.png' });
			const block = createBlockNode('paragraph', [inline], 'b1');

			const state = EditorState.create({
				doc: createDocument([block]),
				selection: createCollapsedSelection('b1', 0),
			});

			reconcile(container, null, state);
			const firstChild = container.firstChild;

			// Same state → no re-render
			reconcile(container, state, state);
			expect(container.firstChild).toBe(firstChild);
		});
	});

	describe('renderBlock with InlineNodes', () => {
		it('renders a block with mixed content using fallback', () => {
			const block = createBlockNode('paragraph', [
				createTextNode('text'),
				createInlineNode(inlineType('widget')),
			]);
			const el = renderBlock(block);

			expect(el.tagName).toBe('P');
			expect(el.getAttribute('data-block-id')).toBe(block.id);
			expect(el.querySelector('[data-inline-type="widget"]')).not.toBeNull();
			expect(el.textContent).toContain('text');
		});
	});
});
