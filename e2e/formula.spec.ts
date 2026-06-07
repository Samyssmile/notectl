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

	test('pasting two standalone inline formulas inserts both (issue #159)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// Two formulas separated only by whitespace: the interceptor used to claim the
		// paste but insert only the first, silently dropping the rest.
		const html = '<math><mi>x</mi></math> <math><mi>y</mi></math>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x y' });

		await expect(page.locator('.notectl-math--inline')).toHaveCount(2);
	});

	test('pasting two standalone display formulas inserts both blocks (issue #159)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		const html = '<math display="block"><mi>x</mi></math> <math display="block"><mi>y</mi></math>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x y' });

		await expect(page.locator('.notectl-math--display')).toHaveCount(2);
	});

	test('pasting two MathJax formulas inserts two, not four (issue #159)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// Each MathJax formula ships the real <math> plus an aria-hidden assistive copy.
		// Both formulas must appear exactly once: the hidden duplicates are not inserted.
		const formula = (value: string): string => {
			const math = `<math><mi>${value}</mi></math>`;
			const assistive = `<mjx-assistive-mml aria-hidden="true">${math}</mjx-assistive-mml>`;
			return `<mjx-container class="MathJax">${math}${assistive}</mjx-container>`;
		};
		const html = `${formula('x')} ${formula('y')}`;
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x y' });

		await expect(page.locator('.notectl-math--inline')).toHaveCount(2);
	});

	test('pasting mixed HTML with inline math amid text preserves the formula (issue A1)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// Text on BOTH sides of <math>: NOT a standalone formula, so FormulaPasteInterceptor
		// declines and the content flows through the general HTML paste pipeline
		// (HTMLParser → ContentSlice → PasteCommand). The inline formula must survive
		// interleaved with the surrounding text instead of being flattened to token text.
		const html =
			'<p>before <math display="inline"><semantics><mrow><msup><mi>a</mi><mn>2</mn></msup></mrow>' +
			'<annotation encoding="application/x-tex">a^2</annotation></semantics></math> after</p>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'before a^2 after' });

		// The formula survived as a real, editable inline node...
		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		expect(JSON.stringify(await editor.getJSON())).toContain('a^2');
		// ...interleaved with the surrounding text inside a single block.
		const block = page
			.locator('[data-block-id]')
			.filter({ has: page.locator('.notectl-math--inline') });
		await expect(block).toContainText('before');
		await expect(block).toContainText('after');
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

	test('a malicious payload smuggled beside pasted MathML cannot execute script', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// A hostile page can place arbitrary HTML on the clipboard. Shaped like a KaTeX
		// fragment (a real <math> plus an aria-hidden visual layer) so the interceptor
		// claims it as a standalone formula, but the visual layer smuggles an
		// <img onerror>. The raw, pre-sanitization HTML must be parsed inertly, so the
		// handler never runs.
		const html =
			'<span class="katex"><span class="katex-mathml"><math><semantics>' +
			'<mrow><mi>x</mi></mrow>' +
			'<annotation encoding="application/x-tex">x</annotation></semantics></math></span>' +
			'<span class="katex-html" aria-hidden="true">' +
			'<img src="totally-invalid-xyz" onerror="window.__formulaPasteXss = true"></span></span>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x' });

		// The formula is still claimed and inserted as a node...
		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		// ...and the smuggled image error handler never executed.
		await page.waitForTimeout(300);
		const xss = await page.evaluate(
			() => (window as Window & { __formulaPasteXss?: boolean }).__formulaPasteXss === true,
		);
		expect(xss).toBe(false);
	});

	test('a dangerous payload INSIDE pasted MathML is stripped by sanitization', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// The hostile content rides INSIDE the <math> itself: an event handler on an
		// operator, a <script> in an mtext integration point, and an annotation-xml
		// HTML-injection. DOMPurify must drop all of it before the MathML is stored
		// and re-rendered via innerHTML (the classic MathML mutation-XSS surface).
		const html =
			'<math><semantics><mrow><mi>x</mi>' +
			'<mo onclick="window.__inMathXss = true">+</mo></mrow>' +
			'<mtext><script>window.__inMathXss = true</script></mtext>' +
			'<annotation-xml encoding="text/html">' +
			'<img src="invalid-xyz" onerror="window.__inMathXss = true"></annotation-xml>' +
			'</semantics></math>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x' });

		// The formula is still claimed and inserted...
		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		// ...nothing executed...
		await page.waitForTimeout(300);
		const xss = await page.evaluate(
			() => (window as Window & { __inMathXss?: boolean }).__inMathXss === true,
		);
		expect(xss).toBe(false);

		// ...and the stored MathML carries none of the dangerous markup.
		const json = JSON.stringify(await editor.getJSON()).toLowerCase();
		expect(json).not.toContain('onclick');
		expect(json).not.toContain('onerror');
		expect(json).not.toContain('<script');
		expect(json).not.toContain('<img');
		expect(json).not.toContain('annotation-xml');
		// The legitimate content survives.
		expect(json).toContain('<mi>x</mi>');
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

	test('the formula editor has a size control that sets the font-size and round-trips on edit', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });

		const sizeSelect = page.locator('.notectl-formula-editor__size');
		await expect(sizeSelect).toHaveCount(1);

		await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
		await input.fill('\\frac{2}{3}');
		await sizeSelect.selectOption('48px');
		await page.locator('.notectl-formula-editor__btn--primary').click();
		await page.waitForTimeout(150);

		const renderedSize = await page.evaluate(() => {
			const host = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-math--display') as HTMLElement | null;
			return host ? getComputedStyle(host).fontSize : 'none';
		});
		expect(renderedSize).toBe('48px');

		// Re-open the editor: the size control reflects the stored size (round-trip).
		await page.locator('.notectl-math--display').first().dblclick();
		const overlaySize = page.locator('.notectl-formula-overlay .notectl-formula-editor__size');
		await overlaySize.waitFor({ state: 'visible' });
		await expect(overlaySize).toHaveValue('48px');
	});

	test('a selected inline formula is visibly highlighted (not user-select:none)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.typeText('$x^2$');
		await page.waitForTimeout(100);
		await page.keyboard.press('Shift+ArrowLeft'); // select the inline atom
		await page.waitForTimeout(80);
		const userSelect = await page.evaluate(() => {
			const atom = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-math--inline') as HTMLElement | null;
			return atom ? getComputedStyle(atom).userSelect : 'none';
		});
		expect(userSelect).not.toBe('none');
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

		// Tab moves to the description field within the dialog; the popup stays open.
		await page.keyboard.press('Tab');
		expect(await active()).toBe('INPUT.notectl-formula-editor__alt');
		await expect(input).toBeVisible();

		// Tab reaches the size control (still inside the dialog).
		await page.keyboard.press('Tab');
		expect(await active()).toBe('SELECT.notectl-formula-editor__size');
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

	test('a formula font size survives a getContentHTML → setContentHTML round-trip (issue #160)', async ({
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

		// Author a display formula sized to 48px via the editor's own size control.
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
		await input.fill('\\frac{2}{3}');
		await page.locator('.notectl-formula-editor__size').selectOption('48px');
		await page.locator('.notectl-formula-editor__btn--primary').click();
		await page.waitForTimeout(150);
		expect(await displayFontSize()).toBe('48px');

		// The exported HTML carries the size as native mathsize...
		const html = await editor.getContentHTML();
		expect(html).toContain('mathsize="48px"');

		// ...and reloading that HTML keeps the size (the round-trip the bug broke).
		await editor.setContentHTML(html);
		await page.waitForTimeout(150);
		expect(await displayFontSize()).toBe('48px');
	});

	test('pasting external MathML with a mathsize preserves the formula size (issue #160)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		// Foreign tools (KaTeX/MathJax/Word) express a formula's size as native mathsize.
		const html =
			'<math mathsize="40px"><semantics><mrow><mi>x</mi></mrow>' +
			'<annotation encoding="application/x-tex">x</annotation></semantics></math>';
		await editor.pasteClipboardData({ 'text/html': html, 'text/plain': 'x' });

		await expect(page.locator('.notectl-math--inline')).toHaveCount(1);
		await page.waitForTimeout(100);
		const renderedSize = await page.evaluate(() => {
			const host = document
				.querySelector('notectl-editor')
				?.shadowRoot?.querySelector('.notectl-math--inline') as HTMLElement | null;
			return host ? getComputedStyle(host).fontSize : 'none';
		});
		expect(renderedSize).toBe('40px');
		// It also re-exports with the size intact.
		expect(await editor.getContentHTML()).toContain('mathsize="40px"');
	});

	test('a formula font size also survives CSS-class export mode (issue #160)', async ({
		editor,
		page,
	}) => {
		// Author a display formula sized to 48px.
		await editor.focus();
		await editor.root.locator('[aria-label="Insert formula"]').click();
		const input = page.locator('.notectl-formula-editor__input');
		await input.waitFor({ state: 'visible' });
		await page.locator('.notectl-formula-editor__toggle input[type="checkbox"]').check();
		await input.fill('\\frac{2}{3}');
		await page.locator('.notectl-formula-editor__size').selectOption('48px');
		await page.locator('.notectl-formula-editor__btn--primary').click();
		await page.waitForTimeout(150);

		// Class mode strips inline `style`, but the size rides on the native `mathsize`
		// attribute, so it survives where a `style="font-size"` would have been dropped.
		const classHtml = await page.evaluate(async () => {
			const ed = document.querySelector('notectl-editor') as unknown as {
				getContentHTML(options: { cssMode: 'classes' }): Promise<{ html: string }>;
			};
			return (await ed.getContentHTML({ cssMode: 'classes' })).html;
		});
		expect(classHtml).toContain('mathsize="48px"');
		expect(classHtml).not.toContain('font-size');
	});
});
