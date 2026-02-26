import { describe, expect, it, vi } from 'vitest';
import type { NodeSpec } from '../model/NodeSpec.js';
import type { Schema } from '../model/Schema.js';
import { createNodeSelection, isGapCursor, isNodeSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import { stateBuilder } from '../test/TestUtils.js';
import { CompositionTracker } from './CompositionTracker.js';
import { KeyboardHandler, normalizeKeyDescriptor } from './KeyboardHandler.js';
import { KeymapRegistry } from './KeymapRegistry.js';

function makeKeyEvent(
	key: string,
	opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key,
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		shiftKey: opts.shiftKey ?? false,
		altKey: opts.altKey ?? false,
		bubbles: true,
		cancelable: true,
	});
}

describe('normalizeKeyDescriptor', () => {
	it('normalizes Ctrl+B to Mod-B', () => {
		const e = makeKeyEvent('b', { ctrlKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-B');
	});

	it('normalizes Meta+B to Mod-B', () => {
		const e = makeKeyEvent('b', { metaKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-B');
	});

	it('normalizes Ctrl+Shift+1 to Mod-Shift-1', () => {
		const e = makeKeyEvent('1', { ctrlKey: true, shiftKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Shift-1');
	});

	it('normalizes Enter without modifiers', () => {
		const e = makeKeyEvent('Enter');
		expect(normalizeKeyDescriptor(e)).toBe('Enter');
	});

	it('normalizes Tab', () => {
		const e = makeKeyEvent('Tab');
		expect(normalizeKeyDescriptor(e)).toBe('Tab');
	});

	it('normalizes Space', () => {
		const e = makeKeyEvent(' ');
		expect(normalizeKeyDescriptor(e)).toBe('Space');
	});

	it('normalizes Alt+Shift+A', () => {
		const e = makeKeyEvent('a', { altKey: true, shiftKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Shift-Alt-A');
	});

	it('normalizes Mod+Shift+Alt+K', () => {
		const e = makeKeyEvent('k', { ctrlKey: true, shiftKey: true, altKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Shift-Alt-K');
	});

	it('uppercases single-character keys', () => {
		const e = makeKeyEvent('z', { ctrlKey: true });
		expect(normalizeKeyDescriptor(e)).toBe('Mod-Z');
	});
});

describe('KeyboardHandler: NodeSelection modifier guard', () => {
	function createHandlerWithNodeSelection(): {
		element: HTMLDivElement;
		handler: KeyboardHandler;
		dispatched: boolean[];
	} {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Before', 'b1')
			.block('image', '', 'img1', {
				attrs: { src: 'test.png', alt: '', align: 'center' },
			})
			.paragraph('After', 'b2')
			.nodeSelection('img1')
			.schema(['paragraph', 'image'], [])
			.build();

		const dispatched: boolean[] = [];
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: () => {
				dispatched.push(true);
			},
			undo: vi.fn(),
			redo: vi.fn(),
		});

		return { element, handler, dispatched };
	}

	it('intercepts unmodified ArrowRight on NodeSelection', () => {
		const { element, handler, dispatched } = createHandlerWithNodeSelection();
		const e = makeKeyEvent('ArrowRight');
		element.dispatchEvent(e);
		expect(dispatched.length).toBeGreaterThan(0);
		handler.destroy();
	});

	it('does NOT intercept Ctrl+Shift+ArrowRight on NodeSelection', () => {
		const { element, handler, dispatched } = createHandlerWithNodeSelection();
		const e = makeKeyEvent('ArrowRight', { ctrlKey: true, shiftKey: true });
		element.dispatchEvent(e);
		// Modified arrow should not be intercepted by handleNodeSelectionKeys
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});

	it('does NOT intercept Mod+Shift+Alt+ArrowLeft on NodeSelection', () => {
		const { element, handler, dispatched } = createHandlerWithNodeSelection();
		const e = makeKeyEvent('ArrowLeft', {
			ctrlKey: true,
			shiftKey: true,
			altKey: true,
		});
		element.dispatchEvent(e);
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});

	it('does NOT intercept Shift+ArrowDown on NodeSelection', () => {
		const { element, handler, dispatched } = createHandlerWithNodeSelection();
		const e = makeKeyEvent('ArrowDown', { shiftKey: true });
		element.dispatchEvent(e);
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});

	it('still intercepts Backspace on NodeSelection', () => {
		const { element, handler, dispatched } = createHandlerWithNodeSelection();
		const e = makeKeyEvent('Backspace');
		element.dispatchEvent(e);
		expect(dispatched.length).toBeGreaterThan(0);
		handler.destroy();
	});
});

describe('KeyboardHandler: Composition guard', () => {
	it('ignores all keydown events during IME composition', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const tracker = new CompositionTracker();
		tracker.start(blockId('b1'));

		const dispatched: boolean[] = [];
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: () => {
				dispatched.push(true);
			},
			undo: vi.fn(),
			redo: vi.fn(),
			compositionTracker: tracker,
		});

		element.dispatchEvent(makeKeyEvent('Enter'));
		element.dispatchEvent(makeKeyEvent('Backspace'));
		element.dispatchEvent(makeKeyEvent('ArrowRight'));

		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});

	it('processes keydown events after composition ends', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		const tracker = new CompositionTracker();
		tracker.start(blockId('b1'));
		tracker.end();

		const undoFn = vi.fn();
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: vi.fn(),
			undo: undoFn,
			redo: vi.fn(),
			compositionTracker: tracker,
		});

		element.dispatchEvent(makeKeyEvent('z', { ctrlKey: true }));
		expect(undoFn).toHaveBeenCalledOnce();
		handler.destroy();
	});
});

describe('KeyboardHandler: Readonly mode', () => {
	it('navigation keymaps run in readonly mode', () => {
		const element: HTMLDivElement = document.createElement('div');
		const registry = new KeymapRegistry();
		const log: string[] = [];

		registry.registerKeymap(
			{
				ArrowDown: () => {
					log.push('navigation');
					return true;
				},
			},
			{ priority: 'navigation' },
		);

		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			keymapRegistry: registry,
			isReadOnly: () => true,
		});

		element.dispatchEvent(makeKeyEvent('ArrowDown'));
		expect(log).toEqual(['navigation']);
		handler.destroy();
	});

	it('default keymaps are blocked in readonly mode', () => {
		const element: HTMLDivElement = document.createElement('div');
		const registry = new KeymapRegistry();
		const log: string[] = [];

		registry.registerKeymap({
			Enter: () => {
				log.push('default');
				return true;
			},
		});

		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			keymapRegistry: registry,
			isReadOnly: () => true,
		});

		element.dispatchEvent(makeKeyEvent('Enter'));
		expect(log).toEqual([]);
		handler.destroy();
	});

	it('context keymaps are blocked in readonly mode', () => {
		const element: HTMLDivElement = document.createElement('div');
		const registry = new KeymapRegistry();
		const log: string[] = [];

		registry.registerKeymap(
			{
				Enter: () => {
					log.push('context');
					return true;
				},
			},
			{ priority: 'context' },
		);

		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			keymapRegistry: registry,
			isReadOnly: () => true,
		});

		element.dispatchEvent(makeKeyEvent('Enter'));
		expect(log).toEqual([]);
		handler.destroy();
	});
});

describe('KeyboardHandler: Keymap priority dispatch', () => {
	function createHandlerWithKeymaps(registry: KeymapRegistry): {
		element: HTMLDivElement;
		handler: KeyboardHandler;
		log: string[];
	} {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const log: string[] = [];
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			keymapRegistry: registry,
		});

		return { element, handler, log };
	}

	it('context keymap has precedence over default keymap for the same key', () => {
		const registry = new KeymapRegistry();
		const log: string[] = [];
		registry.registerKeymap({
			Enter: () => {
				log.push('default');
				return true;
			},
		});
		registry.registerKeymap(
			{
				Enter: () => {
					log.push('context');
					return true;
				},
			},
			{ priority: 'context' },
		);

		const { element, handler } = createHandlerWithKeymaps(registry);
		element.dispatchEvent(makeKeyEvent('Enter'));

		expect(log).toEqual(['context']);
		handler.destroy();
	});

	it('navigation keymap has precedence over default keymap', () => {
		const registry = new KeymapRegistry();
		const log: string[] = [];
		registry.registerKeymap({
			ArrowDown: () => {
				log.push('default');
				return true;
			},
		});
		registry.registerKeymap(
			{
				ArrowDown: () => {
					log.push('navigation');
					return true;
				},
			},
			{ priority: 'navigation' },
		);

		const { element, handler } = createHandlerWithKeymaps(registry);
		element.dispatchEvent(makeKeyEvent('ArrowDown'));

		expect(log).toEqual(['navigation']);
		handler.destroy();
	});

	it('context keymap has precedence over navigation keymap', () => {
		const registry = new KeymapRegistry();
		const log: string[] = [];
		registry.registerKeymap(
			{
				ArrowDown: () => {
					log.push('navigation');
					return true;
				},
			},
			{ priority: 'navigation' },
		);
		registry.registerKeymap(
			{
				ArrowDown: () => {
					log.push('context');
					return true;
				},
			},
			{ priority: 'context' },
		);

		const { element, handler } = createHandlerWithKeymaps(registry);
		element.dispatchEvent(makeKeyEvent('ArrowDown'));

		expect(log).toEqual(['context']);
		handler.destroy();
	});

	it('within same priority, later-registered keymap wins', () => {
		const registry = new KeymapRegistry();
		const log: string[] = [];
		registry.registerKeymap({
			Enter: () => {
				log.push('first');
				return true;
			},
		});
		registry.registerKeymap({
			Enter: () => {
				log.push('second');
				return true;
			},
		});

		const { element, handler } = createHandlerWithKeymaps(registry);
		element.dispatchEvent(makeKeyEvent('Enter'));

		expect(log).toEqual(['second']);
		handler.destroy();
	});

	it('context keymap returning false falls through to navigation then default', () => {
		const registry = new KeymapRegistry();
		const log: string[] = [];
		registry.registerKeymap(
			{
				Enter: () => {
					log.push('context');
					return false;
				},
			},
			{ priority: 'context' },
		);
		registry.registerKeymap(
			{
				Enter: () => {
					log.push('navigation');
					return false;
				},
			},
			{ priority: 'navigation' },
		);
		registry.registerKeymap({
			Enter: () => {
				log.push('default');
				return true;
			},
		});

		const { element, handler } = createHandlerWithKeymaps(registry);
		element.dispatchEvent(makeKeyEvent('Enter'));

		expect(log).toEqual(['context', 'navigation', 'default']);
		handler.destroy();
	});
});

describe('KeyboardHandler: GapCursor key handling', () => {
	const hrSpec: NodeSpec = {
		isVoid: true,
		toDOM: (node) => {
			const el: HTMLElement = document.createElement('hr');
			el.setAttribute('data-block-id', node.id);
			return el;
		},
	};

	function makeGetNodeSpec(spec: NodeSpec): (type: string) => NodeSpec | undefined {
		return (type: string): NodeSpec | undefined => {
			if (type === 'horizontal_rule') return spec;
			return undefined;
		};
	}

	function createGapCursorHandler(side: 'before' | 'after'): {
		element: HTMLDivElement;
		handler: KeyboardHandler;
		dispatched: unknown[];
		getState: () => EditorState;
	} {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('World', 'b2')
			.gapCursor('hr1', side)
			.schema(
				['paragraph', 'horizontal_rule'],
				[],
				makeGetNodeSpec(hrSpec) as Schema['getNodeSpec'],
			)
			.build();

		const dispatched: unknown[] = [];
		let currentState: EditorState = state;
		const handler = new KeyboardHandler(element, {
			getState: () => currentState,
			dispatch: (tr) => {
				dispatched.push(tr);
				currentState = currentState.apply(tr);
			},
			undo: vi.fn(),
			redo: vi.fn(),
		});

		return { element, handler, dispatched, getState: () => currentState };
	}

	it('printable character dispatches insertTextCommand', () => {
		const { element, handler, dispatched, getState } = createGapCursorHandler('before');
		element.dispatchEvent(makeKeyEvent('a'));
		expect(dispatched).toHaveLength(1);
		// A new paragraph with 'a' should have been created
		expect(getState().doc.children.length).toBe(4);
		handler.destroy();
	});

	it('Enter dispatches splitBlockCommand', () => {
		const { element, handler, dispatched, getState } = createGapCursorHandler('after');
		element.dispatchEvent(makeKeyEvent('Enter'));
		expect(dispatched).toHaveLength(1);
		expect(getState().doc.children.length).toBe(4);
		handler.destroy();
	});

	it('Backspace at side=after dispatches deleteBackwardAtGap (deletes void)', () => {
		const { element, handler, dispatched, getState } = createGapCursorHandler('after');
		element.dispatchEvent(makeKeyEvent('Backspace'));
		expect(dispatched).toHaveLength(1);
		// HR should be deleted
		expect(getState().doc.children.length).toBe(2);
		handler.destroy();
	});

	it('Delete at side=before dispatches deleteForwardAtGap (deletes void)', () => {
		const { element, handler, dispatched, getState } = createGapCursorHandler('before');
		element.dispatchEvent(makeKeyEvent('Delete'));
		expect(dispatched).toHaveLength(1);
		// HR should be deleted
		expect(getState().doc.children.length).toBe(2);
		handler.destroy();
	});

	it('arrow keys are NOT intercepted by handleGapCursorKeys (passed through to keymaps/fallback)', () => {
		const { element, handler, dispatched } = createGapCursorHandler('before');
		// Arrow keys bypass handleGapCursorKeys (returns false for arrows).
		// Without a GapCursorPlugin keymap, the fallback handler navigates away.
		// First arrow dispatches (escapes GapCursor), subsequent arrows are on text selection.
		element.dispatchEvent(makeKeyEvent('ArrowLeft'));
		expect(dispatched).toHaveLength(1);
		handler.destroy();
	});

	it('modifier combos pass through the GapCursor handler', () => {
		const { element, handler, dispatched } = createGapCursorHandler('before');
		// Alt+x should not be intercepted by the GapCursor handler
		element.dispatchEvent(makeKeyEvent('x', { altKey: true }));
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});

	it('readonly mode: printable chars are consumed but not dispatched', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.gapCursor('hr1', 'before')
			.schema(
				['paragraph', 'horizontal_rule'],
				[],
				makeGetNodeSpec(hrSpec) as Schema['getNodeSpec'],
			)
			.build();

		const dispatched: unknown[] = [];
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: (tr) => {
				dispatched.push(tr);
			},
			undo: vi.fn(),
			redo: vi.fn(),
			isReadOnly: () => true,
		});

		const e = makeKeyEvent('x');
		element.dispatchEvent(e);
		// Event consumed (handler returns true) but nothing dispatched
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});
});

describe('KeyboardHandler: GapCursor arrow fallback (without plugin)', () => {
	const hrSpec: NodeSpec = {
		isVoid: true,
		toDOM: (node) => {
			const el: HTMLElement = document.createElement('hr');
			el.setAttribute('data-block-id', node.id);
			return el;
		},
	};

	function makeGetNodeSpec(spec: NodeSpec): (type: string) => NodeSpec | undefined {
		return (type: string): NodeSpec | undefined => {
			if (type === 'horizontal_rule') return spec;
			return undefined;
		};
	}

	it('ArrowRight at GapCursor side=before navigates into void (NodeSelection)', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('World', 'b2')
			.gapCursor('hr1', 'before')
			.schema(
				['paragraph', 'horizontal_rule'],
				[],
				makeGetNodeSpec(hrSpec) as Schema['getNodeSpec'],
			)
			.build();

		const dispatched: unknown[] = [];
		let currentState: EditorState = state;
		const handler = new KeyboardHandler(element, {
			getState: () => currentState,
			dispatch: (tr) => {
				dispatched.push(tr);
				currentState = currentState.apply(tr);
			},
			undo: vi.fn(),
			redo: vi.fn(),
		});

		element.dispatchEvent(makeKeyEvent('ArrowRight'));
		expect(dispatched).toHaveLength(1);
		// Should navigate to NodeSelection of the void block
		expect(isNodeSelection(currentState.selection)).toBe(true);
		handler.destroy();
	});

	it('ArrowLeft at GapCursor side=before navigates to previous block', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('World', 'b2')
			.gapCursor('hr1', 'before')
			.schema(
				['paragraph', 'horizontal_rule'],
				[],
				makeGetNodeSpec(hrSpec) as Schema['getNodeSpec'],
			)
			.build();

		const dispatched: unknown[] = [];
		let currentState: EditorState = state;
		const handler = new KeyboardHandler(element, {
			getState: () => currentState,
			dispatch: (tr) => {
				dispatched.push(tr);
				currentState = currentState.apply(tr);
			},
			undo: vi.fn(),
			redo: vi.fn(),
		});

		element.dispatchEvent(makeKeyEvent('ArrowLeft'));
		expect(dispatched).toHaveLength(1);
		// Should navigate to end of previous text block
		expect(isGapCursor(currentState.selection)).toBe(false);
		expect(isNodeSelection(currentState.selection)).toBe(false);
		handler.destroy();
	});

	it('ArrowLeft at doc start GapCursor is a no-op', () => {
		const element: HTMLDivElement = document.createElement('div');
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.paragraph('World', 'b2')
			.gapCursor('hr1', 'before')
			.schema(
				['paragraph', 'horizontal_rule'],
				[],
				makeGetNodeSpec(hrSpec) as Schema['getNodeSpec'],
			)
			.build();

		const dispatched: unknown[] = [];
		const handler = new KeyboardHandler(element, {
			getState: () => state,
			dispatch: (tr) => {
				dispatched.push(tr);
			},
			undo: vi.fn(),
			redo: vi.fn(),
		});

		element.dispatchEvent(makeKeyEvent('ArrowLeft'));
		// No navigation possible — should be no-op
		expect(dispatched).toHaveLength(0);
		handler.destroy();
	});
});
