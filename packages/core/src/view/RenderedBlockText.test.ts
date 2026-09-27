import { describe, expect, it } from 'vitest';
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
import { createBlockElement } from './DomUtils.js';
import { reconcile } from './Reconciler.js';
import { readRenderedBlockText } from './RenderedBlockText.js';

const PH: string = INLINE_NODE_PLACEHOLDER;

function containerWith(html: string): HTMLElement {
	const container: HTMLElement = document.createElement('div');
	container.innerHTML = html;
	return container;
}

function read(html: string, id = 'b1'): string | null {
	return readRenderedBlockText(containerWith(html), blockId(id));
}

describe('readRenderedBlockText', () => {
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
		expect(readRenderedBlockText(container, blockId('spaces'))).toContain('\u00a0');
		expect(container.textContent).toContain('widget');

		const leafIds: readonly BlockId[] = [...leaves, nested]
			.filter((block) => isLeafBlock(block))
			.map((block) => block.id);
		for (const id of leafIds) {
			const rendered: string | null = readRenderedBlockText(container, id);
			expect(rendered, id).not.toBeNull();
			expect(commitComposedText(state, id, rendered ?? '', 0), id).toBeNull();
		}
	});
});
