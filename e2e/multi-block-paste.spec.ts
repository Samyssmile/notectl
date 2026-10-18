import { type EditorPage, expect, test } from './fixtures/editor-page';

interface Block {
	readonly id?: string;
	readonly type: string;
	readonly text?: string;
	readonly marks?: readonly { readonly type: string }[];
	readonly attrs?: Readonly<Record<string, string | number | boolean>>;
	readonly children?: readonly Block[];
}

interface Snapshot {
	readonly doc: { readonly children: readonly Block[] };
	readonly selection: {
		readonly anchor: { readonly blockId: string; readonly offset: number };
		readonly head: { readonly blockId: string; readonly offset: number };
	};
}

const listAttrs = { listType: 'checklist', indent: 1, checked: true };
const placements = ['after-table', 'cell', 'quote', 'list', 'composite-list', 'deep'] as const;

function paragraph(id: string, text = id): Block {
	return { id, type: 'paragraph', children: [{ type: 'text', text, marks: [] }] };
}

function table(children: readonly Block[]): Block {
	return {
		id: 'table',
		type: 'table',
		children: [
			{
				id: 'row',
				type: 'table_row',
				children: [
					{ id: 'cell', type: 'table_cell', children },
					{ id: 'other-cell', type: 'table_cell', children: [paragraph('other')] },
				],
			},
		],
	};
}

function fixture(placement: (typeof placements)[number]): readonly Block[] {
	const target: Block = {
		...paragraph('target', 'abcd'),
		...(placement === 'list' ? { type: 'list_item', attrs: listAttrs } : {}),
	};
	const siblings = [paragraph('before'), target, paragraph('after')];
	switch (placement) {
		case 'after-table':
			return [table([paragraph('first')]), ...siblings];
		case 'cell':
			return [table(siblings)];
		case 'quote':
			return [{ id: 'quote', type: 'blockquote', children: siblings }];
		case 'composite-list':
			return [{ id: 'item', type: 'list_item', attrs: listAttrs, children: siblings }];
		case 'deep':
			return [
				table([
					{
						id: 'quote',
						type: 'blockquote',
						children: [{ id: 'item', type: 'list_item', attrs: listAttrs, children: siblings }],
					},
				]),
			];
		default:
			return siblings;
	}
}

async function snapshot(editor: EditorPage): Promise<Snapshot> {
	return editor.page.evaluate(() => {
		const el = document.querySelector('notectl-editor') as HTMLElement & { getState(): Snapshot };
		const state = el.getState();
		const { anchor, head } = state.selection;
		// DOM synchronization may add optional cached paths. Compare the logical
		// selection, including its direction, independently of that cache.
		return {
			doc: state.doc,
			selection: {
				anchor: { blockId: anchor.blockId, offset: anchor.offset },
				head: { blockId: head.blockId, offset: head.offset },
			},
		};
	});
}

function siblingsOf(children: readonly Block[], id: string): readonly Block[] | undefined {
	if (children.some((node) => node.id === id)) return children;
	for (const node of children) {
		const found = siblingsOf(node.children ?? [], id);
		if (found) return found;
	}
	return undefined;
}

function allIds(children: readonly Block[]): string[] {
	return children.flatMap((node) => [
		...(node.id ? [node.id] : []),
		...allIds(node.children ?? []),
	]);
}

function textOf(node: Block): string {
	return node.text ?? (node.children ?? []).map(textOf).join('');
}

async function replay(editor: EditorPage, before: Snapshot, after: Snapshot): Promise<void> {
	for (let cycle = 0; cycle < 3; cycle++) {
		await editor.page.keyboard.press('Control+z');
		await expect.poll(() => snapshot(editor)).toEqual(before);
		await editor.page.keyboard.press('Control+Shift+z');
		await expect.poll(() => snapshot(editor)).toEqual(after);
		const ids = allIds((await snapshot(editor)).doc.children);
		expect(new Set(ids).size).toBe(ids.length);
	}
}

async function placeCaret(editor: EditorPage, range: boolean): Promise<void> {
	const target = editor.content.locator('[data-block-id="target"]');
	await target.click();
	await target.evaluate((block, isRange) => {
		const text = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
		if (!text) throw new Error('Missing target text');
		window.getSelection()?.setBaseAndExtent(text, 2, text, isRange ? 3 : 2);
		document.dispatchEvent(new Event('selectionchange'));
	}, range);
	await expect
		.poll(async () => (await snapshot(editor)).selection)
		.toMatchObject({
			anchor: { blockId: 'target', offset: 2 },
			head: { blockId: 'target', offset: range ? 3 : 2 },
		});
}

async function paste(editor: EditorPage, flavor: string, types: readonly string[]): Promise<void> {
	const texts = ['one', 'two', 'three', 'four'];
	if (flavor === 'text') return editor.pasteText(texts.join('\n'));
	if (flavor === 'html')
		return editor.pasteHTML(
			types
				.map((type, index) => {
					return type === 'list_item'
						? `<ul><li>${texts[index]}</li></ul>`
						: `<p>${texts[index]}</p>`;
				})
				.join(''),
		);
	const blocks = types.map((type, index) => ({ type, text: texts[index] }));
	const encoded = JSON.stringify(blocks).replace(/"/g, '&quot;');
	await editor.pasteClipboardData({
		'text/plain': texts.join('\n'),
		'text/html': `<div data-notectl-rich="${encoded}">${texts.join('<br>')}</div>`,
	});
}

async function selectAcrossBlocks(
	editor: EditorPage,
	anchorId: string,
	headId: string,
): Promise<void> {
	await editor.content.locator(`[data-block-id="${anchorId}"]`).click();
	await editor.content.evaluate(
		(root, ids) => {
			const textIn = (id: string): Node => {
				const block = root.querySelector(`[data-block-id="${id}"]`);
				const content = block?.querySelector('.notectl-code-block__content') ?? block;
				const text = content
					? document.createTreeWalker(content, NodeFilter.SHOW_TEXT).nextNode()
					: null;
				if (!text) throw new Error(`Missing text in ${id}`);
				return text;
			};
			window.getSelection()?.setBaseAndExtent(textIn(ids[0]), 1, textIn(ids[1]), 1);
			document.dispatchEvent(new Event('selectionchange'));
		},
		[anchorId, headId] as const,
	);
	await expect
		.poll(async () => (await snapshot(editor)).selection)
		.toEqual({ anchor: { blockId: anchorId, offset: 1 }, head: { blockId: headId, offset: 1 } });
}

/** The document alone: a pasted node leaves a node selection, which has no text anchor. */
async function docOf(editor: EditorPage): Promise<Snapshot['doc']> {
	return (await editor.getJSON()) as Snapshot['doc'];
}

/** Like {@link replay}, for pastes that leave a node selection. */
async function replayDocument(
	editor: EditorPage,
	before: Snapshot['doc'],
	after: Snapshot['doc'],
): Promise<void> {
	for (let cycle = 0; cycle < 3; cycle++) {
		await editor.page.keyboard.press('Control+z');
		await expect.poll(() => docOf(editor)).toEqual(before);
		await editor.page.keyboard.press('Control+Shift+z');
		await expect.poll(() => docOf(editor)).toEqual(after);
	}
}

const TABLE_HTML =
	'<table><tbody><tr><td>X1</td><td>X2</td></tr><tr><td>Y1</td><td>Y2</td></tr></tbody></table>';

test.describe('multi-block paste and history (#267)', () => {
	for (const placement of placements) {
		for (const flavor of ['text', 'html', 'internal']) {
			for (const range of [false, true]) {
				test(`${flavor} in ${placement} replaces ${range ? 'range' : 'caret'} as one undo step`, async ({
					editor,
				}) => {
					await editor.setJSON({ children: [...fixture(placement), paragraph('outside')] });
					await placeCaret(editor, range);
					const before = await snapshot(editor);
					await paste(editor, flavor, Array(4).fill('paragraph'));
					const after = await snapshot(editor);
					const siblings = siblingsOf(after.doc.children, 'target') ?? [];
					const index = siblings.findIndex((node) => node.id === 'target');
					const inserted = siblings.slice(index, index + 4);
					expect(inserted.map(textOf)).toEqual([
						'abone',
						'two',
						'three',
						range ? 'fourd' : 'fourcd',
					]);
					expect(siblings[index - 1]?.id).toBe('before');
					expect(siblings[index + 4]?.id).toBe('after');
					if (placement === 'list') {
						expect(inserted.map((node) => node.type)).toEqual(Array(4).fill('list_item'));
						for (const node of inserted) expect(node.attrs).toMatchObject(listAttrs);
					}
					await replay(editor, before, after);
				});
			}
		}
	}

	for (const flavor of ['html', 'internal']) {
		for (const forbidden of [0, 1, 3]) {
			test(`${flavor} escapes forbidden block ${forbidden} after the outer table`, async ({
				editor,
			}) => {
				const forbiddenType = flavor === 'html' ? 'list_item' : 'title';
				await editor.setJSON({ children: [...fixture('deep'), paragraph('outside')] });
				await placeCaret(editor, false);
				const before = await snapshot(editor);
				await paste(
					editor,
					flavor,
					['paragraph', 'paragraph', 'paragraph', 'paragraph'].map((type, index) =>
						index === forbidden ? forbiddenType : type,
					),
				);
				const after = await snapshot(editor);
				expect(after.doc.children[0]).toEqual(before.doc.children[0]);
				expect(after.doc.children.slice(1, 5).map(textOf)).toEqual(['one', 'two', 'three', 'four']);
				expect(after.doc.children[forbidden + 1]?.type).toBe(forbiddenType);
				await replay(editor, before, after);
			});
		}
	}
});

test.describe('structural paste over a backward range (#267)', () => {
	for (const count of [3, 5]) {
		test(`table lands after the merged block of ${count} paragraphs as one undo step`, async ({
			editor,
		}) => {
			const texts = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'].slice(0, count);
			await editor.setJSON({ children: texts.map((text, i) => paragraph(`p${i + 1}`, text)) });
			await selectAcrossBlocks(editor, 'p3', 'p1');
			const before = await snapshot(editor);
			await editor.pasteHTML(TABLE_HTML);
			await expect
				.poll(async () =>
					(await snapshot(editor)).doc.children.map((node) =>
						node.type === 'table' ? 'table' : textOf(node),
					),
				)
				.toEqual(['accc', 'table', ...texts.slice(3)]);
			await replay(editor, before, await snapshot(editor));
		});
	}
});

test.describe('smart paste across code block boundaries (#267)', () => {
	const input = '{"name":"John","age":30,"active":true}';
	for (const startsInCode of [false, true]) {
		for (const backward of [false, true]) {
			test(`${backward ? 'backward' : 'forward'} range starting in ${startsInCode ? 'code' : 'paragraph'} uses the receiving block and preserves history`, async ({
				editor,
			}) => {
				await editor.setJSON({
					children: [
						{ ...paragraph('first', 'abcd'), type: startsInCode ? 'code_block' : 'paragraph' },
						{ ...paragraph('second', 'efgh'), type: startsInCode ? 'paragraph' : 'code_block' },
					],
				});
				await selectAcrossBlocks(
					editor,
					backward ? 'second' : 'first',
					backward ? 'first' : 'second',
				);
				const before = await snapshot(editor);
				await editor.pasteText(input);
				const after = await snapshot(editor);
				expect(after.doc.children.map((node) => `${node.type}:${textOf(node)}`)).toEqual(
					startsInCode
						? [`code_block:a${input}fgh`]
						: ['paragraph:afgh', `code_block:${JSON.stringify(JSON.parse(input), null, 2)}`],
				);
				await replay(editor, before, after);
			});
		}
	}
});

test.describe('multi-block paste across table selections (#267)', () => {
	for (const flavor of ['text', 'html', 'internal']) {
		for (const acrossCells of [false, true]) {
			for (const backward of [false, true]) {
				test(`${flavor} replaces a ${backward ? 'backward' : 'forward'} range across ${acrossCells ? 'cells' : 'cell paragraphs'} as one undo step`, async ({
					editor,
				}) => {
					await editor.setJSON({ children: [...fixture('cell'), paragraph('outside')] });
					const endId = acrossCells ? 'other' : 'after';
					await selectAcrossBlocks(
						editor,
						backward ? endId : 'target',
						backward ? 'target' : endId,
					);
					const before = await snapshot(editor);
					await paste(editor, flavor, Array(4).fill('paragraph'));
					const after = await snapshot(editor);
					expect(siblingsOf(after.doc.children, 'target')?.map(textOf)).toEqual([
						'before',
						'aone',
						'two',
						'three',
						acrossCells ? 'four' : 'fourfter',
					]);
					expect(siblingsOf(after.doc.children, 'other')?.map(textOf)).toEqual([
						acrossCells ? 'ther' : 'other',
					]);
					expect(after.doc.children.at(-1)).toEqual(before.doc.children.at(-1));
					await replay(editor, before, after);
				});
			}
		}
	}
});

test.describe('copied block node paste (#267)', () => {
	const imageNode: string = JSON.stringify({
		type: 'image',
		attrs: { src: 'https://example.com/photo.png', alt: 'Photo' },
	});

	async function rootTypes(editor: EditorPage): Promise<string[]> {
		return (await docOf(editor)).children.map((node) => `${node.type}:${textOf(node)}`);
	}

	for (const range of [false, true]) {
		test(`an image a quote forbids lands after it and replaces a ${range ? 'range' : 'caret'} as one undo step`, async ({
			editor,
		}) => {
			await editor.setJSON({ children: [...fixture('quote'), paragraph('outside')] });
			await placeCaret(editor, range);
			const before = await docOf(editor);
			await editor.pasteClipboardData({ 'application/x-notectl-block': imageNode });
			await expect
				.poll(async () => (await docOf(editor)).children.map((node) => node.type))
				.toEqual(['blockquote', 'image', 'paragraph']);
			const after = await docOf(editor);
			expect(siblingsOf(after.children, 'target')?.map(textOf)).toEqual([
				'before',
				range ? 'abd' : 'abcd',
				'after',
			]);
			await replayDocument(editor, before, after);
		});
	}

	test('an image that replaces the only empty paragraph still lets the caret type after it', async ({
		editor,
	}) => {
		await editor.setJSON({ children: [paragraph('empty', '')] });
		await editor.content.locator('[data-block-id="empty"]').click();
		await editor.pasteClipboardData({ 'application/x-notectl-block': imageNode });
		await expect.poll(() => rootTypes(editor)).toEqual(['image:']);
		await editor.page.keyboard.press('ArrowRight');
		await editor.page.keyboard.type('X');
		await expect.poll(() => rootTypes(editor)).toEqual(['image:', 'paragraph:X']);
	});
});

test.describe('image file and MathML paste over a backward range', () => {
	/**
	 * Bytes that never decode: a loaded image records its natural size as a
	 * separate history step, which would hide whether the paste is one step.
	 */
	async function pasteImageFile(editor: EditorPage): Promise<void> {
		await editor.content.evaluate((content) => {
			const data = new DataTransfer();
			data.items.add(new File(['not an image'], 'pasted.png', { type: 'image/png' }));
			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: data });
			content.dispatchEvent(event);
		});
	}

	const pastes = [
		{ name: 'an image file', type: 'image', paste: pasteImageFile },
		{
			name: 'a display formula',
			type: 'math_display',
			// Math sources put plain text next to the MathML; paste interceptors need it.
			paste: (editor: EditorPage) =>
				editor.pasteClipboardData({
					'text/html': '<math display="block"><mi>x</mi></math>',
					'text/plain': 'x',
				}),
		},
	] as const;

	for (const { name, type, paste } of pastes) {
		test(`${name} replaces the range after its start block as one undo step`, async ({
			editor,
		}) => {
			const texts = ['aaaa', 'bbbb', 'cccc'];
			await editor.setJSON({ children: texts.map((text, i) => paragraph(`p${i + 1}`, text)) });
			await selectAcrossBlocks(editor, 'p3', 'p1');
			const before = await docOf(editor);
			await paste(editor);
			await expect
				.poll(async () =>
					(await docOf(editor)).children.map((node) => (node.type === type ? type : textOf(node))),
				)
				.toEqual(['accc', type, '']);
			await replayDocument(editor, before, await docOf(editor));
		});
	}
});
