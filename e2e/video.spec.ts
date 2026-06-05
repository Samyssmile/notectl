import { expect, test } from './fixtures/editor-page';
import { type JsonChild, getCellContents, insertTable } from './fixtures/table-utils';

const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const TITLE = 'How to set up notectl in 3 minutes';

/** Inserts a video through the toolbar → overlay form flow. */
async function insertVideo(
	editor: { markButton: (t: string) => { click: () => Promise<void> } },
	page: import('@playwright/test').Page,
	url: string = YT_URL,
	title: string = TITLE,
): Promise<void> {
	await editor.markButton('video').click();
	const urlInput = page.locator('notectl-editor input[aria-label="Video URL"]');
	await urlInput.waitFor({ state: 'visible' });
	await urlInput.fill(url);
	await page.locator('notectl-editor input[aria-label="Video title"]').fill(title);
	await page.locator('notectl-editor button[aria-label="Insert video"]').click();
	await page.locator('notectl-editor figure.notectl-video').first().waitFor({ state: 'visible' });
}

test.describe('Video embed', () => {
	test('inserts a facade — not a fallback link or a live iframe (privacy)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertVideo(editor, page);

		// The interactive NodeView rendered (a real Play button), not the toDOM fallback.
		await expect(page.locator('notectl-editor button.notectl-video__facade')).toBeVisible();
		// Zero provider contact before the user opts in: no iframe exists yet.
		await expect(page.locator('notectl-editor iframe.notectl-video__iframe')).toHaveCount(0);
	});

	test('facade activation builds a privacy iframe with a descriptive title', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertVideo(editor, page);

		await page.locator('notectl-editor button.notectl-video__facade').click();
		const iframe = page.locator('notectl-editor iframe.notectl-video__iframe');
		await iframe.waitFor({ state: 'attached', timeout: 5000 });

		expect(await iframe.getAttribute('title')).toBe(TITLE);
		expect(await iframe.getAttribute('src')).toContain('youtube-nocookie.com/embed/');
		expect(await iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
	});

	test('the exit control returns from the player to the facade', async ({ editor, page }) => {
		await editor.focus();
		await insertVideo(editor, page);

		await page.locator('notectl-editor button.notectl-video__facade').click();
		await page
			.locator('notectl-editor iframe.notectl-video__iframe')
			.waitFor({ state: 'attached', timeout: 5000 });

		await page.locator('notectl-editor button.notectl-video__exit').click();
		await expect(page.locator('notectl-editor iframe.notectl-video__iframe')).toHaveCount(0);
		await expect(page.locator('notectl-editor button.notectl-video__facade')).toBeVisible();
	});

	test('ask-first paste offers an embed instead of rewriting silently', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.pasteText(YT_URL);

		const embedBtn = page.locator('notectl-editor button.notectl-video-embed-prompt__embed');
		await embedBtn.waitFor({ state: 'visible', timeout: 3000 });
		await embedBtn.click();

		// The pre-filled insert form opens; supply the required accessible title.
		const titleInput = page.locator('notectl-editor input[aria-label="Video title"]');
		await titleInput.waitFor({ state: 'visible' });
		await titleInput.fill(TITLE);
		await page.locator('notectl-editor button[aria-label="Insert video"]').click();

		await expect(page.locator('notectl-editor figure.notectl-video')).toBeVisible();
		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.some((c) => c.type === 'video')).toBe(true);
	});

	test('keyboard shortcut resizes the selected video', async ({ editor, page }) => {
		await editor.focus();
		await insertVideo(editor, page);

		// The freshly inserted video is node-selected and the editor is focused.
		await page.keyboard.press('Control+Shift+ArrowLeft');

		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const video = json.children.find((c) => c.type === 'video');
			expect((video?.attrs?.widthPercent as number) ?? 100).toBeLessThan(100);
		}).toPass({ timeout: 2000 });
	});

	test('inserts a video into a table cell', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		await page.locator('notectl-editor td').nth(1).click();
		await page.waitForTimeout(100);
		await insertVideo(editor, page);

		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const table = json.children.find((c) => c.type === 'table');
			expect(table).toBeDefined();
			if (!table) return;
			const cells: JsonChild[][] = getCellContents(table);
			expect(cells.some((cell) => cell.some((c) => c.type === 'video'))).toBe(true);
		}).toPass({ timeout: 5000 });
	});

	test('deletes a selected video with Backspace', async ({ editor, page }) => {
		await editor.focus();
		await insertVideo(editor, page);

		await page.keyboard.press('Backspace');
		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.some((c) => c.type === 'video')).toBe(false);
	});
});
