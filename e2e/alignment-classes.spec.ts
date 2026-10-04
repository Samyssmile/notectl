import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/editor-page';

/**
 * Application-defined alignment classes (#270): configured once on the
 * AlignmentPlugin, used by class-based export, HTML import and paste.
 */

const CLASS_NAMES = {
	start: 'align-start',
	center: 'align-center',
	end: 'align-end',
	justify: 'align-justify',
} as const;

/** The application's own stylesheet, written with logical values. */
const APP_STYLESHEET = `
	#published { width: 400px; }
	.align-start { text-align: start; }
	.align-center { text-align: center; }
	.align-end { text-align: end; }
`;

interface ClassExport {
	readonly html: string;
	readonly css: string;
	readonly styleMap: readonly (readonly [string, string])[];
}

async function exportClasses(page: Page): Promise<ClassExport> {
	return page.evaluate(async () => {
		const el = document.querySelector('notectl-editor') as unknown as {
			getContentHTML(options: unknown): Promise<{
				html: string;
				css: string;
				styleMap: ReadonlyMap<string, string>;
			}>;
		};
		const result = await el.getContentHTML({ cssMode: 'classes', includeBlockIds: false });
		return { html: result.html, css: result.css, styleMap: [...result.styleMap] };
	});
}

async function blockAlignments(page: Page): Promise<unknown[]> {
	return page.evaluate(() => {
		const el = document.querySelector('notectl-editor') as unknown as {
			getJSON(): { children: { attrs?: { align?: unknown } }[] };
		};
		return el.getJSON().children.map((block) => block.attrs?.align);
	});
}

/** Publishes exported HTML with the application stylesheet; returns the target's alignment. */
async function publishedTextAlign(page: Page, html: string, selector: string): Promise<string> {
	return page.evaluate(
		({ content, stylesheet, target }) => {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(stylesheet);
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
			const host: HTMLElement = document.createElement('section');
			host.id = 'published';
			host.innerHTML = content;
			document.body.append(host);
			const el: Element | null = host.querySelector(target);
			if (!el) throw new Error(`No ${target} in ${content}`);
			return getComputedStyle(el).textAlign;
		},
		{ content: html, stylesheet: APP_STYLESHEET, target: selector },
	);
}

test.describe('Alignment CSS classes (#270)', () => {
	test.beforeEach(async ({ editor }) => {
		await editor.recreateWithPlugins({
			toolbar: [
				[{ name: 'HeadingPlugin' }],
				[{ name: 'ImagePlugin' }],
				[{ name: 'TablePlugin' }],
				[{ name: 'AlignmentPlugin', config: { styleClasses: CLASS_NAMES } }],
			],
		});
	});

	test('imports application classes and shows the alignment in the editor', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<h2 class="align-center">Title</h2><p class="align-end">Signed, the team</p>',
		);

		await expect(editor.content.locator('h2')).toHaveCSS('text-align', 'center');
		await expect(editor.content.locator('p')).toHaveCSS('text-align', 'end');
		expect(await blockAlignments(page)).toEqual(['center', 'end']);
	});

	test('exports the class of the current alignment after keyboard changes', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML('<p class="align-center">Aligned text</p>');
		await editor.content.locator('p').click();

		await page.keyboard.press('Control+Shift+R');
		const afterEnd: ClassExport = await exportClasses(page);
		await page.keyboard.press('Control+Shift+L');
		const afterStart: ClassExport = await exportClasses(page);

		expect(afterEnd.html).toBe('<p class="align-end">Aligned text</p>');
		expect(afterEnd.css).toBe('.align-end { text-align: end; }');
		expect(afterEnd.styleMap).toEqual([['align-end', 'text-align: end']]);
		expect(afterStart.html).toBe('<p class="align-start">Aligned text</p>');
		expect(afterStart.html).not.toContain('style=');
	});

	test('keeps the class of a pasted image', async ({ editor, page }) => {
		await editor.focus();

		await editor.pasteHTML(
			'<figure class="align-end"><img src="https://example.com/photo.png" alt="Photo"></figure>',
		);

		await expect(editor.content.locator('figure')).toHaveCount(1);
		const { html } = await exportClasses(page);
		expect(html).toContain('<figure class="align-end">');
	});

	for (const source of [
		'<p class="align-center">Single paragraph</p>',
		'<h2 class="align-end">Heading</h2><p class="align-center">Paragraph</p>',
		'<p class="align-center">First</p><p class="align-justify">Middle</p>' +
			'<p class="align-end">Last</p>',
	]) {
		test(`preserves pasted block alignment: ${source}`, async ({ editor, page }) => {
			await editor.focus();

			await editor.pasteHTML(source);
			const first: ClassExport = await exportClasses(page);
			await editor.setContentHTML(first.html);
			const second: ClassExport = await exportClasses(page);

			expect(first.html).toBe(source);
			expect(second).toEqual(first);
			await expect(editor.content.locator('p').first()).toHaveCSS('text-align', 'center');
		});
	}

	test('preserves a heading when pasting an aligned paragraph into it', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML('<h2 class="align-end">Title</h2>');
		await editor.content.locator('h2').click();
		await page.keyboard.press('End');

		await editor.pasteHTML('<p class="align-center">!</p>');

		await expect(editor.content.locator('h2')).toHaveCount(1);
		await expect(editor.content.locator('p')).toHaveCount(0);
		await expect(editor.content.locator('h2')).toHaveCSS('text-align', 'center');
		expect((await exportClasses(page)).html).toBe('<h2 class="align-center">Title!</h2>');
	});

	test('publishes the blocks of an aligned table cell as the editor shows them', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<table><tr><td class="align-center"><p>Cell text</p></td></tr></table>',
		);
		const shown: string = await editor.content
			.locator('td p')
			.evaluate((paragraph: Element) => getComputedStyle(paragraph).textAlign);

		const { html } = await exportClasses(page);

		expect(shown).toBe('center');
		expect(await publishedTextAlign(page, html, 'td p')).toBe(shown);
	});

	for (const direction of ['ltr', 'rtl'] as const) {
		test(`keeps explicit start in an aligned table cell (${direction})`, async ({
			editor,
			page,
		}) => {
			await page.evaluate((dir: string) => {
				document.documentElement.dir = dir;
			}, direction);
			await editor.setContentHTML(
				'<table><tr><td class="align-center"><p class="align-end">Cell text</p></td></tr></table>',
			);
			await editor.content.locator('td p').click();

			await page.keyboard.press('Control+Shift+L');
			const first: ClassExport = await exportClasses(page);

			await expect(editor.content.locator('td p')).toHaveCSS('text-align', 'start');
			await expect(editor.content.locator('td p')).toHaveCSS('direction', direction);
			expect(first.html).toContain('<p class="align-start">Cell text</p>');
			expect(first.html).not.toContain('align-end');
			expect(await publishedTextAlign(page, first.html, 'td p')).toBe('start');
			await editor.setContentHTML(first.html);
			await expect(editor.content.locator('td p')).toHaveCSS('text-align', 'start');
			expect(await exportClasses(page)).toEqual(first);

			await editor.content.locator('td p').click();
			await page.keyboard.press('Control+Shift+E');
			const afterCenter: ClassExport = await exportClasses(page);
			expect(afterCenter.html).toContain('<p class="align-center">Cell text</p>');
			expect(afterCenter.html).not.toContain('align-start');
		});
	}

	test('renders exported content with the application stylesheet in right-to-left pages', async ({
		editor,
		page,
	}) => {
		await editor.setContentHTML(
			'<p class="align-start">بداية</p><p class="align-end">نهاية</p><p>افتراضي</p>',
		);
		const { html } = await exportClasses(page);

		const gaps = await page.evaluate(
			({ content, stylesheet }) => {
				const sheet = new CSSStyleSheet();
				sheet.replaceSync(stylesheet);
				document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
				const host: HTMLElement = document.createElement('section');
				host.id = 'published';
				host.dir = 'rtl';
				host.innerHTML = content;
				document.body.append(host);
				return Array.from(host.querySelectorAll('p')).map((paragraph) => {
					const range: Range = document.createRange();
					range.selectNodeContents(paragraph);
					const text: DOMRect = range.getBoundingClientRect();
					const box: DOMRect = paragraph.getBoundingClientRect();
					return { left: text.left - box.left, right: box.right - text.right };
				});
			},
			{ content: html, stylesheet: APP_STYLESHEET },
		);

		expect(html).toBe(
			'<p class="align-start">بداية</p><p class="align-end">نهاية</p>' +
				'<p class="align-start">افتراضي</p>',
		);
		const [start, end, unaligned] = gaps;
		expect(start?.right).toBeLessThan(1);
		expect(start?.left).toBeGreaterThan(100);
		expect(end?.left).toBeLessThan(1);
		expect(end?.right).toBeGreaterThan(100);
		expect(unaligned?.right).toBeLessThan(1);
	});
});
