import { describe, expect, it, vi } from 'vitest';
import { registerBuiltinSpecs } from '../../model/BuiltinSpecs.js';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import { TextAlignmentPlugin } from './TextAlignmentPlugin.js';

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
		schema: { nodeTypes: ['paragraph', 'heading'], markTypes: ['bold', 'italic', 'underline'] },
	});
}

async function initPlugins(
	plugins: Plugin[],
	state?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn>; getState: () => EditorState }> {
	const pm = new PluginManager();

	// Register built-in specs (paragraph) before plugins
	registerBuiltinSpecs(pm.schemaRegistry);

	for (const plugin of plugins) {
		pm.register(plugin);
	}
	let currentState = state ?? makeState();

	// Route dispatch through middleware so alignment preservation is tested
	const trackingDispatch = vi.fn((tr: Transaction) => {
		pm.dispatchWithMiddleware(tr, currentState, (finalTr) => {
			currentState = currentState.apply(finalTr);
		});
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

describe('TextAlignmentPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new TextAlignmentPlugin();
			expect(plugin.id).toBe('text-alignment');
			expect(plugin.name).toBe('Text Alignment');
			expect(plugin.priority).toBe(90);
		});
	});

	describe('NodeSpec patching', () => {
		it('patches paragraph NodeSpec with textAlign attr', async () => {
			const { pm } = await initPlugins([new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('paragraph');
			expect(spec?.attrs?.textAlign).toBeDefined();
			expect(spec?.attrs?.textAlign?.default).toBe('left');
		});

		it('patches heading NodeSpec with textAlign attr when heading plugin is loaded', async () => {
			const { pm } = await initPlugins([new HeadingPlugin(), new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('heading');
			expect(spec?.attrs?.textAlign).toBeDefined();
			expect(spec?.attrs?.textAlign?.default).toBe('left');
		});

		it('paragraph toDOM renders text-align style for non-left alignment', async () => {
			const { pm } = await initPlugins([new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', { textAlign: 'center' }),
			);
			expect(el?.style.textAlign).toBe('center');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('paragraph toDOM does not set style for left alignment', async () => {
			const { pm } = await initPlugins([new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', { textAlign: 'left' }),
			);
			expect(el?.style.textAlign).toBe('');
		});

		it('heading toDOM renders text-align style and correct tag', async () => {
			const { pm } = await initPlugins([new HeadingPlugin(), new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', { level: 2, textAlign: 'right' }),
			);
			expect(el?.tagName).toBe('H2');
			expect(el?.style.textAlign).toBe('right');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('heading toDOM preserves original behavior without alignment', async () => {
			const { pm } = await initPlugins([new HeadingPlugin(), new TextAlignmentPlugin()]);
			const spec = pm.schemaRegistry.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', { level: 3 }),
			);
			expect(el?.tagName).toBe('H3');
			expect(el?.style.textAlign).toBe('');
		});
	});

	describe('commands', () => {
		it('registers alignment commands for all four alignments', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);

			expect(pm.executeCommand('alignLeft')).toBe(true);
			expect(pm.executeCommand('alignCenter')).toBe(true);
			expect(pm.executeCommand('alignRight')).toBe(true);
			expect(pm.executeCommand('alignJustify')).toBe(true);
		});

		it('alignCenter sets textAlign to center on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm, getState } = await initPlugins([new TextAlignmentPlugin()], state);

			pm.executeCommand('alignCenter');
			expect(getState().doc.children[0]?.attrs?.textAlign).toBe('center');
		});

		it('alignRight sets textAlign to right on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm, getState } = await initPlugins([new TextAlignmentPlugin()], state);

			pm.executeCommand('alignRight');
			expect(getState().doc.children[0]?.attrs?.textAlign).toBe('right');
		});

		it('alignJustify sets textAlign to justify on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm, getState } = await initPlugins([new TextAlignmentPlugin()], state);

			pm.executeCommand('alignJustify');
			expect(getState().doc.children[0]?.attrs?.textAlign).toBe('justify');
		});

		it('alignLeft resets textAlign to left', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'center' } },
			]);
			const { pm, getState } = await initPlugins([new TextAlignmentPlugin()], state);

			pm.executeCommand('alignLeft');
			expect(getState().doc.children[0]?.attrs?.textAlign).toBe('left');
		});

		it('sets alignment on heading blocks', async () => {
			const state = makeState([{ type: 'heading', text: 'Title', id: 'b1', attrs: { level: 1 } }]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('alignCenter');
			const block = getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves heading level when setting alignment', async () => {
			const state = makeState([{ type: 'heading', text: 'Title', id: 'b1', attrs: { level: 3 } }]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('alignRight');
			const block = getState().doc.children[0];
			expect(block?.attrs?.level).toBe(3);
			expect(block?.attrs?.textAlign).toBe('right');
		});

		it('returns false for non-alignable block types', async () => {
			const state = makeState([
				{ type: 'list_item', text: 'Item', id: 'b1', attrs: { listType: 'bullet', indent: 0 } },
			]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);

			expect(pm.executeCommand('alignCenter')).toBe(false);
		});

		it('respects configured alignments subset', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm } = await initPlugins(
				[new TextAlignmentPlugin({ alignments: ['left', 'center'] })],
				state,
			);

			expect(pm.executeCommand('alignLeft')).toBe(true);
			expect(pm.executeCommand('alignCenter')).toBe(true);
			expect(pm.executeCommand('alignRight')).toBe(false);
			expect(pm.executeCommand('alignJustify')).toBe(false);
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for all alignments', async () => {
			const { pm } = await initPlugins([new TextAlignmentPlugin()]);
			const keymaps = pm.schemaRegistry.getKeymaps();

			const keys = keymaps.flatMap((km) => Object.keys(km));
			expect(keys).toContain('Mod-Shift-L');
			expect(keys).toContain('Mod-Shift-E');
			expect(keys).toContain('Mod-Shift-R');
			expect(keys).toContain('Mod-Shift-J');
		});

		it('restricts keymaps to configured alignments', async () => {
			const { pm } = await initPlugins([
				new TextAlignmentPlugin({ alignments: ['left', 'center'] }),
			]);
			const keymaps = pm.schemaRegistry.getKeymaps();

			const keys = keymaps.flatMap((km) => Object.keys(km));
			expect(keys).toContain('Mod-Shift-L');
			expect(keys).toContain('Mod-Shift-E');
			expect(keys).not.toContain('Mod-Shift-R');
			expect(keys).not.toContain('Mod-Shift-J');
		});
	});

	describe('toolbar item', () => {
		it('registers a text-alignment toolbar item', async () => {
			const { pm } = await initPlugins([new TextAlignmentPlugin()]);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item).toBeDefined();
			expect(item?.group).toBe('block');
			expect(item?.popupType).toBe('dropdown');
		});

		it('dropdown contains all configured alignments', async () => {
			const { pm } = await initPlugins([
				new TextAlignmentPlugin({ alignments: ['left', 'center', 'right'] }),
			]);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');
			const config = item.popupConfig as { items: readonly { label: string }[] };

			expect(config.items).toHaveLength(3);
			expect(config.items[0]?.label).toBe('Align Left');
			expect(config.items[1]?.label).toBe('Align Center');
			expect(config.items[2]?.label).toBe('Align Right');
		});

		it('isActive returns true when block has non-left alignment', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'center' } },
			]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns false when block has left alignment', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'left' } },
			]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isActive?.(state)).toBe(false);
		});

		it('isEnabled returns true for alignable blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isEnabled?.(state)).toBe(true);
		});

		it('isEnabled returns false for non-alignable blocks', async () => {
			const state = makeState([
				{ type: 'list_item', text: 'Item', id: 'b1', attrs: { listType: 'bullet', indent: 0 } },
			]);
			const { pm } = await initPlugins([new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isEnabled?.(state)).toBe(false);
		});

		it('isEnabled returns true for title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const { pm } = await initPlugins([new HeadingPlugin(), new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isEnabled?.(state)).toBe(true);
		});

		it('isEnabled returns true for subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const { pm } = await initPlugins([new HeadingPlugin(), new TextAlignmentPlugin()], state);
			const item = pm.schemaRegistry.getToolbarItem('text-alignment');

			expect(item?.isEnabled?.(state)).toBe(true);
		});
	});

	describe('title and subtitle alignment', () => {
		it('sets alignment on title blocks', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('alignCenter');
			const block = getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('sets alignment on subtitle blocks', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('alignCenter');
			const block = getState().doc.children[0];
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing paragraph to title', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'center' } },
			]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setTitle');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('title');
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing paragraph to subtitle', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'right' } },
			]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setSubtitle');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('subtitle');
			expect(block?.attrs?.textAlign).toBe('right');
		});
	});

	describe('middleware — preserves alignment on block type change', () => {
		it('preserves textAlign when changing paragraph to heading', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'center' } },
			]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setHeading1');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.textAlign).toBe('center');
		});

		it('preserves textAlign when changing heading to paragraph', async () => {
			const state = makeState([
				{ type: 'heading', text: 'Title', id: 'b1', attrs: { level: 1, textAlign: 'right' } },
			]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setParagraph');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(block?.attrs?.textAlign).toBe('right');
		});

		it('does not interfere when block has left alignment', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { textAlign: 'left' } },
			]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setHeading2');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(2);
		});

		it('does not interfere when block has no textAlign attr', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const { pm, getState } = await initPlugins(
				[new HeadingPlugin(), new TextAlignmentPlugin()],
				state,
			);

			pm.executeCommand('setHeading1');
			const block = getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(1);
		});
	});
});
