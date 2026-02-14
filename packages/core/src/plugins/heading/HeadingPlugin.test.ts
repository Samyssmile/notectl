import { describe, expect, it, vi } from 'vitest';
import {
	type Mark,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isTextNode,
} from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager, type PluginManagerInitOptions } from '../PluginManager.js';
import { HeadingPlugin } from './HeadingPlugin.js';

// --- Helpers ---

const BOLD_MARK: Mark = { type: markType('bold') };
const ITALIC_MARK: Mark = { type: markType('italic') };
const FONT_SIZE_12: Mark = { type: markType('fontSize'), attrs: { size: '12px' } };
const FONT_SIZE_24: Mark = { type: markType('fontSize'), attrs: { size: '24px' } };

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
		marks?: readonly Mark[];
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const blockNodes = (blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]).map((b) =>
		createBlockNode(b.type, [createTextNode(b.text, b.marks)], b.id, b.attrs),
	);
	const doc = createDocument(blockNodes);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(
			cursorBlockId ?? blockNodes[0]?.id ?? '',
			cursorOffset ?? 0,
		),
		schema: {
			nodeTypes: ['paragraph', 'heading', 'title', 'subtitle'],
			markTypes: ['bold', 'italic', 'underline', 'fontSize'],
		},
	});
}

async function initPlugin(
	plugin: Plugin,
	state?: EditorState,
): Promise<{ pm: PluginManager; dispatch: ReturnType<typeof vi.fn>; getState: () => EditorState }> {
	const pm = new PluginManager();
	pm.register(plugin);
	const dispatch = vi.fn();
	let currentState = state ?? makeState();

	// Apply dispatched transactions to state for realistic behavior
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

describe('HeadingPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new HeadingPlugin();
			expect(plugin.id).toBe('heading');
			expect(plugin.name).toBe('Heading');
			expect(plugin.priority).toBe(30);
		});
	});

	describe('NodeSpec', () => {
		it('registers heading NodeSpec', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.schemaRegistry.getNodeSpec('heading')).toBeDefined();
		});

		it('registers title NodeSpec', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.schemaRegistry.getNodeSpec('title')).toBeDefined();
		});

		it('registers subtitle NodeSpec', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);
			expect(pm.schemaRegistry.getNodeSpec('subtitle')).toBeDefined();
		});

		it('heading NodeSpec creates correct HTML tag for each level', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const spec = pm.schemaRegistry.getNodeSpec('heading');

			for (let level = 1; level <= 6; level++) {
				const el = spec?.toDOM(createBlockNode('heading', [createTextNode('')], 'test', { level }));
				expect(el?.tagName).toBe(`H${level}`);
				expect(el?.getAttribute('data-block-id')).toBe('test');
			}
		});

		it('heading NodeSpec defaults to h1 without level attr', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const spec = pm.schemaRegistry.getNodeSpec('heading');
			const el = spec?.toDOM(createBlockNode('heading', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('H1');
		});

		it('title NodeSpec creates h1 with notectl-title class', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const spec = pm.schemaRegistry.getNodeSpec('title');
			const el = spec?.toDOM(createBlockNode('title', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('H1');
			expect(el?.classList.contains('notectl-title')).toBe(true);
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('subtitle NodeSpec creates h2 with notectl-subtitle class', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const spec = pm.schemaRegistry.getNodeSpec('subtitle');
			const el = spec?.toDOM(createBlockNode('subtitle', [createTextNode('')], 'test'));
			expect(el?.tagName).toBe('H2');
			expect(el?.classList.contains('notectl-subtitle')).toBe(true);
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers setHeading commands for all levels', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			for (let level = 1; level <= 6; level++) {
				expect(pm.executeCommand(`setHeading${level}`)).toBe(true);
			}
		});

		it('registers setParagraph command', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			expect(pm.executeCommand('setParagraph')).toBe(true);
		});

		it('registers setTitle command', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			expect(pm.executeCommand('setTitle')).toBe(true);
		});

		it('registers setSubtitle command', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			expect(pm.executeCommand('setSubtitle')).toBe(true);
		});

		it('setHeading1 converts paragraph to heading', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, dispatch, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading1');

			expect(dispatch).toHaveBeenCalled();
			expect(getState().doc.children[0]?.type).toBe('heading');
			expect(getState().doc.children[0]?.attrs?.level).toBe(1);
		});

		it('setHeading2 sets level 2', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading2');
			expect(getState().doc.children[0]?.attrs?.level).toBe(2);
		});

		it('toggling same heading level reverts to paragraph', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 1 } }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading1');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('toggling different heading level changes level', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 1 } }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading3');
			expect(getState().doc.children[0]?.type).toBe('heading');
			expect(getState().doc.children[0]?.attrs?.level).toBe(3);
		});

		it('setParagraph converts heading back to paragraph', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 2 } }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setParagraph');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading1');
			expect(getBlockText(getState().doc.children[0])).toBe('Hello World');
		});

		it('setTitle converts paragraph to title', async () => {
			const state = makeState([{ type: 'paragraph', text: 'My Title', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, dispatch, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');

			expect(dispatch).toHaveBeenCalled();
			expect(getState().doc.children[0]?.type).toBe('title');
		});

		it('setSubtitle converts paragraph to subtitle', async () => {
			const state = makeState([{ type: 'paragraph', text: 'My Subtitle', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, dispatch, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setSubtitle');

			expect(dispatch).toHaveBeenCalled();
			expect(getState().doc.children[0]?.type).toBe('subtitle');
		});

		it('toggling title when already title reverts to paragraph', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('toggling subtitle when already subtitle reverts to paragraph', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setSubtitle');
			expect(getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when switching to title', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');
			expect(getBlockText(getState().doc.children[0])).toBe('Hello World');
		});
	});

	describe('config', () => {
		it('restricts commands to configured levels', async () => {
			const plugin = new HeadingPlugin({ levels: [1, 2, 3] });
			const { pm } = await initPlugin(plugin);

			expect(pm.executeCommand('setHeading1')).toBe(true);
			expect(pm.executeCommand('setHeading2')).toBe(true);
			expect(pm.executeCommand('setHeading3')).toBe(true);
			expect(pm.executeCommand('setHeading4')).toBe(false);
			expect(pm.executeCommand('setHeading5')).toBe(false);
			expect(pm.executeCommand('setHeading6')).toBe(false);
		});

		it('title and subtitle are always available regardless of config', async () => {
			const plugin = new HeadingPlugin({ levels: [1] });
			const { pm } = await initPlugin(plugin);

			expect(pm.executeCommand('setTitle')).toBe(true);
			expect(pm.executeCommand('setSubtitle')).toBe(true);
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for all levels', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			const keymap = keymaps[0];
			for (let level = 1; level <= 6; level++) {
				expect(keymap?.[`Mod-Shift-${level}`]).toBeDefined();
			}
		});

		it('restricts keymaps to configured levels', async () => {
			const plugin = new HeadingPlugin({ levels: [1, 2] });
			const { pm } = await initPlugin(plugin);

			const keymaps = pm.schemaRegistry.getKeymaps();
			const keymap = keymaps[0];
			expect(keymap?.['Mod-Shift-1']).toBeDefined();
			expect(keymap?.['Mod-Shift-2']).toBeDefined();
			expect(keymap?.['Mod-Shift-3']).toBeUndefined();
		});
	});

	describe('input rules', () => {
		it('registers input rules for each level', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const rules = pm.schemaRegistry.getInputRules();
			expect(rules.length).toBe(6);
		});

		it('input rule pattern matches "# " for H1', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const rules = pm.schemaRegistry.getInputRules();
			const h1Rule = rules[0];
			expect(h1Rule?.pattern.test('# ')).toBe(true);
			expect(h1Rule?.pattern.test('## ')).toBe(false);
		});

		it('input rule pattern matches "## " for H2', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const rules = pm.schemaRegistry.getInputRules();
			const h2Rule = rules[1];
			expect(h2Rule?.pattern.test('## ')).toBe(true);
			expect(h2Rule?.pattern.test('# ')).toBe(false);
		});

		it('input rule handler converts paragraph to heading', async () => {
			const state = makeState([{ type: 'paragraph', text: '# ', id: 'b1' }], 'b1', 2);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const rules = pm.schemaRegistry.getInputRules();
			const h1Rule = rules[0];

			const match = '# '.match(h1Rule?.pattern ?? /$/);
			const tr = h1Rule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('heading');
			expect(newState.doc.children[0]?.attrs?.level).toBe(1);
		});

		it('input rule only applies on paragraph blocks', async () => {
			const state = makeState(
				[{ type: 'heading', text: '# ', id: 'b1', attrs: { level: 2 } }],
				'b1',
				2,
			);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const rules = pm.schemaRegistry.getInputRules();
			const h1Rule = rules[0];
			const match = '# '.match(h1Rule?.pattern ?? /$/);
			const tr = h1Rule?.handler(state, match, 0, 2);

			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a heading toolbar item with custom popup', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item).toBeDefined();
			expect(item?.group).toBe('block');
			expect(item?.icon).toContain('data-heading-label');
			expect(item?.popupType).toBe('custom');
		});

		it('combobox label defaults to Paragraph', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item?.icon).toContain('Paragraph');
		});

		it('isActive returns true when cursor is in heading', async () => {
			const state = makeState([{ type: 'heading', text: 'Title', id: 'b1', attrs: { level: 1 } }]);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns true when cursor is in title', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns true when cursor is in subtitle', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item?.isActive?.(state)).toBe(true);
		});

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin, state);

			const item = pm.schemaRegistry.getToolbarItem('heading');
			expect(item?.isActive?.(state)).toBe(false);
		});
	});

	describe('excludeMarks', () => {
		it('NodeSpecs declare excludeMarks for fontSize', async () => {
			const plugin = new HeadingPlugin();
			const { pm } = await initPlugin(plugin);

			const titleSpec = pm.schemaRegistry.getNodeSpec('title');
			const subtitleSpec = pm.schemaRegistry.getNodeSpec('subtitle');
			const headingSpec = pm.schemaRegistry.getNodeSpec('heading');

			expect(titleSpec?.excludeMarks).toContain('fontSize');
			expect(subtitleSpec?.excludeMarks).toContain('fontSize');
			expect(headingSpec?.excludeMarks).toContain('fontSize');
		});

		it('setTitle strips fontSize marks from text', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello World', id: 'b1', marks: [BOLD_MARK, FONT_SIZE_12] },
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('title');

			const inlineChildren = getInlineChildren(block);
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					const hasFontSize = child.marks.some((m) => m.type === 'fontSize');
					expect(hasFontSize).toBe(false);
				}
			}
		});

		it('setTitle preserves bold marks', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', marks: [BOLD_MARK, FONT_SIZE_12] },
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');

			const block = getState().doc.children[0];
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});

		it('setSubtitle strips fontSize marks', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Subtitle', id: 'b1', marks: [FONT_SIZE_24] },
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setSubtitle');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('subtitle');

			const inlineChildren = getInlineChildren(block);
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					expect(child.marks.some((m) => m.type === 'fontSize')).toBe(false);
				}
			}
		});

		it('setHeading1 strips fontSize marks', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Heading', id: 'b1', marks: [FONT_SIZE_12] },
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading1');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('heading');

			const inlineChildren = getInlineChildren(block);
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					expect(child.marks.some((m) => m.type === 'fontSize')).toBe(false);
				}
			}
		});

		it('preserves text content when stripping marks', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello World', id: 'b1', marks: [BOLD_MARK, FONT_SIZE_12] },
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');
			expect(getBlockText(getState().doc.children[0])).toBe('Hello World');
		});

		it('preserves italic marks when stripping fontSize', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Styled',
					id: 'b1',
					marks: [BOLD_MARK, ITALIC_MARK, FONT_SIZE_24],
				},
			]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setHeading2');

			const block = getState().doc.children[0];
			const inlineChildren = getInlineChildren(block);
			const markTypes: string[] = [];
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					for (const m of child.marks) {
						markTypes.push(m.type);
					}
				}
			}
			expect(markTypes).toContain('bold');
			expect(markTypes).toContain('italic');
			expect(markTypes).not.toContain('fontSize');
		});

		it('no-op when block has no excluded marks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Plain', id: 'b1', marks: [BOLD_MARK] }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('title');
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});

		it('handles empty block without crashing', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setTitle');
			expect(getState().doc.children[0]?.type).toBe('title');
		});

		it('setParagraph does not strip marks (no excludeMarks on paragraph)', async () => {
			const state = makeState([{ type: 'title', text: 'Title', id: 'b1', marks: [BOLD_MARK] }]);
			const plugin = new HeadingPlugin();
			const { pm, getState } = await initPlugin(plugin, state);

			pm.executeCommand('setParagraph');

			const block = getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});
	});
});
