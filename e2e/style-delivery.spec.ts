import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NotectlEditor } from '../packages/core/src/editor/NotectlEditor';
import { expect, test } from './fixtures/editor-page';

test.describe('Compiled stylesheet delivery', () => {
	test('base, toolbar and plugin styles follow theme changes inside the shadow root', async ({
		editor,
	}) => {
		await editor.setContentHTML('<p><code>styled code</code></p>');
		const wrapper = editor.root.locator('.notectl-editor');
		const code = editor.content.locator('code');
		await expect(wrapper).toHaveCSS('display', 'flex');
		await expect(wrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
		await expect(editor.toolbar()).toHaveCSS('display', 'flex');
		await expect(code).toHaveCSS('background-color', 'rgb(237, 240, 245)');
		await expect(code).toHaveCSS('border-radius', '4px');

		await editor.root.evaluate((element: NotectlEditor) => element.setTheme('dark'));
		await expect(wrapper).toHaveCSS('background-color', 'rgb(30, 30, 46)');
		await expect(code).toHaveCSS('background-color', 'rgb(49, 50, 68)');

		await editor.root.evaluate((element: NotectlEditor) => element.setTheme('light'));
		await expect(wrapper).toHaveCSS('background-color', 'rgb(255, 255, 255)');
		await expect(code).toHaveCSS('background-color', 'rgb(237, 240, 245)');
	});

	test('active toolbar foreground follows the component override and theme fallback', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.press('Control+b');
		const bold = editor.markButton('bold');
		await expect(bold).toHaveAttribute('aria-pressed', 'true');
		await expect(bold).toHaveCSS('color', 'rgb(26, 95, 160)');

		await editor.root.evaluate((element: NotectlEditor) => element.setTheme('dark'));
		await expect(bold).toHaveCSS('color', 'rgb(137, 180, 250)');
		await editor.root.evaluate((element) => {
			element.style.setProperty('--notectl-toolbar-button-active-fg', 'rgb(12, 34, 56)');
		});
		await expect(bold).toHaveCSS('color', 'rgb(12, 34, 56)');
	});

	test('editor rules do not style matching classes outside its shadow root', async ({
		editor,
		page,
	}) => {
		await page.evaluate(() => {
			const outside = document.createElement('div');
			outside.id = 'outside-editor';
			outside.className = 'notectl-editor';
			document.body.appendChild(outside);
		});
		await expect(editor.root.locator('.notectl-editor')).toHaveCSS('display', 'flex');
		await expect(page.locator('#outside-editor')).toHaveCSS('display', 'block');
	});

	test('reduced motion removes toolbar transitions', async ({ editor, page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await expect(editor.markButton('bold')).not.toHaveCSS('transition-duration', '0s');
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(editor.markButton('bold')).toHaveCSS('transition-duration', '0s');
	});

	test('forced colors uses the system highlight border and removes the focus shadow', async ({
		editor,
		page,
	}) => {
		await page.emulateMedia({ forcedColors: 'active' });
		await editor.focus();
		const highlight = await page.evaluate(() => {
			const reference = document.createElement('div');
			reference.style.color = 'Highlight';
			document.body.appendChild(reference);
			const color = getComputedStyle(reference).color;
			reference.remove();
			return color;
		});
		await expect(editor.root.locator('.notectl-editor')).toHaveCSS('border-top-color', highlight);
		await expect(editor.root.locator('.notectl-editor')).toHaveCSS('box-shadow', 'none');
	});

	test('UMD renders embedded styles under strict CSP without an external stylesheet', async ({
		page,
	}) => {
		const violations: string[] = [];
		await page.exposeFunction('reportStyleViolation', (directive: string) => {
			violations.push(directive);
		});
		const root = process.cwd();
		const assets = new Map([
			['/library.js', await readFile(resolve(root, 'packages/core/dist/notectl-core.umd.js'))],
			[
				'/purify.js',
				await readFile(resolve(root, 'packages/core/node_modules/dompurify/dist/purify.min.js')),
			],
			[
				'/start.js',
				Buffer.from(`
					document.addEventListener('securitypolicyviolation', event => {
						window.reportStyleViolation(event.effectiveDirective);
					});
					(async () => {
						const editor = await NotectlCore.createEditor({
							locale: 'en',
							toolbar: [[new NotectlCore.TextFormattingPlugin(), new NotectlCore.InlineCodePlugin()]]
						});
						document.body.appendChild(editor);
						editor.setContentHTML('<p><code>UMD styles</code></p>');
					})();
				`),
			],
		]);
		await page.route('https://notectl.test/**', async (route) => {
			const pathname = new URL(route.request().url()).pathname;
			if (pathname === '/') {
				await route.fulfill({
					contentType: 'text/html',
					headers: {
						'Content-Security-Policy':
							"default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'",
					},
					body: '<!doctype html><html><head><title>UMD styles</title></head><body><script src="/purify.js"></script><script src="/library.js"></script><script src="/start.js"></script></body></html>',
				});
				return;
			}
			const body = assets.get(pathname);
			if (!body) {
				await route.abort();
				return;
			}
			await route.fulfill({ contentType: 'text/javascript', body });
		});
		await page.goto('https://notectl.test/');
		const editor = page.locator('notectl-editor');
		await expect(editor.locator('.notectl-editor')).toHaveCSS('display', 'flex');
		await expect(editor.locator('[role="toolbar"]')).toHaveCSS('display', 'flex');
		await expect(editor.locator('code')).toHaveCSS('background-color', 'rgb(237, 240, 245)');
		await expect(page.locator('link[rel="stylesheet"], style')).toHaveCount(0);
		expect(violations).toEqual([]);
	});
});
