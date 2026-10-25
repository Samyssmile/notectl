import { expect, test } from './fixtures/editor-page';
import {
	LINK_DESTINATION,
	expectLinkPopup,
	routeLinkDestination,
} from './fixtures/link-navigation';

test.describe('Link navigation', () => {
	test.beforeEach(async ({ editor, page }) => {
		await routeLinkDestination(page);
		await editor.setContentHTML(
			`<p>Before <a href="${LINK_DESTINATION}"><strong>Open destination</strong></a> after</p>`,
		);
	});

	for (const modifier of ['Control', 'Meta'] as const) {
		test(`${modifier}-click opens nested linked text once without changing content`, async ({
			editor,
			page,
		}) => {
			const before = await editor.getJSON();
			await expectLinkPopup(page, () =>
				editor.content.locator('a').click({ modifiers: [modifier] }),
			);
			expect(await editor.getJSON()).toEqual(before);
			await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		});
	}

	test('plain click previews the destination and preserves the caret for typing', async ({
		editor,
		page,
	}, testInfo) => {
		await editor.content.locator('a').click();
		const preview = page.locator('.notectl-link-preview');
		await expect(preview).toBeVisible();
		await expect(preview).toContainText(LINK_DESTINATION);
		await expect(editor.content).toBeFocused();
		expect(page.context().pages()).toHaveLength(1);
		await preview.screenshot({ path: testInfo.outputPath('link-preview.png') });
		await page.keyboard.type('X');
		await expect(preview).toHaveCount(0);
		expect(await editor.getText()).toContain('X');
	});

	test('preview is reachable by Tab and activates through Enter', async ({ editor, page }) => {
		await editor.content.locator('a').click();
		await page.keyboard.press('Tab');
		await expect(page.locator('.notectl-link-preview a')).toBeFocused();
		await expectLinkPopup(page, () => page.keyboard.press('Enter'));
		await page.keyboard.press('Escape');
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		await expect(editor.content).toBeFocused();
	});

	test('Tab leaves the non-modal preview and Escape restores editor focus', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').click();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Close link preview' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(editor.content).toBeFocused();
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
	});

	test('Ctrl+Enter opens the link at the editing cursor', async ({ editor, page }) => {
		await editor.selectRange(0, 10, 10);
		await expectLinkPopup(page, () => page.keyboard.press('Control+Enter'));
	});

	test('Escape dismisses the preview while keeping the editing caret focused', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').click();
		await page.keyboard.press('Escape');
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		await expect(editor.content).toBeFocused();
	});

	test('toolbar offers Open link at a collapsed cursor inside a link', async ({ editor, page }) => {
		await editor.selectRange(0, 10, 10);
		await expect(editor.markButton('link')).not.toHaveAttribute('aria-disabled', 'true');
		await editor.markButton('link').click();
		await expectLinkPopup(page, () =>
			page
				.locator('.notectl-link-popup')
				.getByRole('button', { name: 'Open link', exact: true })
				.click(),
		);
	});

	test('readonly click, keyboard activation, and mode switching retain native navigation', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').click();
		await editor.configure({ readonly: true });
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		const link = editor.content.locator('a');
		await expect(link).toHaveCSS('cursor', 'pointer');
		await expectLinkPopup(page, () => link.click());
		await link.focus();
		await expectLinkPopup(page, () => page.keyboard.press('Enter'));
		await expectLinkPopup(page, () => link.click({ modifiers: ['Control'] }));
		await editor.configure({ readonly: false });
		await link.click();
		await expect(page.locator('.notectl-link-preview')).toBeVisible();
	});

	test('same-tab setting applies to the preview; Ctrl-click still means new tab', async ({
		editor,
		page,
	}) => {
		await editor.recreateWithPlugins({
			toolbar: [[{ name: 'LinkPlugin', config: { openInNewTab: false } }]],
		});
		await editor.setContentHTML('<p><a href="/link-284-destination">Relative link</a></p>');
		await expectLinkPopup(page, () =>
			editor.content.locator('a').click({ modifiers: ['Control'] }),
		);
		await editor.content.locator('a').click();
		await page
			.locator('.notectl-link-preview')
			.getByRole('link', { name: /Open link/ })
			.click();
		await expect(page).toHaveURL(LINK_DESTINATION);
		expect(page.context().pages()).toHaveLength(1);
	});

	test('initial readonly and a localized preview work without a toolbar', async ({ page }) => {
		await page.evaluate(async (href: string) => {
			const LinkPlugin = (window as unknown as { LinkPlugin: new () => unknown }).LinkPlugin;
			const minimal = document.createElement('notectl-editor') as HTMLElement & {
				init(config: unknown): Promise<void>;
				setContentHTML(html: string): Promise<void>;
			};
			minimal.id = 'minimal-link-editor';
			document.body.append(minimal);
			await minimal.init({ plugins: [new LinkPlugin()], readonly: true, locale: 'de' });
			await minimal.setContentHTML(`<p><a href="${href}">Ziel öffnen</a></p>`);
		}, LINK_DESTINATION);
		const minimal = page.locator('#minimal-link-editor');
		const link = minimal.locator('.notectl-content a');
		await expect(minimal.getByRole('toolbar')).toHaveCount(0);
		await expect(link).toHaveCSS('cursor', 'pointer');
		await expectLinkPopup(page, () => link.click());
		await minimal.evaluate((element) => {
			(element as HTMLElement & { configure(config: unknown): void }).configure({
				readonly: false,
			});
		});
		await link.click();
		await expect(minimal.locator('.notectl-link-preview')).toBeVisible();
		await expectLinkPopup(page, () =>
			minimal.getByRole('link', { name: /Link in neuem Tab öffnen/ }).click(),
		);
	});

	test('plain and modified fragment clicks stay inside the editor in both modes', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<p><a href="#caf%C3%A9"><strong>Jump</strong></a></p><h2 id="café">Target</h2>',
		);
		await page.evaluate(() => {
			const target = document.querySelector('notectl-editor')?.shadowRoot?.querySelector('#café');
			if (!target) throw new Error('missing target');
			target.scrollIntoView = (): void => {
				target.setAttribute(
					'data-scrolled',
					String(Number(target.getAttribute('data-scrolled')) + 1),
				);
			};
		});
		const target = editor.content.locator('#café');
		await editor.content.locator('a').click();
		await expect(target).toHaveAttribute('data-scrolled', '1');
		await editor.content.locator('a').click({ modifiers: ['Control'] });
		await expect(target).toHaveAttribute('data-scrolled', '2');
		await editor.configure({ readonly: true });
		await editor.content.locator('a').click();
		await expect(target).toHaveAttribute('data-scrolled', '3');
		expect(page.context().pages()).toHaveLength(1);
	});

	test('double-click selects text and does not open a preview', async ({ editor, page }) => {
		await editor.content.locator('a').dblclick();
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		const selection = await page.evaluate(() => document.getSelection()?.toString());
		expect(selection?.length).toBeGreaterThan(0);
		expect(page.context().pages()).toHaveLength(1);
	});

	test('replacing content and destroying the editor removes the preview', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').click();
		await editor.setContentHTML(`<p><a href="${LINK_DESTINATION}">Replacement</a></p>`);
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		await editor.content.locator('a').click();
		// Let the playground's scheduled stats refresh finish before destroying its editor.
		await page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
		);
		await editor.destroy();
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
	});
});
