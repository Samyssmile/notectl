import { describe, expect, it, vi } from 'vitest';
import {
	DecorationSet,
	inline as inlineDeco,
	node as nodeDeco,
	widget as widgetDeco,
} from '../decorations/Decoration.js';
import type { InlineDecoration } from '../decorations/Decoration.js';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
} from '../model/Document.js';
import type { InlineNodeSpec } from '../model/InlineNodeSpec.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection, createNodeSelection } from '../model/Selection.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { getStyleText, setStyleText } from '../style/StyleRuntime.js';
import { createBlockElement } from './DomUtils.js';
import { NodeViewRegistry } from './NodeViewRegistry.js';
import { reconcile, renderBlock, renderBlockContent } from './Reconciler.js';

describe('Reconciler InlineNode support', () => {
	describe('renderBlockContent', () => {
		it('renders text-only content as before', () => {
			const block = createBlockNode(nodeType('paragraph'), [createTextNode('hello')]);
			const container = document.createElement('div');
			renderBlockContent(container, block);
			expect(container.textContent).toBe('hello');
		});

		it('renders empty block as <br>', () => {
			const block = createBlockNode(nodeType('paragraph'), [createTextNode('')]);
			const container = document.createElement('div');
			renderBlockContent(container, block);
			expect(container.innerHTML).toBe('<br>');
		});

		it('renders InlineNode as contentEditable=false element', () => {
			const block = createBlockNode(nodeType('paragraph'), [
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

			const block = createBlockNode(nodeType('paragraph'), [
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
			const block = createBlockNode(nodeType('paragraph'), [
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
			const block = createBlockNode(nodeType('paragraph'), [
				createTextNode('bold', [{ type: markType('bold') }]),
				createInlineNode(inlineType('hr')),
				createTextNode('italic', [{ type: markType('italic') }]),
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
				nodeType('paragraph'),
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
				nodeType('paragraph'),
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
				nodeType('paragraph'),
				[createTextNode('a'), createInlineNode(inlineType('image'))],
				blockId('b1'),
			);
			const block2 = createBlockNode(
				nodeType('paragraph'),
				[createTextNode('a'), createInlineNode(inlineType('emoji'))],
				blockId('b1'),
			);

			const state1 = EditorState.create({
				doc: createDocument([block1]),
				selection: createCollapsedSelection(blockId('b1'), 0),
			});
			const state2 = EditorState.create({
				doc: createDocument([block2]),
				selection: createCollapsedSelection(blockId('b1'), 0),
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
				nodeType('paragraph'),
				[createInlineNode(inlineType('image'), { src: 'a.png' })],
				blockId('b1'),
			);
			const block2 = createBlockNode(
				nodeType('paragraph'),
				[createInlineNode(inlineType('image'), { src: 'b.png' })],
				blockId('b1'),
			);

			const state1 = EditorState.create({
				doc: createDocument([block1]),
				selection: createCollapsedSelection(blockId('b1'), 0),
			});
			const state2 = EditorState.create({
				doc: createDocument([block2]),
				selection: createCollapsedSelection(blockId('b1'), 0),
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
			const block = createBlockNode(nodeType('paragraph'), [inline], blockId('b1'));

			const state = EditorState.create({
				doc: createDocument([block]),
				selection: createCollapsedSelection(blockId('b1'), 0),
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
			const block = createBlockNode(nodeType('paragraph'), [
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

describe('semantic HTML ID rendering', () => {
	it('applies an HTML ID through fallback and NodeSpec rendering', () => {
		const fallbackBlock = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('fallback')],
			blockId('fallback'),
			undefined,
			'fallback-target',
		);
		expect(renderBlock(fallbackBlock).id).toBe('fallback-target');

		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		});
		const specBlock = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('spec')],
			blockId('spec'),
			undefined,
			'spec-target',
		);
		expect(renderBlock(specBlock, registry).id).toBe('spec-target');
	});

	it('synchronizes ID changes when a NodeView handles its own update', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'custom',
			toDOM(node) {
				return createBlockElement('div', node.id);
			},
		});
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('custom', (node) => {
			const dom = createBlockElement('div', node.id);
			const contentDOM = document.createElement('div');
			dom.appendChild(contentDOM);
			return { dom, contentDOM, update: () => true };
		});

		const makeState = (htmlId?: string): EditorState =>
			EditorState.create({
				doc: createDocument([
					createBlockNode(
						nodeType('custom'),
						[createTextNode('content')],
						blockId('custom'),
						undefined,
						htmlId,
					),
				]),
				selection: createCollapsedSelection(blockId('custom'), 0),
			});
		const container = document.createElement('div');
		const nodeViews = new Map();
		let current = makeState('old-target');
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => current,
			dispatch: () => {},
		};

		reconcile(container, null, current, options);
		expect((container.firstElementChild as HTMLElement).id).toBe('old-target');

		const old = current;
		current = makeState('new-target');
		reconcile(container, old, current, options);
		expect((container.firstElementChild as HTMLElement).id).toBe('new-target');

		const withID = current;
		current = makeState();
		reconcile(container, withID, current, options);
		expect((container.firstElementChild as HTMLElement).hasAttribute('id')).toBe(false);
	});
});

describe('nested NodeView decorations', () => {
	it('adds and removes descendant node-decoration classes without replacing the NodeView', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'container',
			content: { allow: ['cell'], min: 1 },
			toDOM: (node) => createBlockElement('div', node.id),
		});
		registry.registerNodeSpec({
			type: 'cell',
			toDOM: (node) => createBlockElement('div', node.id),
		});
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('cell', (node) => {
			const dom = createBlockElement('div', node.id);
			dom.classList.add('cell-base');
			return { dom, contentDOM: dom, update: () => true };
		});
		const cell = createBlockNode(nodeType('cell'), [createTextNode('value')], blockId('cell'));
		const root = createBlockNode(nodeType('container'), [cell], blockId('container'));
		const state = EditorState.create({
			doc: createDocument([root]),
			selection: createCollapsedSelection(blockId('cell'), 0),
		});
		const container = document.createElement('div');
		const nodeViews = new Map();
		const baseOptions = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => state,
			dispatch: () => {},
		};

		reconcile(container, null, state, {
			...baseOptions,
			decorations: DecorationSet.empty,
		});
		const cellElement = container.querySelector<HTMLElement>('[data-block-id="cell"]');
		if (!cellElement) throw new Error('Expected nested cell NodeView');

		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: DecorationSet.empty,
			decorations: DecorationSet.create([nodeDeco(blockId('cell'), { class: 'cell-selected' })]),
		});
		expect(cellElement.classList.contains('cell-selected')).toBe(true);

		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: DecorationSet.create([nodeDeco(blockId('cell'), { class: 'cell-selected' })]),
			decorations: DecorationSet.empty,
		});
		expect(cellElement.classList.contains('cell-selected')).toBe(false);
		expect(cellElement.classList.contains('cell-base')).toBe(true);
		expect(container.querySelector('[data-block-id="cell"]')).toBe(cellElement);
	});

	it('updates node-decoration styles and restores NodeView-owned style values', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'container',
			content: { allow: ['cell'], min: 1 },
			toDOM: (node) => createBlockElement('div', node.id),
		});
		registry.registerNodeSpec({
			type: 'cell',
			toDOM: (node) => createBlockElement('div', node.id),
		});
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('cell', (node) => {
			const dom = createBlockElement('div', node.id);
			setStyleText(dom, 'color: black; background-color: white');
			return { dom, contentDOM: dom, update: () => true };
		});
		const cell = createBlockNode(nodeType('cell'), [createTextNode('value')], blockId('cell'));
		const state = EditorState.create({
			doc: createDocument([createBlockNode(nodeType('container'), [cell], blockId('container'))]),
			selection: createCollapsedSelection(blockId('cell'), 0),
		});
		const container = document.createElement('div');
		const baseOptions = {
			registry,
			nodeViewRegistry,
			nodeViews: new Map(),
			getState: () => state,
			dispatch: () => {},
		};

		reconcile(container, null, state, baseOptions);
		const cellElement = container.querySelector<HTMLElement>('[data-block-id="cell"]');
		if (!cellElement) throw new Error('Expected nested cell NodeView');

		const red = DecorationSet.create([
			nodeDeco(blockId('cell'), { style: 'color: red; border-color: green' }),
		]);
		reconcile(container, state, state, { ...baseOptions, decorations: red });
		expect(getStyleText(cellElement)).toContain('color: red');
		expect(getStyleText(cellElement)).toContain('background-color: white');
		expect(getStyleText(cellElement)).toContain('border-color: green');

		const blue = DecorationSet.create([nodeDeco(blockId('cell'), { style: 'color: blue' })]);
		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: red,
			decorations: blue,
		});
		expect(getStyleText(cellElement)).toContain('color: blue');
		expect(getStyleText(cellElement)).toContain('background-color: white');
		expect(getStyleText(cellElement)).not.toContain('border-color');

		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: blue,
			decorations: DecorationSet.empty,
		});
		expect(getStyleText(cellElement)).toContain('color: black');
		expect(getStyleText(cellElement)).toContain('background-color: white');
		expect(getStyleText(cellElement)).not.toContain('border-color');
	});
});

describe('Void block rendering', () => {
	it('preserves atomic NodeView DOM while synchronizing decorations', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'image',
			isVoid: true,
			toDOM: (node) => createBlockElement('figure', node.id),
		});
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('image', (node) => {
			const dom = createBlockElement('figure', node.id);
			const image = document.createElement('img');
			image.className = 'notectl-image__img';
			dom.appendChild(image);
			return { dom, contentDOM: null };
		});
		const image = createBlockNode(nodeType('image'), [], blockId('image-1'));
		const state = EditorState.create({
			doc: createDocument([image]),
			selection: createCollapsedSelection(image.id, 0),
		});
		const container = document.createElement('div');

		reconcile(container, null, state, {
			registry,
			nodeViewRegistry,
			nodeViews: new Map(),
			getState: () => state,
			dispatch: () => {},
		});

		expect(container.querySelector('.notectl-image__img')).not.toBeNull();
	});

	it('preserves DOM supplied by a void NodeSpec while synchronizing decorations', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'image',
			isVoid: true,
			toDOM(node) {
				const dom = createBlockElement('figure', node.id);
				const image = document.createElement('img');
				image.className = 'notectl-image__img';
				dom.appendChild(image);
				return dom;
			},
		});
		const image = createBlockNode(nodeType('image'), [], blockId('image-1'));
		const state = EditorState.create({
			doc: createDocument([image]),
			selection: createCollapsedSelection(image.id, 0),
		});
		const container = document.createElement('div');

		reconcile(container, null, state, { registry });

		expect(container.querySelector('.notectl-image__img')).not.toBeNull();
	});

	it('renderBlock sets data-void on void blocks when NodeSpec has isVoid', () => {
		const registry = new SchemaRegistry();
		const hrSpec: NodeSpec = {
			type: 'horizontal_rule',
			isVoid: true,
			toDOM(node) {
				return createBlockElement('hr', node.id);
			},
		};
		registry.registerNodeSpec(hrSpec);

		const block = createBlockNode(
			nodeType('horizontal_rule'),
			[createTextNode('')],
			blockId('hr1'),
		);
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-void')).toBe('true');
	});

	it('renderBlock does NOT set data-void on regular blocks', () => {
		const registry = new SchemaRegistry();
		const pSpec: NodeSpec = {
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		};
		registry.registerNodeSpec(pSpec);

		const block = createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('p1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-void')).toBeNull();
	});

	it('reconcile applies data-void during full reconciliation', () => {
		const registry = new SchemaRegistry();
		const hrSpec: NodeSpec = {
			type: 'horizontal_rule',
			isVoid: true,
			toDOM(node) {
				return createBlockElement('hr', node.id);
			},
		};
		registry.registerNodeSpec(hrSpec);

		const block = createBlockNode(
			nodeType('horizontal_rule'),
			[createTextNode('')],
			blockId('hr1'),
		);
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection(blockId('hr1'), 0),
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
			createBlockNode(nodeType('list_item'), [createTextNode('a')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('b')], blockId('b2'), {
				listType: 'bullet',
			}),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b1'), 0),
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
			createBlockNode(nodeType('list_item'), [createTextNode('1')], blockId('b1'), {
				listType: 'ordered',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('2')], blockId('b2'), {
				listType: 'ordered',
			}),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b1'), 0),
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
			createBlockNode(nodeType('list_item'), [createTextNode('a')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('1')], blockId('b2'), {
				listType: 'ordered',
			}),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b1'), 0),
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
			createBlockNode(nodeType('list_item'), [createTextNode('a')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('paragraph'), [createTextNode('p')], blockId('b2')),
			createBlockNode(nodeType('list_item'), [createTextNode('b')], blockId('b3'), {
				listType: 'bullet',
			}),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b1'), 0),
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
			createBlockNode(nodeType('list_item'), [createTextNode('a')], blockId('b1'), {
				listType: 'bullet',
			}),
		];
		const blocks2 = [
			createBlockNode(nodeType('list_item'), [createTextNode('a')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('b')], blockId('b2'), {
				listType: 'bullet',
			}),
		];

		const state1 = EditorState.create({
			doc: createDocument(blocks1),
			selection: createCollapsedSelection(blockId('b1'), 0),
		});
		const state2 = EditorState.create({
			doc: createDocument(blocks2),
			selection: createCollapsedSelection(blockId('b1'), 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state1, { registry });

		let wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper?.children.length).toBe(1);

		reconcile(container, state1, state2, { registry });

		wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper?.children.length).toBe(2);
	});

	it('preserves wrapper DOM identity on selection-only reconcile', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks = [
			createBlockNode(nodeType('list_item'), [createTextNode('Alpha')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('Gamma')], blockId('b2'), {
				listType: 'bullet',
			}),
		];

		const state1 = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b1'), 0),
		});
		const state2 = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('b2'), 3),
		});

		const container = document.createElement('div');
		reconcile(container, null, state1, { registry });

		const wrapperBefore = container.querySelector('ul[data-block-wrapper]');
		expect(wrapperBefore).not.toBeNull();
		expect(wrapperBefore?.children.length).toBe(2);

		// Selection-only change — wrapper element must be the same DOM object
		reconcile(container, state1, state2, { registry });

		const wrapperAfter = container.querySelector('ul[data-block-wrapper]');
		expect(wrapperAfter).toBe(wrapperBefore);
		expect(wrapperAfter?.children.length).toBe(2);
	});

	it('reconciles wrapped blocks during composition without duplicating DOM nodes', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec(makeListSpec());

		const blocks1 = [
			createBlockNode(nodeType('list_item'), [createTextNode('first')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('second')], blockId('b2'), {
				listType: 'bullet',
			}),
		];
		const blocks2 = [
			createBlockNode(nodeType('list_item'), [createTextNode('first')], blockId('b1'), {
				listType: 'bullet',
			}),
			createBlockNode(nodeType('list_item'), [createTextNode('second!')], blockId('b2'), {
				listType: 'bullet',
			}),
		];

		const state1 = EditorState.create({
			doc: createDocument(blocks1),
			selection: createCollapsedSelection(blockId('b1'), 0),
		});
		const state2 = EditorState.create({
			doc: createDocument(blocks2),
			selection: createCollapsedSelection(blockId('b1'), 0),
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
		const block = createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('p1'));
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

		const block = createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('p1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-block-type')).toBe('paragraph');
	});

	it('sets data-block-type on NodeView-rendered blocks', () => {
		const nodeViewRegistry = new NodeViewRegistry();
		const nodeViews = new Map();
		const state = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('custom'), [createTextNode('hi')], blockId('c1')),
			]),
			selection: createCollapsedSelection(blockId('c1'), 0),
		});
		nodeViewRegistry.registerNodeView('custom', (node) => {
			const dom = document.createElement('div');
			dom.setAttribute('data-block-id', node.id);
			const contentDOM = document.createElement('div');
			dom.appendChild(contentDOM);
			return { dom, contentDOM };
		});

		const block = createBlockNode(nodeType('custom'), [createTextNode('hi')], blockId('c1'));
		const el = renderBlock(block, undefined, nodeViews, {
			nodeViewRegistry,
			getState: () => state,
			dispatch: () => {},
		});

		expect(el.getAttribute('data-block-type')).toBe('custom');
	});

	it('sets data-block-type during full reconcile', () => {
		const block = createBlockNode(nodeType('paragraph'), [createTextNode('text')], blockId('b1'));
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection(blockId('b1'), 0),
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

		const block = createBlockNode(nodeType('table'), [], blockId('t1'));
		const el = renderBlock(block, registry);

		expect(el.getAttribute('data-selectable')).toBe('true');
	});
});

describe('Container list items (#194)', () => {
	function makeContainerListRegistry(): SchemaRegistry {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'list_item',
			content: { allow: ['text', 'paragraph', 'code_block'] },
			toDOM(node) {
				const el = createBlockElement('li', node.id);
				el.setAttribute('data-list-type', String(node.attrs?.listType ?? 'bullet'));
				return el;
			},
			wrapper(node) {
				const listType = String(node.attrs?.listType ?? 'bullet');
				return {
					tag: listType === 'ordered' ? 'ol' : 'ul',
					key: `list-${listType}`,
					className: `notectl-list notectl-list--${listType}`,
					attrs: { role: 'list' },
				};
			},
		});
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM(node) {
				return createBlockElement('p', node.id);
			},
		});
		return registry;
	}

	function containerItem(text1: string, text2: string): BlockNode {
		return createBlockNode(
			nodeType('list_item'),
			[
				createBlockNode(nodeType('paragraph'), [createTextNode(text1)], blockId('c1')),
				createBlockNode(nodeType('paragraph'), [createTextNode(text2)], blockId('c2')),
			],
			blockId('b1'),
			{ listType: 'bullet', indent: 0, checked: false },
		);
	}

	it('renders block children inside the <li> and still wraps it in a <ul>', () => {
		const registry = makeContainerListRegistry();
		const state = EditorState.create({
			doc: createDocument([containerItem('first', 'second')]),
			selection: createCollapsedSelection(blockId('c1'), 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const wrapper = container.querySelector('ul[data-block-wrapper]');
		expect(wrapper).not.toBeNull();
		const li = wrapper?.querySelector('li[data-block-id="b1"]');
		expect(li).not.toBeNull();
		const paragraphs = li?.querySelectorAll('p[data-block-id]');
		expect(paragraphs?.length).toBe(2);
		expect(paragraphs?.[0]?.textContent).toBe('first');
		expect(paragraphs?.[1]?.textContent).toBe('second');
	});

	it('reconciles an edit inside a child paragraph of a container item', () => {
		const registry = makeContainerListRegistry();
		const state1 = EditorState.create({
			doc: createDocument([containerItem('first', 'second')]),
			selection: createCollapsedSelection(blockId('c1'), 0),
		});
		const state2 = EditorState.create({
			doc: createDocument([containerItem('first', 'changed')]),
			selection: createCollapsedSelection(blockId('c2'), 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state1, { registry });
		reconcile(container, state1, state2, { registry });

		const li = container.querySelector('li[data-block-id="b1"]');
		expect(li?.querySelectorAll('p[data-block-id]').length).toBe(2);
		expect(li?.querySelector('p[data-block-id="c2"]')?.textContent).toBe('changed');
		expect(container.querySelectorAll('ul[data-block-wrapper]').length).toBe(1);
	});

	it('keeps leaf and container items in the same wrapper', () => {
		const registry = makeContainerListRegistry();
		const blocks = [
			createBlockNode(nodeType('list_item'), [createTextNode('leaf')], blockId('l1'), {
				listType: 'bullet',
				indent: 0,
				checked: false,
			}),
			containerItem('first', 'second'),
		];
		const state = EditorState.create({
			doc: createDocument(blocks),
			selection: createCollapsedSelection(blockId('l1'), 0),
		});

		const container = document.createElement('div');
		reconcile(container, null, state, { registry });

		const wrappers = container.querySelectorAll('ul[data-block-wrapper]');
		expect(wrappers.length).toBe(1);
		expect(wrappers[0]?.children.length).toBe(2);
	});
});

describe('CursorWrapper stale removal', () => {
	it('renderBlockContent removes stale data-cursor-wrapper elements', () => {
		const block = createBlockNode(nodeType('paragraph'), [createTextNode('Hello')]);
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

describe('NodeView update reconciliation', () => {
	it('destroys composite descendants before rendering replacement inline content', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'container',
			content: { allow: ['container', 'paragraph'], min: 1 },
			toDOM: (node) => createBlockElement('section', node.id),
		});
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: (node) => createBlockElement('p', node.id),
		});

		const lifecycleEvents: string[] = [];
		registry.registerInlineNodeSpec({
			type: 'emoji',
			toDOM: () => {
				lifecycleEvents.push('render:inline');
				const element = document.createElement('span');
				element.textContent = '🙂';
				return element;
			},
		});

		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('container', (node) => {
			const dom = createBlockElement('section', node.id);
			return {
				dom,
				contentDOM: dom,
				update: () => true,
				destroy: () => lifecycleEvents.push(`destroy:${node.id}`),
			};
		});
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			return {
				dom,
				contentDOM: dom,
				destroy: () => lifecycleEvents.push(`destroy:${node.id}`),
			};
		});

		const grandchild = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('nested')],
			blockId('grandchild'),
		);
		const child = createBlockNode(nodeType('container'), [grandchild], blockId('child'));
		const oldRoot = createBlockNode(nodeType('container'), [child], blockId('root'));
		const newRoot = createBlockNode(
			nodeType('container'),
			[createInlineNode(inlineType('emoji'))],
			blockId('root'),
		);
		const oldState = EditorState.create({
			doc: createDocument([oldRoot]),
			selection: createCollapsedSelection(grandchild.id, 0),
		});
		const newState = EditorState.create({
			doc: createDocument([newRoot]),
			selection: createCollapsedSelection(newRoot.id, 1),
		});
		let currentState = oldState;
		const container = document.createElement('div');
		const nodeViews = new Map();
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => currentState,
			dispatch: () => {},
		};

		reconcile(container, null, oldState, options);
		const rootElement = container.querySelector<HTMLElement>('[data-block-id="root"]');
		const childElement = container.querySelector<HTMLElement>('[data-block-id="child"]');
		if (!rootElement || !childElement) throw new Error('Expected rendered composite subtree');
		expect(nodeViews.has('child')).toBe(true);
		expect(nodeViews.has('grandchild')).toBe(true);

		currentState = newState;
		reconcile(container, oldState, newState, options);

		expect(lifecycleEvents).toEqual(['destroy:grandchild', 'destroy:child', 'render:inline']);
		expect(nodeViews.has('child')).toBe(false);
		expect(nodeViews.has('grandchild')).toBe(false);
		expect(nodeViews.get('root')?.dom).toBe(rootElement);
		expect(rootElement.contains(childElement)).toBe(false);
		expect(rootElement.textContent).toBe('🙂');
	});

	it('synchronizes selection callbacks when handled updates also change the model', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: (node) => createBlockElement('p', node.id),
		});
		const selects = new Map<string, ReturnType<typeof vi.fn>>();
		const deselects = new Map<string, ReturnType<typeof vi.fn>>();
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			const selectNode = vi.fn();
			const deselectNode = vi.fn();
			selects.set(node.id, selectNode);
			deselects.set(node.id, deselectNode);
			return { dom, contentDOM: dom, update: () => true, selectNode, deselectNode };
		});

		const firstId = blockId('first');
		const secondId = blockId('second');
		const oldState = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('old first')], firstId),
				createBlockNode(nodeType('paragraph'), [createTextNode('old second')], secondId),
			]),
			selection: createNodeSelection(firstId, [firstId]),
		});
		const newState = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('paragraph'), [createTextNode('new first')], firstId),
				createBlockNode(nodeType('paragraph'), [createTextNode('new second')], secondId),
			]),
			selection: createNodeSelection(secondId, [secondId]),
		});
		let currentState = oldState;
		const container = document.createElement('div');
		const nodeViews = new Map();
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => currentState,
			dispatch: () => {},
		};

		reconcile(container, null, oldState, { ...options, selectedNodeId: firstId });
		expect(selects.get(firstId)).toHaveBeenCalledTimes(1);
		for (const callback of [...selects.values(), ...deselects.values()]) callback.mockClear();
		currentState = newState;
		reconcile(container, oldState, newState, {
			...options,
			previousSelectedNodeId: firstId,
			selectedNodeId: secondId,
		});

		expect(deselects.get(firstId)).toHaveBeenCalledTimes(1);
		expect(selects.get(firstId)).not.toHaveBeenCalled();
		expect(selects.get(secondId)).toHaveBeenCalledTimes(1);
		expect(deselects.get(secondId)).not.toHaveBeenCalled();
		expect(container.querySelector('[data-block-id="first"]')?.textContent).toBe('new first');
		expect(container.querySelector('[data-block-id="second"]')?.textContent).toBe('new second');
	});
});

describe('recursive block ownership', () => {
	function registerContainerSpecs(registry: SchemaRegistry): void {
		registry.registerNodeSpec({
			type: 'container',
			content: { allow: ['container', 'paragraph'], min: 1 },
			toDOM: (node) => createBlockElement('section', node.id),
		});
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: (node) => createBlockElement('p', node.id),
		});
	}

	it('re-renders a nested block when only its identity changes', () => {
		const registry = new SchemaRegistry();
		registerContainerSpecs(registry);
		const makeState = (childId: string): EditorState => {
			const child = createBlockNode(
				nodeType('paragraph'),
				[createTextNode('same content')],
				blockId(childId),
			);
			return EditorState.create({
				doc: createDocument([createBlockNode(nodeType('container'), [child], blockId('root'))]),
				selection: createCollapsedSelection(blockId(childId), 0),
			});
		};
		const oldState = makeState('old-child');
		const newState = makeState('new-child');
		const container = document.createElement('div');

		reconcile(container, null, oldState, { registry });
		reconcile(container, oldState, newState, { registry });

		expect(container.querySelector('[data-block-id="old-child"]')).toBeNull();
		expect(container.querySelector('[data-block-id="new-child"]')?.textContent).toBe(
			'same content',
		);
	});

	it('updates and removes inline decorations on nested leaf blocks in place', () => {
		const registry = new SchemaRegistry();
		registerContainerSpecs(registry);
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			const chrome = document.createElement('span');
			chrome.className = 'leaf-chrome';
			const contentDOM = document.createElement('span');
			dom.append(chrome, contentDOM);
			return { dom, contentDOM, update: () => true };
		});
		const leaf = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('nested text')],
			blockId('leaf'),
		);
		const state = EditorState.create({
			doc: createDocument([createBlockNode(nodeType('container'), [leaf], blockId('root'))]),
			selection: createCollapsedSelection(blockId('leaf'), 0),
		});
		const container = document.createElement('div');
		const nodeViews = new Map();
		const baseOptions = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => state,
			dispatch: () => {},
		};
		const highlighted = DecorationSet.create([
			inlineDeco(blockId('leaf'), 0, 6, { class: 'nested-highlight' }),
		]);

		reconcile(container, null, state, {
			...baseOptions,
			decorations: DecorationSet.empty,
		});
		const leafElement = container.querySelector<HTMLElement>('[data-block-id="leaf"]');
		if (!leafElement) throw new Error('Expected nested leaf block');

		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: DecorationSet.empty,
			decorations: highlighted,
		});
		expect(leafElement.querySelector('.nested-highlight')?.textContent).toBe('nested');
		expect(leafElement.querySelector('.leaf-chrome')).not.toBeNull();
		expect(container.querySelector('[data-block-id="leaf"]')).toBe(leafElement);

		reconcile(container, state, state, {
			...baseOptions,
			oldDecorations: highlighted,
			decorations: DecorationSet.empty,
		});
		expect(leafElement.querySelector('.nested-highlight')).toBeNull();
		expect(leafElement.textContent).toBe('nested text');
		expect(container.querySelector('[data-block-id="leaf"]')).toBe(leafElement);
	});

	it('retains an updated container NodeView while replacing its owned descendants', () => {
		const registry = new SchemaRegistry();
		registerContainerSpecs(registry);
		const nodeViewRegistry = new NodeViewRegistry();
		const rootDestroy = vi.fn();
		const childDestroys: ReturnType<typeof vi.fn>[] = [];
		let rootFactoryCalls = 0;

		nodeViewRegistry.registerNodeView('container', (node) => {
			rootFactoryCalls += 1;
			const dom = createBlockElement('section', node.id);
			return { dom, contentDOM: dom, update: () => true, destroy: rootDestroy };
		});
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			const destroy = vi.fn();
			childDestroys.push(destroy);
			return { dom, contentDOM: dom, update: () => false, destroy };
		});

		const makeState = (text: string): EditorState => {
			const child = createBlockNode(
				nodeType('paragraph'),
				[createTextNode(text)],
				blockId('child'),
			);
			return EditorState.create({
				doc: createDocument([createBlockNode(nodeType('container'), [child], blockId('root'))]),
				selection: createCollapsedSelection(blockId('child'), 0),
			});
		};
		const oldState = makeState('old');
		const newState = makeState('new');
		const container = document.createElement('div');
		const nodeViews = new Map();
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => newState,
			dispatch: () => {},
		};

		reconcile(container, null, oldState, options);
		const rootElement = container.querySelector('[data-block-id="root"]');
		reconcile(container, oldState, newState, options);

		expect(container.querySelector('[data-block-id="root"]')).toBe(rootElement);
		expect(container.querySelector('[data-block-id="child"]')?.textContent).toBe('new');
		expect(rootFactoryCalls).toBe(1);
		expect(rootDestroy).not.toHaveBeenCalled();
		expect(childDestroys).toHaveLength(2);
		expect(childDestroys[0]).toHaveBeenCalledTimes(1);
		expect(childDestroys[1]).not.toHaveBeenCalled();
	});

	it('destroys every NodeView in a replaced or removed subtree exactly once', () => {
		const registry = new SchemaRegistry();
		registerContainerSpecs(registry);
		const nodeViewRegistry = new NodeViewRegistry();
		const destroys = new Map<string, ReturnType<typeof vi.fn>[]>();

		for (const type of ['container', 'paragraph']) {
			nodeViewRegistry.registerNodeView(type, (node) => {
				const dom = createBlockElement(type === 'container' ? 'section' : 'p', node.id);
				const destroy = vi.fn();
				const generations = destroys.get(node.id) ?? [];
				generations.push(destroy);
				destroys.set(node.id, generations);
				return { dom, contentDOM: dom, update: () => false, destroy };
			});
		}

		const makeState = (text: string): EditorState => {
			const grandchild = createBlockNode(
				nodeType('paragraph'),
				[createTextNode(text)],
				blockId('grandchild'),
			);
			const child = createBlockNode(nodeType('container'), [grandchild], blockId('child'));
			return EditorState.create({
				doc: createDocument([createBlockNode(nodeType('container'), [child], blockId('root'))]),
				selection: createCollapsedSelection(blockId('grandchild'), 0),
			});
		};
		const firstState = makeState('first');
		const secondState = makeState('second');
		const emptyState = EditorState.create({
			doc: createDocument([]),
			selection: createCollapsedSelection(blockId(''), 0),
		});
		const container = document.createElement('div');
		const nodeViews = new Map();
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => secondState,
			dispatch: () => {},
		};

		reconcile(container, null, firstState, options);
		reconcile(container, firstState, secondState, options);

		for (const id of ['root', 'child', 'grandchild']) {
			expect(destroys.get(id)).toHaveLength(2);
			expect(destroys.get(id)?.[0]).toHaveBeenCalledTimes(1);
			expect(destroys.get(id)?.[1]).not.toHaveBeenCalled();
		}

		reconcile(container, secondState, emptyState, options);
		for (const id of ['root', 'child', 'grandchild']) {
			expect(destroys.get(id)?.[0]).toHaveBeenCalledTimes(1);
			expect(destroys.get(id)?.[1]).toHaveBeenCalledTimes(1);
		}
		expect(nodeViews.size).toBe(0);
	});

	it('transfers a moved descendant between top-level owners without leaking or destroying the new view', () => {
		const registry = new SchemaRegistry();
		registerContainerSpecs(registry);
		const nodeViewRegistry = new NodeViewRegistry();
		const destroys = new Map<string, ReturnType<typeof vi.fn>[]>();
		const instances = new Map<string, HTMLElement[]>();
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			const destroy = vi.fn();
			const destroyGenerations = destroys.get(node.id) ?? [];
			destroyGenerations.push(destroy);
			destroys.set(node.id, destroyGenerations);
			const domGenerations = instances.get(node.id) ?? [];
			domGenerations.push(dom);
			instances.set(node.id, domGenerations);
			return { dom, contentDOM: dom, destroy };
		});

		const paragraph = (id: string, text: string): BlockNode =>
			createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
		const oldState = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('container'), [paragraph('a-child', 'A')], blockId('a')),
				createBlockNode(nodeType('container'), [paragraph('moving', 'move')], blockId('b')),
			]),
			selection: createCollapsedSelection(blockId('moving'), 0),
		});
		const newState = EditorState.create({
			doc: createDocument([
				createBlockNode(nodeType('container'), [paragraph('moving', 'move')], blockId('a')),
				createBlockNode(nodeType('container'), [paragraph('b-child', 'B')], blockId('b')),
			]),
			selection: createCollapsedSelection(blockId('moving'), 0),
		});
		const container = document.createElement('div');
		const nodeViews = new Map();
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => newState,
			dispatch: () => {},
		};

		reconcile(container, null, oldState, options);
		reconcile(container, oldState, newState, options);

		expect(destroys.get('moving')).toHaveLength(2);
		expect(destroys.get('moving')?.[0]).toHaveBeenCalledTimes(1);
		expect(destroys.get('moving')?.[1]).not.toHaveBeenCalled();
		expect(nodeViews.get('moving')?.dom).toBe(instances.get('moving')?.[1]);
		expect(container.querySelector('[data-block-id="a"] [data-block-id="moving"]')).toBe(
			instances.get('moving')?.[1],
		);
	});
});

describe('widget decoration rendering', () => {
	it('renders by offset and side, reuses keyed DOM, and removes stale widgets', () => {
		const bid = blockId('paragraph');
		const block = createBlockNode(nodeType('paragraph'), [createTextNode('abc')], bid);
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection(bid, 0),
		});
		const container = document.createElement('div');
		const stableFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'stable';
			return element;
		});
		const afterFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'after';
			return element;
		});
		const unkeyedFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'temporary';
			return element;
		});
		const firstDecorations = DecorationSet.create([
			widgetDeco(bid, 1, afterFactory, { side: 1, key: 'after' }),
			widgetDeco(bid, 1, stableFactory, { side: -1, key: 'stable' }),
			widgetDeco(bid, 2, unkeyedFactory),
		]);

		reconcile(container, null, state, { decorations: firstDecorations });
		const paragraph = container.querySelector<HTMLElement>('[data-block-id="paragraph"]');
		if (!paragraph) throw new Error('Expected paragraph');
		const stableElement = paragraph.querySelector<HTMLElement>('[data-widget-key="stable"]');
		const temporaryElement = Array.from(
			paragraph.querySelectorAll<HTMLElement>('[data-decoration-widget]'),
		).find((element) => element.textContent === 'temporary');
		expect(stableElement).not.toBeNull();
		expect(paragraph.textContent).toBe('astableafterbtemporaryc');
		expect(
			Array.from(paragraph.querySelectorAll<HTMLElement>('[data-decoration-widget]')).map(
				(element) => element.getAttribute('data-widget-side'),
			),
		).toEqual(['-1', '1', '-1']);
		expect(stableFactory).toHaveBeenCalledTimes(1);

		const replacementFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'replacement';
			return element;
		});
		const movedDecorations = DecorationSet.create([
			widgetDeco(bid, 2, replacementFactory, { side: -1, key: 'stable' }),
		]);
		reconcile(container, state, state, {
			oldDecorations: firstDecorations,
			decorations: movedDecorations,
		});

		expect(paragraph.querySelector('[data-widget-key="stable"]')).toBe(stableElement);
		expect(paragraph.textContent).toBe('abstablec');
		expect(replacementFactory).not.toHaveBeenCalled();
		expect(temporaryElement?.isConnected).toBe(false);

		const updatedBlock = createBlockNode(nodeType('paragraph'), [createTextNode('abcd')], bid);
		const updatedState = EditorState.create({
			doc: createDocument([updatedBlock]),
			selection: createCollapsedSelection(bid, 0),
		});
		reconcile(container, state, updatedState, {
			oldDecorations: movedDecorations,
			decorations: movedDecorations,
		});
		const updatedParagraph = container.querySelector<HTMLElement>('[data-block-id="paragraph"]');
		expect(updatedParagraph?.querySelector('[data-widget-key="stable"]')).toBe(stableElement);
		expect(updatedParagraph?.textContent).toBe('abstablecd');
		expect(replacementFactory).not.toHaveBeenCalled();

		reconcile(container, updatedState, updatedState, {
			oldDecorations: movedDecorations,
			decorations: DecorationSet.empty,
		});
		expect(updatedParagraph?.querySelector('[data-decoration-widget]')).toBeNull();
		expect(updatedParagraph?.textContent).toBe('abcd');
	});

	it('reuses each pooled DOM node at most once when widget keys repeat', () => {
		const bid = blockId('paragraph');
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: (node) => createBlockElement('p', node.id),
		});
		const nodeViewRegistry = new NodeViewRegistry();
		nodeViewRegistry.registerNodeView('paragraph', (node) => {
			const dom = createBlockElement('p', node.id);
			return { dom, contentDOM: dom, update: () => true };
		});
		const initialBlock = createBlockNode(nodeType('paragraph'), [createTextNode('abc')], bid);
		const initialState = EditorState.create({
			doc: createDocument([initialBlock]),
			selection: createCollapsedSelection(bid, 0),
		});
		const updatedBlock = createBlockNode(nodeType('paragraph'), [createTextNode('abcd')], bid);
		const updatedState = EditorState.create({
			doc: createDocument([updatedBlock]),
			selection: createCollapsedSelection(bid, 0),
		});
		let currentState = initialState;
		const container = document.createElement('div');
		const nodeViews = new Map();
		const initialFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'existing';
			return element;
		});
		const additionalFactory = vi.fn(() => {
			const element = document.createElement('span');
			element.textContent = 'additional';
			return element;
		});
		const initialDecorations = DecorationSet.create([
			widgetDeco(bid, 1, initialFactory, { key: 'shared' }),
		]);
		const updatedDecorations = DecorationSet.create([
			widgetDeco(bid, 1, () => document.createElement('span'), { key: 'shared' }),
			widgetDeco(bid, 2, additionalFactory, { key: 'shared' }),
		]);
		const options = {
			registry,
			nodeViewRegistry,
			nodeViews,
			getState: () => currentState,
			dispatch: () => {},
		};

		reconcile(container, null, initialState, {
			...options,
			decorations: initialDecorations,
		});
		const existing = container.querySelector<HTMLElement>('[data-widget-key="shared"]');
		currentState = updatedState;
		reconcile(container, initialState, updatedState, {
			...options,
			oldDecorations: initialDecorations,
			decorations: updatedDecorations,
		});

		const widgets = container.querySelectorAll<HTMLElement>('[data-widget-key="shared"]');
		expect(widgets).toHaveLength(2);
		expect(widgets[0]).toBe(existing);
		expect(widgets[1]?.textContent).toBe('additional');
		expect(initialFactory).toHaveBeenCalledOnce();
		expect(additionalFactory).toHaveBeenCalledOnce();
	});
});
