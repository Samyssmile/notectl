import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import { BlockquotePlugin } from './BlockquotePlugin.js';

// --- Helpers ---

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const blockNodes = (blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]).map((b) =>
		createBlockNode(b.type, [createTextNode(b.text)], b.id, b.attrs),
	);
	const doc = createDocument(blockNodes);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(
			cursorBlockId ?? blockNodes[0]?.id ?? '',
			cursorOffset ?? 0,
		),
		schema: { nodeTypes: ['paragraph', 'blockquote'], markTypes: ['bold', 'italic', 'underline'] },
	});
}

async function initPlugin(
	plugin: Plugin,
	state?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn>; getState: () => EditorState }> {
	const pm = new PluginManager();
	pm.register(plugin);
	let currentState = state ?? makeState();

	const trackingDispatch = vi.fn((tr: Transaction) => {
		currentState = currentState.apply(tr);
	});

	await pm.init({
		getState: () => currentState,
		dispatch: trackingDispatch,
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	});

	return { pm, dispatch: trackingDispatch, getState: () => currentState };
}

// --- Tests ---

describe('BlockquotePlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new BlockquotePlugin();
			expect(plugin.id).toBe('blockquote');
			expect(plugin.name).toBe('Blockquote');
			expect(plugin.priority).toBe(35);
		});
	});

	describe('NodeSpec', () => {
		it('registers blockquote NodeSpec', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.schemaRegistry.getNodeSpec('blockquote')).toBeDefined();
		});

		it('blockquote NodeSpec creates <blockquote> element', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);

			const spec = pm.schemaRegistry.getNodeSpec('blockquote');
			const el = spec?.toDOM(createBlockNode('blockquote', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('BLOCKQUOTE');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers toggleBlockquote command', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.executeCommand('toggleBlockquote')).toBe(true);
		});

		it('registers setBlockquote command', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.executeCommand('setBlockquote')).toBe(true);
		});

		it('toggleBlockquote converts paragraph to blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const plugin = new BlockquotePlugin();
			const { pm, dispatch, getState } = await initPlugin(plugin, state);

			pm.executeCommand('toggleBlockquote');

			expect(dispatch).toHaveBeenCalled();
			expect(getState().doc.children[0]?.type).toBe('blockquote');
		});

		it('toggleBlockquote converts blockquote back to paragraph', async () => {
			const state = makeState([{ type: 'blockquote', text: 'Hello', id: 'b1' }]);
			const plugin = new BlockquotePlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('toggleBlockquote');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const plugin = new BlockquotePlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('toggleBlockquote');
			expect(getBlockText(getState().doc.children[0])).toBe('Hello World');
		});
	});

	describe('keymap registration', () => {
		it('registers Mod-Shift-> keymap', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			expect(keymap?.['Mod-Shift->']).toBeDefined();
		});
	});

	describe('input rules', () => {
		it('registers one input rule', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);

			const rules = pm.schemaRegistry.getInputRules();
			expect(rules.length).toBe(1);
		});

		it('input rule pattern matches "> "', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);

			const rules = pm.schemaRegistry.getInputRules();
			const rule = rules[0];
			expect(rule?.pattern.test('> ')).toBe(true);
			expect(rule?.pattern.test('>> ')).toBe(false);
		});

		it('input rule handler converts paragraph to blockquote', async () => {
			const state = makeState([{ type: 'paragraph', text: '> ', id: 'b1' }], 'b1', 2);
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin, state);

			const rules = pm.schemaRegistry.getInputRules();
			const rule = rules[0];

			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('blockquote');
		});

		it('input rule only applies on paragraph blocks', async () => {
			const state = makeState([{ type: 'blockquote', text: '> ', id: 'b1' }], 'b1', 2);
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin, state);

			const rules = pm.schemaRegistry.getInputRules();
			const rule = rules[0];
			const match = '> '.match(rule?.pattern ?? /$/);
			const tr = rule?.handler(state, match, 0, 2);

			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a blockquote toolbar item', async () => {
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin);

			const item = pm.schemaRegistry.getToolbarItem('blockquote');
			expect(item).toBeDefined();
			expect(item?.group).toBe('block');
			expect(item?.label).toBe('Blockquote');
			expect(item?.command).toBe('toggleBlockquote');
		});

		it('isActive returns true when cursor is in blockquote', async () => {
			const state = makeState([{ type: 'blockquote', text: 'Quote', id: 'b1' }]);
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('blockquote');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const plugin = new BlockquotePlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('blockquote');
			expect(item?.isActive?.(state)).toBe(false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new BlockquotePlugin({ separatorAfter: true });
			const { pm } = await initPlugin(plugin);

			const item = pm.schemaRegistry.getToolbarItem('blockquote');
			expect(item?.separatorAfter).toBe(true);
		});
	});
});
