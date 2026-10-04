import type { Page } from '@playwright/test';
import { type ClassExport, expect, test } from './fixtures/editor-page';
import { openStrictCSPPage } from './fixtures/strict-csp-page';

/**
 * Application style classes (#269): each formatting plugin maps its own values
 * to the application's CSS classes for class-based export, HTML import and
 * paste. Runs in Chromium and Firefox, whose CSS engines re-serialize imported
 * values (`#e03131` reads back as `rgb(224, 49, 49)`, font family quotes change).
 */

const FONTS = [
	{ name: 'Inter', family: "'Inter', sans-serif" },
	{ name: 'Georgia', family: 'Georgia, serif' },
	{ name: 'Fira Code', family: "'Fira Code', monospace" },
];

/** The application's own stylesheet for the classes configured below. */
const APP_STYLESHEET = `
	.text-red { color: #e03131; }
	.text-lg { font-size: 18px; }
	.mark-yellow { background-color: #fff176; }
	.align-center { text-align: center; }
`;

interface PublishedStyle {
	readonly color: string;
	readonly fontSize: string;
}

/** Shows exported HTML with the given stylesheet; returns the computed style of `selector`. */
async function publishedStyle(
	page: Page,
	html: string,
	stylesheet: string,
	selector: string,
): Promise<PublishedStyle> {
	return page.evaluate(
		({ content, css, target }) => {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(css);
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
			const host: HTMLElement = document.createElement('section');
			host.innerHTML = content;
			document.body.append(host);
			const el: Element | null = host.querySelector(target);
			if (!el) throw new Error(`No ${target} in ${content}`);
			const style: CSSStyleDeclaration = getComputedStyle(el);
			return { color: style.color, fontSize: style.fontSize };
		},
		{ content: html, css: stylesheet, target: selector },
	);
}

test.describe('Application style classes (#269)', () => {
	test.beforeEach(async ({ editor }) => {
		await editor.recreateWithPlugins({
			toolbar: [
				[
					{
						name: 'TextColorPlugin',
						config: { colors: ['#e03131'], styleClasses: { '#e03131': 'text-red' } },
					},
					{
						name: 'HighlightPlugin',
						config: { colors: ['#fff176'], styleClasses: { '#fff176': 'mark-yellow' } },
					},
					{ name: 'FontSizePlugin', config: { styleClasses: { 18: 'text-lg' } } },
					{
						name: 'FontPlugin',
						config: {
							fonts: FONTS,
							styleClasses: { Inter: 'font-sans', Georgia: 'font-serif', 'Fira Code': 'font-mono' },
						},
					},
				],
				[{ name: 'TextFormattingPlugin' }],
				[{ name: 'BlockquotePlugin' }, { name: 'TablePlugin' }],
				[{ name: 'AlignmentPlugin', config: { styleClasses: { center: 'align-center' } } }],
			],
		});
	});

	test('exports the class of a color picked in the toolbar', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		await editor.markButton('textColor').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.locator('.notectl-color-picker__swatch').first().click();
		await picker.waitFor({ state: 'hidden' });
		const result: ClassExport = await editor.getContentClasses();

		expect(result.html).toBe('<p><span class="text-red">Hello</span></p>');
		expect(result.css).toBe('.text-red { color: #e03131; }');
		expect(result.styleMap).toEqual([['text-red', 'color: #e03131']]);
	});

	test('gives every mark of a text run its own class, styled like the editor', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<p><span style="color: #e03131; font-size: 18px">Big red</span></p>',
		);
		const shown: PublishedStyle = await editor.content
			.locator('span')
			.last()
			.evaluate((el: Element) => {
				const style: CSSStyleDeclaration = getComputedStyle(el);
				return { color: style.color, fontSize: style.fontSize };
			});

		const { html }: ClassExport = await editor.getContentClasses();

		expect(html).toBe('<p><span class="text-red text-lg">Big red</span></p>');
		expect(await publishedStyle(page, html, APP_STYLESHEET, 'span')).toEqual(shown);
	});

	test('gives unmapped values a generated class next to the application class', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<p><span style="color: #e03131; font-size: 13px">Mixed</span></p>',
		);

		const { html, css }: ClassExport = await editor.getContentClasses();

		expect(html).toMatch(/^<p><span class="text-red notectl-s-[a-z0-9]+">Mixed<\/span><\/p>$/);
		expect(await publishedStyle(page, html, `${APP_STYLESHEET}\n${css}`, 'span')).toEqual({
			color: 'rgb(224, 49, 49)',
			fontSize: '13px',
		});
	});

	for (const source of [
		'<p><span class="text-red">Red</span> <span class="mark-yellow">marked</span> ' +
			'<span class="text-lg">large</span></p>',
		'<p><span class="font-sans">Inter</span> <span class="font-serif">Georgia</span> ' +
			'<span class="font-mono">Fira Code</span></p>',
		'<p class="align-center"><strong><span class="text-red text-lg">Bold</span></strong></p>',
	]) {
		test(`round-trips class-based HTML without a styleMap: ${source}`, async ({ editor }) => {
			await editor.setContentHTML(source);
			const first: ClassExport = await editor.getContentClasses();

			await editor.setContentHTML(first.html);
			const second: ClassExport = await editor.getContentClasses();

			expect(first.html).toBe(source);
			expect(second).toEqual(first);
		});
	}

	test('shows imported classes in the editor', async ({ editor }) => {
		await editor.setContentHTML('<p><span class="text-red text-lg">Styled</span></p>');

		const span = editor.content.locator('span').last();
		await expect(span).toHaveCSS('color', 'rgb(224, 49, 49)');
		await expect(span).toHaveCSS('font-size', '18px');
	});

	test('reads application classes in pasted paragraphs', async ({ editor }) => {
		await editor.focus();

		await editor.pasteHTML('<p>Pasted <span class="text-red">red</span></p>');

		await expect(editor.content.getByText('red', { exact: true })).toHaveCSS(
			'color',
			'rgb(224, 49, 49)',
		);
		expect((await editor.getContentClasses()).html).toContain('<span class="text-red">red</span>');
	});

	test('reads application classes in pasted quotes and tables', async ({ editor }) => {
		await editor.focus();

		await editor.pasteHTML(
			'<blockquote><p><span class="mark-yellow">quoted</span></p></blockquote>' +
				'<table><tr><td><p><span class="text-red">cell</span></p></td></tr></table>',
		);

		const { html }: ClassExport = await editor.getContentClasses();
		expect(html).toContain('<span class="mark-yellow">quoted</span>');
		expect(html).toContain('<span class="text-red">cell</span>');
	});

	test('lets an inline style win over a class for the same property', async ({ editor }) => {
		await editor.setContentHTML(
			'<p><span class="text-red" style="color: rgb(25, 113, 194)">Blue</span></p>',
		);

		await expect(editor.content.getByText('Blue')).toHaveCSS('color', 'rgb(25, 113, 194)');
		expect((await editor.getContentClasses()).html).not.toContain('text-red');
	});
});

test.describe('Application style classes under a strict CSP (#269)', () => {
	test('imports and exports classes on a page that blocks inline styles', async ({ page }) => {
		const source = '<p class="align-center"><span class="text-red text-lg">Strict</span></p>';
		const violations: string[] = await openStrictCSPPage(
			page,
			`(async () => {
				const editor = await NotectlCore.createEditor({
					locale: 'en',
					toolbar: [[
						new NotectlCore.TextColorPlugin({ styleClasses: { '#e03131': 'text-red' } }),
						new NotectlCore.FontSizePlugin({ styleClasses: { 18: 'text-lg' } }),
						new NotectlCore.AlignmentPlugin({ styleClasses: { center: 'align-center' } }),
					]],
				});
				document.body.appendChild(editor);
				window.notectlEditor = editor;
			})();`,
		);
		await page.waitForFunction(() => 'notectlEditor' in window);

		const html: string = await page.evaluate(async (content: string) => {
			const editor = (
				window as unknown as {
					notectlEditor: {
						setContentHTML(value: string): Promise<void>;
						getContentHTML(options: unknown): Promise<{ html: string }>;
					};
				}
			).notectlEditor;
			await editor.setContentHTML(content);
			return (await editor.getContentHTML({ cssMode: 'classes', includeBlockIds: false })).html;
		}, source);

		expect(html).toBe(source);
		await expect(page.locator('notectl-editor p')).toHaveCSS('text-align', 'center');
		expect(violations).toEqual([]);
	});
});
