import { expect, test } from './fixtures/editor-page';

test.describe('Print typography', () => {
	test('print HTML includes body rule with font-family without paper mode', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello World');

		const html: string = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getService(key: { id: string }): { toHTML(opts?: object): string } | undefined;
			};
			const service = el.getService({ id: 'print' });
			return service?.toHTML({}) ?? '';
		});

		expect(html).toContain('body {');
		expect(html).toContain('font-family');
		expect(html).toContain('Hello World');
	});

	test('print HTML includes font-size and line-height without paper mode', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Typography test');

		const html: string = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getService(key: { id: string }): { toHTML(opts?: object): string } | undefined;
			};
			const service = el.getService({ id: 'print' });
			return service?.toHTML({}) ?? '';
		});

		const bodyMatch: RegExpMatchArray | null = html.match(/body\s*\{[^}]*\}/);
		if (!bodyMatch) {
			expect.unreachable('Expected body rule in print HTML');
			return;
		}

		const bodyRule: string = bodyMatch[0];
		expect(bodyRule).toContain('font-size');
		expect(bodyRule).toContain('line-height');
	});

	test('print HTML includes body rule with paper mode', async ({ editor, page }) => {
		await editor.typeText('Paper mode test');

		const html: string = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement & {
				getService(key: { id: string }): { toHTML(opts?: object): string } | undefined;
			};
			const service = el.getService({ id: 'print' });
			return service?.toHTML({ paperSize: 'din-a4' }) ?? '';
		});

		expect(html).toContain('body {');
		expect(html).toContain('font-family');
	});
});
