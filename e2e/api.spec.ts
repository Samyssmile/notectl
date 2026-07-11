import { expect, test } from './fixtures/editor-page';

test.describe('API', () => {
	test('getJSON returns document JSON', async ({ editor }) => {
		await editor.typeText('Hello');
		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		expect(json.children[0].type).toBe('paragraph');
	});

	test('getJSON / setJSON roundtrip', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const json = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getJSON(): { children: { children: { text: string; marks: { type: string }[] }[] }[] };
				setJSON(doc: unknown): void;
			};
			const doc = el.getJSON();
			el.setJSON(doc);
			return el.getJSON();
		});

		expect(json.children).toHaveLength(1);
		expect(json.children[0].children[0].text).toBe('Hello World');
		expect(json.children[0].children[0].marks).toContainEqual({ type: 'bold' });
	});

	test('getContentHTML includes formatting tags', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.press('Control+b');
		await page.keyboard.type('bold', { delay: 10 });
		await page.keyboard.press('Control+b');
		await page.keyboard.type(' normal', { delay: 10 });

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('bold');
		expect(html).toContain('normal');
	});

	test('getContentHTML omits data-block-id with includeBlockIds: false', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello');

		const { withIds, clean } = await page.evaluate(async () => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getContentHTML(options?: { includeBlockIds?: boolean }): Promise<string>;
			};
			return {
				withIds: await el.getContentHTML(),
				clean: await el.getContentHTML({ includeBlockIds: false }),
			};
		});

		expect(withIds).toContain('data-block-id');
		expect(withIds).toContain('Hello');
		expect(clean).not.toContain('data-block-id');
		expect(clean).toContain('Hello');
	});

	test('setContentHTML parses HTML into document', async ({ editor }) => {
		await editor.setContentHTML('<p><strong>Bold</strong> and <em>italic</em></p>');

		const text = await editor.getText();
		expect(text).toContain('Bold');
		expect(text).toContain('italic');

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});

	test('semantic local-link targets survive live rendering and clean HTML round-trips', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<p><a href="#installation">Installation</a></p>' +
				'<h2 id="installation">Install notectl</h2>',
		);

		const result = await page.evaluate(async () => {
			type BlockJSON = {
				readonly id: string;
				readonly htmlId?: string;
				readonly children: readonly {
					readonly marks?: readonly { readonly attrs?: { readonly href?: string } }[];
				}[];
			};
			type EditorElement = HTMLElement & {
				getJSON(): { readonly children: readonly BlockJSON[] };
				getContentHTML(options?: { readonly includeBlockIds?: boolean }): Promise<string>;
				setContentHTML(html: string): Promise<void>;
			};
			const el = document.querySelector('notectl-editor') as EditorElement | null;
			if (!el) throw new Error('editor missing');

			const before = el.getJSON();
			const withBlockIds: string = await el.getContentHTML();
			const clean: string = await el.getContentHTML({ includeBlockIds: false });
			const targetBefore = el.shadowRoot?.querySelector<HTMLElement>('#installation');

			await el.setContentHTML(clean);
			const after = el.getJSON();
			const targetAfter = el.shadowRoot?.querySelector<HTMLElement>('#installation');

			return {
				beforeTarget: before.children[1]?.htmlId,
				afterTarget: after.children[1]?.htmlId,
				linkHref: before.children[0]?.children[0]?.marks?.[0]?.attrs?.href,
				internalIdChanged: before.children[1]?.id !== after.children[1]?.id,
				withBlockIds,
				clean,
				renderedBefore: targetBefore?.id,
				renderedAfter: targetAfter?.id,
			};
		});

		expect(result.beforeTarget).toBe('installation');
		expect(result.afterTarget).toBe('installation');
		expect(result.linkHref).toBe('#installation');
		expect(result.internalIdChanged).toBe(true);
		expect(result.withBlockIds).toContain('data-block-id');
		expect(result.clean).not.toContain('data-block-id');
		expect(result.clean).toContain('id="installation"');
		expect(result.renderedBefore).toBe('installation');
		expect(result.renderedAfter).toBe('installation');
	});

	test('getText returns plain text', async ({ editor }) => {
		await editor.typeText('Hello');
		const text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('isEmpty returns correct value', async ({ editor, page }) => {
		const emptyBefore = await page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as { isEmpty(): boolean }).isEmpty(),
		);
		expect(emptyBefore).toBe(true);

		await editor.typeText('Hi');
		const emptyAfter = await page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as { isEmpty(): boolean }).isEmpty(),
		);
		expect(emptyAfter).toBe(false);
	});

	test('API toggle bold', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.evaluate(() =>
			(
				document.querySelector('notectl-editor') as unknown as {
					executeCommand(cmd: string): boolean;
				}
			).executeCommand('toggleBold'),
		);

		const html = await editor.getContentHTML();
		expect(html).toContain('<strong>');
	});

	test('can() returns correct capability checks', async ({ editor }) => {
		const checks = await editor.getCanChecks();
		expect(checks.bold).toBe(true);
		expect(checks.italic).toBe(true);
		expect(checks.underline).toBe(true);
		expect(checks.undo).toBe(false);
		expect(checks.redo).toBe(false);

		await editor.typeText('Hello');

		const undoRedoChecks = await editor.getCanChecks();
		expect(undoRedoChecks.undo).toBe(true);
		expect(undoRedoChecks.redo).toBe(false);
	});

	test('stateChange event fires on changes', async ({ editor }) => {
		await editor.registerStateChangeCounter();
		await editor.typeText('Hi');

		const count = await editor.getStateChangeCount();
		expect(count).toBeGreaterThan(0);
	});

	test('API undo/redo', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await page.click('#btn-undo');

		const text = await editor.getText();
		expect(text.trim()).toBe('');

		await page.click('#btn-redo');
		const text2 = await editor.getText();
		expect(text2.trim()).toBe('Hello');
	});

	test('destroy cleans up editor', async ({ editor, page }) => {
		await expect(editor.toolbar()).toBeVisible();

		const result = await page.evaluate(async () => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				destroy(): Promise<void>;
				getState(): unknown;
			};
			await el.destroy();
			try {
				el.getState();
				return { threw: false };
			} catch {
				return { threw: true };
			}
		});

		expect(result.threw).toBe(true);
		await expect(editor.toolbar()).toHaveCount(0);
	});
});
