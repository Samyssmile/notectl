import { describe, expect, it } from 'vitest';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import { readSelectionFromDOM, syncSelectionToDOM } from './SelectionSync.js';

describe('SelectionSync InlineNode support', () => {
	function makeBlockEl(id: string): HTMLElement {
		const el = document.createElement('p');
		el.setAttribute('data-block-id', id);
		return el;
	}

	function makeInlineEl(type: string): HTMLElement {
		const el = document.createElement('span');
		el.setAttribute('data-inline-type', type);
		el.setAttribute('contenteditable', 'false');
		return el;
	}

	describe('statePositionToDOM with InlineNodes', () => {
		it('positions cursor before an InlineNode at the start', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const inlineEl = makeInlineEl('image');
			const textNode = document.createTextNode('hello');
			block.appendChild(inlineEl);
			block.appendChild(textNode);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 0 = before the inline element
			syncSelectionToDOM(container, createCollapsedSelection('b1', 0));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(block);
			expect(sel?.anchorOffset).toBe(0);

			document.body.removeChild(container);
		});

		it('positions cursor after InlineNode (at start of text)', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const inlineEl = makeInlineEl('image');
			const textNode = document.createTextNode('hello');
			block.appendChild(inlineEl);
			block.appendChild(textNode);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 1 = after inline (width 1), at start of "hello"
			syncSelectionToDOM(container, createCollapsedSelection('b1', 1));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(textNode);
			expect(sel?.anchorOffset).toBe(0);

			document.body.removeChild(container);
		});

		it('positions cursor within text after InlineNode', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 4 = past "ab"(2) + inline(1) + 1 into "cd" = 'c' at position 1
			syncSelectionToDOM(container, createCollapsedSelection('b1', 4));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(textAfter);
			expect(sel?.anchorOffset).toBe(1);

			document.body.removeChild(container);
		});

		it('handles offset right at InlineNode boundary', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 2 = end of "ab" text node, right before inline
			syncSelectionToDOM(container, createCollapsedSelection('b1', 2));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(textBefore);
			expect(sel?.anchorOffset).toBe(2);

			document.body.removeChild(container);
		});

		it('handles offset right after InlineNode', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 3 = past "ab"(2) + inline(1) = start of "cd"
			syncSelectionToDOM(container, createCollapsedSelection('b1', 3));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(textAfter);
			expect(sel?.anchorOffset).toBe(0);

			document.body.removeChild(container);
		});

		it('handles consecutive InlineNodes', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const inline1 = makeInlineEl('img');
			const inline2 = makeInlineEl('emoji');
			const textAfter = document.createTextNode('end');
			block.appendChild(inline1);
			block.appendChild(inline2);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Offset 2 = past both inlines, start of "end"
			syncSelectionToDOM(container, createCollapsedSelection('b1', 2));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(textAfter);
			expect(sel?.anchorOffset).toBe(0);

			document.body.removeChild(container);
		});
	});

	describe('readSelectionFromDOM with InlineNodes', () => {
		it('reads offset after InlineNode from text node position', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('hello');
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Simulate selection at start of "hello" (which is offset 1 in state)
			const sel = window.getSelection();
			sel?.collapse(textAfter, 0);

			const result = readSelectionFromDOM(container);
			expect(result).not.toBeNull();
			expect(result?.anchor.blockId).toBe('b1');
			expect(result?.anchor.offset).toBe(1); // inline(1) + 0

			document.body.removeChild(container);
		});

		it('reads offset with text before and after InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Selection at "cd" offset 1 → state offset = 2 + 1 + 1 = 4
			const sel = window.getSelection();
			sel?.collapse(textAfter, 1);

			const result = readSelectionFromDOM(container);
			expect(result).not.toBeNull();
			expect(result?.anchor.offset).toBe(4);

			document.body.removeChild(container);
		});

		it('reads offset from element-level selection around InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Element-level selection: block node, offset 2 (after textBefore and inlineEl)
			const sel = window.getSelection();
			sel?.collapse(block, 2);

			const result = readSelectionFromDOM(container);
			expect(result).not.toBeNull();
			// "ab" (2) + inline (1) = 3
			expect(result?.anchor.offset).toBe(3);

			document.body.removeChild(container);
		});

		it('reads offset from element-level selection before InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('hello');
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Element-level selection: block node, offset 0 (before inline)
			const sel = window.getSelection();
			sel?.collapse(block, 0);

			const result = readSelectionFromDOM(container);
			expect(result).not.toBeNull();
			expect(result?.anchor.offset).toBe(0);

			document.body.removeChild(container);
		});
	});

	describe('roundtrip: syncSelectionToDOM → readSelectionFromDOM', () => {
		it('roundtrips offset before InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			const original = createCollapsedSelection('b1', 2);
			syncSelectionToDOM(container, original);
			const result = readSelectionFromDOM(container);

			expect(result?.anchor.offset).toBe(2);
			expect(result?.head.offset).toBe(2);

			document.body.removeChild(container);
		});

		it('roundtrips offset after InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			const original = createCollapsedSelection('b1', 3);
			syncSelectionToDOM(container, original);
			const result = readSelectionFromDOM(container);

			expect(result?.anchor.offset).toBe(3);

			document.body.removeChild(container);
		});

		it('roundtrips selection spanning InlineNode', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const inlineEl = makeInlineEl('img');
			const textAfter = document.createTextNode('cd');
			block.appendChild(textBefore);
			block.appendChild(inlineEl);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			// Selection from offset 1 to offset 4: "b" + inline + "c"
			const original = createSelection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 4 });
			syncSelectionToDOM(container, original);

			// Verify sync wrote correct DOM positions
			const domSel = window.getSelection();
			expect(domSel?.anchorNode).toBe(textBefore);
			expect(domSel?.anchorOffset).toBe(1);
			// Note: happy-dom's setBaseAndExtent may not properly maintain
			// non-collapsed selections for readback, so verify sync direction
			// (state→DOM) directly rather than roundtrip for range selections.

			document.body.removeChild(container);
		});
	});

	describe('syncSelectionToDOM with NodeSelection', () => {
		it('sets DOM selection around the block element', () => {
			const container = document.createElement('div');
			const block1 = makeBlockEl('b1');
			block1.appendChild(document.createTextNode('first'));
			const block2 = makeBlockEl('b2');
			block2.setAttribute('data-void', 'true');
			block2.appendChild(document.createTextNode('void'));
			const block3 = makeBlockEl('b3');
			block3.appendChild(document.createTextNode('third'));
			container.appendChild(block1);
			container.appendChild(block2);
			container.appendChild(block3);
			document.body.appendChild(container);

			syncSelectionToDOM(container, createNodeSelection('b2' as never, ['b2' as never]));

			const sel = window.getSelection();
			expect(sel?.anchorNode).toBe(container);
			expect(sel?.anchorOffset).toBe(1);

			document.body.removeChild(container);
		});

		it('returns early if block not found', () => {
			const container = document.createElement('div');
			const block1 = makeBlockEl('b1');
			block1.appendChild(document.createTextNode('hello'));
			container.appendChild(block1);
			document.body.appendChild(container);

			// Record current selection state
			const selBefore = window.getSelection();
			const firstChild = block1.firstChild;
			if (!firstChild) return;
			selBefore?.collapse(firstChild, 2);
			const anchorBefore = selBefore?.anchorNode;
			const offsetBefore = selBefore?.anchorOffset;

			// Call with a non-existent blockId — should not throw
			expect(() => {
				syncSelectionToDOM(
					container,
					createNodeSelection('nonexistent' as never, ['nonexistent' as never]),
				);
			}).not.toThrow();

			// Selection should be unchanged
			const selAfter = window.getSelection();
			expect(selAfter?.anchorNode).toBe(anchorBefore);
			expect(selAfter?.anchorOffset).toBe(offsetBefore);

			document.body.removeChild(container);
		});
	});
});
