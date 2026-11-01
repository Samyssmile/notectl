import { type Page, expect, test } from '@playwright/test';
import type {} from '../examples/vanillajs/src/custom-ui.js';
import type { SelectionView } from '../packages/core/src/ui.js';

async function select(
	page: Page,
	anchor: number,
	head: number,
	id: 'external' | 'plugin' = 'external',
): Promise<void> {
	await measureSelections(page, [[anchor, head]], id);
}

async function measureSelections(
	page: Page,
	offsets: readonly (readonly [number, number])[],
	id: 'external' | 'plugin' = 'external',
): Promise<readonly SelectionView[]> {
	// Read all directions in one task so subscribed controls cannot shift the layout between reads.
	return page.evaluate(
		({ offsets, id }) => {
			const { editor, ui } = window.uiDemo[id];
			return offsets.map(([anchor, head]) => {
				const state = editor.getState();
				const block = state.doc.children[0];
				if (!block) throw new Error('Missing block');
				editor.dispatch(
					state
						.transaction('api')
						.setSelection({
							anchor: { blockId: block.id, offset: anchor },
							head: { blockId: block.id, offset: head },
						})
						.build(),
				);
				return ui.getSelection();
			});
		},
		{ offsets, id },
	);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/custom-ui.html');
	await page.waitForFunction(() => !!window.uiDemo);
});

test('measures multiline selections and preserves backward anchor/focus', async ({ page }) => {
	const [forward, backward] = await measureSelections(page, [
		[4, 124],
		[124, 4],
	]);
	if (!forward || !backward) throw new Error('Missing measurements');
	expect(forward.type).toBe('text');
	expect(forward.collapsed).toBe(false);
	expect(forward.geometry?.rects.length).toBeGreaterThan(1);
	expect(forward.geometry?.focus.y).toBeGreaterThan(forward.geometry?.anchor.y ?? 0);
	expect(backward.geometry?.bounds).toEqual(forward.geometry?.bounds);
	expect(backward.geometry?.anchor).toEqual(forward.geometry?.focus);
	expect(backward.geometry?.focus).toEqual(forward.geometry?.anchor);
});

for (const dir of ['ltr', 'rtl'] as const) {
	for (const breaks of [1, 2]) {
		test(`measures ${dir} carets and selections after ${breaks} trailing hard breaks`, async ({
			page,
		}) => {
			await page.evaluate((dir) => {
				const { editor, ui } = window.uiDemo.external;
				editor.configure({ dir });
				editor.setText(dir === 'rtl' ? '\u0645\u0631\u062d\u0628\u0627' : 'abc');
				ui.focusEditor();
			}, dir);
			await page.keyboard.press('ControlOrMeta+End');
			for (let i = 0; i < breaks; i++) await page.keyboard.press('Shift+Enter');
			const caret = await page.evaluate(() => {
				const { editor, ui } = window.uiDemo.external;
				const block = editor.shadowRoot?.querySelector('[data-block-id]');
				const placeholder = block?.lastChild;
				if (!(placeholder instanceof HTMLBRElement)) throw new Error('Missing trailing BR');
				const line: DOMRect = placeholder.getBoundingClientRect();
				const firstLine: DOMRect | undefined = block?.querySelector('br')?.getBoundingClientRect();
				if (!firstLine) throw new Error('Missing hard break');
				const state = editor.getState();
				if (!('anchor' in state.selection)) throw new Error('Expected text selection');
				return {
					view: ui.getSelection(),
					line: { x: line.x, y: line.y },
					firstLineY: firstLine.y,
					offset: state.selection.head.offset,
				};
			});
			expect(caret.view.collapsed).toBe(true);
			expect(caret.view.geometry).not.toBeNull();
			expect(caret.view.geometry?.anchor.height).toBeGreaterThan(0);
			expect(caret.view.geometry?.anchor.y).toBeCloseTo(caret.line.y, 1);
			expect(caret.view.geometry?.anchor.x).toBeCloseTo(caret.line.x, 1);
			expect(caret.view.geometry?.anchor.y).toBeGreaterThan(caret.firstLineY);
			const [collapsed, forward, backward] = await measureSelections(page, [
				[caret.offset, caret.offset],
				[0, caret.offset],
				[caret.offset, 0],
			]);
			if (!collapsed || !forward || !backward) throw new Error('Missing measurements');
			expect(forward.geometry).not.toBeNull();
			expect(forward.geometry?.focus).toEqual(collapsed.geometry?.focus);
			expect(backward.geometry?.bounds).toEqual(forward.geometry?.bounds);
			expect(backward.geometry?.anchor).toEqual(forward.geometry?.focus);
			expect(backward.geometry?.focus).toEqual(forward.geometry?.anchor);
			await select(page, caret.offset, caret.offset);
			expect(await page.evaluate(() => !!window.uiDemo.external.ui.openAction('fontSize'))).toBe(
				true,
			);
			await expect(page.locator('#external-editor .notectl-toolbar-popup')).toBeVisible();
		});
	}
}

test('applies actions from both surfaces without standard toolbars and isolates editors', async ({
	page,
}, testInfo) => {
	expect(await page.getByRole('toolbar').count()).toBe(0);
	await select(page, 0, 6);
	await page.locator('#external-controls [data-action="bold"]').click();
	await expect(page.locator('#external-controls [data-action="bold"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.locator('#plugin-editor [data-action="bold"]')).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await select(page, 0, 6, 'plugin');
	await page.locator('#plugin-editor [data-action="italic"]').click();
	await expect(page.locator('#plugin-editor [data-action="italic"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await page.screenshot({ path: testInfo.outputPath('custom-ui.png'), fullPage: true });
	await page.evaluate(() => window.uiDemo.plugin.editor.commands.undo());
	await expect(page.locator('#plugin-editor [data-action="italic"]')).toHaveAttribute(
		'aria-pressed',
		'false',
	);
	await page.evaluate(() => window.uiDemo.plugin.editor.commands.redo());
	await expect(page.locator('#plugin-editor [data-action="italic"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
});

test('preserves a focused external input through transactions and restores the model selection', async ({
	page,
}) => {
	await select(page, 7, 12);
	const input = page.locator('#external-controls input');
	await input.fill('outside');
	await page.evaluate(() => {
		const { editor } = window.uiDemo.external;
		const state = editor.getState();
		const block = state.doc.children[0];
		if (!block || !('anchor' in state.selection)) throw new Error('Expected text selection');
		const builder = state.transaction('api').insertText(block.id, 0, 'prefix ', []);
		const mapping = builder.build().mapping;
		editor.dispatch(
			builder
				.setSelection({
					anchor: mapping.map(state.selection.anchor, -1),
					head: mapping.map(state.selection.head, 1),
				})
				.build(),
		);
	});
	await page.evaluate(() => window.uiDemo.external.ui.executeAction('bold'));
	await expect(input).toBeFocused();
	await input.press('End');
	await input.press('Space');
	await input.press('X');
	await expect(input).toHaveValue('outside X');
	await page
		.locator('#external-controls')
		.getByRole('button', { name: 'Return to selection' })
		.click();
	await expect(page.locator('#external-editor [role="textbox"]')).toBeFocused();
	expect(
		await page.evaluate(
			() => window.uiDemo.external.ui.getActions().find((a) => a.id === 'bold')?.active,
		),
	).toBe(true);
	expect(
		await page.evaluate(() => {
			const selection = window.uiDemo.external.editor.getState().selection;
			return 'anchor' in selection ? [selection.anchor.offset, selection.head.offset] : null;
		}),
	).toEqual([14, 19]);
});

test('measures selected table cells and gap cursors through the same selection API', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { editor, cells } = window.uiDemo.external;
		editor.executeCommand('insertTable');
		const table = editor.getState().doc.children.find((block) => block.type === 'table');
		if (!table) throw new Error('Missing table');
		cells?.setSelectedRange({ tableId: table.id, fromRow: 0, fromCol: 0, toRow: 1, toCol: 1 });
	});
	const cells = await page.evaluate(() => window.uiDemo.external.ui.getSelection());
	expect(cells.type).toBe('cell');
	expect(cells.collapsed).toBe(false);
	expect(cells.geometry?.rects).toHaveLength(4);
	await page.evaluate(() => {
		const { editor, cells } = window.uiDemo.external;
		cells?.setSelectedRange(null);
		const state = editor.getState();
		const table = state.doc.children.find((block) => block.type === 'table');
		if (table)
			editor.dispatch(
				state
					.transaction('api')
					.setSelection({
						type: 'gap',
						blockId: table.id,
						path: [table.id],
						side: 'after',
					})
					.build(),
			);
	});
	const gap = await page.evaluate(() => window.uiDemo.external.ui.getSelection());
	expect(gap.type).toBe('gap');
	expect(gap.collapsed).toBe(true);
	expect(gap.geometry?.bounds.height).toBe(1);
});

test('does not move focus or run UI actions during IME composition', async ({ page }) => {
	await select(page, 0, 0);
	const content = page.locator('#external-editor [role="textbox"]');
	await page.evaluate(() => window.uiDemo.external.ui.focusEditor());
	await content.dispatchEvent('compositionstart', { data: '' });
	expect(
		await page.evaluate(() => ({
			action: window.uiDemo.external.ui.executeAction('bold'),
			geometry: window.uiDemo.external.ui.getSelection().geometry,
		})),
	).toEqual({ action: false, geometry: null });
	await expect(content).toBeFocused();
	await content.dispatchEvent('compositionend', { data: '' });
	await expect
		.poll(() => page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry))
		.not.toBeNull();
});

test('keeps popup input editing native and preserves the link feature focus contract', async ({
	page,
}) => {
	await select(page, 0, 6);
	const trigger = page.locator('#external-controls [data-action="link"]');
	await trigger.click();
	const popup = page.locator('#external-editor .notectl-toolbar-popup');
	const input = popup.locator('input').first();
	await input.fill('https://example.com');
	await input.press('End');
	await input.press('Space');
	await input.press('X');
	await expect(input).toHaveValue('https://example.com X');
	await input.press('Escape');
	await expect(popup).toHaveCount(0);
	await expect(page.locator('#external-editor [role="textbox"]')).toBeFocused();
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('remeasures on scroll and resize and repositions a live selection popup', async ({ page }) => {
	await select(page, 0, 6);
	await page.getByRole('button', { name: 'Selection popup', exact: true }).click();
	const popup = page.getByRole('dialog', { name: 'Selection popup' });
	await expect(popup).toBeVisible();
	const before = await popup.boundingBox();
	await page.locator('#scroll-container').evaluate((element) => {
		element.scrollTop = 25;
	});
	await expect.poll(async () => (await popup.boundingBox())?.y).toBeLessThan((before?.y ?? 0) - 10);
	await select(page, 0, 100);
	await expect
		.poll(() => page.locator('#external-controls output').textContent())
		.toContain('"collapsed":false');
	const beforeResize = await page.locator('#external-controls output').textContent();
	await page.locator('#scroll-container').evaluate((element) => {
		element.style.width = '260px';
	});
	await expect
		.poll(() => page.locator('#external-controls output').textContent())
		.not.toBe(beforeResize);
	const selection = await page.evaluate(() => window.uiDemo.external.ui.getSelection());
	expect(selection.geometry?.rects.length).toBeGreaterThan(2);
	await popup.locator('input').press('Escape');
	await expect(page.getByRole('button', { name: 'Selection popup', exact: true })).toBeFocused();
});

test('reads native backward keyboard selections and leaves another editor focused', async ({
	page,
}) => {
	const content = page.locator('#external-editor [role="textbox"]');
	await content.click();
	await page.keyboard.press('ControlOrMeta+Home');
	await page.keyboard.press('ControlOrMeta+ArrowRight');
	for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
	await expect
		.poll(() =>
			page.evaluate(() => {
				const selection = window.uiDemo.external.editor.getState().selection;
				return 'anchor' in selection && selection.anchor.offset > selection.head.offset;
			}),
		)
		.toBe(true);
	const geometry = await page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry);
	expect(geometry?.anchor.x).toBeGreaterThan(geometry?.focus.x ?? 0);
	const second = page.locator('#plugin-editor [role="textbox"]');
	await second.click();
	await page.evaluate(() => window.uiDemo.external.ui.executeAction('bold'));
	await expect(second).toBeFocused();
});

test('measures cursor, RTL, node and hidden selections', async ({ page }) => {
	await select(page, 4, 4);
	expect(await page.evaluate(() => window.uiDemo.external.ui.getSelection().collapsed)).toBe(true);
	expect(
		await page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry),
	).not.toBeNull();
	await page.evaluate(() => window.uiDemo.external.editor.setText(''));
	expect(
		await page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry),
	).not.toBeNull();
	await page.evaluate(() => {
		window.uiDemo.external.editor.setText('مرحبا بالعالم مرحبا');
		window.uiDemo.external.editor.configure({ dir: 'rtl' });
	});
	await select(page, 0, 12);
	const rtl = await page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry);
	expect(rtl?.anchor.x).toBeGreaterThan(rtl?.focus.x ?? 0);
	await page.evaluate(() => {
		const { editor } = window.uiDemo.external;
		editor.executeCommand('insertHorizontalRule');
		const state = editor.getState();
		const node = state.doc.children.find((block) => block.type === 'horizontal_rule');
		if (!node) throw new Error('Missing horizontal rule');
		editor.dispatch(
			state
				.transaction('api')
				.setSelection({ type: 'node', nodeId: node.id, path: [node.id] })
				.build(),
		);
	});
	const node = await page.evaluate(() => window.uiDemo.external.ui.getSelection());
	expect(node.type).toBe('node');
	expect(node.geometry?.bounds.width).toBeGreaterThan(0);
	await page.locator('#external-editor').evaluate((element) => {
		element.hidden = true;
	});
	expect(await page.evaluate(() => window.uiDemo.external.ui.getSelection().geometry)).toBeNull();
});

test('readonly closes action popups and destroy stops subscriptions and focus helpers', async ({
	page,
}) => {
	await select(page, 0, 6);
	await page.locator('#external-controls [data-action="fontSize"]').click();
	await expect(page.locator('#external-editor .notectl-toolbar-popup')).toBeVisible();
	await page.evaluate(() => window.uiDemo.external.editor.configure({ readonly: true }));
	await expect(page.locator('#external-editor .notectl-toolbar-popup')).toHaveCount(0);
	await expect(page.locator('#external-controls [data-action="bold"]')).toBeDisabled();
	const result = await page.evaluate(async () => {
		const { editor, ui } = window.uiDemo.external;
		let notifications = 0;
		ui.subscribeSelection(() => {
			notifications++;
		});
		await editor.destroy();
		const before = notifications;
		window.dispatchEvent(new Event('resize'));
		ui.invalidateGeometry();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		return { before, notifications, focused: ui.focusEditor(), actions: ui.getActions().length };
	});
	expect(result.notifications).toBe(result.before);
	expect(result.focused).toBe(false);
	expect(result.actions).toBe(0);
});
