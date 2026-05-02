import { describe, expect, it } from 'vitest';
import { createBlockNode, createTextNode } from '../../model/Document.js';
import { type BlockId, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { makeBlockState, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { HeadingPlugin } from '../heading/HeadingPlugin.js';
import { TextDirectionPlugin } from '../text-direction/TextDirectionPlugin.js';
import { TextDirectionAutoPlugin } from './TextDirectionAutoPlugin.js';

const HARNESS_OPTIONS = { useMiddleware: true, builtinSpecs: true } as const;

function plugins(
	extra?: HeadingPlugin[],
): readonly (HeadingPlugin | TextDirectionPlugin | TextDirectionAutoPlugin)[] {
	return [new TextDirectionPlugin(), new TextDirectionAutoPlugin(), ...(extra ?? [])];
}

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
	return makeBlockState(blocks, { cursorBlockId, cursorOffset });
}

describe('TextDirectionAutoPlugin', () => {
	describe('dependency contract', () => {
		it('throws when registered without TextDirectionPlugin', async () => {
			await expect(
				pluginHarness(new TextDirectionAutoPlugin(), undefined, HARNESS_OPTIONS),
			).rejects.toThrow(/text-direction/);
		});
	});

	describe('preserve direction on block type change', () => {
		it('preserves dir when changing paragraph to heading', async () => {
			const state: EditorState = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'rtl' },
				},
			]);
			const h = await pluginHarness([...plugins([new HeadingPlugin()])], state, HARNESS_OPTIONS);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.dir).toBe('rtl');
		});

		it('preserves dir when changing heading to paragraph', async () => {
			const state: EditorState = makeState([
				{
					type: 'heading',
					text: 'Title',
					id: 'b1',
					attrs: { level: 1, dir: 'ltr' },
				},
			]);
			const h = await pluginHarness([...plugins([new HeadingPlugin()])], state, HARNESS_OPTIONS);

			h.executeCommand('setParagraph');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(block?.attrs?.dir).toBe('ltr');
		});

		it('does not interfere when block has auto direction', async () => {
			const state: EditorState = makeState([
				{
					type: 'paragraph',
					text: 'Hello',
					id: 'b1',
					attrs: { dir: 'auto' },
				},
			]);
			const h = await pluginHarness([...plugins([new HeadingPlugin()])], state, HARNESS_OPTIONS);

			h.executeCommand('setHeading2');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(2);
		});

		it('does not interfere when block has no dir attr', async () => {
			const state: EditorState = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
			const h = await pluginHarness([...plugins([new HeadingPlugin()])], state, HARNESS_OPTIONS);

			h.executeCommand('setHeading1');
			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(1);
		});
	});

	describe('auto-detection on insertText', () => {
		it('sets dir to rtl when Arabic text is typed in auto block', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('sets dir to ltr when Latin text is typed in auto block', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('does not change dir for non-empty blocks with explicit direction', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('re-detects LTR when Latin text is typed in empty RTL block', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('keeps RTL when Arabic text is typed in empty RTL block', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not re-detect non-empty block with explicit direction', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' Hello')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not change dir for neutral characters', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, '123')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	describe('auto-detection on deleteText', () => {
		it('resets dir to auto when all text is deleted', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'مرحبا', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('re-detects dir when RTL prefix is deleted and LTR remains', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'مرحبا Hello', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 6, 'مرحبا ', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('does not update dir when direction stays the same after delete', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'مرحبا عالم', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 5, 10, ' عالم', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('does not affect block already set to auto', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '123', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 3, '123', [])
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	describe('direction inheritance on insertNode', () => {
		it('inherits dir from preceding sibling on insertNode', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 8)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('does not inherit when sibling has auto direction', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'Text', 'b1', { attrs: { dir: 'auto' } })
				.cursor('b1', 4)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			const dir = doc.children[1]?.attrs?.dir;
			expect(dir === undefined || dir === 'auto').toBe(true);
		});

		it('detects RTL from pasted Arabic text in insertNode', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'Hello', 'b1', { attrs: { dir: 'ltr' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

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
			const state: EditorState = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

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
			const state: EditorState = stateBuilder()
				.block('paragraph', 'مرحبا', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 5)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId);
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			expect(h.getState().doc.children[1]?.attrs?.dir).toBe('rtl');
		});

		it('does not override explicit direction on new block', async () => {
			const state: EditorState = stateBuilder()
				.block('paragraph', 'RTL text', 'b1', { attrs: { dir: 'rtl' } })
				.cursor('b1', 8)
				.schema(['paragraph', 'heading'], ['bold', 'italic', 'underline'])
				.build();
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const newBlock = createBlockNode('paragraph', [createTextNode('')], 'b2' as BlockId, {
				dir: 'ltr',
			});
			const tr = h.getState().transaction('command').insertNode([], 1, newBlock).build();
			h.dispatch(tr);

			const doc = h.getState().doc;
			expect(doc.children[1]?.attrs?.dir).toBe('ltr');
		});
	});

	describe('full auto-detection lifecycle', () => {
		it('auto → rtl → delete all → auto', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr1 = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr1);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			const tr2 = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr2);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	describe('manual override after auto-detection', () => {
		it('manual setDirectionLTR overrides auto-detected RTL', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('auto-detection does not override manually set direction on non-empty block', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'ltr' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 5, ' مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');
		});

		it('full lifecycle: auto → rtl → manual ltr → delete all → auto', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr1 = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr1);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			h.executeCommand('setDirectionLTR');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');

			const tr2 = h
				.getState()
				.transaction('input')
				.deleteText('b1' as BlockId, 0, 5, 'مرحبا', [])
				.build();
			h.dispatch(tr2);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});

		it('toggleDirection after auto-detection cycles correctly', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('ltr');

			h.executeCommand('toggleDirection');
			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('auto');
		});
	});

	// Regression coverage for #113: when a single transaction both modifies
	// text AND changes block attrs (via setBlockType or setNodeAttr), the
	// auto-detect middleware must not append its own setNodeAttr — its
	// pre-transaction snapshot would clobber the freshly written attrs
	// because applySetNodeAttr has full-replace semantics.
	describe('transaction-level conflict handling', () => {
		it('preserves attrs of new block type when deleteText + setBlockType are combined (#113 reproducer)', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '```java ', id: 'b1', attrs: { dir: 'ltr' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.deleteTextAt('b1' as BlockId, 0, 8)
				.setBlockType('b1' as BlockId, nodeType('code_block'), {
					language: 'java',
					backgroundColor: '',
				})
				.build();
			h.dispatch(tr);

			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('code_block');
			expect(block?.attrs?.language).toBe('java');
			expect(block?.attrs?.backgroundColor).toBe('');
		});

		it('preserves new attrs when insertText + setBlockType to non-directable type are combined', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'hello')
				.setBlockType('b1' as BlockId, nodeType('code_block'), { language: 'python' })
				.build();
			h.dispatch(tr);

			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('code_block');
			expect(block?.attrs?.language).toBe('python');
		});

		it('does not clobber a sibling setNodeAttr that targets the same block in the same transaction', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('command')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.setNodeAttr(['b1' as BlockId], { dir: 'ltr', someExternalAttr: 'keep-me' })
				.build();
			h.dispatch(tr);

			const block = h.getState().doc.children[0];
			expect(block?.attrs?.dir).toBe('ltr');
			expect(block?.attrs?.someExternalAttr).toBe('keep-me');
		});

		it('still auto-detects when there is no conflicting attr step in the transaction', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: '', id: 'b1', attrs: { dir: 'auto' } },
			]);
			const h = await pluginHarness([...plugins()], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('input')
				.insertText('b1' as BlockId, 0, 'مرحبا')
				.build();
			h.dispatch(tr);

			expect(h.getState().doc.children[0]?.attrs?.dir).toBe('rtl');
		});

		it('lets preserve-dir handle block-type changes to directable types (paragraph → heading)', async () => {
			const state: EditorState = makeState([
				{ type: 'paragraph', text: 'Hello', id: 'b1', attrs: { dir: 'rtl' } },
			]);
			const h = await pluginHarness([...plugins([new HeadingPlugin()])], state, HARNESS_OPTIONS);

			const tr = h
				.getState()
				.transaction('command')
				.deleteTextAt('b1' as BlockId, 0, 5)
				.setBlockType('b1' as BlockId, nodeType('heading'), { level: 1 })
				.build();
			h.dispatch(tr);

			const block = h.getState().doc.children[0];
			expect(block?.type).toBe('heading');
			expect(block?.attrs?.level).toBe(1);
			expect(block?.attrs?.dir).toBe('rtl');
		});
	});
});
