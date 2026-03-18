import { expect, test } from './fixtures/editor-page';

/**
 * Regression test for GitHub issue #68 (point 4): dropdown menus misposition
 * when the editor lives inside a container that establishes a new containing
 * block for `position: fixed` elements.
 *
 * Root cause: `positionPopup()` uses `position: fixed` with viewport-relative
 * coordinates, but popups live in the shadow root inside the editor element.
 * When an ancestor has `transform`, `filter`, `perspective`, or `will-change`,
 * CSS resolves `fixed` offsets relative to that ancestor instead of the
 * viewport — causing the popup to appear offset from its trigger.
 *
 * Note: plain `position: relative/absolute` alone do NOT break `fixed`
 * positioning per CSS spec. Bootstrap Modals and Gridstack trigger this bug
 * because they use `transform` for animations/layout — not because of their
 * `position` property.
 */
test.describe('Dropdown position in positioned containers (#68)', () => {
	/** Maximum allowed pixel drift between trigger and popup. */
	const MAX_OFFSET_DRIFT = 10;

	/**
	 * Returns viewport-relative bounding boxes of the first visible popup
	 * and the trigger button that opened it.
	 */
	async function measurePopupAlignment(page: import('@playwright/test').Page, toolbarItem: string) {
		return page.evaluate((item: string) => {
			const editor = document.querySelector('notectl-editor');
			if (!editor?.shadowRoot) return null;

			const btn = editor.shadowRoot.querySelector(
				`button[data-toolbar-item="${item}"]`,
			) as HTMLElement | null;
			const popup = editor.shadowRoot.querySelector('.notectl-toolbar-popup') as HTMLElement | null;

			if (!btn || !popup) return null;

			const btnRect = btn.getBoundingClientRect();
			const popupRect = popup.getBoundingClientRect();

			return {
				button: {
					top: btnRect.top,
					bottom: btnRect.bottom,
					left: btnRect.left,
					right: btnRect.right,
				},
				popup: {
					top: popupRect.top,
					bottom: popupRect.bottom,
					left: popupRect.left,
					right: popupRect.right,
				},
			};
		}, toolbarItem);
	}

	/** Opens the heading dropdown and asserts correct alignment. */
	async function openDropdownAndAssertAlignment(
		editor: Awaited<Parameters<Parameters<typeof test>[2]>[0]['editor']>,
		page: import('@playwright/test').Page,
	): Promise<void> {
		await editor.typeText('Hello');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		const rects = await measurePopupAlignment(page, 'heading');
		if (!rects) {
			expect.fail('Could not measure popup alignment — button or popup not found');
			return;
		}

		const verticalGap: number = rects.popup.top - rects.button.bottom;
		expect(
			verticalGap,
			`Popup should appear directly below the button (gap: ${verticalGap}px)`,
		).toBeGreaterThanOrEqual(0);
		expect(
			verticalGap,
			`Popup drifted ${verticalGap}px below button — expected ≤${MAX_OFFSET_DRIFT}px`,
		).toBeLessThanOrEqual(MAX_OFFSET_DRIFT);

		const horizontalDrift: number = Math.abs(rects.popup.left - rects.button.left);
		expect(
			horizontalDrift,
			`Popup drifted ${horizontalDrift}px horizontally — expected ≤${MAX_OFFSET_DRIFT}px`,
		).toBeLessThanOrEqual(MAX_OFFSET_DRIFT);
	}

	// -- Baseline: these pass today and prove the popup works in simple layouts --

	test('baseline: popup aligns correctly inside a position:relative container', async ({
		editor,
		page,
	}) => {
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			if (!container) return;

			const wrapper = document.createElement('div');
			wrapper.style.cssText =
				'position: relative; margin-top: 120px; padding: 20px; border: 1px solid #ccc;';
			container.parentElement?.insertBefore(wrapper, container);
			wrapper.appendChild(container);
		});

		await openDropdownAndAssertAlignment(editor, page);
	});

	test('baseline: popup aligns correctly inside a position:absolute container', async ({
		editor,
		page,
	}) => {
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			if (!container) return;

			const wrapper = document.createElement('div');
			wrapper.style.cssText =
				'position: absolute; top: 100px; left: 50px; right: 50px; padding: 20px;';
			container.parentElement?.insertBefore(wrapper, container);
			wrapper.appendChild(container);
		});

		await openDropdownAndAssertAlignment(editor, page);
	});

	// -- Bug reproductions: these fail today and prove the bug from #68 --

	test('popup aligns correctly inside a transform container', async ({ editor, page }) => {
		// CSS `transform` on an ancestor creates a new containing block for
		// `position: fixed`, breaking viewport-relative positioning.
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			if (!container) return;

			const wrapper = document.createElement('div');
			wrapper.style.cssText = 'transform: translateY(0); padding: 20px; margin-top: 80px;';
			container.parentElement?.insertBefore(wrapper, container);
			wrapper.appendChild(container);
		});

		await openDropdownAndAssertAlignment(editor, page);
	});

	test('popup aligns correctly inside a Bootstrap-modal-like container', async ({
		editor,
		page,
	}) => {
		// Simulates a Bootstrap modal: centered, position:fixed, with a
		// transform on the dialog (which breaks inner fixed positioning).
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			if (!container) return;

			// Modal backdrop
			const backdrop = document.createElement('div');
			backdrop.style.cssText =
				'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3);';

			// Modal dialog (transform is what Bootstrap uses for animation)
			const dialog = document.createElement('div');
			dialog.style.cssText =
				'position: relative; transform: translate(0, 0); background: #fff; border-radius: 8px; padding: 24px; width: 800px; max-height: 80vh; overflow: auto;';

			backdrop.appendChild(dialog);
			document.body.appendChild(backdrop);
			dialog.appendChild(container);
		});

		await openDropdownAndAssertAlignment(editor, page);
	});

	test('popup aligns correctly inside a will-change:transform container', async ({
		editor,
		page,
	}) => {
		// `will-change: transform` also creates a new containing block —
		// commonly applied by animation libraries and frameworks.
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			if (!container) return;

			const wrapper = document.createElement('div');
			wrapper.style.cssText = 'will-change: transform; padding: 20px; margin-top: 80px;';
			container.parentElement?.insertBefore(wrapper, container);
			wrapper.appendChild(container);
		});

		await openDropdownAndAssertAlignment(editor, page);
	});
});
