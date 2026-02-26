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
import { createBlockElement } from '../model/NodeSpec.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, inlineType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { NodeViewRegistry } from './NodeViewRegistry.js';
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

describe('Void block rendering', () => {
	it('renderBlock sets data-void on void blocks when NodeSpec has isVoid', () => {
		const registry = new SchemaRegistry();
		const hrSpec: NodeSpec = {
			type: 'horizontal_rule',
			isVoid: true,
			toDOM(node) {
				const el = createBlockElement('hr', node.id);
				return el;
			},
		};
		registry.registerNodeSpec(hrSpec);

		const block = createBlockNode('horizontal_rule', [createTextNode('')], blockId('hr1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-void')).toBe('true');
	});

	it('renderBlock does NOT set data-void on regular blocks', () => {
		const registry = new SchemaRegistry();
		const pSpec: NodeSpec = {
			type: 'paragraph',
			toDOM(node) {
				const el = createBlockElement('p', node.id);
				return el;
			},
		};
		registry.registerNodeSpec(pSpec);

		const block = createBlockNode('paragraph', [createTextNode('hello')], blockId('p1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-void')).toBeNull();
	});

	it('reconcile applies data-void during full reconciliation', () => {
		const registry = new SchemaRegistry();
		const hrSpec: NodeSpec = {
			type: 'horizontal_rule',
			isVoid: true,
			toDOM(node) {
				const el = createBlockElement('hr', node.id);
				return el;
			},
		};
		registry.registerNodeSpec(hrSpec);

		const block = createBlockNode('horizontal_rule', [createTextNode('')], blockId('hr1'));
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection('hr1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const renderedEl = container.firstChild as HTMLElement;
		expect(renderedEl.getAttribute('data-void')).toBe('true');
	});
});

describe('Block wrapper reconciliation', () => {
	function makeListSpec(): NodeSpec {
		return {
			type: 'list_item',
			toDOM(node) {
				const el = createBlockElement('li', node.id);
				el.setAttribute('data-list-type', String(node.attrs?.listType ?? 'bullet'));
				return el;
			},
			wrapper(node) {
				const listType = String(node.attrs?.listType ?? 'bullet');
				const tag = listType === 'ordered' ? 'ol' : 'ul';
				return {
					tag,
					key: `list-${listType}`,
					className: `notectl-list notectl-list--${listType}`,
					attrs: { role: 'list' },
				};
			},
		};
	}

	it('wraps consecutive list items in a ul element', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks = [
			createBlockNode('list_item', [createTextNode('a')], 'b1', { listType: 'bullet' }),
			createBlockNode('list_item', [createTextNode('b')], 'b2', { listType: 'bullet' }),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.getAttribute('role')).toBe('list');
		expect(wrapper?.children.length).toBe(2);
		expect(wrapper?.children[0]?.tagName).toBe('LI');
		expect(wrapper?.children[1]?.tagName).toBe('LI');
	});

	it('wraps ordered list items in an ol element', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks = [
			createBlockNode('list_item', [createTextNode('1')], 'b1', { listType: 'ordered' }),
			createBlockNode('list_item', [createTextNode('2')], 'b2', { listType: 'ordered' }),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const wrapper = container.querySelector('ol[data-block-wrapper]');
		expect(wrapper).not.toBeNull();
		expect(wrapper?.getAttribute('data-block-wrapper')).toBe('list-ordered');
	});

	it('creates separate wrappers for different list types', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const pSpec: NodeSpec = {
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		};
		registry.registerNodeSpec(pSpec);

		const blocks = [
			createBlockNode('list_item', [createTextNode('a')], 'b1', { listType: 'bullet' }),
			createBlockNode('list_item', [createTextNode('1')], 'b2', { listType: 'ordered' }),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const uls = container.querySelectorAll('ul[data-block-wrapper]');
		const ols = container.querySelectorAll('ol[data-block-wrapper]');
		expect(uls.length).toBe(1);
		expect(ols.length).toBe(1);
	});

	it('non-list blocks break wrapper grouping', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		});

		const blocks = [
			createBlockNode('list_item', [createTextNode('a')], 'b1', { listType: 'bullet' }),
			createBlockNode('paragraph', [createTextNode('p')], 'b2'),
			createBlockNode('list_item', [createTextNode('b')], 'b3', { listType: 'bullet' }),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const wrappers = container.querySelectorAll('ul[data-block-wrapper]');
		expect(wrappers.length).toBe(2);
		expect(wrappers[0]?.children.length).toBe(1);
		expect(wrappers[1]?.children.length).toBe(1);

		// Paragraph is between the two wrappers
		const p = container.querySelector('p');
		expect(p).not.toBeNull();
	});

	it('preserves wrappers across incremental reconcile', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks1 = [
			createBlockNode('list_item', [createTextNode('a')], 'b1', { listType: 'bullet' }),
		];
		const blocks2 = [
			createBlockNode('list_item', [createTextNode('a')], 'b1', { listType: 'bullet' }),
			createBlockNode('list_item', [createTextNode('b')], 'b2', { listType: 'bullet' }),
		];

		const state1 = EditorState.create({
			doc: createDocument(blocks1),
			selection: createCollapsedSelection('b1', 0),
		});
		const state2 = EditorState.create({
			doc: createDocument(blocks2),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state1, { registry });

		let wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper?.children.length).toBe(1);

		reconcile(container, state1, state2, { registry });

		wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper?.children.length).toBe(2);
	});

	it('reconciles wrapped blocks during composition without duplicating DOM nodes', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks1 = [
			createBlockNode('list_item', [createTextNode('first')], 'b1', { listType: 'bullet' }),
			createBlockNode('list_item', [createTextNode('second')], 'b2', { listType: 'bullet' }),
		];
		const blocks2 = [
			createBlockNode('list_item', [createTextNode('first')], 'b1', { listType: 'bullet' }),
			createBlockNode('list_item', [createTextNode('second!')], 'b2', { listType: 'bullet' }),
		];

		const state1 = EditorState.create({
			doc: createDocument(blocks1),
			selection: createCollapsedSelection('b1', 0),
		});
		const state2 = EditorState.create({
			doc: createDocument(blocks2),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state1, { registry });

		expect(container.querySelectorAll('[data-block-id="b1"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-block-id="b2"]')).toHaveLength(1);

		reconcile(container, state1, state2, {
			registry,
			compositionBlockId: blockId('b1'),
		});

		const wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper?.children.length).toBe(2);
		expect(container.querySelectorAll('[data-block-id="b1"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-block-id="b2"]')).toHaveLength(1);
		expect(wrapper?.textContent).toContain('first');
		expect(wrapper?.textContent).toContain('second!');
	});
});

describe('data-block-type attribute', () => {
	it('sets data-block-type on fallback-rendered blocks', () => {
		const block = createBlockNode('paragraph', [createTextNode('hello')], blockId('p1'));
		const el = renderBlock(block);

		expect(el.getAttribute('data-block-type')).toBe('paragraph');
	});

	it('sets data-block-type on NodeSpec-rendered blocks', () => {
		const registry = new SchemaRegistry();
		const pSpec: NodeSpec = {
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		};
		registry.registerNodeSpec(pSpec);

		const block = createBlockNode('paragraph', [createTextNode('hello')], blockId('p1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-block-type')).toBe('paragraph');
	});

	it('sets data-block-type on NodeView-rendered blocks', () => {
		const nodeViewRegistry = new NodeViewRegistry();
		const nodeViews = new Map();
		const state = EditorState.create({
			doc: createDocument([createBlockNode('custom', [createTextNode('hi')], blockId('c1'))]),
			selection: createCollapsedSelection('c1', 0),
		});
		nodeViewRegistry.registerNodeView('custom', (node) => {
			const dom = document.createElement('div');
			dom.setAttribute('data-block-id', node.id);
			const contentDOM = document.createElement('div');
			dom.appendChild(contentDOM);
			return { dom, contentDOM };
		});

		const block = createBlockNode('custom', [createTextNode('hi')], blockId('c1'));
		const el = renderBlock(block, undefined, nodeViews, {
			nodeViewRegistry,
			getState: () => state,
			dispatch: () => {},
		});

		expect(el.getAttribute('data-block-type')).toBe('custom');
	});

	it('sets data-block-type during full reconcile', () => {
		const block = createBlockNode('paragraph', [createTextNode('text')], blockId('b1'));
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection('b1', 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state);

		const el = container.firstChild as HTMLElement;
		expect(el.getAttribute('data-block-type')).toBe('paragraph');
	});
});

describe('Selectable block rendering', () => {
	it('renderBlock sets data-selectable when NodeSpec has selectable', () => {
		const registry = new SchemaRegistry();
		const tableSpec: NodeSpec = {
			type: 'table',
			selectable: true,
			toDOM(node) {
				return createBlockElement('div', node.id);
			},
		};
		registry.registerNodeSpec(tableSpec);

		const block = createBlockNode('table', [], blockId('t1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-selectable')).toBe('true');
	});
});

describe('CursorWrapper stale removal', () => {
	it('renderBlockContent removes stale data-cursor-wrapper elements', () => {
		const block = createBlockNode('paragraph', [createTextNode('Hello')]);
		const container = document.createElement('div');

		// Simulate a stale CursorWrapper left in the DOM
		const staleWrapper = document.createElement('span');
		staleWrapper.setAttribute('data-cursor-wrapper', '');
		staleWrapper.textContent = '\u200B';
		container.appendChild(staleWrapper);

		renderBlockContent(container, block);

		expect(container.querySelector('[data-cursor-wrapper]')).toBeNull();
		expect(container.textContent).toBe('Hello');
	});
});
