import { expect, test } from './fixtures/editor-page';

/**
 * Verifies the editor supports a fixed external size with internal scrolling
 * (issue #107). The toolbar must stay pinned at the top while overflow content
 * scrolls inside the content area; the bottom plugin container must stay pinned
 * at the bottom.
 */
test.describe('Fixed-size editor with internal scrolling', () => {
	const HOST_HEIGHT = 280;

	test.beforeEach(async ({ page, editor }) => {
		await editor.focus();
		// Force a fixed external height on the host.
		await page.evaluate((h) => {
			const el = document.querySelector('notectl-editor') as HTMLElement | null;
			if (!el) return;
			el.style.height = `${h}px`;
			el.style.display = 'block';
		}, HOST_HEIGHT);
	});

	test('host height fills the inner wrapper', async ({ page }) => {
		const heights = await page.evaluate(() => {
			const host = document.querySelector('notectl-editor') as HTMLElement;
			const wrapper = host.shadowRoot?.querySelector('.notectl-editor') as HTMLElement;
			return {
				host: host.getBoundingClientRect().height,
				wrapper: wrapper.getBoundingClientRect().height,
			};
		});
		expect(heights.host).toBeCloseTo(HOST_HEIGHT, 0);
		// Wrapper fills the host (border-box accounts for the 1px border).
		expect(Math.round(heights.wrapper)).toBe(HOST_HEIGHT);
	});

	test('content scrolls when overflowing while toolbar stays pinned', async ({ page, editor }) => {
		// Insert enough lines to overflow the 280px host.
		const lines: string[] = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
		await editor.setJSON({
			children: lines.map((text) => ({
				type: 'paragraph',
				children: [{ text }],
			})),
		});

		const layout = await page.evaluate(() => {
			const host = document.querySelector('notectl-editor') as HTMLElement;
			const root = host.shadowRoot as ShadowRoot;
			const toolbar = root.querySelector('.notectl-plugin-container--top') as HTMLElement;
			const content = root.querySelector('.notectl-content') as HTMLElement;
			return {
				toolbarTop: toolbar.getBoundingClientRect().top,
				contentScrollHeight: content.scrollHeight,
				contentClientHeight: content.clientHeight,
				contentOverflowY: getComputedStyle(content).overflowY,
			};
		});

		expect(layout.contentOverflowY).toBe('auto');
		expect(layout.contentScrollHeight).toBeGreaterThan(layout.contentClientHeight);

		// Scroll the content programmatically and ensure the toolbar does not move.
		await page.evaluate(() => {
			const host = document.querySelector('notectl-editor') as HTMLElement;
			const content = host.shadowRoot?.querySelector('.notectl-content') as HTMLElement;
			content.scrollTop = 200;
		});

		const after = await page.evaluate(() => {
			const host = document.querySelector('notectl-editor') as HTMLElement;
			const root = host.shadowRoot as ShadowRoot;
			const toolbar = root.querySelector('.notectl-plugin-container--top') as HTMLElement;
			const content = root.querySelector('.notectl-content') as HTMLElement;
			return {
				toolbarTop: toolbar.getBoundingClientRect().top,
				scrollTop: content.scrollTop,
			};
		});

		expect(after.scrollTop).toBeGreaterThan(0);
		expect(after.toolbarTop).toBeCloseTo(layout.toolbarTop, 0);
	});

	test('--notectl-content-max-height limits content area without host height', async ({
		page,
		editor,
	}) => {
		// Reset host height; switch to the variable approach.
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor') as HTMLElement;
			el.style.height = '';
			el.style.setProperty('--notectl-content-max-height', '180px');
			el.style.setProperty('--notectl-content-min-height', '0px');
		});

		const lines: string[] = Array.from({ length: 30 }, (_, i) => `paragraph ${i + 1}`);
		await editor.setJSON({
			children: lines.map((text) => ({
				type: 'paragraph',
				children: [{ text }],
			})),
		});

		const measurements = await page.evaluate(() => {
			const host = document.querySelector('notectl-editor') as HTMLElement;
			const content = host.shadowRoot?.querySelector('.notectl-content') as HTMLElement;
			const padding: CSSStyleDeclaration = getComputedStyle(content);
			return {
				clientHeight: content.clientHeight,
				scrollHeight: content.scrollHeight,
				maxHeight: padding.maxHeight,
				paddingTop: Number.parseFloat(padding.paddingTop),
				paddingBottom: Number.parseFloat(padding.paddingBottom),
			};
		});

		// max-height applies to the content box; clientHeight includes padding.
		const padding: number = measurements.paddingTop + measurements.paddingBottom;
		expect(measurements.maxHeight).toBe('180px');
		expect(measurements.clientHeight).toBeLessThanOrEqual(180 + padding + 1);
		expect(measurements.scrollHeight).toBeGreaterThan(measurements.clientHeight);
	});
});
