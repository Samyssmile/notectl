import { describe, expect, it, vi } from 'vitest';
import { HTMLParser } from '../../input/HTMLParser.js';
import type { BlockId } from '../../model/TypeBrands.js';
import {
	expectCommandDispatches,
	expectCommandRegistered,
	expectKeyBinding,
	expectMarkSpec,
	expectNoKeyBinding,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { makePluginOptions, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { PluginManager } from '../PluginManager.js';
import { InlineCodePlugin } from './InlineCodePlugin.js';

// --- Helpers ---

const CODE_SCHEMA = ['code'] as const;

function rangeState(markTypes: readonly string[] = CODE_SCHEMA) {
	return stateBuilder()
		.paragraph('hello', 'b1')
		.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
		.schema(['paragraph'], [...markTypes])
		.build();
}

// --- Tests ---

describe('InlineCodePlugin', () => {
	describe('MarkSpec', () => {
		it('registers code MarkSpec with correct tag and rank', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			expectMarkSpec(h, 'code', { tag: 'CODE', rank: 3 });
		});
	});

	describe('command', () => {
		it('registers toggleInlineCode command', async () => {
			const state = rangeState();
			const h = await pluginHarness(new InlineCodePlugin(), state);
			expectCommandRegistered(h, 'toggleInlineCode');
		});

		it('toggleInlineCode dispatches a transaction on range selection', async () => {
			const state = rangeState();
			const h = await pluginHarness(new InlineCodePlugin(), state);
			expectCommandDispatches(h, 'toggleInlineCode');
		});
	});

	describe('keymap', () => {
		it('registers Mod-E keymap', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			expectKeyBinding(h, 'Mod-E');
		});

		it('does not register keymap when keymap is null', async () => {
			const h = await pluginHarness(new InlineCodePlugin({ keymap: null }));
			expectNoKeyBinding(h, 'Mod-E');
		});
	});

	describe('toolbar item', () => {
		it('registers an inline_code toolbar item', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			expectToolbarItem(h, 'inline_code', {
				group: 'format',
				label: 'Inline Code',
				command: 'toggleInlineCode',
				hasSvgIcon: true,
			});
		});

		it('toolbar item reports active state', async () => {
			const state = stateBuilder()
				.paragraph('coded', 'b1', {
					marks: [{ type: 'code' }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['code'])
				.build();

			const h = await pluginHarness(new InlineCodePlugin(), state);
			expectToolbarActive(h, 'inline_code', true);
		});

		it('toolbar item reports inactive state', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['code'])
				.build();

			const h = await pluginHarness(new InlineCodePlugin(), state);
			expectToolbarActive(h, 'inline_code', false);
		});

		it('does not register toolbar when toolbar is false', async () => {
			const h = await pluginHarness(new InlineCodePlugin({ toolbar: false }));
			expect(h.getToolbarItem('inline_code')).toBeUndefined();
		});
	});

	describe('InputRule', () => {
		it('registers backtick input rule when enabled', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			const rules = h.getInputRules();
			expect(rules.length).toBeGreaterThanOrEqual(1);
		});

		it('does not register input rule when inputRule is false', async () => {
			const h = await pluginHarness(new InlineCodePlugin({ inputRule: false }));
			const rules = h.getInputRules();
			expect(rules.length).toBe(0);
		});

		it('backtick pattern matches `hello` and converts to code mark', async () => {
			const state = stateBuilder()
				.paragraph('`hello`', 'b1')
				.cursor('b1', 7)
				.schema(['paragraph'], ['code'])
				.build();

			const h = await pluginHarness(new InlineCodePlugin(), state);
			const rules = h.getInputRules();
			const rule = rules[0];
			if (!rule) throw new Error('No input rule registered');

			const match = '`hello`'.match(rule.pattern);
			expect(match).not.toBeNull();
			if (!match) return;

			const start: number = match.index ?? 0;
			const tr = rule.handler(h.getState(), match, start, start + match[0].length);
			expect(tr).not.toBeNull();
			if (!tr) return;

			const hasInsert: boolean = tr.steps.some(
				(s) => s.type === 'insertText' && s.marks.some((m) => m.type === 'code'),
			);
			expect(hasInsert).toBe(true);
		});

		it('does not match empty backticks ``', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			const rules = h.getInputRules();
			const rule = rules[0];
			if (!rule) throw new Error('No input rule registered');

			const match = '``'.match(rule.pattern);
			expect(match).toBeNull();
		});

		it('returns null inside a code_block', async () => {
			const state = stateBuilder()
				.block('code_block', '`hello`', 'cb1')
				.cursor('cb1', 7)
				.schema(['paragraph', 'code_block'], ['code'])
				.build();

			const h = await pluginHarness(new InlineCodePlugin(), state);
			const rules = h.getInputRules();
			const rule = rules[0];
			if (!rule) throw new Error('No input rule registered');

			const match = '`hello`'.match(rule.pattern);
			expect(match).not.toBeNull();
			if (!match) return;

			const start: number = match.index ?? 0;
			const tr = rule.handler(h.getState(), match, start, start + match[0].length);
			expect(tr).toBeNull();
		});
	});

	describe('exclusivity middleware', () => {
		it('prevents bold from being added to text with code mark', async () => {
			const state = stateBuilder()
				.paragraph('coded', 'b1', { marks: [{ type: 'code' }] })
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['code', 'bold'])
				.build();

			const plugin = new InlineCodePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasBoldAdd: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'addMark' && s.mark?.type === 'bold',
			);
			expect(hasBoldAdd).toBe(false);
		});

		it('strips bold and italic when code mark is applied', async () => {
			const state = stateBuilder()
				.paragraph('styled', 'b1', { marks: [{ type: 'bold' }, { type: 'italic' }] })
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 6 })
				.schema(['paragraph'], ['code', 'bold', 'italic'])
				.build();

			const plugin = new InlineCodePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 6, { type: 'code' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasRemoveBold: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'bold',
			);
			const hasRemoveItalic: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'removeMark' && s.mark?.type === 'italic',
			);
			expect(hasRemoveBold).toBe(true);
			expect(hasRemoveItalic).toBe(true);
		});

		it('strips excluded stored marks when code is present in storedMarksAfter', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], ['code', 'bold', 'italic'])
				.build();

			const plugin = new InlineCodePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.setStoredMarks([{ type: 'code' }, { type: 'bold' }, { type: 'italic' }], state.storedMarks)
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const stored: readonly { type: string }[] = dispatched.storedMarksAfter ?? [];
			const types: string[] = stored.map((m: { type: string }) => m.type);
			expect(types).toContain('code');
			expect(types).not.toContain('bold');
			expect(types).not.toContain('italic');
		});

		it('allows link mark to coexist with code mark', async () => {
			const state = stateBuilder()
				.paragraph('linked', 'b1', { marks: [{ type: 'code' }] })
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 6 })
				.schema(['paragraph'], ['code', 'link'])
				.build();

			const plugin = new InlineCodePlugin();
			const pm = new PluginManager();
			pm.register(plugin);
			await pm.init(makePluginOptions({ getState: () => state }));

			const tr = state
				.transaction('command')
				.addMark('b1' as BlockId, 0, 6, { type: 'link', href: 'https://example.com' })
				.setSelection(state.selection)
				.build();

			const finalDispatch = vi.fn();
			pm.dispatchWithMiddleware(tr, state, finalDispatch);

			expect(finalDispatch).toHaveBeenCalled();
			const dispatched = finalDispatch.mock.calls[0]?.[0];
			const hasLinkAdd: boolean = dispatched.steps.some(
				(s: { type: string; mark?: { type: string } }) =>
					s.type === 'addMark' && s.mark?.type === 'link',
			);
			expect(hasLinkAdd).toBe(true);
		});
	});

	describe('parseHTML rules', () => {
		async function parseViaPlugin(html: string): Promise<ReturnType<HTMLParser['parse']>> {
			const state = stateBuilder().paragraph('', 'b1').schema(['paragraph'], ['code']).build();
			const h = await pluginHarness(new InlineCodePlugin(), state);
			const schema = h.getState().schema;
			const parser = new HTMLParser({
				schema,
				schemaRegistry: h.pm.schemaRegistry,
			});
			const template = document.createElement('template');
			template.innerHTML = html;
			return parser.parse(template.content);
		}

		it('detects <code> as code mark', async () => {
			const slice = await parseViaPlugin('<p><code>hello</code></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'hello', marks: [{ type: 'code' }] }]);
		});

		it('detects <span style="font-family:monospace"> as code mark', async () => {
			const slice = await parseViaPlugin('<p><span style="font-family:monospace">mono</span></p>');
			expect(slice.blocks[0]?.segments).toEqual([{ text: 'mono', marks: [{ type: 'code' }] }]);
		});
	});

	describe('HTML serialization', () => {
		it('outputs <code>content</code>', async () => {
			const h = await pluginHarness(new InlineCodePlugin());
			const spec = h.getMarkSpec('code');
			expect(spec).toBeDefined();
			if (!spec) return;

			const result: string = spec.toHTMLString({ type: 'code' }, 'hello');
			expect(result).toBe('<code>hello</code>');
		});
	});
});
