/**
 * Type definitions, service keys, and event keys for the PrintPlugin.
 */

import type { PaperSize } from '../../editor/PaperSize.js';
import type { NodeTypeName } from '../../model/TypeBrands.js';
import { EventKey, ServiceKey } from '../Plugin.js';

// --- Print Options ---

export interface PrintOptions {
	/** Page title shown in the browser print header. */
	readonly title?: string;

	/** Additional CSS appended to the print stylesheet. */
	readonly customCSS?: string;

	/**
	 * Header HTML inserted once at the top of the print document.
	 * For repeating per-page headers, use toHTML() with server-side PDF generation.
	 */
	readonly header?: string | (() => string);

	/**
	 * Footer HTML inserted once at the bottom of the print document.
	 * For repeating per-page footers, use toHTML() with server-side PDF generation.
	 */
	readonly footer?: string | (() => string);

	/** Page margins as CSS value (e.g. '2cm'). */
	readonly margin?: string;

	/** Force page break before these block types. */
	readonly pageBreakBefore?: readonly NodeTypeName[];

	/** Exclude these block types from print output. */
	readonly excludeBlockTypes?: readonly NodeTypeName[];

	/** Print background colors and images. */
	readonly printBackground?: boolean;

	/** Page orientation. */
	readonly orientation?: 'portrait' | 'landscape';

	/** Paper size for @page CSS rule. When set, overrides the default A4 page size. */
	readonly paperSize?: PaperSize;
}

// --- Plugin Configuration ---

export interface PrintPluginConfig {
	/** Default options applied to every print() call. */
	readonly defaults?: PrintOptions;

	/** Keyboard shortcut (default: 'Mod-P'). */
	readonly keyBinding?: string;

	/** Show toolbar button (default: true). */
	readonly showToolbarItem?: boolean;

	/** Locale override for user-facing strings. */
	readonly locale?: import('./PrintLocale.js').PrintLocale;
}

// --- Service Interface ---

export interface PrintService {
	/** Prints the editor content with optional configuration. */
	print(options?: PrintOptions): void;

	/** Generates print-ready HTML as a complete document string. */
	toHTML(options?: PrintOptions): string;
}

// --- Service & Event Keys ---

export const PRINT_SERVICE_KEY: ServiceKey<PrintService> = new ServiceKey<PrintService>('print');

export const BEFORE_PRINT: EventKey<BeforePrintEvent> = new EventKey<BeforePrintEvent>(
	'print:before',
);

export const AFTER_PRINT: EventKey<AfterPrintEvent> = new EventKey<AfterPrintEvent>('print:after');

// --- Event Payloads ---

export interface BeforePrintEvent {
	/** Options can be mutated — EventBus passes by reference. */
	options: PrintOptions;
	/** Set to true to cancel the print. */
	cancelled: boolean;
}

export interface AfterPrintEvent {
	/** The generated HTML (read-only). */
	readonly html: string;
}
