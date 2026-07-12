import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures/editor-page';

type TableDimensionSnapshot = {
	readonly tableId: string;
	readonly columnWidthsPx: readonly (number | null)[] | null;
	readonly rowMinHeightsPx: readonly (number | null)[];
};

interface SizedTableOptions {
	readonly columnWidthsPx?: readonly (number | null)[];
	readonly rowMinHeightsPx?: readonly (number | null)[];
	readonly cellText?: (row: number, column: number) => string;
}

async function setSizedTable(
	page: Page,
	{
		columnWidthsPx,
		rowMinHeightsPx = [null, null, null],
		cellText = (row: number, column: number): string => `R${row + 1}C${column + 1}`,
	}: SizedTableOptions = {},
): Promise<void> {
	await page.evaluate(
		({ widths, heights, texts }) => {
			type EditorElement = HTMLElement & { setJSON(document: unknown): void };
			const editor = document.querySelector('notectl-editor') as EditorElement | null;
			if (!editor) throw new Error('Editor element missing');
			editor.setJSON({
				children: [
					{
						id: 'sizing-table',
						type: 'table',
						...(widths ? { attrs: { columnWidthsPx: widths } } : {}),
						children: Array.from({ length: 3 }, (_unused, row) => ({
							id: `sizing-row-${row}`,
							type: 'table_row',
							...(heights[row] === null || heights[row] === undefined
								? {}
								: { attrs: { minHeightPx: heights[row] } }),
							children: Array.from({ length: 3 }, (_cell, column) => ({
								id: `sizing-cell-${row}-${column}`,
								type: 'table_cell',
								children: [
									{
										type: 'text',
										text: texts[row]?.[column] ?? '',
										marks: [],
									},
								],
							})),
						})),
					},
				],
			});
		},
		{
			widths: columnWidthsPx,
			heights: rowMinHeightsPx,
			texts: Array.from({ length: 3 }, (_unused, row) =>
				Array.from({ length: 3 }, (_cell, column) => cellText(row, column)),
			),
		},
	);
	await expect(
		page.locator('notectl-editor .ntbl-container[data-block-id="sizing-table"]'),
	).toBeVisible();
}

async function getDimensions(page: Page): Promise<TableDimensionSnapshot> {
	return page.evaluate(() => {
		type JsonNode = {
			readonly id?: string;
			readonly type?: string;
			readonly attrs?: {
				readonly columnWidthsPx?: readonly (number | null)[];
				readonly minHeightPx?: number;
			};
			readonly children?: readonly JsonNode[];
		};
		type EditorElement = HTMLElement & { getJSON(): { readonly children: readonly JsonNode[] } };
		const editor = document.querySelector('notectl-editor') as EditorElement | null;
		const table = editor?.getJSON().children.find((node) => node.type === 'table');
		if (!table?.id) throw new Error('Table node missing');
		return {
			tableId: table.id,
			columnWidthsPx: table.attrs?.columnWidthsPx ?? null,
			rowMinHeightsPx: (table.children ?? [])
				.filter((node) => node.type === 'table_row')
				.map((row) => row.attrs?.minHeightPx ?? null),
		};
	});
}

async function editorContentHasFocus(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const host = document.querySelector('notectl-editor');
		return host?.shadowRoot?.activeElement?.classList.contains('notectl-content') ?? false;
	});
}

function columnSeparator(page: Page, index: number): Locator {
	return page.locator(`notectl-editor .ntbl-resize-separator--column[data-index="${index}"]`);
}

function rowSeparator(page: Page, index: number): Locator {
	return page.locator(`notectl-editor .ntbl-resize-separator--row[data-index="${index}"]`);
}

async function activateTableControls(page: Page): Promise<void> {
	await page.locator('notectl-editor .ntbl-container').hover();
	await expect(page.locator('notectl-editor .ntbl-resize-separator--column').first()).toBeVisible();
}

async function beginDrag(page: Page, separator: Locator): Promise<{ x: number; y: number }> {
	const box = await separator.boundingBox();
	if (!box) throw new Error('Resize separator has no rendered box');
	const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(point.x, point.y);
	await page.mouse.down();
	return point;
}

async function openSelectionSizeDialog(page: Page): Promise<Locator> {
	const actions = page.locator('notectl-editor .ntbl-actions-btn');
	await actions.click();
	const sizeItem = page.locator('notectl-editor [role="menuitem"][data-submenu="size"]');
	await sizeItem.click();
	const dialog = page.getByRole('dialog', { name: 'Table size' });
	await expect(dialog).toBeVisible();
	return dialog;
}

async function applyPreciseSize(
	dialog: Locator,
	values: { readonly columnWidthPx?: number; readonly rowMinHeightPx?: number },
): Promise<void> {
	if (values.columnWidthPx !== undefined) {
		await dialog.getByLabel('Column width (px)').fill(String(values.columnWidthPx));
	}
	if (values.rowMinHeightPx !== undefined) {
		await dialog.getByLabel('Row minimum height (px)').fill(String(values.rowMinHeightPx));
	}
	await dialog.getByRole('button', { name: 'Apply' }).click();
	await expect(dialog).toBeHidden();
}

test.describe('Persistent table sizing', () => {
	test('pointer resize previews in the DOM and commits exactly one history entry', async ({
		editor,
		page,
	}) => {
		await setSizedTable(page, { columnWidthsPx: [140, null, 180] });
		await editor.registerStateChangeCounter();
		await activateTableControls(page);

		const separator = columnSeparator(page, 0);
		const start = await beginDrag(page, separator);
		for (const delta of [12, 24, 36, 48]) {
			await page.mouse.move(start.x + delta, start.y, { steps: 2 });
		}

		await expect(page.locator('notectl-editor .ntbl-resize-indicator')).toHaveText('188 px');
		expect(await editor.getStateChangeCount()).toBe(0);
		expect((await getDimensions(page)).columnWidthsPx).toEqual([140, null, 180]);

		await page.mouse.up();
		await expect.poll(() => editor.getStateChangeCount()).toBe(1);
		expect((await getDimensions(page)).columnWidthsPx).toEqual([188, null, 180]);

		await page.keyboard.press('Control+z');
		await expect
			.poll(async () => (await getDimensions(page)).columnWidthsPx)
			.toEqual([140, null, 180]);
		await page.keyboard.press('Control+Shift+z');
		await expect
			.poll(async () => (await getDimensions(page)).columnWidthsPx)
			.toEqual([188, null, 180]);
	});

	test('Escape cancels a pointer resize and restores the canonical width', async ({
		editor,
		page,
	}) => {
		await setSizedTable(page, { columnWidthsPx: [150, null, 180] });
		await editor.registerStateChangeCounter();
		await activateTableControls(page);

		const separator = columnSeparator(page, 0);
		const start = await beginDrag(page, separator);
		await page.mouse.move(start.x + 70, start.y, { steps: 4 });
		await expect(page.locator('notectl-editor col').first()).toHaveCSS('width', '220px');

		await page.keyboard.press('Escape');
		await page.mouse.up();
		await expect(page.locator('notectl-editor .ntbl-resize-indicator')).toBeHidden();
		await expect(page.locator('notectl-editor col').first()).toHaveCSS('width', '150px');
		expect((await getDimensions(page)).columnWidthsPx).toEqual([150, null, 180]);
		expect(await editor.getStateChangeCount()).toBe(0);
	});

	test('row pointer resize persists a minimum height without clipping growing content', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page, {
			columnWidthsPx: [120, 180, 180],
			cellText: (row, column) =>
				row === 0 && column === 0
					? 'A long cell value that wraps onto several lines and must expand the row.'
					: `R${row + 1}C${column + 1}`,
		});
		await activateTableControls(page);

		const separator = rowSeparator(page, 0);
		const initial = Number(await separator.getAttribute('aria-valuenow'));
		const start = await beginDrag(page, separator);
		await page.mouse.move(start.x, start.y - 200, { steps: 5 });
		await page.mouse.up();

		const expected = Math.max(24, initial - 200);
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([expected, null, null]);
		const geometry = await page
			.locator('notectl-editor tbody tr')
			.first()
			.evaluate((row) => ({
				height: row.getBoundingClientRect().height,
				cellScrollHeight: row.querySelector('td')?.scrollHeight ?? 0,
				cellClientHeight: row.querySelector('td')?.clientHeight ?? 0,
			}));
		expect(geometry.height).toBeGreaterThan(expected);
		expect(geometry.cellClientHeight).toBeGreaterThanOrEqual(geometry.cellScrollHeight);
	});

	test('keyboard uses small and large steps and Delete resets both axes to automatic', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page, {
			columnWidthsPx: [160, null, null],
			rowMinHeightsPx: [44, null, null],
		});
		await activateTableControls(page);

		const column = columnSeparator(page, 0);
		const initialColumnWidth = Number(await column.getAttribute('aria-valuenow'));
		await column.focus();
		await page.keyboard.press('ArrowRight');
		expect((await getDimensions(page)).columnWidthsPx).toEqual([
			initialColumnWidth + 8,
			null,
			null,
		]);
		await expect(column).toBeFocused();
		await page.keyboard.press('Shift+ArrowRight');
		expect((await getDimensions(page)).columnWidthsPx).toEqual([
			initialColumnWidth + 40,
			null,
			null,
		]);
		await page.keyboard.press('Delete');
		expect((await getDimensions(page)).columnWidthsPx).toBeNull();

		const row = rowSeparator(page, 0);
		const initialRowHeight = Number(await row.getAttribute('aria-valuenow'));
		await row.focus();
		await page.keyboard.press('ArrowDown');
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([initialRowHeight + 8, null, null]);
		await expect(row).toBeFocused();
		await page.keyboard.press('Shift+ArrowDown');
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([
			initialRowHeight + 40,
			null,
			null,
		]);
		await page.keyboard.press('Backspace');
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([null, null, null]);
	});

	test('cell context precise sizing updates its logical column and row and resets independently', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page);
		const cell = page.locator('notectl-editor td').nth(4);
		await cell.click();
		await cell.click({ button: 'right' });
		const sizeItem = page.locator('notectl-editor [role="menuitem"][data-submenu="size"]');
		await sizeItem.click();
		const dialog = page.getByRole('dialog', { name: 'Table size' });
		await applyPreciseSize(dialog, { columnWidthPx: 210, rowMinHeightPx: 58 });
		await expect.poll(() => editorContentHasFocus(page)).toBe(true);

		expect((await getDimensions(page)).columnWidthsPx).toEqual([null, 210, null]);
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([null, 58, null]);

		await cell.click({ button: 'right' });
		await page.locator('notectl-editor [role="menuitem"][data-submenu="size"]').click();
		const resetDialog = page.getByRole('dialog', { name: 'Table size' });
		await resetDialog.getByRole('button', { name: 'Reset column width' }).click();
		await resetDialog.getByRole('button', { name: 'Cancel' }).click();

		expect((await getDimensions(page)).columnWidthsPx).toBeNull();
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([null, 58, null]);
	});

	test('row and column handle selections target their complete logical axes', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page);
		const container = page.locator('notectl-editor .ntbl-container');
		await container.hover();

		const columnHandle = page
			.locator('notectl-editor .ntbl-col-handle')
			.nth(1)
			.locator('.ntbl-handle-select');
		await columnHandle.focus();
		await page.keyboard.press('Enter');
		await applyPreciseSize(await openSelectionSizeDialog(page), { columnWidthPx: 176 });
		await expect(page.locator('notectl-editor .ntbl-actions-btn')).toBeFocused();
		expect((await getDimensions(page)).columnWidthsPx).toEqual([null, 176, null]);

		await container.hover();
		const rowHandle = page
			.locator('notectl-editor .ntbl-row-handle')
			.nth(2)
			.locator('.ntbl-handle-select');
		await rowHandle.focus();
		await page.keyboard.press('Enter');
		await applyPreciseSize(await openSelectionSizeDialog(page), { rowMinHeightPx: 54 });
		expect((await getDimensions(page)).columnWidthsPx).toEqual([null, 176, null]);
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([null, null, 54]);
	});

	test('rectangular multi-cell selection exposes mixed values and updates every covered axis', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page, {
			columnWidthsPx: [110, 160, 220],
			rowMinHeightsPx: [32, 44, 56],
		});
		const first = page.locator('notectl-editor td').nth(0);
		const fifth = page.locator('notectl-editor td').nth(4);
		await first.click();
		await fifth.click({ modifiers: ['Shift'] });
		await expect(page.locator('notectl-editor td.notectl-table-cell--selected')).toHaveCount(4);

		const dialog = await openSelectionSizeDialog(page);
		await expect(dialog.getByLabel('Column width (px)')).toHaveAttribute('placeholder', 'Mixed');
		await expect(dialog.getByLabel('Row minimum height (px)')).toHaveAttribute(
			'placeholder',
			'Mixed',
		);
		await applyPreciseSize(dialog, { columnWidthPx: 190, rowMinHeightPx: 60 });

		expect((await getDimensions(page)).columnWidthsPx).toEqual([190, 190, 220]);
		expect((await getDimensions(page)).rowMinHeightsPx).toEqual([60, 60, 56]);
	});

	test('wide explicit columns scroll and resize controls follow measured geometry', async ({
		editor: _editor,
		page,
	}) => {
		await setSizedTable(page, { columnWidthsPx: [500, 420, 360] });
		const wrapper = page.locator('notectl-editor .notectl-table-wrapper');
		const overflow = await wrapper.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
		}));
		expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
		await wrapper.evaluate((element) => {
			element.scrollLeft = 260;
			element.dispatchEvent(new Event('scroll'));
		});
		await activateTableControls(page);

		const separatorAlignmentError = async (): Promise<number> => {
			const colBox = await page.locator('notectl-editor col').nth(1).boundingBox();
			const separatorBox = await columnSeparator(page, 1).boundingBox();
			if (!colBox || !separatorBox) return Number.POSITIVE_INFINITY;
			return Math.abs(separatorBox.x + separatorBox.width / 2 - (colBox.x + colBox.width));
		};
		await expect.poll(separatorAlignmentError).toBeLessThan(2);

		await page.locator('notectl-editor').evaluate((element) => {
			(element as HTMLElement).style.width = '620px';
		});
		await expect.poll(separatorAlignmentError).toBeLessThan(2);
		expect(await wrapper.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
			true,
		);
	});

	test('RTL mirrors horizontal resizing without changing logical column ownership', async ({
		editor,
		page,
	}) => {
		await editor.configure({ dir: 'rtl' });
		await setSizedTable(page, { columnWidthsPx: [200, 180, 160] });
		await activateTableControls(page);
		expect(
			await page
				.locator('notectl-editor table')
				.evaluate((table) => getComputedStyle(table).direction),
		).toBe('rtl');

		const firstLogicalColumn = columnSeparator(page, 0);
		const initialWidth = Number(await firstLogicalColumn.getAttribute('aria-valuenow'));
		await firstLogicalColumn.focus();
		await page.keyboard.press('ArrowRight');
		expect((await getDimensions(page)).columnWidthsPx).toEqual([initialWidth - 8, 180, 160]);

		const renderedWidth = await page
			.locator('notectl-editor col')
			.first()
			.evaluate((column) => column.getBoundingClientRect().width);
		const start = await beginDrag(page, firstLogicalColumn);
		await page.mouse.move(start.x + 30, start.y, { steps: 3 });
		await page.mouse.up();
		expect((await getDimensions(page)).columnWidthsPx).toEqual([
			Math.round(renderedWidth - 30),
			180,
			160,
		]);

		const cell = page.locator('notectl-editor td').nth(4);
		await cell.click();
		const cellBox = await cell.boundingBox();
		if (!cellBox) throw new Error('RTL table cell is not rendered');
		const anchorX = cellBox.x + cellBox.width / 2;
		await cell.click({ button: 'right' });
		const menu = page.locator('notectl-editor .notectl-table-context-menu').first();
		await expect(menu).toBeVisible();
		const menuBox = await menu.boundingBox();
		if (!menuBox) throw new Error('RTL table menu is not rendered');
		expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(anchorX + 2);
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
		await expect.poll(() => editorContentHasFocus(page)).toBe(true);
	});

	test('read-only keeps dimensions but hides UI and rejects the public sizing service', async ({
		editor,
		page,
	}) => {
		await setSizedTable(page, {
			columnWidthsPx: [150, 210, 170],
			rowMinHeightsPx: [42, null, 54],
		});
		await editor.configure({ readonly: true });
		const container = page.locator('notectl-editor .ntbl-container');
		await expect(container).toHaveAttribute('data-notectl-table-readonly', '');
		await expect(page.locator('notectl-editor .ntbl-resize-separator').first()).toBeHidden();
		await expect(page.locator('notectl-editor .ntbl-actions-btn')).toBeHidden();

		const result = await page.evaluate(() => {
			type SizingService = {
				setSize(target: unknown, input: unknown): boolean;
			};
			type JsonNode = { id?: string; type?: string };
			type EditorElement = HTMLElement & {
				getJSON(): { children: JsonNode[] };
				getService(key: { id: string }): SizingService | undefined;
			};
			const element = document.querySelector('notectl-editor') as EditorElement | null;
			const table = element?.getJSON().children.find((node) => node.type === 'table');
			if (!element || !table?.id) throw new Error('Sized table missing');
			return element
				.getService({ id: 'tableSizing' })
				?.setSize({ kind: 'column', tableId: table.id, column: 0 }, { columnWidthPx: 999 });
		});
		expect(result).toBe(false);
		expect((await getDimensions(page)).columnWidthsPx).toEqual([150, 210, 170]);

		await page.locator('notectl-editor td').first().click({ button: 'right', force: true });
		await expect(page.locator('notectl-editor .notectl-table-context-menu')).toHaveCount(0);
	});

	test('static HTML and print output preserve semantic sizing metadata', async ({
		editor,
		page,
	}) => {
		await setSizedTable(page, {
			columnWidthsPx: [135, null, 245],
			rowMinHeightsPx: [46, null, 62],
		});
		const staticHtml = await editor.getContentHTML();
		expect(staticHtml).toContain('<colgroup>');
		expect(staticHtml).toContain('data-notectl-width-px="135"');
		expect(staticHtml).toContain('data-notectl-width-px="245"');
		expect(staticHtml).toContain('data-notectl-min-height-px="46"');
		expect(staticHtml).toContain('data-notectl-min-height-px="62"');

		const printHtml = await page.evaluate(() => {
			type PrintService = { toHTML(options?: Record<string, unknown>): string };
			type EditorElement = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorElement = document.querySelector('notectl-editor') as EditorElement | null;
			return editorElement?.getService({ id: 'print' })?.toHTML() ?? '';
		});
		expect(printHtml).toContain('data-notectl-width-px="135"');
		expect(printHtml).toContain('data-notectl-width-px="245"');
		expect(printHtml).toContain('data-notectl-min-height-px="46"');
		expect(printHtml).toContain('data-notectl-min-height-px="62"');

		const cell = page.locator('notectl-editor td').first();
		await cell.click();
		await cell.click({ button: 'right' });
		await page.locator('notectl-editor [role="menuitem"][data-submenu="size"]').click();
		const sizeDialog = page.getByRole('dialog', { name: 'Table size' });
		await expect(sizeDialog).toBeVisible();

		await page.emulateMedia({ media: 'print' });
		await expect(sizeDialog).toBeHidden();
		await expect(page.locator('notectl-editor .ntbl-resize-separator').first()).toBeHidden();
		expect(
			await page
				.locator('notectl-editor .ntbl-container > [data-notectl-no-print]')
				.evaluateAll((elements) =>
					elements.every((element) => getComputedStyle(element).display === 'none'),
				),
		).toBe(true);
		expect(
			await page
				.locator('notectl-editor .notectl-table-wrapper')
				.evaluate((wrapper) => getComputedStyle(wrapper).overflowX),
		).toBe('visible');
		expect((await getDimensions(page)).columnWidthsPx).toEqual([135, null, 245]);
	});
});
