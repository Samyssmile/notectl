import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode, getBlockText } from '../../model/Document.js';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectNodeSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { assertDefined, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { CodeBlockPlugin } from './CodeBlockPlugin.js';
import { CODE_BLOCK_SERVICE_KEY } from './CodeBlockTypes.js';

// --- Helpers ---

function makeState(
	blocks?: { type: string; text: string; id: string }[],
	cursorBlockId?: string,
	cursorOffset?: number,
) {
	const builder = stateBuilder();
	for (const b of blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]) {
		builder.block(b.type, b.text, b.id);
	}
	const bid: string = cursorBlockId ?? blocks?.[0]?.id ?? 'b1';
	builder.cursor(bid, cursorOffset ?? 0);
	builder.schema(['paragraph', 'code_block'], ['bold', 'italic', 'underline']);
	return builder.build();
}

// --- Tests ---

describe('CodeBlockPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new CodeBlockPlugin();
			expect(plugin.id).toBe('code-block');
			expect(plugin.name).toBe('Code Block');
			expect(plugin.priority).toBe(36);
		});
	});

	describe('NodeSpec', () => {
		it('registers code_block NodeSpec', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectNodeSpec(h, 'code_block');
		});

		it('NodeSpec has correct attributes', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const spec = h.getNodeSpec('code_block');
			assertDefined(spec);
			expect(spec.attrs?.language).toEqual({ default: '' });
			expect(spec.attrs?.backgroundColor).toEqual({ default: '' });
		});

		it('marks are stripped when converting to code_block', async () => {
			const state = stateBuilder()
				.paragraph('bold text', 'b1', {
					marks: [{ type: 'bold' as import('../../model/TypeBrands.js').MarkTypeName }],
				})
				.cursor('b1', 0)
				.schema(['paragraph', 'code_block'], ['bold'])
				.build();
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			h.executeCommand('toggleCodeBlock');

			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('code_block');
			const text = block?.children[0];
			if (text && 'marks' in text) {
				expect(text.marks.length).toBe(0);
			}
		});

		it('toDOM creates <pre> element with <code> child', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const spec = h.getNodeSpec('code_block');
			assertDefined(spec);
			const node = createBlockNode('code_block', [createTextNode('')], 'test');
			const el = spec.toDOM(node);
			expect(el.tagName).toBe('PRE');
			expect(el.getAttribute('data-block-id')).toBe('test');
			expect(el.querySelector('code')).not.toBeNull();
		});

		it('parseHTML matches <pre> tags', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const spec = h.getNodeSpec('code_block');
			assertDefined(spec);
			expect(spec.parseHTML).toBeDefined();
			expect(spec.parseHTML?.[0]?.tag).toBe('pre');
		});

		it('parseHTML extracts language from data-language', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const spec = h.getNodeSpec('code_block');
			assertDefined(spec);

			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.setAttribute('data-language', 'typescript');
			pre.appendChild(code);

			const attrs = spec.parseHTML?.[0]?.getAttrs?.(pre);
			expect(attrs).toEqual({ language: 'typescript' });
		});

		it('parseHTML extracts language from class', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const spec = h.getNodeSpec('code_block');
			assertDefined(spec);

			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.className = 'language-python';
			pre.appendChild(code);

			const attrs = spec.parseHTML?.[0]?.getAttrs?.(pre);
			expect(attrs).toEqual({ language: 'python' });
		});
	});

	describe('commands', () => {
		it('registers toggleCodeBlock command', async () => {
			const state = makeState();
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			expectCommandRegistered(h, 'toggleCodeBlock');
		});

		it('registers insertCodeBlock command', async () => {
			const state = makeState();
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			expectCommandRegistered(h, 'insertCodeBlock');
		});

		it('registers exitCodeBlock command', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			expectCommandRegistered(h, 'exitCodeBlock');
		});

		it('toggleCodeBlock converts paragraph to code_block', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			h.executeCommand('toggleCodeBlock');

			expect(h.dispatch).toHaveBeenCalled();
			expect(h.getState().doc.children[0]?.type).toBe('code_block');
		});

		it('toggleCodeBlock converts code_block back to paragraph', async () => {
			const state = makeState([{ type: 'code_block', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			h.executeCommand('toggleCodeBlock');
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('preserves text content when toggling', async () => {
			const state = makeState([{ type: 'paragraph', text: 'Hello World', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			h.executeCommand('toggleCodeBlock');
			expect(getBlockText(h.getState().doc.children[0])).toBe('Hello World');
		});

		it('insertCodeBlock does not re-convert existing code_block', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			h.dispatch.mockClear();
			h.executeCommand('insertCodeBlock');
			expect(h.dispatch).not.toHaveBeenCalled();
		});

		it('insertCodeBlock applies defaultLanguage from config', async () => {
			const state = makeState([{ type: 'paragraph', text: 'code', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin({ defaultLanguage: 'typescript' }), state);

			h.executeCommand('insertCodeBlock');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('code_block');
			expect(block?.attrs?.language).toBe('typescript');
		});
	});

	describe('keymap registration', () => {
		it('registers Enter keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Enter');
		});

		it('registers Tab keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Tab');
		});

		it('registers Shift-Tab keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Shift-Tab');
		});

		it('registers Escape keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Escape');
		});

		it('registers Mod-Shift-M keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Mod-Shift-M');
		});
	});

	describe('configurable keymap', () => {
		it('uses default keybindings when no keymap provided', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Mod-Enter');
			expectKeyBinding(h, 'Mod-Shift-M');
		});

		it('custom insertAfter key registers under the custom key', async () => {
			const h = await pluginHarness(
				new CodeBlockPlugin({ keymap: { insertAfter: 'Mod-Shift-Enter' } }),
			);
			expectKeyBinding(h, 'Mod-Shift-Enter');

			const keymaps = h.getKeymaps();
			const hasDefault: boolean = keymaps.some((km) => 'Mod-Enter' in km);
			expect(hasDefault).toBe(false);
		});

		it('custom toggle key registers under the custom key', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ keymap: { toggle: 'Mod-Shift-C' } }));
			expectKeyBinding(h, 'Mod-Shift-C');

			const keymaps = h.getKeymaps();
			const hasDefault: boolean = keymaps.some((km) => 'Mod-Shift-M' in km);
			expect(hasDefault).toBe(false);
		});

		it('null insertAfter disables the binding', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ keymap: { insertAfter: null } }));

			const keymaps = h.getKeymaps();
			const hasInsertAfter: boolean = keymaps.some((km) => 'Mod-Enter' in km);
			expect(hasInsertAfter).toBe(false);
		});

		it('null toggle disables the binding', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ keymap: { toggle: null } }));

			const keymaps = h.getKeymaps();
			const hasToggle: boolean = keymaps.some((km) => 'Mod-Shift-M' in km);
			expect(hasToggle).toBe(false);
		});

		it('Escape is always registered regardless of keymap config', async () => {
			const h = await pluginHarness(
				new CodeBlockPlugin({ keymap: { insertAfter: null, toggle: null } }),
			);
			expectKeyBinding(h, 'Escape');
		});

		it('custom insertAfter key dispatches insertParagraphAfter', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(
				new CodeBlockPlugin({ keymap: { insertAfter: 'Mod-Shift-Enter' } }),
				state,
			);

			const handler = h.getKeymaps().find((km) => km['Mod-Shift-Enter'])?.['Mod-Shift-Enter'];
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);
			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('custom toggle key updates toolbar tooltip', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ keymap: { toggle: 'Mod-Shift-C' } }));
			const item = h.getToolbarItem('code_block');
			assertDefined(item);
			expect(item.tooltip).toContain('Shift+C');
			expect(item.tooltip).not.toContain('Shift+M');
		});

		it('null toggle removes shortcut from toolbar tooltip', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ keymap: { toggle: null } }));
			const item = h.getToolbarItem('code_block');
			assertDefined(item);
			expect(item.tooltip).toBe('Code Block');
		});
	});

	describe('keyboard: Backspace', () => {
		it('Backspace at start of code block converts to paragraph', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.Backspace)?.Backspace;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);
			expect(h.getState().doc.children[0]?.type).toBe('paragraph');
		});

		it('Backspace preserves text content when converting', async () => {
			const state = makeState([{ type: 'code_block', text: 'hello world', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.Backspace)?.Backspace;
			assertDefined(handler);
			handler();

			expect(getBlockText(h.getState().doc.children[0])).toBe('hello world');
		});

		it('Backspace at non-zero offset returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.Backspace)?.Backspace;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});

		it('Backspace on non-code block returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.Backspace)?.Backspace;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});

		it('registers Backspace keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Backspace');
		});
	});

	describe('keyboard: Enter', () => {
		it('Enter inserts newline in code block', async () => {
			const state = makeState([{ type: 'code_block', text: 'line1', id: 'b1' }], 'b1', 5);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const keymaps = h.getKeymaps();
			const enterHandler = keymaps.find((km) => km.Enter)?.Enter;
			assertDefined(enterHandler);

			const handled: boolean = enterHandler();
			expect(handled).toBe(true);
			expect(getBlockText(h.getState().doc.children[0])).toBe('line1\n');
		});

		it('Enter in middle of text inserts newline at offset', async () => {
			const state = makeState([{ type: 'code_block', text: 'ab', id: 'b1' }], 'b1', 1);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const enterHandler = h.getKeymaps().find((km) => km.Enter)?.Enter;
			assertDefined(enterHandler);
			enterHandler();

			expect(getBlockText(h.getState().doc.children[0])).toBe('a\nb');
		});

		it('Enter does not handle non-code blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const enterHandler = h.getKeymaps().find((km) => km.Enter)?.Enter;
			assertDefined(enterHandler);

			const handled: boolean = enterHandler();
			expect(handled).toBe(false);
		});

		it('double-enter exits code block', async () => {
			const state = makeState([{ type: 'code_block', text: 'code\n', id: 'b1' }], 'b1', 5);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const enterHandler = h.getKeymaps().find((km) => km.Enter)?.Enter;
			assertDefined(enterHandler);

			const handled: boolean = enterHandler();
			expect(handled).toBe(true);

			// Should have created a new paragraph block
			const doc = h.getState().doc;
			expect(doc.children.length).toBe(2);
			expect(doc.children[1]?.type).toBe('paragraph');
		});
	});

	describe('keyboard: Tab', () => {
		it('Tab inserts tab character in code block', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const tabHandler = h.getKeymaps().find((km) => km.Tab)?.Tab;
			assertDefined(tabHandler);

			const handled: boolean = tabHandler();
			expect(handled).toBe(true);
			expect(getBlockText(h.getState().doc.children[0])).toBe('\tcode');
		});

		it('Tab inserts spaces when configured', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin({ useSpaces: true, spaceCount: 4 }), state);

			const tabHandler = h.getKeymaps().find((km) => km.Tab)?.Tab;
			assertDefined(tabHandler);
			tabHandler();

			expect(getBlockText(h.getState().doc.children[0])).toBe('    code');
		});

		it('Tab does not handle non-code blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const tabHandler = h.getKeymaps().find((km) => km.Tab)?.Tab;
			assertDefined(tabHandler);

			const handled: boolean = tabHandler();
			expect(handled).toBe(false);
		});
	});

	describe('keyboard: Shift-Tab', () => {
		it('Shift-Tab removes leading tab', async () => {
			const state = makeState([{ type: 'code_block', text: '\tcode', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km['Shift-Tab'])?.['Shift-Tab'];
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);
			expect(getBlockText(h.getState().doc.children[0])).toBe('code');
		});

		it('Shift-Tab does not handle non-code blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km['Shift-Tab'])?.['Shift-Tab'];
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});
	});

	describe('keymap registration: ArrowDown & ArrowUp', () => {
		it('registers ArrowDown keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'ArrowDown');
		});

		it('registers ArrowUp keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'ArrowUp');
		});
	});

	describe('keyboard: ArrowDown', () => {
		it('ArrowDown on last line moves to next block', async () => {
			const state = makeState(
				[
					{ type: 'code_block', text: 'line1\nline2', id: 'b1' },
					{ type: 'paragraph', text: 'next', id: 'b2' },
				],
				'b1',
				10,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowDown)?.ArrowDown;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b2');
				expect(sel.anchor.offset).toBe(0);
			}
		});

		it('ArrowDown on non-last line returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'line1\nline2', id: 'b1' }], 'b1', 3);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowDown)?.ArrowDown;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});

		it('ArrowDown creates paragraph when code block is last', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowDown)?.ArrowDown;
			assertDefined(handler);
			handler();

			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('ArrowDown on single-line code block exits', async () => {
			const state = makeState(
				[
					{ type: 'code_block', text: 'hello', id: 'b1' },
					{ type: 'paragraph', text: '', id: 'b2' },
				],
				'b1',
				2,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowDown)?.ArrowDown;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b2');
			}
		});

		it('ArrowDown on non-code block returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowDown)?.ArrowDown;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});
	});

	describe('keyboard: ArrowUp', () => {
		it('ArrowUp on first line moves to previous block', async () => {
			const state = makeState(
				[
					{ type: 'paragraph', text: 'prev', id: 'b1' },
					{ type: 'code_block', text: 'line1\nline2', id: 'b2' },
				],
				'b2',
				3,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowUp)?.ArrowUp;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b1');
				expect(sel.anchor.offset).toBe(4);
			}
		});

		it('ArrowUp on non-first line returns false', async () => {
			const state = makeState(
				[
					{ type: 'paragraph', text: 'prev', id: 'b1' },
					{ type: 'code_block', text: 'line1\nline2', id: 'b2' },
				],
				'b2',
				8,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowUp)?.ArrowUp;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});

		it('ArrowUp at first block returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowUp)?.ArrowUp;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});

		it('ArrowUp on single-line code block exits', async () => {
			const state = makeState(
				[
					{ type: 'paragraph', text: 'prev', id: 'b1' },
					{ type: 'code_block', text: 'hello', id: 'b2' },
				],
				'b2',
				3,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowUp)?.ArrowUp;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b1');
			}
		});

		it('ArrowUp on non-code block returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowUp)?.ArrowUp;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(false);
		});
	});

	describe('keyboard: Escape', () => {
		it('Escape moves to next block', async () => {
			const state = makeState(
				[
					{ type: 'code_block', text: 'code', id: 'b1' },
					{ type: 'paragraph', text: 'next', id: 'b2' },
				],
				'b1',
				0,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const escHandler = h.getKeymaps().find((km) => km.Escape)?.Escape;
			assertDefined(escHandler);

			const handled: boolean = escHandler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b2');
			}
		});

		it('Escape creates paragraph when code block is last', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const escHandler = h.getKeymaps().find((km) => km.Escape)?.Escape;
			assertDefined(escHandler);
			escHandler();

			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('Escape does not handle non-code blocks', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const escHandler = h.getKeymaps().find((km) => km.Escape)?.Escape;
			assertDefined(escHandler);

			const handled: boolean = escHandler();
			expect(handled).toBe(false);
		});
	});

	describe('input rules', () => {
		it('registers one input rule', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expect(h.getInputRules().length).toBe(1);
		});

		it('input rule pattern matches "``` "', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const rule = h.getInputRules()[0];
			assertDefined(rule);
			expect(rule.pattern.test('``` ')).toBe(true);
		});

		it('input rule pattern matches "```typescript "', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const rule = h.getInputRules()[0];
			assertDefined(rule);
			expect(rule.pattern.test('```typescript ')).toBe(true);
		});

		it('input rule handler converts paragraph to code_block', async () => {
			const state = makeState([{ type: 'paragraph', text: '``` ', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const rule = h.getInputRules()[0];
			assertDefined(rule);

			const match = '``` '.match(rule.pattern);
			assertDefined(match);
			const tr = rule.handler(state, match, 0, 4);

			expect(tr).not.toBeNull();
			assertDefined(tr);
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('code_block');
		});

		it('input rule extracts language', async () => {
			const state = makeState([{ type: 'paragraph', text: '```ts ', id: 'b1' }], 'b1', 6);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const rule = h.getInputRules()[0];
			assertDefined(rule);

			const match = '```ts '.match(rule.pattern);
			assertDefined(match);
			const tr = rule.handler(state, match, 0, 6);

			assertDefined(tr);
			const newState = state.apply(tr);
			expect(newState.doc.children[0]?.type).toBe('code_block');
			expect(newState.doc.children[0]?.attrs?.language).toBe('ts');
		});

		it('input rule only applies on paragraph blocks', async () => {
			const state = makeState([{ type: 'code_block', text: '``` ', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const rule = h.getInputRules()[0];
			assertDefined(rule);

			const match = '``` '.match(rule.pattern);
			assertDefined(match);
			const tr = rule.handler(state, match, 0, 4);
			expect(tr).toBeNull();
		});
	});

	describe('toolbar item', () => {
		it('registers a code_block toolbar item', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectToolbarItem(h, 'code_block', {
				group: 'block',
				label: 'Code Block',
				command: 'toggleCodeBlock',
			});
		});

		it('isActive returns true when cursor is in code_block', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			expectToolbarActive(h, 'code_block', true);
		});

		it('isActive returns false when cursor is in paragraph', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			expectToolbarActive(h, 'code_block', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new CodeBlockPlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'code_block', { separatorAfter: true });
		});
	});

	describe('middleware (mark prevention)', () => {
		it('filters out addMark steps for code_block', async () => {
			const state = makeState([{ type: 'code_block', text: 'hello', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state, {
				useMiddleware: true,
			});

			// Build a transaction that tries to add a bold mark
			const tr = state
				.transaction('command')
				.addMark('b1' as import('../../model/TypeBrands.js').BlockId, 0, 5, {
					type: 'bold' as import('../../model/TypeBrands.js').MarkTypeName,
				})
				.setSelection(state.selection)
				.build();

			h.dispatch(tr);

			// The mark should have been filtered out by middleware
			const block = h.getState().doc.children[0];
			assertDefined(block);
			const text = block.children[0];
			if (text && 'marks' in text) {
				expect(text.marks.length).toBe(0);
			}
		});
	});

	describe('service', () => {
		it('registers CodeBlockService', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			expect(service).toBeDefined();
		});

		it('isCodeBlock returns true for code blocks', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			assertDefined(service);
			expect(service.isCodeBlock('b1' as import('../../model/TypeBrands.js').BlockId)).toBe(true);
		});

		it('isCodeBlock returns false for paragraphs', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }]);
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			assertDefined(service);
			expect(service.isCodeBlock('b1' as import('../../model/TypeBrands.js').BlockId)).toBe(false);
		});

		it('getLanguage returns language attr', async () => {
			const state = stateBuilder()
				.block('code_block', 'code', 'b1', { attrs: { language: 'python' } })
				.cursor('b1', 0)
				.schema(['paragraph', 'code_block'], ['bold'])
				.build();
			const h = await pluginHarness(new CodeBlockPlugin(), state);
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			assertDefined(service);
			expect(service.getLanguage('b1' as import('../../model/TypeBrands.js').BlockId)).toBe(
				'python',
			);
		});

		it('getSupportedLanguages returns empty when no highlighter', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			assertDefined(service);
			expect(service.getSupportedLanguages()).toEqual([]);
		});

		it('getSupportedLanguages delegates to highlighter', async () => {
			const mockHighlighter = {
				tokenize: () => [],
				getSupportedLanguages: () => ['typescript', 'python'] as const,
			};
			const h = await pluginHarness(new CodeBlockPlugin({ highlighter: mockHighlighter }));
			const service = h.pm.getService(CODE_BLOCK_SERVICE_KEY);
			assertDefined(service);
			expect(service.getSupportedLanguages()).toEqual(['typescript', 'python']);
		});
	});

	describe('decorations', () => {
		it('returns empty when no highlighter configured', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }]);
			const plugin = new CodeBlockPlugin();
			await pluginHarness(plugin, state);

			const decos = plugin.decorations(state);
			expect(decos.isEmpty).toBe(true);
		});

		it('returns decorations from highlighter', async () => {
			const state = stateBuilder()
				.block('code_block', 'const x = 1', 'b1', {
					attrs: { language: 'typescript' },
				})
				.cursor('b1', 0)
				.schema(['paragraph', 'code_block'], ['bold'])
				.build();

			const mockHighlighter = {
				tokenize: () => [
					{ from: 0, to: 5, type: 'keyword' },
					{ from: 10, to: 11, type: 'number' },
				],
				getSupportedLanguages: () => ['typescript'] as const,
			};

			const plugin = new CodeBlockPlugin({ highlighter: mockHighlighter });
			await pluginHarness(plugin, state);

			const decos = plugin.decorations(state);
			expect(decos.isEmpty).toBe(false);
		});
	});

	describe('keymap registration: ArrowRight, ArrowLeft, Mod-Enter', () => {
		it('registers ArrowRight keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'ArrowRight');
		});

		it('registers ArrowLeft keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'ArrowLeft');
		});

		it('registers Mod-Enter keymap', async () => {
			const h = await pluginHarness(new CodeBlockPlugin());
			expectKeyBinding(h, 'Mod-Enter');
		});
	});

	describe('keyboard: ArrowRight', () => {
		it('at end of text exits to next block', async () => {
			const state = makeState(
				[
					{ type: 'code_block', text: 'code', id: 'b1' },
					{ type: 'paragraph', text: 'next', id: 'b2' },
				],
				'b1',
				4,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowRight)?.ArrowRight;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b2');
				expect(sel.anchor.offset).toBe(0);
			}
		});

		it('at end of text (last block) creates paragraph', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowRight)?.ArrowRight;
			assertDefined(handler);
			handler();

			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('not at end returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowRight)?.ArrowRight;
			assertDefined(handler);

			expect(handler()).toBe(false);
		});

		it('on non-code block returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 4);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowRight)?.ArrowRight;
			assertDefined(handler);

			expect(handler()).toBe(false);
		});
	});

	describe('keyboard: ArrowLeft', () => {
		it('at offset 0 exits to previous block', async () => {
			const state = makeState(
				[
					{ type: 'paragraph', text: 'prev', id: 'b1' },
					{ type: 'code_block', text: 'code', id: 'b2' },
				],
				'b2',
				0,
			);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowLeft)?.ArrowLeft;
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			const sel = h.getState().selection;
			if ('anchor' in sel) {
				expect(sel.anchor.blockId).toBe('b1');
				expect(sel.anchor.offset).toBe(4);
			}
		});

		it('at offset 0 (first block) returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowLeft)?.ArrowLeft;
			assertDefined(handler);

			expect(handler()).toBe(false);
		});

		it('not at offset 0 returns false', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowLeft)?.ArrowLeft;
			assertDefined(handler);

			expect(handler()).toBe(false);
		});

		it('on non-code block returns false', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km.ArrowLeft)?.ArrowLeft;
			assertDefined(handler);

			expect(handler()).toBe(false);
		});
	});

	describe('keyboard: Mod-Enter', () => {
		it('creates paragraph after code block and moves cursor', async () => {
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 2);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km['Mod-Enter'])?.['Mod-Enter'];
			assertDefined(handler);

			const handled: boolean = handler();
			expect(handled).toBe(true);

			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[0]?.type).toBe('code_block');
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('works even if not at end of text', async () => {
			const state = makeState([{ type: 'code_block', text: 'hello world', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km['Mod-Enter'])?.['Mod-Enter'];
			assertDefined(handler);
			handler();

			expect(h.getState().doc.children.length).toBe(2);
			expect(h.getState().doc.children[1]?.type).toBe('paragraph');
		});

		it('returns false on non-code block', async () => {
			const state = makeState([{ type: 'paragraph', text: 'text', id: 'b1' }], 'b1', 0);
			const h = await pluginHarness(new CodeBlockPlugin(), state);

			const handler = h.getKeymaps().find((km) => km['Mod-Enter'])?.['Mod-Enter'];
			assertDefined(handler);

			expect(handler()).toBe(false);
		});
	});

	describe('onStateChange: focus tracking and announcements', () => {
		it('runs without error when entering code block', async () => {
			const oldState = makeState(
				[
					{ type: 'paragraph', text: 'text', id: 'b1' },
					{ type: 'code_block', text: 'code', id: 'b2' },
				],
				'b1',
				0,
			);
			const newState = makeState(
				[
					{ type: 'paragraph', text: 'text', id: 'b1' },
					{ type: 'code_block', text: 'code', id: 'b2' },
				],
				'b2',
				0,
			);

			const plugin = new CodeBlockPlugin();
			await pluginHarness(plugin, oldState);

			const tr = oldState.transaction('command').setSelection(newState.selection).build();
			plugin.onStateChange(oldState, newState, tr);
		});

		it('runs without error when leaving code block', async () => {
			const oldState = makeState(
				[
					{ type: 'code_block', text: 'code', id: 'b1' },
					{ type: 'paragraph', text: 'text', id: 'b2' },
				],
				'b1',
				0,
			);
			const newState = makeState(
				[
					{ type: 'code_block', text: 'code', id: 'b1' },
					{ type: 'paragraph', text: 'text', id: 'b2' },
				],
				'b2',
				0,
			);

			const plugin = new CodeBlockPlugin();
			await pluginHarness(plugin, oldState);

			const tr = oldState.transaction('command').setSelection(newState.selection).build();
			plugin.onStateChange(oldState, newState, tr);
		});

		it('does not throw when context is null', () => {
			const plugin = new CodeBlockPlugin();
			const state = makeState([{ type: 'code_block', text: 'code', id: 'b1' }], 'b1', 0);
			const tr = state.transaction('command').setSelection(state.selection).build();

			// Plugin not initialized, context is null — should return early
			plugin.onStateChange(state, state, tr);
		});
	});
});
