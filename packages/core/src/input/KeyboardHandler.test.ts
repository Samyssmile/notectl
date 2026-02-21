import { describe, expect, it, vi } from 'vitest';
import { createNodeSelection, isNodeSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import { KeyboardHandler, normalizeKeyDescriptor } from './KeyboardHandler.js';

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
