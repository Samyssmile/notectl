import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
	/**
	 * Which document variant to probe. `export` (default) renders toHTML()
	 * output into a scratch iframe; `internal` captures the iframe that
	 * print() itself writes (page-fidelity CSS: html/body reset, body
	 * typography, @page, hoisted imports) with the dialog stubbed out.
	 */
	readonly variant?: 'export' | 'internal';
	/** Computed properties (kebab-case) to read from the printed table cell. */
	readonly properties: readonly string[];
	/** Also read the same properties from the live editor's table cell. */
	readonly readLive?: boolean;
	/** Computed properties to read from the printed host element. */
	readonly hostProperties?: readonly string[];
	/** Computed properties to read from the print document's body. */
	readonly bodyProperties?: readonly string[];
	/** Computed properties to read from the printed .notectl-content element. */
	readonly contentProperties?: readonly string[];
	/** Class added to the live page's <html> for the duration of the probe. */
	readonly rootClass?: string;
}

interface PrintCellProbeResult {
	readonly printStyles: Record<string, string>;
	readonly liveStyles: Record<string, string>;
	readonly hostStyles: Record<string, string>;
	readonly bodyStyles: Record<string, string>;
	readonly contentStyles: Record<string, string>;
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
		type PrintService = {
			toHTML(options: Record<string, unknown>): string;
			print(options: Record<string, unknown>): void;
		};
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

			let frame: HTMLIFrameElement;
			let html: string;
			if (input.variant === 'internal') {
				// Capture the iframe print() creates and stub its dialog before the
				// service writes into it (window expandos survive document.open).
				const captured: HTMLIFrameElement[] = [];
				const body = document.body;
				const originalAppendChild = body.appendChild.bind(body);
				body.appendChild = <T extends Node>(node: T): T => {
					const result: T = originalAppendChild(node);
					if (node instanceof HTMLIFrameElement) {
						captured.push(node);
						const win = node.contentWindow as (Window & { print(): void }) | null;
						if (win) win.print = (): void => {};
					}
					return result;
				};
				try {
					printService.print(input.printOptions ?? {});
				} finally {
					body.appendChild = originalAppendChild;
				}
				const printFrame: HTMLIFrameElement | undefined = captured[0];
				if (!printFrame) throw new Error('print() created no iframe');
				frame = printFrame;
				html = frame.contentDocument?.documentElement.outerHTML ?? '';
			} else {
				html = printService.toHTML(input.printOptions ?? {});
				frame = document.createElement('iframe');
				frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
				document.body.appendChild(frame);
			}
			try {
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				if (input.variant !== 'internal') {
					frameDoc.open();
					frameDoc.write(html);
					frameDoc.close();
				}

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

				const bodyComputed: CSSStyleDeclaration = frameWin.getComputedStyle(frameDoc.body);
				const bodyStyles: Record<string, string> = {};
				for (const property of input.bodyProperties ?? []) {
					bodyStyles[property] = bodyComputed.getPropertyValue(property);
				}

				const contentStyles: Record<string, string> = {};
				if (input.contentProperties?.length) {
					const printContent = printShadow.querySelector<HTMLElement>('.notectl-content');
					if (!printContent) throw new Error('print content element missing');
					const contentComputed: CSSStyleDeclaration = frameWin.getComputedStyle(printContent);
					for (const property of input.contentProperties) {
						contentStyles[property] = contentComputed.getPropertyValue(property);
					}
				}

				return { printStyles, liveStyles, hostStyles, bodyStyles, contentStyles, html };
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

	test('keeps the printed page visible against host print-hiding CSS', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// The classic "print only one section" host pattern hides everything
		// (including the replicated editor host) and app shells clip the page;
		// the print guards must restore visibility and page flow.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [
				{
					css: [
						'body * { visibility: hidden !important; }',
						'html, body { height: 100%; overflow: hidden; }',
					].join('\n'),
				},
			],
			properties: ['visibility'],
			hostProperties: ['visibility'],
			bodyProperties: ['overflow-y', 'visibility'],
		});

		expect(probe.hostStyles.visibility, 'host visibility must be restored in print').toBe(
			'visible',
		);
		expect(probe.printStyles.visibility, 'content must stay visible via inheritance').toBe(
			'visible',
		);
		expect(probe.bodyStyles['overflow-y'], 'page clipping must be neutralized').toBe('visible');
		expect(probe.bodyStyles.visibility).toBe('visible');
	});

	test('keeps the printed page visible against host clip-path/content-visibility hiding (#203)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// sr-only / visually-hidden utilities and app shells hide via clip-path,
		// clip, and content-visibility just like visibility/overflow; the print
		// guards must restore all of them.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [
				{
					css: [
						'notectl-editor { clip-path: inset(50%); }',
						'html, body { clip-path: inset(100%); content-visibility: hidden; }',
					].join('\n'),
				},
			],
			properties: [],
			hostProperties: ['clip-path'],
			bodyProperties: ['clip-path', 'content-visibility'],
		});

		expect(probe.hostStyles['clip-path'], 'host clip-path must be reset in print').toBe('none');
		expect(probe.bodyStyles['clip-path'], 'page clip-path clipping must be neutralized').toBe(
			'none',
		);
		expect(probe.bodyStyles['content-visibility'], 'page content-visibility must be restored').toBe(
			'visible',
		);
	});

	test('does not clip print content to carried screen height constraints', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Both documented ways to constrain the content area on screen — the
		// height token and ::part(content) rules — must not scroll-clip print.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [
				{
					css: [
						'notectl-editor { --notectl-content-max-height: 120px; }',
						'notectl-editor::part(content) { max-height: 100px !important; }',
					].join('\n'),
				},
			],
			properties: ['padding-top'],
			contentProperties: ['max-height', 'overflow-y', 'min-height'],
		});

		expect(probe.contentStyles['max-height'], 'content must not keep a max-height in print').toBe(
			'none',
		);
		expect(probe.contentStyles['overflow-y'], 'content must not scroll in print').toBe('visible');
		expect(probe.contentStyles['min-height'], 'screen min-height must not pad print output').toBe(
			'0px',
		);
	});

	test('carries the live background onto the printed page when not forcing light', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Dark-themed editor: without a pinned carried background the body would
		// stay white while the text keeps its light dark-theme color.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [{ css: 'notectl-editor { --notectl-bg: rgb(20, 20, 30); }' }],
			printOptions: { forceLightTheme: false },
			properties: [],
			bodyProperties: ['background-color'],
		});

		expect(
			probe.bodyStyles['background-color'],
			'print body must sit on the carried theme background',
		).toBe('rgb(20, 20, 30)');

		// The embed-safe export has no body rule; the replica paints the carried
		// background itself.
		const exported: PrintCellProbeResult = await probePrintCell(page, {
			hostSheets: [{ css: 'notectl-editor { --notectl-bg: rgb(20, 20, 30); }' }],
			printOptions: { forceLightTheme: false },
			properties: [],
			hostProperties: ['background-color'],
		});
		expect(exported.hostStyles['background-color']).toBe('rgb(20, 20, 30)');

		// Forced light (default) keeps pinning white regardless of the live theme.
		const forcedLight: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [{ css: 'notectl-editor { --notectl-bg: rgb(20, 20, 30); }' }],
			properties: [],
			bodyProperties: ['background-color'],
		});
		expect(forcedLight.bodyStyles['background-color']).toBe('rgb(255, 255, 255)');
	});

	test('forces print-color-adjust at document scope so the page background prints', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// The shadow-scope guard cannot reach body/html: without a document-scope
		// copy the carried dark background is stripped by the browser's default
		// "no background graphics" print behavior — near-white text on white
		// paper.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			printOptions: { forceLightTheme: false },
			properties: [],
			bodyProperties: ['print-color-adjust'],
		});
		expect(probe.bodyStyles['print-color-adjust']).toBe('exact');
	});

	test('page-level customCSS can reference forced light theme tokens', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		// The forced light tokens must live on :root, not only on the host
		// element — otherwise a document-level var() reference resolves to
		// guaranteed-invalid and the declaration collapses (border-top-style
		// would stay none, computing to 0px width).
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			printOptions: { customCSS: 'body { border-top: 3px solid var(--notectl-primary); }' },
			properties: [],
			bodyProperties: ['border-top-width', 'border-top-style'],
		});
		expect(probe.bodyStyles['border-top-style']).toBe('solid');
		expect(probe.bodyStyles['border-top-width']).toBe('3px');
	});

	test('carries runtime setProperty theme tokens when not forcing light', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Runtime theme switchers set tokens via JS setProperty — inline style on
		// the editor element, the only page-side declaration that beats the
		// shadow :host theme defaults for the token. The replica strips the
		// style attribute, so without the token re-emission the copied
		// stylesheet default would win in print.
		await page.evaluate(() => {
			const editorEl = document.querySelector<HTMLElement>('notectl-editor');
			editorEl?.style.setProperty('--notectl-bg', 'rgb(10, 20, 30)');
		});
		try {
			const probe: PrintCellProbeResult = await probePrintCell(page, {
				hostSheets: [{ css: 'notectl-editor { --notectl-bg: rgb(200, 200, 200); }' }],
				printOptions: { forceLightTheme: false },
				properties: [],
				hostProperties: ['--notectl-bg'],
			});
			expect(
				probe.hostStyles['--notectl-bg'].trim(),
				'inline token must beat the copied stylesheet default, exactly as live',
			).toBe('rgb(10, 20, 30)');
		} finally {
			await page.evaluate(() => {
				const editorEl = document.querySelector<HTMLElement>('notectl-editor');
				editorEl?.style.removeProperty('--notectl-bg');
			});
		}
	});

	test('injected print output stays static and never boots a live editor', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(async () => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			const html: string = printService.toHTML({});

			// A page-level element matching a shadow-scope selector: the fallback
			// carries a copy of the shadow CSS (including the !important content
			// unclip rules), which must stay @scope'd to the fallback subtree.
			const leakProbe: HTMLElement = document.createElement('div');
			leakProbe.className = 'notectl-content';
			leakProbe.style.maxHeight = '50px';
			document.body.appendChild(leakProbe);

			// The documented consumption path: setHTMLUnsafe parses declarative
			// shadow DOM, and <notectl-editor> is registered in this page, so the
			// replica upgrades. It must keep its shadow content and stay static.
			const wrapper: HTMLElement = document.createElement('div');
			document.body.appendChild(wrapper);
			try {
				(wrapper as HTMLElement & { setHTMLUnsafe(markup: string): void }).setHTMLUnsafe(html);
				const replica = wrapper.querySelector<HTMLElement>('notectl-editor');
				if (!replica) throw new Error('replica missing after injection');
				// Give a (wrongly) scheduled auto-init time to run.
				await new Promise((resolve) => setTimeout(resolve, 100));
				return {
					hasStaticMarker: replica.hasAttribute('data-notectl-static'),
					hasShadow: replica.shadowRoot !== null,
					hasTableCell: !!replica.shadowRoot?.querySelector('[part~="table-cell"]'),
					hasToolbar: !!replica.shadowRoot?.querySelector('.notectl-toolbar'),
					contentEditable:
						replica.shadowRoot
							?.querySelector('.notectl-content')
							?.getAttribute('contenteditable') ?? null,
					probeMaxHeight: getComputedStyle(leakProbe).maxHeight,
				};
			} finally {
				wrapper.remove();
				leakProbe.remove();
			}
		});

		expect(result.hasStaticMarker).toBe(true);
		expect(result.hasShadow, 'upgrade must preserve the declarative shadow root').toBe(true);
		expect(result.hasTableCell, 'replicated content must survive the upgrade').toBe(true);
		expect(result.hasToolbar, 'no live editor may boot over the print markup').toBe(false);
		expect(result.contentEditable, 'print content must stay non-editable').toBeNull();
		expect(
			result.probeMaxHeight,
			'embedded fallback styles must not leak onto the embedding page',
		).toBe('50px');
	});

	test('fallback script attaches the shadow root for non-DSD parsers', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			const html: string = printService.toHTML({});

			// Simulate a script-executing engine without DSD parsing: innerHTML
			// leaves the template inert (and runs no scripts), then the embedded
			// fallback script is executed manually in the same realm.
			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:400px;height:300px;border:none';
			document.body.appendChild(frame);
			try {
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow as (Window & { eval(src: string): void }) | null;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				frameDoc.body.innerHTML = html;

				const replica = frameDoc.querySelector<HTMLElement>('notectl-editor');
				if (!replica) throw new Error('replica missing');
				const inertBefore: boolean = replica.shadowRoot === null;

				const scriptSource: string | undefined = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
				if (!scriptSource) throw new Error('fallback script missing in print output');
				frameWin.eval(scriptSource);

				return {
					inertBefore,
					hasShadowAfter: replica.shadowRoot !== null,
					hasTableCell: !!replica.shadowRoot?.querySelector('[part~="table-cell"]'),
					templateGone: !replica.querySelector('template[shadowrootmode]'),
					fallbackGone: !replica.querySelector('[data-notectl-print-fallback]'),
				};
			} finally {
				frame.remove();
			}
		});

		expect(result.inertBefore, 'innerHTML must not attach the shadow root itself').toBe(true);
		expect(result.hasShadowAfter, 'fallback script must attach the shadow root').toBe(true);
		expect(result.hasTableCell, 'content must be visible after the fallback').toBe(true);
		expect(result.templateGone).toBe(true);
		expect(result.fallbackGone, 'script must drop the static fallback to avoid doubled text').toBe(
			true,
		);
	});

	test('innerHTML injection renders the static fallback instead of a blank page', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			const html: string = printService.toHTML({});

			// The worst-case consumption path: innerHTML gives neither declarative
			// shadow DOM parsing nor script execution. The unslotted light-DOM
			// fallback must render readable, statically styled output.
			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:800px;height:600px;border:none';
			document.body.appendChild(frame);
			try {
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				frameDoc.body.innerHTML = html;

				const replica = frameDoc.querySelector<HTMLElement>('notectl-editor');
				if (!replica) throw new Error('replica missing');
				const fallback = replica.querySelector<HTMLElement>('[data-notectl-print-fallback]');
				const cell = fallback?.querySelector<HTMLElement>('[part~="table-cell"]');
				return {
					hasShadow: replica.shadowRoot !== null,
					hasFallback: !!fallback,
					hasCell: !!cell,
					cellDisplay: cell ? frameWin.getComputedStyle(cell).display : '',
					cellPaddingTop: cell ? frameWin.getComputedStyle(cell).paddingTop : '',
				};
			} finally {
				frame.remove();
			}
		});

		expect(result.hasShadow).toBe(false);
		expect(result.hasFallback, 'the static fallback must survive innerHTML parsing').toBe(true);
		expect(result.hasCell, 'the fallback must carry the full content').toBe(true);
		expect(result.cellDisplay, 'the fallback content must render').not.toBe('none');
		// The fallback embeds the shadow CSS statically: the editor base rule
		// .notectl-table td { padding: 8px 12px } applies at document level.
		expect(result.cellPaddingTop, 'the fallback must be statically styled').toBe('8px');
	});

	test('a replica with a stripped static marker boots a clean editor, never a stacked one', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(async () => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			// A sanitizer or template pipeline may strip the data-notectl-static
			// marker from the replica host tag. The upgrade must then restore the
			// pre-DSD invariant: clear the declarative content and boot a clean
			// editor — never a live editor stacked below leftover print markup.
			const html: string = printService.toHTML({}).replace(' data-notectl-static>', '>');

			const wrapper: HTMLElement = document.createElement('div');
			document.body.appendChild(wrapper);
			try {
				(wrapper as HTMLElement & { setHTMLUnsafe(markup: string): void }).setHTMLUnsafe(html);
				const replica = wrapper.querySelector<HTMLElement>('notectl-editor');
				if (!replica) throw new Error('replica missing after injection');

				// Wait for the scheduled auto-init to boot the clean editor. The
				// static clone already contains .notectl-content, so wait for a
				// live-only element: the unmarked root is cleared when init() runs,
				// not synchronously in the upgrade constructor.
				const deadline: number = Date.now() + 5000;
				while (!replica.shadowRoot?.querySelector('.notectl-toolbar')) {
					if (Date.now() > deadline) break;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}

				return {
					hasStaticMarker: replica.hasAttribute('data-notectl-static'),
					printCellCount: replica.shadowRoot?.querySelectorAll('[part~="table-cell"]').length ?? -1,
					contentCount: replica.shadowRoot?.querySelectorAll('.notectl-content').length ?? -1,
				};
			} finally {
				wrapper.remove();
			}
		});

		expect(result.hasStaticMarker).toBe(false);
		expect(result.printCellCount, 'replicated print markup must be cleared on upgrade').toBe(0);
		expect(result.contentCount, 'exactly one clean live editor must boot').toBe(1);
	});

	test('rebases relative url() references against the stylesheet location', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// A stylesheet in /print-202-assets/css/ referencing ../img/: copied
		// verbatim into the print document (whose base is the page URL), the
		// relative reference would resolve to the wrong path and 404.
		await page.route('**/print-202-assets/css/theme.css', (route) =>
			route.fulfill({
				contentType: 'text/css',
				body: 'notectl-editor::part(table-cell) { background-image: url(../img/cell.png); }',
			}),
		);
		await page.evaluate(async () => {
			const link: HTMLLinkElement = document.createElement('link');
			link.id = 'notectl-202-rebase-css';
			link.rel = 'stylesheet';
			link.href = '/print-202-assets/css/theme.css';
			const loaded: Promise<void> = new Promise((resolve, reject) => {
				link.onload = (): void => resolve();
				link.onerror = (): void => reject(new Error('stylesheet failed to load'));
			});
			document.head.appendChild(link);
			await loaded;
		});

		try {
			const probe: PrintCellProbeResult = await probePrintCell(page, { properties: [] });
			expect(probe.html, 'relative url() must be rebased to the stylesheet directory').toContain(
				'/print-202-assets/img/cell.png',
			);
			expect(probe.html).not.toContain('url(../img/cell.png)');
		} finally {
			await page.evaluate(() => {
				document.getElementById('notectl-202-rebase-css')?.remove();
			});
		}
	});

	test('preserves @import layer() and supports() semantics when inlining', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Layered import content loses to unlayered page rules live regardless
		// of specificity; a supports()-gated import with a false condition never
		// applies. Both must hold identically in the print document.
		await page.route('**/print-202-assets/defaults.css', (route) =>
			route.fulfill({
				contentType: 'text/css',
				body: 'notectl-editor:not(.zzz)::part(table-cell) { padding-top: 9px; }',
			}),
		);
		await page.route('**/print-202-assets/unsupported.css', (route) =>
			route.fulfill({
				contentType: 'text/css',
				// Same high specificity as defaults.css: if the supports()
				// condition were dropped during inlining, this rule would beat
				// the 2px override on specificity and the probe would catch it.
				body: 'notectl-editor:not(.zzz)::part(table-cell) { padding-top: 13px; }',
			}),
		);
		await page.evaluate(async () => {
			const style: HTMLStyleElement = document.createElement('style');
			style.id = 'notectl-202-layer-import-css';
			style.textContent = [
				'@import url("/print-202-assets/defaults.css") layer(defaults);',
				'@import url("/print-202-assets/unsupported.css") supports(display: no-such-value);',
				'notectl-editor::part(table-cell) { padding-top: 2px; }',
			].join('\n');
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
				readLive: true,
			});
			// Setup validity: live, the unlayered 2px override beats the more
			// specific layered 9px rule, and the false supports() stays inactive.
			expect(
				probe.liveStyles['padding-top'],
				'unlayered page rule must beat the layered import live',
			).toBe('2px');
			// Without layer preservation the inlined 9px rule would win on
			// specificity inside notectl-host.
			expect(
				probe.printStyles['padding-top'],
				'print cascade must match the live layered-import result',
			).toBe('2px');
		} finally {
			await page.evaluate(() => {
				document.getElementById('notectl-202-layer-import-css')?.remove();
			});
		}
	});

	test('keeps cross-origin sheets at their source-order position in the print cascade', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// A cross-origin sheet (no CORS: cssRules throws) is re-referenced via
		// @import. Live it loads after the local 7px rule and wins the
		// equal-specificity tie by source order; hoisting it ahead of the copied
		// rules would flip the tie in print.
		await page.route('**/notectl-cdn.example/cdn-theme.css', (route) =>
			route.fulfill({
				contentType: 'text/css',
				body: 'notectl-editor::part(table-cell) { padding-top: 3px; }',
			}),
		);
		await page.evaluate(async () => {
			const local: HTMLStyleElement = document.createElement('style');
			local.id = 'notectl-202-order-local';
			local.textContent = 'notectl-editor::part(table-cell) { padding-top: 7px; }';
			document.head.appendChild(local);

			const link: HTMLLinkElement = document.createElement('link');
			link.id = 'notectl-202-order-cdn';
			link.rel = 'stylesheet';
			link.href = 'https://notectl-cdn.example/cdn-theme.css';
			const loaded: Promise<void> = new Promise((resolve, reject) => {
				link.onload = (): void => resolve();
				link.onerror = (): void => reject(new Error('cdn stylesheet failed to load'));
			});
			document.head.appendChild(link);
			await loaded;
		});

		try {
			const result = await page.evaluate(async () => {
				type PrintService = {
					toHTML(options: Record<string, unknown>): string;
					print(options: Record<string, unknown>): void;
				};
				type EditorEl = HTMLElement & {
					getService(key: { id: string }): PrintService | undefined;
				};
				const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
				if (!editorEl) throw new Error('editor element missing');
				const liveCell = editorEl.shadowRoot?.querySelector<HTMLElement>('[part~="table-cell"]');
				if (!liveCell) throw new Error('live table cell missing');
				const livePadding: string = getComputedStyle(liveCell).paddingTop;

				const printService = editorEl.getService({ id: 'print' });
				if (!printService) throw new Error('print service missing');

				// Hoisted cross-origin imports only exist in the internal print()
				// variant (the embed-safe export must not load foreign sheets into a
				// consumer page), so capture the iframe print() writes.
				const captured: HTMLIFrameElement[] = [];
				const body = document.body;
				const originalAppendChild = body.appendChild.bind(body);
				body.appendChild = <T extends Node>(node: T): T => {
					const result: T = originalAppendChild(node);
					if (node instanceof HTMLIFrameElement) {
						captured.push(node);
						const win = node.contentWindow as (Window & { print(): void }) | null;
						if (win) win.print = (): void => {};
					}
					return result;
				};
				try {
					printService.print({});
				} finally {
					body.appendChild = originalAppendChild;
				}
				const frame: HTMLIFrameElement | undefined = captured[0];
				if (!frame) throw new Error('print() created no iframe');
				try {
					const frameDoc = frame.contentDocument;
					const frameWin = frame.contentWindow;
					if (!frameDoc || !frameWin) throw new Error('iframe document missing');

					const printHost = frameDoc.querySelector<HTMLElement>('notectl-editor');
					const printCell =
						printHost?.shadowRoot?.querySelector<HTMLElement>('[part~="table-cell"]');
					if (!printCell) throw new Error('print table cell missing');

					// The hoisted @import loads asynchronously in the print frame; the
					// copied local 7px rule applies immediately, so poll until the
					// import result (3px) lands. On regression the value stays 7px and
					// the deadline surfaces it.
					const deadline: number = Date.now() + 5000;
					let printPadding: string = frameWin.getComputedStyle(printCell).paddingTop;
					while (printPadding !== '3px') {
						if (Date.now() > deadline) break;
						await new Promise((resolve) => setTimeout(resolve, 25));
						printPadding = frameWin.getComputedStyle(printCell).paddingTop;
					}

					const exportHTML: string = printService.toHTML({});
					return { livePadding, printPadding, exportHTML };
				} finally {
					frame.remove();
				}
			});

			// Setup validity: the later cross-origin rule wins the tie live.
			expect(result.livePadding, 'cdn sheet must win the source-order tie live').toBe('3px');
			expect(
				result.printPadding,
				'print cascade must keep the live source order for hoisted sheets',
			).toBe('3px');
			// The embed-safe export may reference the foreign sheet only inside
			// the inert standalone bundle, never in its active head styles.
			const exportHead: string = result.exportHTML.slice(0, result.exportHTML.indexOf('</head>'));
			expect(exportHead).not.toContain('@import');
			expect(result.exportHTML.indexOf('@import')).toBeGreaterThan(
				result.exportHTML.indexOf('data-notectl-print-styles'),
			);
		} finally {
			await page.evaluate(() => {
				document.getElementById('notectl-202-order-local')?.remove();
				document.getElementById('notectl-202-order-cdn')?.remove();
			});
		}
	});

	test('carries the enclosing sheet media onto a hoisted cross-origin @import (#204)', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// A cross-origin sheet re-referenced from a media-scoped <style>: the
		// enclosing sheet media must ride onto the hoisted @import, or the foreign
		// sheet applies unconditionally instead of only in its media context.
		await page.route('**/notectl-cdn.example/gated-204.css', (route) =>
			route.fulfill({
				contentType: 'text/css',
				body: 'notectl-editor::part(table-cell) { padding-top: 5px; }',
			}),
		);

		// print-gated: the hoisted statement must carry `print`, so the foreign
		// sheet stays inactive in the screen-rendered probe.
		const gated: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [
				{ css: '@import url("https://notectl-cdn.example/gated-204.css");', media: 'print' },
			],
			properties: ['padding-top'],
		});
		expect(
			gated.html,
			'hoisted cross-origin import must carry the enclosing sheet media',
		).toContain(
			'@import url("https://notectl-cdn.example/gated-204.css") layer(notectl-host) print;',
		);
		expect(
			gated.printStyles['padding-top'],
			'print-gated foreign sheet must stay inactive in the screen probe',
		).toBe('8px');

		// Setup validity: without the media gate the same sheet is hoisted bare,
		// proving the only difference is the carried condition.
		const ungated: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [{ css: '@import url("https://notectl-cdn.example/gated-204.css");' }],
			properties: ['padding-top'],
		});
		expect(
			ungated.html,
			'an ungated cross-origin import is hoisted without a media condition',
		).toContain('@import url("https://notectl-cdn.example/gated-204.css") layer(notectl-host);');
	});

	test('embedding the export leaves the consumer page unstyled', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(async () => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');

			// Embedding the export registers the editor's typed custom properties
			// (@property rules apply document-wide even from inside a shadow
			// root), which changes the SERIALIZATION of token values without
			// changing their color. Normalize through a scratch element so the
			// comparison only fails on real value changes.
			const scratch: HTMLElement = document.createElement('div');
			document.body.appendChild(scratch);
			const normalizeColor = (value: string): string => {
				scratch.style.color = '';
				scratch.style.color = value || 'transparent';
				return getComputedStyle(scratch).color;
			};
			const snapshot = (): Record<string, string> => {
				const body: CSSStyleDeclaration = getComputedStyle(document.body);
				const root: CSSStyleDeclaration = getComputedStyle(document.documentElement);
				const live: CSSStyleDeclaration = getComputedStyle(editorEl);
				return {
					bodyBackground: body.backgroundColor,
					bodyMargin: body.marginTop,
					bodyOverflow: body.overflowY,
					rootOverflow: root.overflowY,
					liveHeight: live.height,
					liveBorder: live.borderTopWidth,
					liveBackground: live.backgroundColor,
					liveToken: normalizeColor(live.getPropertyValue('--notectl-bg').trim()),
				};
			};

			const before: Record<string, string> = snapshot();
			const html: string = printService.toHTML({});
			const wrapper: HTMLElement = document.createElement('div');
			document.body.appendChild(wrapper);
			try {
				(wrapper as HTMLElement & { setHTMLUnsafe(markup: string): void }).setHTMLUnsafe(html);
				await new Promise((resolve) => setTimeout(resolve, 50));
				const after: Record<string, string> = snapshot();
				const replica = wrapper.querySelector<HTMLElement>('notectl-editor');
				return {
					before,
					after,
					replicaHasShadow: !!replica?.shadowRoot,
					html,
				};
			} finally {
				wrapper.remove();
				scratch.remove();
			}
		});

		// The old export shipped unscoped html/body/notectl-editor/:root rules
		// that turned dark consumer apps white and flattened every live editor
		// on the page. All document-level CSS must now be inert outside the
		// replica subtree.
		expect(result.after).toEqual(result.before);
		expect(result.replicaHasShadow, 'the embedded replica itself must still render').toBe(true);
		// Page-level CSS may only exist inside the inert standalone bundle.
		const head: string = result.html.slice(0, result.html.indexOf('</head>'));
		expect(head).not.toContain('html, body {');
		expect(head).not.toContain('@page');
		expect(head).not.toContain('@layer notectl-host {');
	});

	test('the fallback script ignores consumer DSD templates', async ({ editor, page }) => {
		await editor.focus();
		await insertTable(page);

		const result = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			const html: string = printService.toHTML({});

			// A consumer widget whose framework inserted a DSD template via
			// fragment parsing (inert) and intends to process it itself.
			const frame: HTMLIFrameElement = document.createElement('iframe');
			frame.style.cssText = 'position:fixed;left:-9999px;width:400px;height:300px;border:none';
			document.body.appendChild(frame);
			try {
				const frameDoc = frame.contentDocument;
				const frameWin = frame.contentWindow as (Window & { eval(src: string): void }) | null;
				if (!frameDoc || !frameWin) throw new Error('iframe document missing');
				const consumer: HTMLElement = frameDoc.createElement('div');
				consumer.innerHTML = '<template shadowrootmode="open"><p>consumer</p></template>';
				frameDoc.body.appendChild(consumer);

				const embed: HTMLElement = frameDoc.createElement('div');
				embed.innerHTML = html;
				frameDoc.body.appendChild(embed);

				const scriptSource: string | undefined = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
				if (!scriptSource) throw new Error('fallback script missing in print output');
				frameWin.eval(scriptSource);

				const replica = embed.querySelector<HTMLElement>('notectl-editor');
				return {
					consumerTemplateIntact: consumer.querySelectorAll('template').length === 1,
					consumerHasShadow: consumer.shadowRoot !== null,
					replicaHasShadow: !!replica?.shadowRoot,
					replicaFallbacks: replica
						? replica.querySelectorAll('[data-notectl-print-fallback]').length
						: -1,
				};
			} finally {
				frame.remove();
			}
		});

		// A document-wide template sweep would consume the consumer's template
		// and break their component's own hydration.
		expect(result.consumerTemplateIntact).toBe(true);
		expect(result.consumerHasShadow).toBe(false);
		expect(result.replicaHasShadow, 'the replica template must still be attached').toBe(true);
		expect(result.replicaFallbacks, 'the replica fallback must still be removed').toBe(0);
	});

	test('renders replica content when the component is registered before parsing', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		const html: string = await page.evaluate(() => {
			type PrintService = { toHTML(options: Record<string, unknown>): string };
			type EditorEl = HTMLElement & {
				getService(key: { id: string }): PrintService | undefined;
			};
			const editorEl = document.querySelector('notectl-editor') as EditorEl | null;
			if (!editorEl) throw new Error('editor element missing');
			const printService = editorEl.getService({ id: 'print' });
			if (!printService) throw new Error('print service missing');
			return printService.toHTML({});
		});

		// A consumer page that loads the notectl bundle as a classic script in
		// <head>: the custom element is defined before the replica markup is
		// parsed, so the parser runs the constructor before attributes and
		// children exist. An eagerly attached shadow root would block the DSD
		// template from attaching and blank the whole export.
		const umdSource: string = readFileSync(
			resolve(process.cwd(), 'packages/core/dist/notectl-core.umd.js'),
			'utf8',
		);
		const hostedPage: string = html.replace(
			'<head>',
			'<head>\n<script src="/print-202-umd.js"></script>',
		);
		await page.route('**/print-202-static-host.html', (route) =>
			route.fulfill({ contentType: 'text/html', body: hostedPage }),
		);
		await page.route('**/print-202-umd.js', (route) =>
			route.fulfill({ contentType: 'application/javascript', body: umdSource }),
		);

		await page.goto('/print-202-static-host.html');
		const result = await page.evaluate(() => {
			const host = document.querySelector<HTMLElement>('notectl-editor');
			return {
				defined: !!customElements.get('notectl-editor'),
				hasShadow: !!host?.shadowRoot,
				hasTableCell: !!host?.shadowRoot?.querySelector('[part~="table-cell"]'),
				hasToolbar: !!host?.shadowRoot?.querySelector('.notectl-toolbar'),
				fallbacks: host ? host.querySelectorAll('[data-notectl-print-fallback]').length : -1,
				leftoverTemplates: host ? host.querySelectorAll('template').length : -1,
			};
		});

		expect(result.defined, 'setup: the bundle must register the component').toBe(true);
		expect(result.hasShadow, 'the declarative shadow root must attach').toBe(true);
		expect(result.hasTableCell, 'replicated content must render, not a blank page').toBe(true);
		expect(result.hasToolbar, 'no live editor may boot over the replica').toBe(false);
		expect(result.fallbacks, 'the fallback must be cleaned up once the root exists').toBe(0);
		expect(result.leftoverTemplates).toBe(0);
	});

	test('wrapper-scoped theme tokens survive into print when carrying the theme', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// The live theme comes from a wrapper-scoped rule; the wrapper is not
		// replicated in the print document, where only the unscoped light
		// default would match. The unlayered computed snapshot must keep the
		// live value on the replica.
		await page.evaluate(() => {
			const editorEl = document.querySelector<HTMLElement>('notectl-editor');
			if (!editorEl?.parentElement) throw new Error('editor element missing');
			const wrapper: HTMLElement = document.createElement('div');
			wrapper.id = 'notectl-202-theme-wrapper';
			wrapper.className = 'notectl-202-theme-dark';
			editorEl.parentElement.insertBefore(wrapper, editorEl);
			wrapper.appendChild(editorEl);
		});
		try {
			const probe: PrintCellProbeResult = await probePrintCell(page, {
				hostSheets: [
					{
						css: [
							'.notectl-202-theme-dark notectl-editor { --notectl-bg: rgb(17, 34, 51); }',
							'notectl-editor { --notectl-bg: rgb(238, 238, 238); }',
						].join('\n'),
					},
				],
				printOptions: { forceLightTheme: false },
				properties: [],
				hostProperties: ['--notectl-bg'],
			});
			expect(
				probe.hostStyles['--notectl-bg'].trim(),
				'the computed live token must beat the mismatched host-copy default',
			).toBe('rgb(17, 34, 51)');
		} finally {
			await page.evaluate(() => {
				const wrapper = document.getElementById('notectl-202-theme-wrapper');
				const editorEl = wrapper?.querySelector<HTMLElement>('notectl-editor');
				if (wrapper?.parentElement && editorEl) {
					wrapper.parentElement.insertBefore(editorEl, wrapper);
				}
				wrapper?.remove();
			});
		}
	});

	test('carries a background painted on html when body is transparent', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await insertTable(page);

		// Dark themes commonly paint html and leave body transparent; stopping
		// the background walk at body used to fall back to white while the text
		// stayed light — invisible print output.
		const probe: PrintCellProbeResult = await probePrintCell(page, {
			variant: 'internal',
			hostSheets: [
				{
					css: [
						'html { background: rgb(13, 17, 23); }',
						'body { background: transparent; }',
						'notectl-editor { --notectl-bg: transparent; }',
					].join('\n'),
				},
			],
			printOptions: { forceLightTheme: false },
			properties: [],
			bodyProperties: ['background-color'],
		});
		expect(probe.bodyStyles['background-color']).toBe('rgb(13, 17, 23)');
	});
});
