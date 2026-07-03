import { expect, test } from './fixtures/editor-page';
import { insertTable } from './fixtures/table-utils';

/**
 * Regression proof for issue #202.
 *
 * A consumer styles the editor's table via the exposed shadow parts from the
 * host page, e.g.:
 *
 *   notectl-editor::part(table-cell) { padding: 0; }
 *
 * This works in the live editor because `::part()` pierces the shadow boundary
 * and, per the shadow-tree cascade, an outer normal declaration wins over the
 * shadow tree's own rule regardless of specificity. The print pipeline, however,
 * clones `.notectl-content` out of the shadow DOM into a plain iframe document
 * where `::part()` can no longer match, and it only collects the shadow root's
 * adopted stylesheets, never the host page's own stylesheets. So the consumer's
 * part styling is silently dropped in print.
 *
 * The `padding` property is deliberately chosen because the editor's own
 * `.notectl-table td { padding: 8px 12px }` rule (specificity 0,1,1) competes
 * with it. A naive translation to `[part~="table-cell"]` (specificity 0,1,0)
 * would lose that fight, so this test also guards that the fix carries genuine
 * override power, not just a matching selector.
 *
 * `::part()` cannot be exercised in happy-dom (its CSS parser drops the rule),
 * so this behaviour can only be proven in a real browser.
 */

const HOST_PART_CSS = 'notectl-editor::part(table-cell) { padding: 0px; }';

interface PartCssProbe {
	readonly livePaddingTop: string;
	readonly printPaddingTop: string;
	readonly printHasPartCellSelector: boolean;
	readonly printHasRawPartPseudo: boolean;
}

test.describe('Print — host ::part() CSS (issue #202)', () => {
	test('carries host ::part(table-cell) styling into print output', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const probe: PartCssProbe = await page.evaluate(
			({ css, cssId }) => {
				type PrintService = { toHTML(options: Record<string, unknown>): string };
				type EditorEl = HTMLElement & {
					getService(key: { id: string }): PrintService | undefined;
				};

				// Inject the host-page ::part() rule into the top document.
				const style: HTMLStyleElement = document.createElement('style');
				style.id = cssId;
				style.textContent = css;
				document.head.appendChild(style);

				const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
				if (!editorEl) throw new Error('editor element missing');

				// 1) Live editor: the ::part() rule must override the editor's own
				//    cell padding (proves the setup is valid and that ::part wins).
				const liveCell = editorEl.shadowRoot?.querySelector<HTMLElement>('[part~="table-cell"]');
				const livePaddingTop = liveCell ? getComputedStyle(liveCell).paddingTop : 'NO_LIVE_CELL';

				// 2) Print output: render it and read the cloned cell's computed style.
				const printService = editorEl.getService({ id: 'print' });
				if (!printService) throw new Error('print service missing');
				const printHTML: string = printService.toHTML({});

				const frame: HTMLIFrameElement = document.createElement('iframe');
				frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
				document.body.appendChild(frame);
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				frameDoc.open();
				frameDoc.write(printHTML);
				frameDoc.close();

				const printCell = frameDoc.querySelector<HTMLElement>('[part~="table-cell"]');
				const printPaddingTop = printCell
					? frameWin.getComputedStyle(printCell).paddingTop
					: 'NO_PRINT_CELL';

				frame.remove();
				document.getElementById(cssId)?.remove();

				return {
					livePaddingTop,
					printPaddingTop,
					printHasPartCellSelector: printHTML.includes('[part~="table-cell"]'),
					printHasRawPartPseudo: printHTML.includes('::part(table-cell)'),
				};
			},
			{ css: HOST_PART_CSS, cssId: 'notectl-202-host-part-css' },
		);

		// Setup validity: the ::part() rule genuinely overrides the cell padding
		// in the live editor (0px instead of the built-in 8px).
		expect(probe.livePaddingTop, 'host ::part() rule must apply in the live editor').toBe('0px');

		// The bug: the same styling must survive into the print output.
		// Red while #202 is open, green once the fix carries host ::part() rules
		// into print with enough override power to beat the editor's own cell rule.
		expect(
			probe.printPaddingTop,
			`print output dropped the host ::part() styling (diagnostics: ${JSON.stringify({
				printHasPartCellSelector: probe.printHasPartCellSelector,
				printHasRawPartPseudo: probe.printHasRawPartPseudo,
			})})`,
		).toBe('0px');
	});

	test('PrintOptions.customCSS can override the editor cell padding', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// The reporter also tried customCSS. It failed because a bare
		// `[part~="table-cell"]` (0,1,0) loses to the editor's own `.notectl-table td`
		// (0,1,1). With the base styles behind a cascade layer, unlayered customCSS
		// wins regardless of specificity.
		const printPaddingTop: string = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};

			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');

			const printHTML: string = printService.toHTML({
				customCSS: '[part~="table-cell"] { padding: 0px; }',
			});

			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
			document.body.appendChild(frame);
			const frameDoc = frame.contentDocument;
			const frameWin = frame.contentWindow;
			if (!frameDoc || !frameWin) throw new Error('iframe document missing');
			frameDoc.open();
			frameDoc.write(printHTML);
			frameDoc.close();

			const printCell = frameDoc.querySelector<HTMLElement>('[part~="table-cell"]');
			const value = printCell ? frameWin.getComputedStyle(printCell).paddingTop : 'NO_PRINT_CELL';
			frame.remove();
			return value;
		});

		expect(printPaddingTop, 'customCSS must override the editor cell padding in print').toBe('0px');
	});

	test('editor base styles still apply in print when nothing overrides them', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Regression guard for the cascade-layer change: with no host ::part() or
		// customCSS override, the layered base rule (.notectl-table td { padding: 8px 12px })
		// must still apply, so the cell keeps its built-in padding.
		const printPaddingTop: string = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};

			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');

			const printHTML: string = printService.toHTML({});

			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
			document.body.appendChild(frame);
			const frameDoc = frame.contentDocument;
			const frameWin = frame.contentWindow;
			if (!frameDoc || !frameWin) throw new Error('iframe document missing');
			frameDoc.open();
			frameDoc.write(printHTML);
			frameDoc.close();

			const printCell = frameDoc.querySelector<HTMLElement>('[part~="table-cell"]');
			const value = printCell ? frameWin.getComputedStyle(printCell).paddingTop : 'NO_PRINT_CELL';
			frame.remove();
			return value;
		});

		expect(printPaddingTop, 'base cell padding must survive inside the cascade layer').toBe('8px');
	});
});
