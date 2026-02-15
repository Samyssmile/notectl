import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type Mark,
	createBlockNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isTextNode,
} from '../../model/Document.js';
import { blockId, markType, nodeType } from '../../model/TypeBrands.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectNodeSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HeadingPlugin } from './HeadingPlugin.js';

// --- Helpers ---

type BlockWithAttrs = Omit<BlockNode, 'attrs'> & {
	readonly attrs: Record<string, string | number | boolean>;
};

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
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id, { marks: b.marks, attrs: b.attrs });
	}
	const bid = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(
		['paragraph', 'heading', 'title', 'subtitle'],
		['bold', 'italic', 'underline', 'fontSize'],
	);
	return builder.build();
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
		it('registers heading, title, and subtitle NodeSpecs', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectNodeSpec(h, 'heading');
			expectNodeSpec(h, 'title');
			expectNodeSpec(h, 'subtitle');
		});

		it('heading NodeSpec creates correct HTML tag for each level', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const spec = h.getNodeSpec('heading');

			for (let level = 1; level <= 6; level++) {
				const block = createBlockNode(nodeType('heading'), [createTextNode('')], blockId('test'), {
					level,
				});
				const el = spec?.toDOM(block as BlockWithAttrs);
				expect(el?.tagName).toBe(`H${level}`);
				expect(el?.getAttribute('data-block-id')).toBe('test');
			}
		});

		it('heading NodeSpec defaults to h1 without level attr', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const spec = h.getNodeSpec('heading');
			const block = createBlockNode(nodeType('heading'), [createTextNode('')], blockId('test'));
			const el = spec?.toDOM(block as BlockWithAttrs);
			expect(el?.tagName).toBe('H1');
		});

		it('title NodeSpec creates h1 with notectl-title class', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const spec = h.getNodeSpec('title');
			const block = createBlockNode(nodeType('title'), [createTextNode('')], blockId('test'));
			const el = spec?.toDOM(block as BlockWithAttrs);
			expect(el?.tagName).toBe('H1');
			expect(el?.classList.contains('notectl-title')).toBe(true);
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});

		it('subtitle NodeSpec creates h2 with notectl-subtitle class', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const spec = h.getNodeSpec('subtitle');
			const block = createBlockNode(nodeType('subtitle'), [createTextNode('')], blockId('test'));
			const el = spec?.toDOM(block as BlockWithAttrs);
			expect(el?.tagName).toBe('H2');
			expect(el?.classList.contains('notectl-subtitle')).toBe(true);
			expect(el?.getAttribute('data-block-id')).toBe('test');
		});
	});

	describe('commands', () => {
		it('registers setHeading commands for all levels', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			for (let level = 1; level <= 6; level++) {
				expectCommandRegistered(h, `setHeading${level}`);
			}
		});

		it('registers setParagraph command', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectCommandRegistered(h, 'setParagraph');
		});

		it('registers setTitle command', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectCommandRegistered(h, 'setTitle');
		});

		it('registers setSubtitle command', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectCommandRegistered(h, 'setSubtitle');
		});

		it('setHeading1 converts paragraph to heading', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading1');

			expect(h.dispatch).toHaveBeenCalled();
			expect(h.getState().doc.children[0]?.type).toBe('heading');
			expect(h.getState().doc.children[0]?.attrs?.level).toBe(1);
		});

		it('setHeading2 sets level 2', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading2');
			expect(h.getState().doc.children[0]?.attrs?.level).toBe(2);
		});

		it('toggling same heading level reverts to paragraph', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 1 } }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading1');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('toggling different heading level changes level', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 1 } }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading3');
			expect(h.getState().doc.children[0]?.type).toBe('heading');
			expect(h.getState().doc.children[0]?.attrs?.level).toBe(3);
		});

		it('setParagraph converts heading back to paragraph', async () => {
			const state = makeState([{ type: 'heading', text: 'Hello', id: 'b1', attrs: { level: 2 } }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setParagraph');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(getBlockText(block)).toBe('Hello World');
		});

		it('setTitle converts paragraph to title', async () => {
			const state = makeState([{ type: 'paragraph', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');

			expect(h.dispatch).toHaveBeenCalled();
			expect(h.getState().doc.children[0]?.type).toBe('title');
		});

		it('setSubtitle converts paragraph to subtitle', async () => {
			const state = makeState([{ type: 'paragraph', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setSubtitle');

			expect(h.dispatch).toHaveBeenCalled();
			expect(h.getState().doc.children[0]?.type).toBe('subtitle');
		});

		it('toggling title when already title reverts to paragraph', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('toggling subtitle when already subtitle reverts to paragraph', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setSubtitle');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when switching to title', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');
			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(getBlockText(block)).toBe('Hello World');
		});
	});

	describe('config', () => {
		it('restricts commands to configured levels', async () => {
			const h = await pluginHarness(new HeadingPlugin({ levels: [1, 2, 3] }));

			expectCommandRegistered(h, 'setHeading1');
			expectCommandRegistered(h, 'setHeading2');
			expectCommandRegistered(h, 'setHeading3');
			expect(h.executeCommand('setHeading4')).toBe(false);
			expect(h.executeCommand('setHeading5')).toBe(false);
			expect(h.executeCommand('setHeading6')).toBe(false);
		});

		it('title and subtitle are always available regardless of config', async () => {
			const h = await pluginHarness(new HeadingPlugin({ levels: [1] }));
			expectCommandRegistered(h, 'setTitle');
			expectCommandRegistered(h, 'setSubtitle');
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for all levels', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			for (let level = 1; level <= 6; level++) {
				expectKeyBinding(h, `Mod-Shift-${level}`);
			}
		});

		it('restricts keymaps to configured levels', async () => {
			const h = await pluginHarness(new HeadingPlugin({ levels: [1, 2] }));
			expectKeyBinding(h, 'Mod-Shift-1');
			expectKeyBinding(h, 'Mod-Shift-2');

			const keymaps = h.getKeymaps();
			const keymap = keymaps[0];
			expect(keymap?.['Mod-Shift-3']).toBeUndefined();
		});
	});

	describe('input rules', () => {
		it('registers input rules for each level', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expect(h.getInputRules().length).toBe(6);
		});

		it('input rule pattern matches "# " for H1', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const h1Rule = h.getInputRules()[0];
			expect(h1Rule?.pattern.test('# ')).toBe(true);
			expect(h1Rule?.pattern.test('## ')).toBe(false);
		});

		it('input rule pattern matches "## " for H2', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const h2Rule = h.getInputRules()[1];
			expect(h2Rule?.pattern.test('## ')).toBe(true);
			expect(h2Rule?.pattern.test('# ')).toBe(false);
		});

		it('input rule handler converts paragraph to heading', async () => {
			const state = makeState([{ type: 'paragraph', text: '# ', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new HeadingPlugin(), state);
			const h1Rule = h.getInputRules()[0];

			const match = '# '.match(h1Rule?.pattern ?? /$/);
			assertDefined(match);
			const tr = h1Rule?.handler(state, match, 0, 2);

			expect(tr).not.toBeNull();
			assertDefined(tr);
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
			const h = await pluginHarness(new HeadingPlugin(), state);
			const h1Rule = h.getInputRules()[0];
			const match = '# '.match(h1Rule?.pattern ?? /$/);
			assertDefined(match);
			const tr = h1Rule?.handler(state, match, 0, 2);

			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a heading toolbar item with custom popup', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectToolbarItem(h, 'heading', {
				group: 'block',
				popupType: 'custom',
			});

			const item = h.getToolbarItem('heading');
			expect(item?.icon).toContain('data-heading-label');
		});

		it('combobox label defaults to Paragraph', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			const item = h.getToolbarItem('heading');
			expect(item?.icon).toContain('Paragraph');
		});

		it('isActive returns true when cursor is in heading', async () => {
			const state = makeState([{ type: 'heading', text: 'Title', id: 'b1', attrs: { level: 1 } }]);
			const h = await pluginHarness(new HeadingPlugin(), state);
			expectToolbarActive(h, 'heading', true);
		});

		it('isActive returns true when cursor is in title', async () => {
			const state = makeState([{ type: 'title', text: 'My Title', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);
			expectToolbarActive(h, 'heading', true);
		});

		it('isActive returns true when cursor is in subtitle', async () => {
			const state = makeState([{ type: 'subtitle', text: 'My Subtitle', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);
			expectToolbarActive(h, 'heading', true);
		});

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);
			expectToolbarActive(h, 'heading', false);
		});
	});

	describe('excludeMarks', () => {
		it('NodeSpecs declare excludeMarks for fontSize', async () => {
			const h = await pluginHarness(new HeadingPlugin());
			expectNodeSpec(h, 'title', { excludeMarks: ['fontSize'] });
			expectNodeSpec(h, 'subtitle', { excludeMarks: ['fontSize'] });
			expectNodeSpec(h, 'heading', { excludeMarks: ['fontSize'] });
		});

		it('setTitle strips fontSize marks from text', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello World',
					id: 'b1',
					marks: [BOLD_MARK, FONT_SIZE_12],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(block.type).toBe('title');

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
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					marks: [BOLD_MARK, FONT_SIZE_12],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});

		it('setSubtitle strips fontSize marks', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Subtitle',
					id: 'b1',
					marks: [FONT_SIZE_24],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setSubtitle');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(block.type).toBe('subtitle');

			const inlineChildren = getInlineChildren(block);
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					expect(child.marks.some((m) => m.type === 'fontSize')).toBe(false);
				}
			}
		});

		it('setHeading1 strips fontSize marks', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Heading',
					id: 'b1',
					marks: [FONT_SIZE_12],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading1');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(block.type).toBe('heading');

			const inlineChildren = getInlineChildren(block);
			for (const child of inlineChildren) {
				if (isTextNode(child)) {
					expect(child.marks.some((m) => m.type === 'fontSize')).toBe(false);
				}
			}
		});

		it('preserves text content when stripping marks', async () => {
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Hello World',
					id: 'b1',
					marks: [BOLD_MARK, FONT_SIZE_12],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');
			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(getBlockText(block)).toBe('Hello World');
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
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setHeading2');

			const block = h.getState().doc.children[0];
			assertDefined(block);
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
			const state = makeState([
				{
					type: 'paragraph',
					text: 'Plain',
					id: 'b1',
					marks: [BOLD_MARK],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(block.type).toBe('title');
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});

		it('handles empty block without crashing', async () => {
			const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setTitle');
			expect(h.getState().doc.children[0]?.type).toBe('title');
		});

		it('setParagraph does not strip marks (no excludeMarks on paragraph)', async () => {
			const state = makeState([
				{
					type: 'title',
					text: 'Title',
					id: 'b1',
					marks: [BOLD_MARK],
				},
			]);
			const h = await pluginHarness(new HeadingPlugin(), state);

			h.executeCommand('setParagraph');

			const block = h.getState().doc.children[0];
			assertDefined(block);
			expect(block.type).toBe('paragraph');
			const inlineChildren = getInlineChildren(block);
			const hasBold = inlineChildren.some(
				(child) => isTextNode(child) && child.marks.some((m) => m.type === 'bold'),
			);
			expect(hasBold).toBe(true);
		});
	});
});
