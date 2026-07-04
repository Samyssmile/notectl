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
 * The print document preserves the editor's shadow boundary via declarative
 * shadow DOM and copies the host page's stylesheets verbatim (in the
 * `notectl-host` cascade layer), so `::part()`, specificity, custom
 * properties, `@media`/`@layer`/`@supports`, CSS nesting, and `@import` all
 * behave exactly as in the live editor — no translation, no emulation.
 *
 * The `padding` property is deliberately chosen because the editor's own
 * `.notectl-table td { padding: 8px 12px }` shadow rule competes with it; per
 * the shadow-tree cascade an outer normal declaration must win regardless of
 * specificity.
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
	/** Computed properties to read from the printed host element. */
	readonly hostProperties?: readonly string[];
	/** Class added to the live page's <html> for the duration of the probe. */
	readonly rootClass?: string;
}

interface PrintCellProbeResult {
	readonly printStyles: Record<string, string>;
	readonly liveStyles: Record<string, string>;
	readonly hostStyles: Record<string, string>;
	readonly html: string;
}

/**
 * Injects the given host stylesheets, renders the print output into a hidden
 * iframe, and reads computed styles from the printed table cell (inside the
 * declarative shadow root), the printed host element, and optionally the live
 * editor. All injected DOM is cleaned up before returning.
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
		if (input.rootClass) document.documentElement.classList.add(input.rootClass);

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

				const printHost = frameDoc.querySelector<HTMLElement>('notectl-editor');
				if (!printHost) throw new Error('print host element missing');
				const printShadow = printHost.shadowRoot;
				if (!printShadow) throw new Error('declarative shadow root missing in print output');

				const printCell = printShadow.querySelector<HTMLElement>('[part~="table-cell"]');
				if (!printCell) throw new Error('print table cell missing');
				const printComputed: CSSStyleDeclaration = frameWin.getComputedStyle(printCell);
				const printStyles: Record<string, string> = {};
				for (const property of input.properties) {
					printStyles[property] = printComputed.getPropertyValue(property);
				}

				const hostComputed: CSSStyleDeclaration = frameWin.getComputedStyle(printHost);
				const hostStyles: Record<string, string> = {};
				for (const property of input.hostProperties ?? []) {
					hostStyles[property] = hostComputed.getPropertyValue(property);
				}

				return { printStyles, liveStyles, hostStyles, html };
			} finally {
				frame.remove();
			}
		} finally {
			for (const style of styleEls) style.remove();
			if (input.rootClass) document.documentElement.classList.remove(input.rootClass);
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

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			properties: ['padding-top'],
		});

		expect(
			probe.printStyles['padding-top'],
			'base cell padding must survive inside the cascade layer',
		).toBe('8px');
	});

	test('supports bare ::part() selectors without a host prefix', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [{ css: '::part(table-cell) { padding-top: 12px; }' }],
			properties: ['padding-top'],
		});

		expect(
			probe.printStyles['padding-top'],
			'bare ::part() must match natively in the print document',
		).toBe('12px');
	});

	test('handles selector lists with commas inside functional pseudo-classes', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

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
			'::part() rule with an :is() host prefix must apply',
		).toBe('3px');
		expect(
			probe.printStyles['padding-bottom'],
			'customCSS must stay intact alongside copied host rules',
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
			'@layer-nested ::part() rule must apply in print',
		).toBe('5px');
		expect(probe.printStyles['padding-left'], 'CSS-nested ::part() rule must apply in print').toBe(
			'6px',
		);
	});

	test('preserves @media conditions on carried ::part() rules', async ({ editor, page }) => {
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

		// The @media print rule is copied verbatim, so it is inactive in the
		// screen-rendered probe iframe and only activates when printing.
		expect(probe.html).toContain('@media print');
		expect(
			probe.printStyles['padding-top'],
			'@media print rule must stay conditional in the print document',
		).toBe('8px');
		expect(
			probe.printStyles['padding-left'],
			'matching @media rule must apply in the print document',
		).toBe('2px');
	});

	test('resolves var() references against copied host custom properties', async ({
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
			'var() reference must resolve natively in the print document',
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

		expect(probe.html, 'disabled stylesheet rules must not be copied').not.toContain(
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
				'::part() rule from an @import stylesheet must apply',
			).toBe('4px');
		} finally {
			await page.evaluate(() => {
				document.getElementById('notectl-202-import-css')?.remove();
			});
		}
	});

	test('neutralizes host widget chrome in the print document', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Host pages style the editor widget (height, border, padding). Those
		// rules are copied for ::part()/token fidelity, but must not constrain
		// the paginated print flow.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{ css: 'notectl-editor { height: 40px; border: 3px solid red; padding: 30px; }' },
			],
			properties: ['padding-top'],
			hostProperties: ['border-top-width', 'padding-top', 'overflow-y'],
		});

		expect(probe.hostStyles['border-top-width'], 'host border must be reset in print').toBe('0px');
		expect(probe.hostStyles['padding-top'], 'host padding must be reset in print').toBe('0px');
		expect(probe.hostStyles['overflow-y'], 'host overflow must be reset in print').toBe('visible');
		expect(
			probe.printStyles['padding-top'],
			'content styling must stay unaffected by the reset',
		).toBe('8px');
	});

	test('neutralizes host widget chrome even against !important host rules', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// For !important declarations the layer order reverses, so the reset in
		// the earlier notectl-print layer must beat !important host chrome in
		// the notectl-host layer.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: 'notectl-editor { height: 40px !important; border: 3px solid red !important; padding: 30px !important; }',
				},
			],
			properties: ['padding-top'],
			hostProperties: ['border-top-width', 'padding-top', 'overflow-y'],
		});

		expect(
			probe.hostStyles['border-top-width'],
			'!important host border must be reset in print',
		).toBe('0px');
		expect(probe.hostStyles['padding-top'], '!important host padding must be reset in print').toBe(
			'0px',
		);
		expect(probe.hostStyles['overflow-y'], 'host overflow must stay reset').toBe('visible');
		expect(probe.printStyles['padding-top'], 'content styling must stay unaffected').toBe('8px');
	});

	test('forced light theme beats !important host theme-token overrides', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [{ css: 'notectl-editor { --notectl-bg: rgb(1, 2, 3) !important; }' }],
			properties: ['padding-top'],
			hostProperties: ['--notectl-bg'],
		});

		expect(
			probe.hostStyles['--notectl-bg']?.trim(),
			'forced light theme token must beat the !important host override',
		).toBe('#ffffff');
	});

	test('customCSS !important restyles the print host past the reset and host rules', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Escape hatch: customCSS is copied into the earliest layer
		// (notectl-custom), so its !important declarations outrank both the
		// print reset and !important host rules.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [{ css: 'notectl-editor { border-top: 9px dotted blue !important; }' }],
			printOptions: {
				customCSS: 'notectl-editor { border-top: 5px solid rgb(0, 128, 0) !important; }',
			},
			properties: ['padding-top'],
			hostProperties: ['border-top-width', 'border-top-color'],
		});

		expect(
			probe.hostStyles['border-top-width'],
			'customCSS !important must beat the print host reset',
		).toBe('5px');
		expect(
			probe.hostStyles['border-top-color'],
			'customCSS !important must beat the !important host rule',
		).toBe('rgb(0, 128, 0)');
	});

	test('survives a literal </style> sequence inside customCSS', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// Without escaping, the raw sequence would close the <style> element
		// early and every rule after it (including the padding rule below)
		// would leak into the document as markup instead of applying.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			printOptions: {
				customCSS: [
					'.notectl-content::before { content: "</style>"; }',
					'[part~="table-cell"] { padding-top: 2px; }',
				].join('\n'),
			},
			properties: ['padding-top'],
		});

		expect(probe.html, 'the </ sequence must be CSS-escaped').toContain('content: "<\\/style>"');
		expect(
			probe.printStyles['padding-top'],
			'rules after the </style> sequence must still apply',
		).toBe('2px');
	});

	test('theme-conditional ::part() rules follow forceLightTheme', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const darkSheet: HostSheetInit = {
			css: 'html.dark notectl-editor::part(table-cell) { padding-top: 13px; }',
		};

		// Default (forced light): the print document carries no dark theme
		// context, so the class-gated dark rule must stay inactive.
		const forcedLight: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [darkSheet],
			rootClass: 'dark',
			properties: ['padding-top'],
			readLive: true,
		});
		expect(
			forcedLight.liveStyles['padding-top'],
			'dark-gated rule must apply in the live editor',
		).toBe('13px');
		expect(
			forcedLight.printStyles['padding-top'],
			'forced light print must not activate dark-gated rules',
		).toBe('8px');

		// forceLightTheme: false — the live theme context is carried, so the
		// dark-gated rule applies exactly as in the editor.
		const liveTheme: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [darkSheet],
			rootClass: 'dark',
			printOptions: { forceLightTheme: false },
			properties: ['padding-top'],
		});
		expect(
			liveTheme.printStyles['padding-top'],
			'carried theme context must activate dark-gated rules',
		).toBe('13px');
	});
});
