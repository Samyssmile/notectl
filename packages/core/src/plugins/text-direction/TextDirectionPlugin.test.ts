import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode } from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectToolbarActive,
	expectToolbarEnabled,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import type { DropdownConfig } from '../toolbar/ToolbarItem.js';
import { DIRECTION_ICONS, TextDirectionPlugin } from './TextDirectionPlugin.js';

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
): EditorState {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { attrs: b.attrs });
	}
	const bid: string = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi']);
	return builder.build();
}

// --- Tests ---

describe('TextDirectionPlugin', () => {
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

			const node = createBlockNode(
				'paragraph' as NodeTypeName,
				[createTextNode('')],
				'test' as BlockId,
				{ dir: 'ltr' },
			);
			const el = spec?.toDOM(node as Parameters<NonNullable<typeof spec>['toDOM']>[0]);
			expect(el?.getAttribute('dir')).toBe('ltr');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('paragraph toDOM renders dir attribute for rtl', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const node = createBlockNode(
				'paragraph' as NodeTypeName,
				[createTextNode('')],
				'test' as BlockId,
				{ dir: 'rtl' },
			);
			const el = spec?.toDOM(node as Parameters<NonNullable<typeof spec>['toDOM']>[0]);
			expect(el?.getAttribute('dir')).toBe('rtl');
		});

		it('paragraph toDOM renders dir="auto" for browser-level auto-detection', async () => {
			const h = await pluginHarness(new TextDirectionPlugin(), undefined, HARNESS_OPTIONS);
			const spec = h.getNodeSpec('paragraph');

			const node = createBlockNode(
				'paragraph' as NodeTypeName,
				[createTextNode('')],
				'test' as BlockId,
				{ dir: 'auto' },
			);
			const el = spec?.toDOM(node as Parameters<NonNullable<typeof spec>['toDOM']>[0]);
			expect(el?.getAttribute('dir')).toBe('auto');
		});

		it('heading toDOM renders dir attribute and correct tag', async () => {
			const h = await pluginHarness(
				[new HeadingPlugin(), new TextDirectionPlugin()],
				undefined,
				HARNESS_OPTIONS,
			);
			const spec = h.getNodeSpec('heading');

			const node = createBlockNode(
				'heading' as NodeTypeName,
				[createTextNode('')],
				'test' as BlockId,
				{ level: 2, dir: 'rtl' },
			);
			const el = spec?.toDOM(node as Parameters<NonNullable<typeof spec>['toDOM']>[0]);
			expect(el?.tagName).toBe('H2');
			expect(el?.getAttribute('dir')).toBe('rtl');
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers all direction commands', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			expectCommandRegistered(h, 'setDirectionLTR');
			expectCommandRegistered(h, 'setDirectionRTL');
			expectCommandRegistered(h, 'setDirectionAuto');
		});

		it('setDirectionRTL sets dir to rtl on paragraph', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('setDirectionLTR sets dir to ltr on paragraph', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('setDirectionAuto sets dir to auto on paragraph', async () => {
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([
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
			expect(item?.popupType).toBe('dropdown');

			const config = (item as unknown as { popupConfig: DropdownConfig }).popupConfig;
			expect(config.items).toHaveLength(3);
			expect(config.items[0]?.label).toBe('Left to Right');
			expect(config.items[1]?.label).toBe('Right to Left');
			expect(config.items[2]?.label).toBe('Auto');
		});

		it('isActive returns true when block has non-auto direction', async () => {
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-direction', true);
		});

		it('isEnabled returns false for non-directable blocks', async () => {
			const state: EditorState = makeState([
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

	describe('dynamic toolbar icon', () => {
		it('getIcon returns RTL icon for RTL block', async () => {
			const state: EditorState = makeState(
				[{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } }],
				'b1',
				0,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			const toolbarItem = h.getToolbarItem('text-direction');
			expect(toolbarItem?.getIcon).toBeDefined();
			const icon: string | undefined = toolbarItem?.getIcon?.(h.getState());
			expect(icon).toBe(DIRECTION_ICONS.rtl);
		});

		it('getIcon returns auto icon for auto block', async () => {
			const state: EditorState = makeState(
				[{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'auto' } }],
				'b1',
				0,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			const toolbarItem = h.getToolbarItem('text-direction');
			const icon: string | undefined = toolbarItem?.getIcon?.(h.getState());
			expect(icon).toBe(DIRECTION_ICONS.auto);
		});

		it('getIcon returns LTR icon for LTR block', async () => {
			const state: EditorState = makeState(
				[{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'ltr' } }],
				'b1',
				0,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			const toolbarItem = h.getToolbarItem('text-direction');
			const icon: string | undefined = toolbarItem?.getIcon?.(h.getState());
			expect(icon).toBe(DIRECTION_ICONS.ltr);
		});
	});

	describe('NodeSelection support', () => {
		it('isEnabled returns true for directable block via NodeSelection', async () => {
			const state: EditorState = stateBuilder()
				.paragraph('text', 'b1')
				.block('paragraph', 'selected', 'b2')
				.nodeSelection('b2')
				.schema(['paragraph'], ['bold', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectToolbarEnabled(h, 'text-direction', true);
		});
	});

	describe('multi-block direction change', () => {
		it('sets direction on all blocks in a range selection', async () => {
			const state: EditorState = stateBuilder()
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
			const state: EditorState = stateBuilder()
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
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});

	describe('toggleDirection command', () => {
		it('registers toggleDirection command', async () => {
			const state: EditorState = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectCommandRegistered(h, 'toggleDirection');
		});

		it('registers Mod-Shift-D keymap', async () => {
			const state: EditorState = makeState();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);
			expectKeyBinding(h, 'Mod-Shift-D');
		});

		it('cycles auto → rtl → ltr → auto', async () => {
			const state: EditorState = makeState([
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
			const state: EditorState = makeState([
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

	describe('toggleDirection with NodeSelection', () => {
		it('toggles direction when block is selected via NodeSelection', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'Hello', 'b1', { attrs: { dir: 'auto' } })
				.nodeSelection('b1')
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('sets direction via setDirectionRTL on NodeSelection', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'Hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			h.executeCommand('setDirectionRTL');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});

	describe('splitBlock preserves dir', () => {
		it('both halves keep RTL direction after split', async () => {
			const state: EditorState = makeState(
				[{ type: 'paragraph', text: 'مرحبا عالم', id: 'b1', attrs: { dir: 'rtl' } }],
				'b1',
				5,
			);
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.splitBlock('b1' as BlockId, 5, 'b1-split' as BlockId)
				.build();
			(h.dispatch as (tr: unknown) => void)(tr);

			const doc = h.getState().doc;
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
		});
	});

	describe('mergeBlocks keeps target dir', () => {
		it('merged block preserves first block direction', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.block('paragraph', 'Hello', 'b2', { attrs: { dir: 'ltr' } })
				.cursor('b2', 0)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline', 'bdi'])
				.build();
			const h = await pluginHarness(new TextDirectionPlugin(), state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.mergeBlocks('b1' as BlockId, 'b2' as BlockId, 5)
				.build();
			(h.dispatch as (tr: unknown) => void)(tr);

			const doc = h.getState().doc;
			expect(doc.children).toHaveLength(1);
			expect(doc.children[0]?.attrs?.dir).toBe('rtl');
		});
	});
});
