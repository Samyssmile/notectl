import type { Page } from '@playwright/test';
import type { NotectlEditor } from '../packages/core/src/editor/NotectlEditor';
import type { BlockNode } from '../packages/core/src/model/Document';
import { expect, test } from './fixtures/editor-page';

const paragraph = (id: string, text: string) => ({
	id,
	type: 'paragraph',
	children: [{ type: 'text', text, marks: [] }],
});

async function selectRange(
	page: Page,
	from: string,
	start: number,
	to = from,
	end = start,
): Promise<void> {
	await page.evaluate(
		({ from, start, to, end }) => {
			const root = document.querySelector('notectl-editor')?.shadowRoot;
			const anchor = root?.querySelector(`[data-block-id="${from}"]`)?.firstChild;
			const head = root?.querySelector(`[data-block-id="${to}"]`)?.firstChild;
			if (!anchor || !head) throw new Error('Missing selection endpoints');
			window.getSelection()?.setBaseAndExtent(anchor, start, head, end);
			document.dispatchEvent(new Event('selectionchange'));
		},
		{ from, start, to, end },
	);
	await expect
		.poll(async () => (await snapshot(page)).selection)
		.toMatchObject({
			anchor: { blockId: from, offset: start },
			head: { blockId: to, offset: end },
		});
}

/** Check model identity and the corresponding DOM nodes in document order. */
async function snapshot(page: Page) {
	return page.evaluate(() => {
		const editor = document.querySelector<NotectlEditor>('notectl-editor');
		if (!editor) throw new Error('Missing editor');
		const state = editor.getState();
		const modelIds: string[] = [];
		const visit = (block: BlockNode): void => {
			modelIds.push(block.id);
			for (const child of block.children) {
				if ('id' in child) visit(child);
			}
		};
		state.doc.children.forEach(visit);
		const domIds = Array.from(
			editor.shadowRoot?.querySelectorAll('.notectl-content [data-block-id]') ?? [],
			(node) => node.getAttribute('data-block-id'),
		);
		return { doc: state.doc, selection: state.selection, modelIds, domIds };
	});
}

async function expectIdentity(page: Page): Promise<void> {
	const { modelIds, domIds } = await snapshot(page);
	expect(new Set(modelIds).size).toBe(modelIds.length);
	expect(domIds).toEqual(modelIds);
}

test.describe('History at container boundaries (#225)', () => {
	for (const backward of [false, true]) {
		const key = backward ? 'Backspace' : 'Delete';
		test(`${key} next to a quote preserves selection, undo and redo`, async ({ editor, page }) => {
			const p = paragraph('p', 'abc');
			const quote = { id: 'q', type: 'blockquote', children: [paragraph('inside', 'def')] };
			await editor.setJSON({
				children: [...(backward ? [quote, p] : [p, quote]), paragraph('tail', 'keep')],
			});
			await editor.content.focus();
			await selectRange(page, 'p', backward ? 0 : 3);
			const initial = await snapshot(page);
			await page.keyboard.press(key);
			expect(await snapshot(page)).toEqual(initial);
			expect((await editor.getCanChecks()).undo).toBe(false);
			await page.keyboard.press('Control+z');
			expect(await snapshot(page)).toEqual(initial);
			await expectIdentity(page);

			// A real edit supplies history on both sides of the blocked deletion.
			await page.keyboard.type('X');
			if (backward) await selectRange(page, 'p', 0);
			const boundary = await snapshot(page);
			await page.keyboard.press(key);
			expect(await snapshot(page)).toEqual(boundary);
			await page.keyboard.press('Control+z');
			expect(await snapshot(page)).toEqual(initial);
			await page.keyboard.press(key);
			expect((await editor.getCanChecks()).redo).toBe(true);
			await page.keyboard.press('Control+Shift+z');
			// Redo restores the selection that was active immediately before undo.
			expect(await snapshot(page)).toEqual(boundary);
			await expectIdentity(page);
		});
	}

	for (const key of ['Delete', 'X']) {
		test(`${key} across nested quote depths restores the exact tree on undo`, async ({
			editor,
			page,
		}) => {
			await editor.setJSON({
				children: [
					{
						id: 'q',
						type: 'blockquote',
						children: [
							paragraph('p1', 'abc'),
							{
								id: 'nested',
								type: 'blockquote',
								children: [paragraph('p2', 'def'), paragraph('p3', 'ghi')],
							},
							paragraph('p4', 'jkl'),
						],
					},
					paragraph('tail', 'keep'),
				],
			});
			await editor.content.focus();
			await selectRange(page, 'p1', 1, 'p4', 2);
			const before = await snapshot(page);
			await page.keyboard.press(key);
			const after = await snapshot(page);
			expect(after.doc).not.toEqual(before.doc);
			expect(after.modelIds).toEqual(['q', 'p1', 'nested', 'p2', 'p4', 'tail']);
			await expect(editor.content.locator('[data-block-id="p1"]')).toHaveText(
				key === 'Delete' ? 'a' : 'aX',
			);
			await expect(editor.content.locator('[data-block-id="p2"]')).toHaveText('');
			await expect(editor.content.locator('[data-block-id="p4"]')).toHaveText('l');
			await expectIdentity(page);
			await page.keyboard.press('Control+z');
			expect(await snapshot(page)).toEqual(before);
			await expectIdentity(page);
			await page.keyboard.press('Control+Shift+z');
			expect(await snapshot(page)).toEqual(after);
			await expectIdentity(page);
		});
	}
});
