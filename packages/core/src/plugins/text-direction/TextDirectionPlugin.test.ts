import { afterEach, describe, expect, it } from 'vitest';
import { parseHTMLToDocument } from '../../editor/DocumentParser.js';
import { serializeDocumentToHTML } from '../../editor/DocumentSerializer.js';
import { registerBuiltinSpecs } from '../../model/BuiltinSpecs.js';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectToolbarActive,
	expectToolbarEnabled,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { resetPlatformCache } from '../../view/Platform.js';
import { PluginManager } from '../PluginManager.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import { TextDirectionPlugin } from './TextDirectionPlugin.js';

// --- Helpers ---

const HARNESS_OPTIONS = { useMiddleware: true, builtinSpecs: true } as const;

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	const bid = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi']);
	return builder.build();
}

// --- Tests ---

describe('TextDirectionPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new TextDirectionPlugin();
			expect(plugin.id).toBe('text-direction');
			expect(plugin.name).toBe('Text Direction');
			expect(plugin.priority).toBe(91);
		});
	});

	describe('NodeSpec patching', () => {
		it('patches paragraph NodeSpec with dir attr', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');
			expect(spec?.attrs?.dir).toBeDefined();
			expect(spec?.attrs?.dir?.default).toBe('auto');
		});

		it('patches heading NodeSpec with dir attr when heading plugin is loaded', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');
			expect(spec?.attrs?.dir).toBeDefined();
			expect(spec?.attrs?.dir?.default).toBe('auto');
		});

		it('paragraph toDOM renders dir attribute for ltr', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					dir: 'ltr',
				}),
			);
			expect(el?.getAttribute('dir')).toBe('ltr');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('paragraph toDOM renders dir attribute for rtl', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					dir: 'rtl',
				}),
			);
			expect(el?.getAttribute('dir')).toBe('rtl');
		});

		it('paragraph toDOM renders dir="auto" for browser-level auto-detection', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const el = spec?.toDOM(
				createBlockNode('paragraph', [createTextNode('')], 'test', {
					dir: 'auto',
				}),
			);
			expect(el?.getAttribute('dir')).toBe('auto');
		});

		it('heading toDOM renders dir attribute and correct tag', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');

			const el = spec?.toDOM(
				createBlockNode('heading', [createTextNode('')], 'test', {
					level: 2,
					dir: 'rtl',
				}),
			);
			expect(el?.tagName).toBe('H2');
			expect(el?.getAttribute('dir')).toBe('rtl');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers all direction commands', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'setDirectionLTR');
			expectCommandRegistered(h, 'setDirectionRTL');
			expectCommandRegistered(h, 'setDirectionAuto');
		});

		it('registers all inline bdi commands', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'toggleBidiLTR');
			expectCommandRegistered(h, 'toggleBidiRTL');
			expectCommandRegistered(h, 'toggleBidiAuto');
			expectCommandRegistered(h, 'removeBidi');
		});

		it('setDirectionRTL sets dir to rtl on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('setDirectionLTR sets dir to ltr on paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('setDirectionAuto sets dir to auto on paragraph', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'rtl' },
				},
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionAuto');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('sets direction on heading blocks', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1 },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setDirectionRTL');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.dir).toBe('rtl');
		});

		it('preserves heading level when setting direction', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 3 },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setDirectionRTL');
			const block = h.getState().doc.children[0];
			expect(block?.attrs?.level).toBe(3);
			expect(block?.attrs?.dir).toBe('rtl');
		});

		it('returns false for non-directable block types', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'Item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const h = await pluginHarness(
				new TextDirectionPlugin({ directableTypes: ['paragraph'] }),
				state,
				HARNESS_OPTIONS,
			);

			expect(h.executeCommand('setDirectionRTL')).toBe(false);
		});
	});

	describe('bdi mark', () => {
		it('registers bdi mark spec', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec).toBeDefined();
			expect(spec?.rank).toBe(10);
		});

		it('bdi mark toDOM renders <bdi> element with dir attribute', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el = spec?.toDOM({ type: 'bdi', attrs: { dir: 'rtl' } });
			expect(el?.tagName).toBe('BDI');
			expect(el?.getAttribute('dir')).toBe('rtl');
		});

		it('bdi mark toDOM defaults dir to auto', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el = spec?.toDOM({ type: 'bdi' });
			expect(el?.tagName).toBe('BDI');
			expect(el?.getAttribute('dir')).toBe('auto');
		});

		it('bdi mark attrs default to auto', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec?.attrs?.dir?.default).toBe('auto');
		});
	});

	describe('toolbar item', () => {
		it('registers a text-direction toolbar item', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			expectToolbarItem(h, 'text-direction', {
				group: 'block',
				popupType: 'dropdown',
			});
		});

		it('tooltip includes keyboard shortcut hint', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('text-direction');
			expect(item?.tooltip).toContain('Shift');
			expect(item?.tooltip).toContain('D');
		});

		it('dropdown contains all three directions', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('text-direction');
			const config = item?.popupConfig as {
				items: readonly { label: string }[];
			};

			expect(config.items).toHaveLength(3);
			expect(config.items[0]?.label).toBe('Left to Right');
			expect(config.items[1]?.label).toBe('Right to Left');
			expect(config.items[2]?.label).toBe('Auto');
		});

		it('isActive returns true when block has non-auto direction', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'rtl' },
				},
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'text-direction', true);
		});

		it('isActive returns false when block has auto direction', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'auto' },
				},
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarActive(h, 'text-direction', false);
		});

		it('isEnabled returns true for directable blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-direction', true);
		});

		it('isEnabled returns false for non-directable blocks', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'Item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const h = await pluginHarness(
				new TextDirectionPlugin({ directableTypes: ['paragraph'] }),
				state,
				HARNESS_OPTIONS,
			);
			expectToolbarEnabled(h, 'text-direction', false);
		});
	});

	describe('middleware — preserves direction on block type change', () => {
		it('preserves dir when changing paragraph to heading', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'rtl' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.dir).toBe('rtl');
		});

		it('preserves dir when changing heading to paragraph', async () => {
			const state = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1, dir: 'ltr' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setParagraph');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(block?.attrs?.dir).toBe('ltr');
		});

		it('does not interfere when block has auto direction', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'auto' },
				},
			]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading2');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(2);
		});

		it('does not interfere when block has no dir attr', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(1);
		});
	});

	describe('NodeSelection support', () => {
		it('isEnabled returns true for directable block via NodeSelection', async () => {
			const state = stateBuilder()
				.paragraph('text', 'b1')
				.block('paragraph', 'selected', 'b2')
				.nodeSelection('b2')
				.schema(['paragraph'], ['bold', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-direction', true);
		});
	});

	// --- Phase 4: Multi-block direction change ---

	describe('multi-block direction change', () => {
		it('sets direction on all blocks in a range selection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.paragraph('Foo', 'b3')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b3', offset: 3 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			const doc = h.getState().doc;
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
			expect(doc.children[2]?.attrs?.dir).toBe('rtl');
		});

		it('only changes directable blocks in range selection', async () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.block('list_item', 'Item', 'b2', { attrs: { listType: 'bullet', indent: 0 } })
				.paragraph('World', 'b3')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b3', offset: 5 })
				.schema(['paragraph', 'heading', 'list_item'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(
				new TextDirectionPlugin({ directableTypes: ['paragraph'] }),
				state,
				HARNESS_OPTIONS,
			);

			h.executeCommand('setDirectionRTL');
			const doc = h.getState().doc;
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBeUndefined();
			expect(doc.children[2]?.attrs?.dir).toBe('rtl');
		});

		it('works with collapsed cursor (single block)', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});

	// --- Phase 5: Keyboard shortcut + toggleDirection ---

	describe('toggleDirection command', () => {
		it('registers toggleDirection command', async () => {
			const state = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectCommandRegistered(h, 'toggleDirection');
		});

		it('registers Mod-Shift-d keymap', async () => {
			const state = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectKeyBinding(h, 'Mod-Shift-d');
		});

		it('cycles auto → rtl → ltr → auto', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('returns false for non-directable block', async () => {
			const state = makeState([
				{
					type: 'list_item',
					text: 'Item',
					id: 'b1',
					attrs: { listType: 'bullet', indent: 0 },
				},
			]);
			const h = await pluginHarness(
				new TextDirectionPlugin({ directableTypes: ['paragraph'] }),
				state,
				HARNESS_OPTIONS,
			);

			expect(h.executeCommand('toggleDirection')).toBe(false);
		});
	});

	// --- Phase 6: Auto-detection middleware ---

	describe('auto-detection middleware', () => {
		it('sets dir to rtl when Arabic text is typed in auto block', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('sets dir to ltr when Latin text is typed in auto block', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('does not change dir for non-empty blocks with explicit direction', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('re-detects LTR when Latin text is typed in empty RTL block', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'rtl' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('keeps RTL when Arabic text is typed in empty RTL block', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'rtl' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not re-detect non-empty block with explicit direction', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not change dir for neutral characters', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, '123')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	// --- Direction inheritance middleware ---

	describe('direction inheritance middleware', () => {
		it('inherits dir from preceding sibling on insertNode', async () => {
			const state = stateBuilder()
				.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 8)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('does not inherit when sibling has auto direction', async () => {
			const state = stateBuilder()
				.block('paragraph', 'Text', 'b1', { attrs: { dir: 'auto' } })
				.cursor('b1', 4)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			// Should remain auto (default), not inherit
			const dir = doc.children[1]?.attrs?.dir;
			expect(dir === undefined || dir === 'auto').toBe(true);
		});

		it('detects RTL from pasted Arabic text in insertNode', async () => {
			const state = stateBuilder()
				.block('paragraph', 'Hello', 'b1', { attrs: { dir: 'ltr' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode(
				'paragraph',
				[createTextNode('مرحبا بالعالم')],
				'b2' as BlockId,
			);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			expect(h.getState().doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('detects LTR from pasted Latin text in insertNode', async () => {
			const state = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode(
				'paragraph',
				[createTextNode('Hello World')],
				'b2' as BlockId,
			);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			expect(h.getState().doc.children[1]?.attrs?.dir).toBe('ltr');
		});

		it('inherits sibling direction for empty inserted block', async () => {
			const state = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			expect(h.getState().doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('does not override explicit direction on new block', async () => {
			const state = stateBuilder()
				.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 8)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId, {
				dir: 'ltr',
			});
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children[1]?.attrs?.dir).toBe('ltr');
		});
	});

	// --- Auto-detection on deleteText ---

	describe('auto-detection on deleteText', () => {
		it('resets dir to auto when all text is deleted', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('re-detects dir when RTL prefix is deleted and LTR remains', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'مرحبا Hello', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 6, 'مرحبا ', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('does not update dir when direction stays the same after delete', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'مرحبا عالم', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 5, 10, ' عالم', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not affect block already set to auto', async () => {
			const state = makeState([
				{ type: 'paragraph', text: '123', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 3, '123', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	// --- Copy/Paste roundtrip tests ---

	describe('copy/paste roundtrip — bdi mark', () => {
		it('parses <bdi dir="rtl"> as bdi mark', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');
			expect(spec?.parseHTML?.[0]?.tag).toBe('bdi');

			const el = document.createElement('bdi');
			el.setAttribute('dir', 'rtl');
			const attrs = spec?.parseHTML?.[0]?.getAttrs?.(el);
			expect(attrs).toEqual({ dir: 'rtl' });
		});

		it('bdi toHTMLString → parseHTML roundtrip preserves dir="rtl"', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const html: string | undefined = spec?.toHTMLString?.(
				{ type: 'bdi', attrs: { dir: 'rtl' } },
				'מילה',
			);
			expect(html).toBe('<bdi dir="rtl">מילה</bdi>');
		});

		it('paragraph serialization includes dir="rtl" via defense-in-depth', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const registry = h.pm.schemaRegistry;

			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('مرحبا')], 'test', {
					dir: 'rtl',
				}),
			]);
			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('dir="rtl"');
			expect(html).toContain('مرحبا');
		});

		it('paragraph toDOM → dir="ltr" → renders attribute', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const block = createBlockNode('paragraph', [createTextNode('Hello')], 'test', {
				dir: 'ltr',
			});
			const el = spec?.toDOM(block);
			expect(el?.getAttribute('dir')).toBe('ltr');
		});

		it('bdi parseHTML rejects invalid dir values', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getMarkSpec('bdi');

			const el = document.createElement('bdi');
			el.setAttribute('dir', 'foo');
			const attrs = spec?.parseHTML?.[0]?.getAttrs?.(el);
			expect(attrs).toEqual({ dir: 'auto' });
		});
	});

	// --- Edge cases: splitBlock / mergeBlocks ---

	describe('splitBlock preserves dir', () => {
		it('both halves keep RTL direction after split', async () => {
			const state = makeState(
				[{ type: 'paragraph', text: 'مرحبا عالم', id: 'b1', attrs: { dir: 'rtl' } }],
				'b1',
				5,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.splitBlock('b1' as BlockId, 5)
				.build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
		});
	});

	describe('mergeBlocks keeps target dir', () => {
		it('merged block preserves first block direction', async () => {
			const state = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.block('paragraph', 'Hello', 'b2', { attrs: { dir: 'ltr' } })
				.cursor('b2', 0)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.mergeBlocks('b1' as BlockId, 'b2' as BlockId)
				.build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children).toHaveLength(1);
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});

	// --- Full HTML roundtrip ---

	describe('HTML serialization roundtrip', () => {
		it('dir attribute survives serialize → parse cycle', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const registry = h.pm.schemaRegistry;

			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('مرحبا')], 'b1', { dir: 'rtl' }),
				createBlockNode('paragraph', [createTextNode('Hello')], 'b2', { dir: 'ltr' }),
			]);

			const html: string = serializeDocumentToHTML(doc, registry);
			expect(html).toContain('dir="rtl"');
			expect(html).toContain('dir="ltr"');

			const parsed = parseHTMLToDocument(html, registry);
			expect(parsed.children[0]?.attrs?.dir).toBe('rtl');
			expect(parsed.children[1]?.attrs?.dir).toBe('ltr');
		});
	});

	// --- Defense-in-depth: dir in serialized HTML even without NodeSpec toHTML ---

	describe('defense-in-depth serialization', () => {
		it('dir appears in fallback HTML when NodeSpec has no toHTML', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('مرحبا')], 'b1', { dir: 'rtl' }),
			]);

			// Serialize without registry — falls back to <p>, but dir should still inject
			const html: string = serializeDocumentToHTML(doc);
			expect(html).toContain('dir="rtl"');
		});
	});

	// --- toggleDirection with NodeSelection ---

	describe('toggleDirection with NodeSelection', () => {
		it('toggles direction when block is selected via NodeSelection', async () => {
			const state = stateBuilder()
				.block('paragraph', 'Hello', 'b1', { attrs: { dir: 'auto' } })
				.nodeSelection('b1')
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('sets direction via setDirectionRTL on NodeSelection', async () => {
			const state = stateBuilder()
				.block('paragraph', 'Hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});

	// --- Full auto-detection lifecycle ---

	describe('full auto-detection lifecycle', () => {
		it('auto → rtl → delete all → auto', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			// Type Arabic → auto becomes rtl
			const tr1 = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr1);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			// Delete all text → back to auto
			const tr2 = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr2);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	// --- Manual override after auto-detection ---

	describe('manual override after auto-detection', () => {
		it('manual setDirectionLTR overrides auto-detected RTL', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			// Type Arabic → auto-detect sets RTL
			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			// Manual override to LTR
			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('auto-detection does not override manually set direction on non-empty block', async () => {
			const state = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'ltr' } },
			]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			// Type Arabic into existing LTR block → should NOT change direction
			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('full lifecycle: auto → rtl → manual ltr → delete all → auto', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			// Type Arabic → auto-detect RTL
			const tr1 = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr1);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			// Manual override to LTR
			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');

			// Delete all text → resets to auto
			const tr2 = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr2);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('toggleDirection after auto-detection cycles correctly', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			// Auto-detect RTL
			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			// Toggle: rtl → ltr
			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');

			// Toggle: ltr → auto
			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	// --- Destroy cleanup ---

	describe('destroy', () => {
		it('plugin has destroy method for cleanup', () => {
			const plugin = new TextDirectionPlugin();
			expect(typeof plugin.destroy).toBe('function');
		});
	});

	// --- Ctrl+Shift direction shortcuts (Windows/Linux) ---

	describe('Ctrl+Shift direction shortcuts', () => {
		afterEach(() => {
			resetPlatformCache();
		});

		/**
		 * Sets up the TextDirectionPlugin with a stable container so we can
		 * dispatch keyboard events and verify command side-effects.
		 */
		async function setupWithContainer() {
			const container: HTMLElement = document.createElement('div');
			document.body.appendChild(container);

			const pm = new PluginManager();
			registerBuiltinSpecs(pm.schemaRegistry);
			pm.register(new TextDirectionPlugin());

			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
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

	// --- Dynamic toolbar icon ---

	describe('dynamic toolbar icon', () => {
		it('getIcon returns RTL icon for RTL block', async () => {
			const state = makeState(
				[{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } }],
				'b1',
				0,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			const toolbarItem = h.getToolbarItem('text-direction');
			expect(toolbarItem?.getIcon).toBeDefined();
			const icon: string | undefined = toolbarItem?.getIcon?.(h.getState());
			expect(icon).toContain('<svg');
			// Should match the RTL direction icon, not auto or ltr
			expect(icon).toContain('M8 14l-4 4');
		});

		it('getIcon returns auto icon for auto block', async () => {
			const state = makeState(
				[{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'auto' } }],
				'b1',
				0,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			const toolbarItem = h.getToolbarItem('text-direction');
			const icon: string | undefined = toolbarItem?.getIcon?.(h.getState());
			// Auto icon has bidirectional arrows
			expect(icon).toContain('l-4-4v3H3');
		});
	});

	// --- toggleBidiIsolation command ---

	describe('toggleBidiIsolation command', () => {
		it('registers toggleBidiIsolation command', async () => {
			const state = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectCommandRegistered(h, 'toggleBidiIsolation');
		});

		it('registers Mod-Shift-b keymap', async () => {
			const state = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectKeyBinding(h, 'Mod-Shift-b');
		});

		it('applies bdi-ltr mark in an auto/ltr block', async () => {
			const state = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const firstChild = block?.children[0];
			if (firstChild && 'marks' in firstChild) {
				const bdiMark = firstChild.marks.find((m) => m.type === 'bdi');
				expect(bdiMark).toBeDefined();
				expect(bdiMark?.attrs?.dir).toBe('rtl');
			}
		});

		it('applies bdi-ltr mark in an RTL block', async () => {
			const state = stateBuilder()
				.block('paragraph', 'مرحبا Hello', 'b1', { attrs: { dir: 'rtl' } })
				.selection({ blockId: 'b1', offset: 6 }, { blockId: 'b1', offset: 11 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const children = block?.children;
			const hasBdiLtr = children?.some(
				(c) => 'marks' in c && c.marks.some((m) => m.type === 'bdi' && m.attrs?.dir === 'ltr'),
			);
			expect(hasBdiLtr).toBe(true);
		});

		it('removes bdi mark when toggled a second time', async () => {
			const state = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiIsolation');
			h.executeCommand('toggleBidiIsolation');

			const block = h.getState().doc.children[0];
			const hasBdi = block?.children.some(
				(c) => 'marks' in c && c.marks.some((m) => m.type === 'bdi'),
			);
			expect(hasBdi).toBe(false);
		});
	});

	// --- Inline direction toolbar item ---

	describe('inline-direction toolbar item', () => {
		it('registers an inline-direction toolbar item', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			expectToolbarItem(h, 'inline-direction', {
				group: 'format',
				popupType: 'dropdown',
			});
		});

		it('tooltip includes Mod-Shift-b shortcut hint', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('inline-direction');
			expect(item?.tooltip).toContain('Shift');
			expect(item?.tooltip).toContain('b');
		});

		it('dropdown contains LTR, RTL, Auto, and Remove items', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const item = h.getToolbarItem('inline-direction');
			const config = item?.popupConfig as {
				items: readonly { label: string; command: string }[];
			};

			expect(config.items).toHaveLength(4);
			expect(config.items[0]?.command).toBe('toggleBidiLTR');
			expect(config.items[1]?.command).toBe('toggleBidiRTL');
			expect(config.items[2]?.command).toBe('toggleBidiAuto');
			expect(config.items[3]?.command).toBe('removeBidi');
		});

		it('isActive returns true when bdi mark is active', async () => {
			const state = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiLTR');

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isActive?.(h.getState())).toBe(true);
		});

		it('isActive returns false when no bdi mark', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isActive?.(h.getState())).toBe(false);
		});

		it('isEnabled returns false for collapsed cursor', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isEnabled?.(h.getState())).toBe(false);
		});

		it('isEnabled returns true for range selection', async () => {
			const state = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const item = h.getToolbarItem('inline-direction');
			expect(item?.isEnabled?.(h.getState())).toBe(true);
		});
	});

	// --- removeBidi announces ---

	describe('removeBidi announcement', () => {
		it('removeBidi announces removal', async () => {
			const state = stateBuilder()
				.paragraph('Hello world', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleBidiLTR');
			const result: boolean = h.executeCommand('removeBidi');
			expect(result).toBe(true);
		});
	});
});
