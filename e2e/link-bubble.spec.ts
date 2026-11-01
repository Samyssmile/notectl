import { expect, test } from './fixtures/editor-page';

test.beforeEach(async ({ editor }) => {
	await editor.setContentHTML(
		'<p>Before <a href="/old" title="Keep title">one<strong>two</strong></a><a href="/other">other</a> after</p>',
	);
});
test('keyboard bubble edits the entire formatted link in one undo step', async ({
	editor,
	page,
}) => {
	await editor.selectRange(0, 8, 8);
	await page.keyboard.press('ControlOrMeta+k');
	const bubble = page.locator('.notectl-link-bubble');
	await expect(bubble).toBeVisible();
	await page.keyboard.press('Tab');
	await page.keyboard.press('ArrowRight');
	await expect(bubble.getByRole('button', { name: 'Edit link' })).toBeFocused();
	await page.keyboard.press('Enter');
	await bubble.getByRole('textbox').fill('/new');
	await page.keyboard.press('Enter');
	await expect(bubble).toHaveCount(0);
	await expect(editor.content.locator('a[href="/new"]')).toHaveCount(2);
	await expect(editor.content.locator('a[href="/new"]').first()).toHaveAttribute(
		'title',
		'Keep title',
	);
	await expect(editor.content.locator('a[href="/other"]')).toHaveText('other');
	await page.keyboard.press('ControlOrMeta+z');
	await expect(editor.content.locator('a[href="/new"]')).toHaveCount(0);
	await expect(editor.content.locator('a[href="/old"]')).toHaveCount(2);
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(editor.content.locator('a[href="/new"]')).toHaveCount(2);
});
test('keyboard entry, dismissal and reentry preserve caret focus', async ({ editor, page }) => {
	await editor.selectRange(0, 6, 6);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('.notectl-link-bubble')).toBeVisible();
	await expect(editor.content).toBeFocused();
	await page.keyboard.press('Escape');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+k');
	await expect(page.locator('.notectl-link-bubble')).toBeVisible();
});
test('toolbar shares validation and cancels without modifying the link', async ({
	editor,
	page,
}) => {
	await editor.selectRange(0, 8, 8);
	await editor.markButton('link').click();
	const bubble = page.locator('.notectl-link-bubble');
	await expect(bubble).toHaveCount(1);
	await bubble.getByRole('button', { name: 'Edit link' }).click();
	await bubble.getByRole('textbox').fill('javascript:alert(1)');
	await page.keyboard.press('Enter');
	await expect(bubble.getByRole('alert')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(editor.content).toBeFocused();
	await expect(editor.content.locator('a[href="/old"]')).toHaveCount(2);
});

test('typing dismisses the bubble until the caret leaves the link', async ({ editor, page }) => {
	await editor.selectRange(0, 8, 8);
	await page.keyboard.press('ControlOrMeta+k');
	await page.keyboard.type('X');
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
});
test('creation form works through Mod-K without a toolbar', async ({ page }) => {
	await page.evaluate(async () => {
		const LinkPlugin = (window as unknown as { LinkPlugin: new () => unknown }).LinkPlugin;
		const minimal = document.createElement('notectl-editor') as HTMLElement & {
			init(config: unknown): Promise<void>;
			setContentHTML(html: string): Promise<void>;
		};
		minimal.id = 'standalone-link';
		document.body.append(minimal);
		await minimal.init({ plugins: [new LinkPlugin()] });
		await minimal.setContentHTML('<p>Create link</p>');
	});
	const minimal = page.locator('#standalone-link');
	await minimal.locator('.notectl-content').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('ControlOrMeta+k');
	const input = minimal.getByRole('textbox', { name: 'Link URL', exact: true });
	await expect(input).toBeFocused();
	await input.fill('/standalone');
	await page.keyboard.press('Tab');
	await expect(minimal.getByRole('button', { name: 'Apply link' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(minimal.locator('.notectl-content a')).toHaveAttribute('href', '/standalone');
	await minimal.locator('.notectl-content a').click();
	await minimal.getByRole('button', { name: 'Edit link' }).click();
	await input.fill('/updated');
	await page.keyboard.press('Enter');
	await expect(minimal.locator('.notectl-content a')).toHaveAttribute('href', '/updated');
});

test('clicking another link with the same URL switches the editing target', async ({
	editor,
	page,
}) => {
	await editor.setContentHTML('<p><a href="/same">first</a> gap <a href="/same">second</a></p>');
	await editor.content.locator('a').first().click();
	await expect(page.locator('.notectl-link-bubble')).toBeVisible();
	await editor.content.locator('a').last().click();
	await page.getByRole('button', { name: 'Edit link' }).click();
	await page.getByRole('textbox', { name: 'Link URL', exact: true }).fill('/second');
	await page.keyboard.press('Enter');
	await expect(editor.content.locator('a').first()).toHaveAttribute('href', '/same');
	await expect(editor.content.locator('a').last()).toHaveAttribute('href', '/second');
});

test('Tab leaves the non-modal bubble without restoring editor focus', async ({ editor, page }) => {
	await editor.selectRange(0, 8, 8);
	await page.keyboard.press('ControlOrMeta+k');
	await page.keyboard.press('Tab');
	await expect(page.locator('.notectl-link-bubble a')).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Close link bubble' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
	await expect(editor.content).not.toBeFocused();
});
