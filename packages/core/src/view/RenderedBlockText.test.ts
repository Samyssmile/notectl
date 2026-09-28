import { afterEach, describe, expect, it } from 'vitest';
import { commitComposedText } from '../commands/CompositionCommands.js';
import {
	DecorationSet,
	inline as inlineDeco,
	widget as widgetDeco,
} from '../decorations/Decoration.js';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	isLeafBlock,
} from '../model/Document.js';
import { INLINE_NODE_PLACEHOLDER } from '../model/InputRule.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { type BlockId, blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { Mapping } from '../state/Mapping.js';
import { createBlockElement } from './DomUtils.js';
import { reconcile } from './Reconciler.js';
import { captureInlineNodeOrigins, readCompositionSnapshot } from './RenderedBlockText.js';

const PH: string = INLINE_NODE_PLACEHOLDER;

function containerWith(html: string): HTMLElement {
	const container: HTMLElement = document.createElement('div');
	container.innerHTML = html;
	return container;
}

function read(html: string, id = 'b1'): string | null {
	return readCompositionSnapshot(containerWith(html), blockId(id))?.text ?? null;
}

describe('readCompositionSnapshot text', () => {
	it('reads text through mark and decoration wrappers', () => {
		const html = '<p data-block-id="b1">he<strong>ll</strong><span class="deco">o</span></p>';

		expect(read(html)).toBe('hello');
	});

	it('reads an inline node element as one placeholder', () => {
		const html = '<p data-block-id="b1">a<span contenteditable="false"><b>ignored</b></span>b</p>';

		expect(read(html)).toBe(`a${PH}b`);
	});

	it('reads a hard break as a placeholder and ignores the trailing caret <br>', () => {
		const html = '<p data-block-id="b1">a<br contenteditable="false"><br></p>';

		expect(read(html)).toBe(`a${PH}`);
	});

	it('reads an empty block rendered as a placeholder <br> as empty', () => {
		expect(read('<p data-block-id="b1"><br></p>')).toBe('');
	});

	it('skips widgets', () => {
		const html =
			'<p data-block-id="b1"><span data-widget="true" contenteditable="false">x</span>ab</p>';

		expect(read(html)).toBe('ab');
	});

	it('includes text composed into the cursor wrapper without its zero-width space', () => {
		const html =
			'<p data-block-id="b1">he​llo<span data-cursor-wrapper=""><strong>​wo</strong></span></p>';

		expect(read(html)).toBe('he​llowo');
	});

	it('excludes nested blocks', () => {
		const html = '<div data-block-id="b1">outer<div data-block-id="b2">inner</div></div>';

		expect(read(html)).toBe('outer');
		expect(read(html, 'b2')).toBe('inner');
	});

	it('reads only the content DOM of a NodeView', () => {
		const html =
			'<pre data-block-id="b1"><div>JavaScript</div><code data-content-dom="">let x</code></pre>';

		expect(read(html)).toBe('let x');
	});

	it('returns null when no element renders the block', () => {
		expect(read('<p data-block-id="b1">a</p>', 'missing')).toBeNull();
	});

	it('reads every untouched leaf of a rendered document as its model text', () => {
		const registry = new SchemaRegistry();
		registry.registerNodeSpec({
			type: 'paragraph',
			toDOM: (node) => createBlockElement('p', node.id),
		});
		registry.registerNodeSpec({
			type: 'quote',
			content: { allow: ['paragraph'], min: 1 },
			toDOM: (node) => createBlockElement('blockquote', node.id),
		});
		registry.registerMarkSpec({ type: 'bold', toDOM: () => document.createElement('strong') });
		registry.registerInlineNodeSpec({
			type: 'emoji',
			toDOM: () => {
				const element: HTMLElement = document.createElement('span');
				element.textContent = '🙂';
				return element;
			},
		});
		registry.registerInlineNodeSpec({
			type: 'hard_break',
			toDOM: () => document.createElement('br'),
		});

		const bold = [{ type: markType('bold') }];
		const leaves: readonly BlockNode[] = [
			createBlockNode(
				nodeType('paragraph'),
				[createTextNode(' lead  and trail '), createTextNode('bold ', bold)],
				blockId('spaces'),
			),
			createBlockNode(
				nodeType('paragraph'),
				[
					createTextNode('a'),
					createInlineNode(inlineType('emoji')),
					createTextNode('b c'),
					createInlineNode(inlineType('hard_break')),
				],
				blockId('inline'),
			),
			createBlockNode(nodeType('paragraph'), [createTextNode('')], blockId('empty')),
		];
		const nested: BlockNode = createBlockNode(
			nodeType('paragraph'),
			[createTextNode('quoted')],
			blockId('nested'),
		);
		const quote: BlockNode = createBlockNode(nodeType('quote'), [nested], blockId('quote'));
		const state: EditorState = EditorState.create({
			doc: createDocument([...leaves, quote]),
			selection: createCollapsedSelection(blockId('spaces'), 0),
		});
		const decorations: DecorationSet = DecorationSet.create([
			inlineDeco(blockId('spaces'), 1, 5, { class: 'highlight' }),
			widgetDeco(blockId('inline'), 1, () => {
				const element: HTMLElement = document.createElement('span');
				element.textContent = 'widget';
				return element;
			}),
		]);
		const container: HTMLElement = document.createElement('div');
		reconcile(container, null, state, { registry, decorations });
		// The risky cases are really rendered: NBSP-drawn spaces and widget text.
		expect(readCompositionSnapshot(container, blockId('spaces'))?.text).toContain('\u00a0');
		expect(container.textContent).toContain('widget');

		const leafIds: readonly BlockId[] = [...leaves, nested]
			.filter((block) => isLeafBlock(block))
			.map((block) => block.id);
		for (const id of leafIds) {
			const baseline: BlockNode | undefined = state.getBlock(id);
			const origins = captureInlineNodeOrigins(container, id);
			const rendered = readCompositionSnapshot(container, id, origins);
			expect(rendered, id).not.toBeNull();
			if (!baseline || !rendered) continue;
			const commit = { blockId: id, baseline, from: 0, to: 0, rendered, mapping: Mapping.empty };
			expect(commitComposedText(state, commit), id).toEqual({ kind: 'commit', tr: null });
		}
	});
});

describe('readCompositionSnapshot inline node origins', () => {
	const TWO_FORMULAS =
		'<p data-block-id="b1">x<span contenteditable="false">A</span>' +
		'<span contenteditable="false">B</span>z</p>';

	it('reports the offset each surviving inline node rendered at when it was captured', () => {
		const container: HTMLElement = containerWith(TWO_FORMULAS);
		const origins = captureInlineNodeOrigins(container, blockId('b1'));

		container.querySelector('[contenteditable="false"]')?.remove();
		const snapshot = readCompositionSnapshot(container, blockId('b1'), origins);

		expect(snapshot?.text).toBe(`x${PH}z`);
		expect(snapshot?.inlineNodeOrigins).toEqual(new Map([[1, 2]]));
	});

	it('captures offsets without the cursor wrapper placeholder', () => {
		const container: HTMLElement = containerWith(
			'<p data-block-id="b1">a<span data-cursor-wrapper="">\u200b</span>' +
				'<span contenteditable="false">F</span></p>',
		);
		const origins = captureInlineNodeOrigins(container, blockId('b1'));

		const snapshot = readCompositionSnapshot(container, blockId('b1'), origins);

		expect(snapshot?.inlineNodeOrigins).toEqual(new Map([[1, 1]]));
	});

	it('reports inline node elements the capture did not see without an origin', () => {
		const container: HTMLElement = containerWith(TWO_FORMULAS);
		const origins = captureInlineNodeOrigins(container, blockId('b1'));

		container.querySelector('p')?.append(document.createElement('br'));
		container.querySelector('p > br')?.setAttribute('contenteditable', 'false');
		const snapshot = readCompositionSnapshot(container, blockId('b1'), origins);

		expect(snapshot?.inlineNodeOrigins).toEqual(
			new Map([
				[1, 1],
				[2, 2],
				[4, null],
			]),
		);
	});

	it('reports no inline node origins without a capture', () => {
		const snapshot = readCompositionSnapshot(containerWith(TWO_FORMULAS), blockId('b1'));

		expect(snapshot?.inlineNodeOrigins).toBeUndefined();
	});
});

describe('readCompositionSnapshot caret', () => {
	afterEach(() => {
		window.getSelection()?.removeAllRanges();
		document.body.replaceChildren();
	});

	it.each([
		{ childOffset: 0, expected: 0 },
		{ childOffset: 1, expected: 2 },
		{ childOffset: 2, expected: 3 },
		{ childOffset: 3, expected: 5 },
		{ childOffset: 4, expected: 9 },
	])(
		'maps a block boundary at child $childOffset to rendered offset $expected',
		({ childOffset, expected }) => {
			const container = containerWith(
				'<p data-block-id="b1">ab<br contenteditable="false"><span data-cursor-wrapper><strong>\u200Bwo</strong></span>tail</p>',
			);
			document.body.append(container);
			window.getSelection()?.collapse(container.firstChild, childOffset);
			expect(readCompositionSnapshot(container, blockId('b1'))?.caretOffset).toBe(expected);
		},
	);

	it('counts inline nodes once and skips widgets before a caret inside marks', () => {
		const container = containerWith(
			'<p data-block-id="b1">ab<span contenteditable="false">formula</span><span data-widget>widget</span><strong>\u200Bcd</strong>tail</p>',
		);
		document.body.append(container);
		const text = container.querySelector('strong')?.firstChild;
		if (!text) throw new Error('Expected marked text');
		window.getSelection()?.collapse(text, 2);
		// The ZWS outside an IME wrapper is actual document text.
		expect(readCompositionSnapshot(container, blockId('b1'))?.caretOffset).toBe(5);
	});

	it('reads only the content DOM of a NodeView and rejects its header', () => {
		const container = containerWith(
			'<pre data-block-id="b1"><div>JavaScript</div><code data-content-dom>let x</code></pre>',
		);
		document.body.append(container);
		const code = container.querySelector('code');
		const header = container.querySelector('div');
		if (!code || !header) throw new Error('Expected NodeView content and header');
		window.getSelection()?.collapse(code, 1);
		expect(readCompositionSnapshot(container, blockId('b1'))?.caretOffset).toBe(5);
		window.getSelection()?.collapse(header, 1);
		expect(readCompositionSnapshot(container, blockId('b1'))?.caretOffset).toBeNull();
	});
});
