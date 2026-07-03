import type { Page } from '@playwright/test';
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
 * where `::part()` can no longer match, so the plugin translates host `::part()`
 * rules into `[part~="..."]` attribute selectors and places the editor's own
 * base styles behind a cascade layer so the carried rules win.
 *
 * The `padding` property is deliberately chosen because the editor's own
 * `.notectl-table td { padding: 8px 12px }` rule (specificity 0,1,1) competes
 * with it: a naive translation to `[part~="table-cell"]` (specificity 0,1,0)
 * would lose that fight without the cascade layer.
 *
 * `::part()` cannot be exercised in happy-dom (its CSS parser drops the rule),
 * so this behaviour can only be proven in a real browser.
 */

/** A host-page stylesheet to inject for the duration of one probe. */
interface HostSheetInit {
	readonly css: string;
	readonly media?: string;
	readonly disabled?: boolean;
}

interface PrintCellProbeArgs {
	readonly hostSheets?: readonly HostSheetInit[];
	readonly printOptions?: Record<string, unknown>;
	/** Computed properties (kebab-case) to read from the printed table cell. */
	readonly properties: readonly string[];
	/** Also read the same properties from the live editor's table cell. */
	readonly readLive?: boolean;
}

interface PrintCellProbeResult {
	readonly printStyles: Record<string, string>;
	readonly liveStyles: Record<string, string>;
	readonly html: string;
}

/**
 * Injects the given host stylesheets, renders the print output into a hidden
 * iframe, and reads computed styles from the printed (and optionally the live)
 * table cell. All injected DOM is cleaned up before returning.
 */
async function probePrintCell(page: Page, args: PrintCellProbeArgs): Promise<PrintCellProbeResult> {
	return page.evaluate((input: PrintCellProbeArgs): PrintCellProbeResult => {
		type PrintService = { toHTML(options: Record<string, unknown>): string };
		type EditorEl = HTMLElement & {
			getService(key: { id: string }): PrintService | undefined;
		};

		const styleEls: HTMLStyleElement[] = [];
		for (const sheetInit of input.hostSheets ?? []) {
			const style: HTMLStyleElement = document.createElement('style');
			if (sheetInit.media) style.media = sheetInit.media;
			style.textContent = sheetInit.css;
			document.head.appendChild(style);
			if (sheetInit.disabled && style.sheet) style.sheet.disabled = true;
			styleEls.push(style);
		}

		try {
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');

			const liveStyles: Record<string, string> = {};
			if (input.readLive) {
				const liveCell = editorEl.shadowRoot?.querySelector<HTMLElement>('[part~="table-cell"]');
				if (!liveCell) throw new Error('live table cell missing');
				const liveComputed: CSSStyleDeclaration = getComputedStyle(liveCell);
				for (const property of input.properties) {
					liveStyles[property] = liveComputed.getPropertyValue(property);
				}
			}

			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			const html: string = printService.toHTML(input.printOptions ?? {});

			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
			document.body.appendChild(frame);
			try {
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				frameDoc.open();
				frameDoc.write(html);
				frameDoc.close();

				const printCell = frameDoc.querySelector<HTMLElement>('[part~="table-cell"]');
				if (!printCell) throw new Error('print table cell missing');
				const printComputed: CSSStyleDeclaration = frameWin.getComputedStyle(printCell);
				const printStyles: Record<string, string> = {};
				for (const property of input.properties) {
					printStyles[property] = printComputed.getPropertyValue(property);
				}
				return { printStyles, liveStyles, html };
			} finally {
				frame.remove();
			}
		} finally {
			for (const style of styleEls) style.remove();
		}
	}, args);
}

test.describe('Print — host ::part() CSS (issue #202)', () => {
	test('carries host ::part(table-cell) styling into print output', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [{ css: 'notectl-editor::part(table-cell) { padding: 0px; }' }],
			properties: ['padding-top'],
			readLive: true,
		});

		// Setup validity: the ::part() rule genuinely overrides the cell padding
		// in the live editor (0px instead of the built-in 8px).
		expect(
			probe.liveStyles['padding-top'],
			'host ::part() rule must apply in the live editor',
		).toBe('0px');

		// The bug: the same styling must survive into the print output.
		expect(probe.printStyles['padding-top'], 'print output dropped the host ::part() styling').toBe(
			'0px',
		);
	});

	test('PrintOptions.customCSS can override the editor cell padding', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// The reporter also tried customCSS. It failed because a bare
		// `[part~="table-cell"]` (0,1,0) loses to the editor's own `.notectl-table td`
		// (0,1,1). With the base styles behind a cascade layer, unlayered customCSS
		// wins regardless of specificity.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			printOptions: { customCSS: '[part~="table-cell"] { padding: 0px; }' },
			properties: ['padding-top'],
		});

		expect(
			probe.printStyles['padding-top'],
			'customCSS must override the editor cell padding in print',
		).toBe('0px');
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
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			properties: ['padding-top'],
		});

		expect(
			probe.printStyles['padding-top'],
			'base cell padding must survive inside the cascade layer',
		).toBe('8px');
	});

	test('handles commas inside functional pseudo-classes without corrupting later CSS', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// The first rule's prefix contains a comma inside :is(); the second rule
		// carries a comma in a trailing pseudo-class. A naive split(',') would drop
		// the first rule and emit an unbalanced selector for the second, swallowing
		// every rule that follows — including customCSS.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: [
						':is(notectl-editor, .some-other-widget)::part(table-cell) { padding-top: 3px; }',
						'notectl-editor::part(table-cell):is(:hover, :focus-visible) { outline: 1px solid red; }',
					].join('\n'),
				},
			],
			printOptions: { customCSS: '[part~="table-cell"] { padding-bottom: 4px; }' },
			properties: ['padding-top', 'padding-bottom'],
		});

		expect(
			probe.printStyles['padding-top'],
			'::part() rule with an :is() host prefix must be carried',
		).toBe('3px');
		expect(
			probe.printStyles['padding-bottom'],
			'customCSS after a carried rule with commas must stay intact',
		).toBe('4px');
	});

	test('carries ::part() rules nested in @layer blocks and CSS nesting', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: [
						'@layer app { notectl-editor::part(table-cell) { padding-top: 5px; } }',
						'notectl-editor { &::part(table-cell) { padding-left: 6px; } }',
					].join('\n'),
				},
			],
			properties: ['padding-top', 'padding-left'],
		});

		expect(
			probe.printStyles['padding-top'],
			'@layer-nested ::part() rule must be carried (flattened)',
		).toBe('5px');
		expect(probe.printStyles['padding-left'], 'CSS-nested ::part() rule must be carried').toBe(
			'6px',
		);
	});

	test('carries @media-nested ::part() rules wrapped in their condition', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: [
						'@media print { notectl-editor::part(table-cell) { padding-top: 9px; } }',
						'@media (min-width: 10px) { notectl-editor::part(table-cell) { padding-left: 2px; } }',
					].join('\n'),
				},
			],
			properties: ['padding-top', 'padding-left'],
		});

		// The @media print rule is carried but stays wrapped, so it is inactive in
		// the screen-rendered probe iframe and only activates when printing.
		expect(probe.html).toContain('@media print { [part~="table-cell"]');
		expect(
			probe.printStyles['padding-top'],
			'@media print rule must stay conditional in the print document',
		).toBe('8px');
		expect(
			probe.printStyles['padding-left'],
			'matching @media rule must be carried and active',
		).toBe('2px');
	});

	test('resolves var() references via snapshotted host custom properties', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: [
						':root { --cell-pad: 7px; }',
						'notectl-editor::part(table-cell) { padding-top: var(--cell-pad); }',
					].join('\n'),
				},
			],
			properties: ['padding-top'],
		});

		expect(probe.html).toContain('--cell-pad: 7px');
		expect(
			probe.printStyles['padding-top'],
			'carried var() reference must resolve in the print document',
		).toBe('7px');
	});

	test('skips disabled stylesheets and preserves stylesheet media conditions', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: 'notectl-editor::part(table-cell) { padding-top: 11px; }',
					disabled: true,
				},
				{
					css: 'notectl-editor::part(table-cell) { padding-top: 9px; }',
					media: '(max-width: 1px)',
				},
			],
			properties: ['padding-top'],
		});

		expect(probe.html, 'disabled stylesheet rules must not be carried').not.toContain(
			'padding-top: 11px',
		);
		expect(probe.html, 'stylesheet media must be preserved as a wrapper').toContain(
			'@media (max-width: 1px)',
		);
		expect(
			probe.printStyles['padding-top'],
			'neither disabled nor media-mismatched rules may apply',
		).toBe('8px');
	});

	test('carries ::part() rules from same-origin @import stylesheets', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Load a part rule via @import (blob URLs are same-origin) and wait until
		// the imported stylesheet is readable before probing.
		await page.evaluate(async () => {
			const importedCSS = 'notectl-editor::part(table-cell) { padding-top: 4px; }';
			const blobUrl: string = URL.createObjectURL(new Blob([importedCSS], { type: 'text/css' }));
			const style: HTMLStyleElement = document.createElement('style');
			style.id = 'notectl-202-import-css';
			style.textContent = `@import url("${blobUrl}");`;
			document.head.appendChild(style);

			await new Promise<void>((resolve, reject) => {
				const deadline: number = Date.now() + 5000;
				const check = (): void => {
					try {
						const rule = style.sheet?.cssRules[0] as CSSImportRule | undefined;
						if (rule?.styleSheet && rule.styleSheet.cssRules.length > 0) {
							resolve();
							return;
						}
					} catch {
						// import not readable yet
					}
					if (Date.now() > deadline) {
						reject(new Error('@import stylesheet did not load'));
						return;
					}
					setTimeout(check, 25);
				};
				check();
			});
		});

		try {
			const probe: PrintCellProbeResult = await probePrintCell(page, {
				properties: ['padding-top'],
			});
			expect(
				probe.printStyles['padding-top'],
				'::part() rule from an @import stylesheet must be carried',
			).toBe('4px');
		} finally {
			await page.evaluate(() => {
				document.getElementById('notectl-202-import-css')?.remove();
			});
		}
	});
});
