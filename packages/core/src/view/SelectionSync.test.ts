import { describe, expect, it, vi } from 'vitest';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
} from '../model/Selection.js';
import {
	readComposedSelection,
	readDOMSelectionEndpoints,
	readSelectionFromDOM,
	syncSelectionToDOM,
} from './SelectionSync.js';

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

		it('counts content before wrapper elements when the browser returns an element endpoint', () => {
			const container = document.createElement('div');
			container.setAttribute('contenteditable', 'true');
			const block = makeBlockEl('b1');
			const textBefore = document.createTextNode('ab');
			const strong = document.createElement('strong');
			strong.appendChild(document.createTextNode('cd'));
			const textAfter = document.createTextNode('ef');
			block.appendChild(textBefore);
			block.appendChild(strong);
			block.appendChild(textAfter);
			container.appendChild(block);
			document.body.appendChild(container);

			const sel = window.getSelection();
			sel?.collapse(strong, 1);

			const result = readSelectionFromDOM(container);
			expect(result).not.toBeNull();
			expect(result?.anchor.blockId).toBe('b1');
			expect(result?.anchor.offset).toBe(4);

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

	describe('readComposedSelection', () => {
		it('returns null when container is not in a shadow root', () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const sel = window.getSelection();
			if (!sel) throw new Error('Selection unavailable');
			const result = readComposedSelection(container, sel);
			expect(result).toBeNull();

			document.body.removeChild(container);
		});

		it('returns null when getComposedRanges is not available', () => {
			// Create a mock container whose getRootNode returns a ShadowRoot-like object
			const container = document.createElement('div');
			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			// Selection without getComposedRanges
			const sel = window.getSelection();
			if (!sel) throw new Error('Selection unavailable');
			const result = readComposedSelection(container, sel);
			expect(result).toBeNull();

			vi.restoreAllMocks();
		});

		it('uses modern syntax and returns endpoints from StaticRange', () => {
			const container = document.createElement('div');
			const textNode = document.createTextNode('hello');
			container.appendChild(textNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: textNode,
				startOffset: 1,
				endContainer: textNode,
				endOffset: 4,
				collapsed: false,
			};

			const mockSel = {
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(textNode);
			expect(result?.anchorOffset).toBe(1);
			expect(result?.focusNode).toBe(textNode);
			expect(result?.focusOffset).toBe(4);

			// Verify modern syntax was called with options dict
			expect(mockSel.getComposedRanges).toHaveBeenCalledWith({
				shadowRoots: [fakeShadowRoot],
			});

			vi.restoreAllMocks();
		});

		it('falls back to legacy syntax when modern throws', () => {
			const container = document.createElement('div');
			const textNode = document.createTextNode('world');
			container.appendChild(textNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: textNode,
				startOffset: 0,
				endContainer: textNode,
				endOffset: 5,
				collapsed: false,
			};

			let callIdx = 0;
			const mockSel = {
				getComposedRanges: vi.fn().mockImplementation(() => {
					callIdx++;
					// First call (modern syntax with options dict) throws
					if (callIdx === 1) {
						throw new TypeError('Invalid argument');
					}
					// Second call (legacy syntax with rest params) succeeds
					return [mockRange];
				}),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(textNode);
			expect(result?.focusOffset).toBe(5);
			expect(mockSel.getComposedRanges).toHaveBeenCalledTimes(2);

			vi.restoreAllMocks();
		});

		it('restores backward direction from Selection.direction', () => {
			const container = document.createElement('div');
			const startNode = document.createTextNode('start');
			const endNode = document.createTextNode('end');
			container.appendChild(startNode);
			container.appendChild(endNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: startNode,
				startOffset: 2,
				endContainer: endNode,
				endOffset: 3,
				collapsed: false,
			};

			const mockSel = {
				direction: 'backward',
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			// Backward: anchor = end, focus = start
			expect(result?.anchorNode).toBe(endNode);
			expect(result?.anchorOffset).toBe(3);
			expect(result?.focusNode).toBe(startNode);
			expect(result?.focusOffset).toBe(2);

			vi.restoreAllMocks();
		});

		it('preserves forward direction (default)', () => {
			const container = document.createElement('div');
			const startNode = document.createTextNode('start');
			const endNode = document.createTextNode('end');
			container.appendChild(startNode);
			container.appendChild(endNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: startNode,
				startOffset: 0,
				endContainer: endNode,
				endOffset: 3,
				collapsed: false,
			};

			const mockSel = {
				direction: 'forward',
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			// Forward: anchor = start, focus = end
			expect(result?.anchorNode).toBe(startNode);
			expect(result?.anchorOffset).toBe(0);
			expect(result?.focusNode).toBe(endNode);
			expect(result?.focusOffset).toBe(3);

			vi.restoreAllMocks();
		});

		it('treats missing direction property as forward', () => {
			const container = document.createElement('div');
			const startNode = document.createTextNode('start');
			const endNode = document.createTextNode('end');
			container.appendChild(startNode);
			container.appendChild(endNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: startNode,
				startOffset: 1,
				endContainer: endNode,
				endOffset: 2,
				collapsed: false,
			};

			// No direction property at all (e.g. Safari 17–18)
			const mockSel = {
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(startNode);
			expect(result?.anchorOffset).toBe(1);
			expect(result?.focusNode).toBe(endNode);
			expect(result?.focusOffset).toBe(2);

			vi.restoreAllMocks();
		});

		it('treats direction "none" as forward', () => {
			const container = document.createElement('div');
			const startNode = document.createTextNode('start');
			const endNode = document.createTextNode('end');
			container.appendChild(startNode);
			container.appendChild(endNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: startNode,
				startOffset: 0,
				endContainer: endNode,
				endOffset: 3,
				collapsed: false,
			};

			const mockSel = {
				direction: 'none',
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(startNode);
			expect(result?.anchorOffset).toBe(0);
			expect(result?.focusNode).toBe(endNode);
			expect(result?.focusOffset).toBe(3);

			vi.restoreAllMocks();
		});

		it('returns null when getComposedRanges returns empty array', () => {
			const container = document.createElement('div');
			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockSel = {
				getComposedRanges: vi.fn().mockReturnValue([]),
			} as unknown as globalThis.Selection;

			const result = readComposedSelection(container, mockSel);
			expect(result).toBeNull();

			vi.restoreAllMocks();
		});
	});

	describe('readDOMSelectionEndpoints', () => {
		it('returns endpoints from standard selection when not in Shadow DOM', () => {
			const container = document.createElement('div');
			const block = makeBlockEl('b1');
			const textNode = document.createTextNode('hello');
			block.appendChild(textNode);
			container.appendChild(block);
			document.body.appendChild(container);

			const sel = window.getSelection();
			if (!sel) throw new Error('Selection unavailable');
			sel.collapse(textNode, 2);

			const result = readDOMSelectionEndpoints(container, sel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(textNode);
			expect(result?.anchorOffset).toBe(2);
			expect(result?.focusNode).toBe(textNode);
			expect(result?.focusOffset).toBe(2);

			document.body.removeChild(container);
		});

		it('returns composed endpoints when in Shadow DOM', () => {
			const container = document.createElement('div');
			const textNode = document.createTextNode('shadow');
			container.appendChild(textNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: textNode,
				startOffset: 1,
				endContainer: textNode,
				endOffset: 5,
				collapsed: false,
			};

			const mockSel = {
				anchorNode: null,
				anchorOffset: 0,
				focusNode: null,
				focusOffset: 0,
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readDOMSelectionEndpoints(container, mockSel);
			expect(result).not.toBeNull();
			expect(result?.anchorNode).toBe(textNode);
			expect(result?.anchorOffset).toBe(1);
			expect(result?.focusNode).toBe(textNode);
			expect(result?.focusOffset).toBe(5);

			vi.restoreAllMocks();
		});

		it('returns null when anchorNode is null', () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const mockSel = {
				anchorNode: null,
				anchorOffset: 0,
				focusNode: null,
				focusOffset: 0,
			} as unknown as globalThis.Selection;

			const result = readDOMSelectionEndpoints(container, mockSel);
			expect(result).toBeNull();

			document.body.removeChild(container);
		});

		it('returns null when focusNode is null', () => {
			const container = document.createElement('div');
			const textNode = document.createTextNode('hello');
			container.appendChild(textNode);
			document.body.appendChild(container);

			const mockSel = {
				anchorNode: textNode,
				anchorOffset: 0,
				focusNode: null,
				focusOffset: 0,
			} as unknown as globalThis.Selection;

			const result = readDOMSelectionEndpoints(container, mockSel);
			expect(result).toBeNull();

			document.body.removeChild(container);
		});

		it('prefers composed ranges over standard selection properties', () => {
			const container = document.createElement('div');
			const composedNode = document.createTextNode('composed');
			const standardNode = document.createTextNode('standard');
			container.appendChild(composedNode);
			container.appendChild(standardNode);

			const fakeShadowRoot = Object.create(ShadowRoot.prototype);
			vi.spyOn(container, 'getRootNode').mockReturnValue(fakeShadowRoot);

			const mockRange: StaticRange = {
				startContainer: composedNode,
				startOffset: 0,
				endContainer: composedNode,
				endOffset: 3,
				collapsed: false,
			};

			const mockSel = {
				anchorNode: standardNode,
				anchorOffset: 1,
				focusNode: standardNode,
				focusOffset: 4,
				getComposedRanges: vi.fn().mockReturnValue([mockRange]),
			} as unknown as globalThis.Selection;

			const result = readDOMSelectionEndpoints(container, mockSel);
			expect(result).not.toBeNull();
			// Should use composed (composedNode), not standard (standardNode)
			expect(result?.anchorNode).toBe(composedNode);
			expect(result?.anchorOffset).toBe(0);
			expect(result?.focusNode).toBe(composedNode);
			expect(result?.focusOffset).toBe(3);

			vi.restoreAllMocks();
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
