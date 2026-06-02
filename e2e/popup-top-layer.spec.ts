import { expect, test } from './fixtures/editor-page';

/**
 * Regression test for the formula/toolbar popup being trapped below a host-page
 * sibling such as a documentation site's table-of-contents sidebar.
 *
 * Reproduces the exact Starlight layout that triggered the bug:
 *  - the editor sits inside a wrapper with `isolation: isolate`, which forms a
 *    stacking context, and
 *  - a later sibling uses `position: fixed` (like Starlight's `.right-sidebar`).
 *
 * The fixed sibling paints above the entire isolated stacking context, so the
 * popup's high `z-index` cannot lift it out — clicks on the overlapped region
 * hit the sibling and dismiss the popup. Promoting the popup to the browser's
 * top layer (Popover API) is the only thing that escapes the trap.
 */
test.describe('Popup top-layer promotion', () => {
	/**
	 * Wraps `#editor-container` in an `isolation: isolate` stacking context,
	 * mirroring Starlight's `.main-pane`.
	 */
	async function wrapInIsolatedStackingContext(
		page: import('@playwright/test').Page,
	): Promise<void> {
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			const parent = container?.parentElement;
			if (!container || !parent) return;
			const isolate = document.createElement('div');
			isolate.id = 'isolate-wrapper';
			isolate.style.isolation = 'isolate';
			parent.insertBefore(isolate, container);
			isolate.appendChild(container);
		});
	}

	/**
	 * Appends a `position: fixed` overlay as a later sibling of the isolated
	 * wrapper, standing in for Starlight's fixed right sidebar. Because it is a
	 * later sibling outside the isolate context, it paints above everything the
	 * popup can reach with `z-index` alone.
	 */
	async function addFixedSiblingOverlay(page: import('@playwright/test').Page): Promise<void> {
		await page.evaluate(() => {
			const isolate = document.getElementById('isolate-wrapper');
			const parent = isolate?.parentElement;
			if (!isolate || !parent) return;
			const overlay = document.createElement('div');
			overlay.id = 'fake-sidebar';
			overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(255, 0, 0, 0.25);';
			parent.appendChild(overlay);
		});
	}

	test('toolbar popup stays clickable over a fixed host-page sibling', async ({ editor, page }) => {
		await wrapInIsolatedStackingContext(page);
		await editor.typeText('Hello');
		await page.waitForTimeout(100);

		await editor.markButton('heading').click();
		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		// Cover the viewport with the stand-in fixed sidebar AFTER the popup opened.
		await addFixedSiblingOverlay(page);

		const hit = await page.evaluate(() => {
			const editorEl = document.querySelector('notectl-editor');
			const popupEl = editorEl?.shadowRoot?.querySelector(
				'.notectl-toolbar-popup',
			) as HTMLElement | null;
			if (!popupEl) return { ok: false, reason: 'no-popup' };
			const r = popupEl.getBoundingClientRect();
			const x = Math.round(r.left + r.width / 2);
			const y = Math.round(r.top + r.height / 2);
			const top = document.elementFromPoint(x, y);
			// A point over shadow-DOM content resolves to the shadow host. If the
			// fixed sibling were on top instead, it would resolve to #fake-sidebar.
			return {
				ok: top?.tagName === 'NOTECTL-EDITOR',
				topTag: top?.tagName,
				topId: (top as HTMLElement | null)?.id,
			};
		});

		expect(
			hit.ok,
			`Point over the popup resolved to <${hit.topTag} id="${hit.topId}"> — the fixed sibling is covering the popup`,
		).toBe(true);
	});

	test('opening a popup promotes it to the top layer', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.waitForTimeout(100);

		await editor.markButton('heading').click();
		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		const state = await page.evaluate(() => {
			const editorEl = document.querySelector('notectl-editor');
			const popupEl = editorEl?.shadowRoot?.querySelector(
				'.notectl-toolbar-popup',
			) as HTMLElement | null;
			if (!popupEl) return null;
			return {
				popover: popupEl.getAttribute('popover'),
				matchesOpen: popupEl.matches(':popover-open'),
			};
		});

		expect(state?.popover).toBe('manual');
		expect(state?.matchesOpen).toBe(true);
	});
});
