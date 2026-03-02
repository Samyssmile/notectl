import { afterEach, describe, expect, it } from 'vitest';
import { registerBuiltinSpecs } from '../../editor/BuiltinSpecs.js';
import { resetPlatformCache } from '../../platform/Platform.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { PluginManager } from '../PluginManager.js';
import { TextDirectionPlugin } from './TextDirectionPlugin.js';

// --- Helpers ---

/**
 * Sets up the TextDirectionPlugin with a stable container so we can
 * dispatch keyboard events and verify command side-effects.
 *
 * Uses PluginManager directly rather than pluginHarness because we need
 * a real DOM container for keyboard event dispatch.
 */
async function setupWithContainer(): Promise<{
	container: HTMLElement;
	getState: () => EditorState;
	pm: PluginManager;
	cleanup: () => void;
}> {
	const container: HTMLElement = document.createElement('div');
	document.body.appendChild(container);

	const pm = new PluginManager();
	registerBuiltinSpecs(pm.schemaRegistry);
	pm.register(new TextDirectionPlugin());

	const state: EditorState = stateBuilder()
		.paragraph('Hello', 'b1')
		.cursor('b1', 0)
		.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
		.build();
	let currentState: EditorState = state;

	await pm.init({
		getState: () => currentState,
		dispatch: (tr: Transaction) => {
			pm.dispatchWithMiddleware(tr, currentState, (finalTr: Transaction) => {
				currentState = currentState.apply(finalTr);
			});
		},
		getContainer: () => container,
		getPluginContainer: () => document.createElement('div'),
	});

	return {
		container,
		getState: () => currentState,
		pm,
		cleanup: () => {
			pm.destroy();
			container.remove();
		},
	};
}

function keydown(
	target: HTMLElement,
	key: string,
	code: string,
	mods: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
): void {
	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			code,
			ctrlKey: mods.ctrlKey ?? false,
			altKey: mods.altKey ?? false,
			metaKey: mods.metaKey ?? false,
			bubbles: true,
		}),
	);
}

function keyup(target: HTMLElement, key: string, code: string): void {
	target.dispatchEvent(
		new KeyboardEvent('keyup', {
			key,
			code,
			bubbles: true,
		}),
	);
}

// --- Tests ---

describe('ShiftDirectionHandler — Ctrl+Shift direction shortcuts', () => {
	afterEach(() => {
		resetPlatformCache();
	});

	it('Ctrl+ShiftLeft then Shift keyup sets direction to LTR', async () => {
		const { container, getState, cleanup } = await setupWithContainer();

		keydown(container, 'Shift', 'ShiftLeft', { ctrlKey: true });
		keyup(container, 'Shift', 'ShiftLeft');

		expect(getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		cleanup();
	});

	it('Ctrl+ShiftRight then Shift keyup sets direction to RTL', async () => {
		const { container, getState, cleanup } = await setupWithContainer();

		keydown(container, 'Shift', 'ShiftRight', { ctrlKey: true });
		keyup(container, 'Shift', 'ShiftRight');

		expect(getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		cleanup();
	});

	it('cancels pending direction when another key is pressed between', async () => {
		const { container, getState, cleanup } = await setupWithContainer();

		// Ctrl+ShiftLeft sets pending LTR
		keydown(container, 'Shift', 'ShiftLeft', { ctrlKey: true });
		// Pressing another key cancels it
		keydown(container, 'd', 'KeyD', { ctrlKey: true });
		keyup(container, 'Shift', 'ShiftLeft');

		// Direction should remain auto (unchanged)
		const dir = getState().doc.children[0]?.attrs?.dir;
		expect(dir === 'auto' || dir === undefined).toBe(true);
		cleanup();
	});

	it('detaches event listeners on destroy', async () => {
		const { container, getState, cleanup } = await setupWithContainer();

		cleanup();

		// After destroy, keyboard events should have no effect
		keydown(container, 'Shift', 'ShiftRight', { ctrlKey: true });
		keyup(container, 'Shift', 'ShiftRight');

		const dir = getState().doc.children[0]?.attrs?.dir;
		expect(dir === 'auto' || dir === undefined).toBe(true);
	});

	it('does not fire for Ctrl+Alt+Shift combinations', async () => {
		const { container, getState, cleanup } = await setupWithContainer();

		keydown(container, 'Shift', 'ShiftLeft', { ctrlKey: true, altKey: true });
		keyup(container, 'Shift', 'ShiftLeft');

		const dir = getState().doc.children[0]?.attrs?.dir;
		expect(dir === 'auto' || dir === undefined).toBe(true);
		cleanup();
	});
});
