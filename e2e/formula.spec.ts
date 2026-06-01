import { expect, test } from './fixtures/editor-page';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Reads MathML facts out of the editor (shadow DOM aware). */
async function mathInfo(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const ed = document.querySelector('notectl-editor');
		const root: Document | ShadowRoot = ed?.shadowRoot ?? document;
		const inlineEl = root.querySelector('.notectl-math--inline math');
		const displayEl = root.querySelector('.notectl-math--display math');
		const anyMath = root.querySelector('.notectl-math math');
		return {
			inline: root.querySelectorAll('.notectl-math--inline').length,
			display: root.querySelectorAll('.notectl-math--display').length,
			inlineNs: inlineEl?.namespaceURI ?? null,
			displayNs: displayEl?.namespaceURI ?? null,
			fontFamily: anyMath ? getComputedStyle(anyMath as Element).fontFamily : '',
		};
	});
}

test.describe('Formula plugin', () => {
	test.beforeEach(async ({ editor }) => {
		await editor.goto();
	});

	test('inserts an inline formula via the toolbar popup, rendered as native MathML', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();

		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await input.fill('e^{i\\pi} + 1 = 0');
		// Live preview renders MathML.
		await expect(page.locator('.notectl-formula-editor__preview math')).toHaveCount(1);
		await page.locator('.notectl-formula-editor__btn--primary').click();

		const info = await mathInfo(page);
		expect(info.inline).toBe(1);
		expect(info.inlineNs).toBe(MATHML_NS);

		const json = JSON.stringify(await editor.getJSON());
		expect(json).toContain('math_inline');
		expect(json).toContain('application/x-tex');
		// Backslashes are doubled by JSON.stringify, so match the escaped form.
		expect(json).toContain('e^{i\\\\pi} + 1 = 0');
		expect(json).toContain('<msup><mi>e</mi>');
	});

	test('$...$ input rule creates inline math', async ({ editor, page }) => {
		await editor.focus();
		await editor.typeText('$x^2+1$');
		const info = await mathInfo(page);
		expect(info.inline).toBe(1);
		expect(info.inlineNs).toBe(MATHML_NS);
	});

	test('$$...$$ input rule creates a display math block', async ({ editor, page }) => {
		await editor.focus();
		await editor.typeText('$$\\int_0^1 x\\,dx$$');
		const info = await mathInfo(page);
		expect(info.display).toBe(1);
		expect(info.displayNs).toBe(MATHML_NS);
	});

	test('clicking an inline formula opens the edit overlay and updates it', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.typeText('$a+b$');
		await page.locator('.notectl-math--inline').first().click();

		const input = page.locator('.notectl-formula-overlay .notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await expect(input).toHaveValue('a+b');

		// The overlay must be styled and positioned (mounted in shadow DOM, not body).
		const style = await page.locator('.notectl-formula-overlay').evaluate((el) => {
			const cs = getComputedStyle(el);
			return {
				position: cs.position,
				border: cs.borderTopWidth,
				top: el.getBoundingClientRect().top,
			};
		});
		expect(style.position).toBe('fixed');
		expect(style.border).not.toBe('0px');
		expect(style.top).toBeGreaterThan(0);

		await input.fill('a-b');
		await page.locator('.notectl-formula-overlay .notectl-formula-editor__btn--primary').click();

		const json = JSON.stringify(await editor.getJSON());
		expect(json).toContain('a-b');
		expect(json).not.toContain('"latex":"a+b"');
	});

	test('pasting MathML inserts an editable formula node', async ({ editor, page }) => {
		await editor.focus();
		const html =
			'<math display="inline"><semantics><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow>' +
			'<annotation encoding="application/x-tex">\\frac{1}{2}</annotation></semantics></math>';
		// Real math sources (KaTeX/MathJax/Word) put both text/html and text/plain on the
		// clipboard; the editor only runs paste interceptors when text/plain is present.
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': '\\frac{1}{2}' });

		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		const json = JSON.stringify(await editor.getJSON());
		expect(json).toContain('\\\\frac{1}{2}');
	});

	test('pasting a KaTeX clipboard fragment (visual layer + assistive math) works', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		const katex =
			'<span class="katex"><span class="katex-mathml"><math><semantics>' +
			'<mrow><msup><mi>a</mi><mn>2</mn></msup></mrow>' +
			'<annotation encoding="application/x-tex">a^2</annotation></semantics></math></span>' +
			'<span class="katex-html" aria-hidden="true"><span class="base">a²</span></span></span>';
		await editor.pasteClipboardData({ 'text/html': katex, 'text/plain': 'a^2' });

		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		const json = JSON.stringify(await editor.getJSON());
		expect(json).toContain('a^2');
		// The aria-hidden visual layer must NOT leak in as stray text.
		expect(await editor.getText()).not.toContain('a²');
	});

	test('blackboard-bold renders as a real Unicode glyph (no mathvariant reliance)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await input.fill('\\mathbb{R}');
		await page.locator('.notectl-formula-editor__btn--primary').click();

		const json = JSON.stringify(await editor.getJSON());
		// ℝ = U+211D, emitted as a literal glyph rather than mathvariant="double-struck".
		expect(json).toContain('ℝ');
	});

	test('the bundled MATH font is applied to rendered formulas', async ({ editor, page }) => {
		await editor.focus();
		await editor.typeText('$x$');
		const info = await mathInfo(page);
		expect(info.fontFamily.toLowerCase()).toContain('notectl math');
	});

	test('undo removes an inserted formula', async ({ editor, page }) => {
		await editor.focus();
		await editor.typeText('$x^2$');
		expect((await mathInfo(page)).inline).toBe(1);
		await page.keyboard.press('Control+z');
		expect((await mathInfo(page)).inline).toBe(0);
	});

	test('selecting a formula (incl. via Ctrl+A) and picking a Font Size resizes it', async ({
		editor,
		page,
	}) => {
		const displayFontSize = (): Promise<string> =>
			page.evaluate(() => {
				const host = document
					.querySelector('notectl-editor')
					?.shadowRoot?.querySelector('.notectl-math--display') as HTMLElement | null;
				return host ? getComputedStyle(host).fontSize : 'none';
			});

		// Insert a display formula via the toolbar popup (display toggle).
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
		await input.fill('\\frac{2}{3}');
		await page.locator('.notectl-formula-editor__btn--primary').click();
		await page.waitForTimeout(150);
		expect(await displayFontSize()).toBe('16px');

		// The user's gesture: focus the editor, Ctrl+A, then pick a size.
		await editor.content.click();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(50);

		await editor.root.locator('[data-toolbar-item="fontSize"]').click();
		await page.waitForTimeout(100);
		await editor.root
			.locator('button[role="option"]')
			.filter({ hasText: /^48$/ })
			.first()
			.click({ force: true });
		await page.waitForTimeout(100);

		expect(await displayFontSize()).toBe('48px');
	});

	test('the formula popup keeps keyboard focus inside the dialog and starts on the LaTeX field', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await page.waitForTimeout(250); // let the popup's auto-focus settle

		const active = (): Promise<string> =>
			page.evaluate(() => {
				const ed = document.querySelector('notectl-editor');
				let el = ed?.shadowRoot?.activeElement as Element | null;
				while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
				return el ? `${el.tagName}.${(el.className || '').toString().split(' ')[0]}` : 'null';
			});
		const focusInContent = (): Promise<boolean> =>
			page.evaluate(() => {
				const ed = document.querySelector('notectl-editor');
				let el = ed?.shadowRoot?.activeElement as Element | null;
				while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
				return !!el?.closest('.notectl-content');
			});

		// Initial focus is the LaTeX authoring field, not the description input.
		expect(await active()).toBe('TEXTAREA.notectl-formula-editor__input');

		// Tab moves to the next field within the dialog; the popup stays open.
		await page.keyboard.press('Tab');
		expect(await active()).toBe('INPUT.notectl-formula-editor__alt');
		await expect(input).toBeVisible();

		// Tab continues to the display-equation checkbox (still inside the dialog).
		await page.keyboard.press('Tab');
		const onCheckbox = await page.evaluate(() => {
			const ed = document.querySelector('notectl-editor');
			let el = ed?.shadowRoot?.activeElement as Element | null;
			while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
			return (el as HTMLInputElement | null)?.type === 'checkbox';
		});
		expect(onCheckbox).toBe(true);
		await expect(input).toBeVisible();

		// Focus never escaped into the editor content.
		expect(await focusInContent()).toBe(false);

		// Escape closes the popup from any field (focus is on the checkbox here).
		await page.keyboard.press('Escape');
		await expect(input).toBeHidden();
	});

	test('the editor is keyboard accessible: labelled field and roving-tabindex palette', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();

		// LaTeX field has an associated <label>.
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		const inputId = await input.getAttribute('id');
		expect(inputId).toBeTruthy();
		await expect(page.locator(`label[for="${inputId}"]`)).toHaveCount(1);

		// Structural palette is a toolbar; exactly one button is tabbable (roving tabindex).
		const palette = page.locator('.notectl-math-palette[role="toolbar"]');
		await expect(palette).toHaveCount(1);
		const tabbable = palette.locator('button[tabindex="0"]');
		await expect(tabbable).toHaveCount(1);
		// A palette button inserts a snippet into the field.
		await palette.locator('button').first().click();
		await expect(input).not.toHaveValue('');
	});
});
