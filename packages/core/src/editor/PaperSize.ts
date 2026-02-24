/**
 * Paper size definitions and dimension helpers.
 * Used by PaperLayoutController for WYSIWYG page layout
 * and by PrintStyleCollector for @page CSS rules.
 */

/** Conversion factor: 1mm = 96/25.4 px at CSS reference pixel (96 DPI). */
const MM_TO_PX: number = 96 / 25.4;

/** Physical dimensions of a paper size. */
export interface PaperDimensions {
	readonly widthMm: number;
	readonly heightMm: number;
	readonly widthPx: number;
	readonly heightPx: number;
}

/** Available paper size presets. */
export const PaperSize = {
	DINA4: 'din-a4',
	DINA5: 'din-a5',
	USLetter: 'us-letter',
	USLegal: 'us-legal',
} as const;
export type PaperSize = (typeof PaperSize)[keyof typeof PaperSize];

/** Rounds to nearest integer for pixel dimensions. */
function mmToPx(mm: number): number {
	return Math.round(mm * MM_TO_PX);
}

/** Lookup table for paper dimensions. */
const PAPER_DIMENSIONS: ReadonlyMap<PaperSize, PaperDimensions> = new Map<
	PaperSize,
	PaperDimensions
>([
	[PaperSize.DINA4, { widthMm: 210, heightMm: 297, widthPx: mmToPx(210), heightPx: mmToPx(297) }],
	[PaperSize.DINA5, { widthMm: 148, heightMm: 210, widthPx: mmToPx(148), heightPx: mmToPx(210) }],
	[
		PaperSize.USLetter,
		{ widthMm: 215.9, heightMm: 279.4, widthPx: mmToPx(215.9), heightPx: mmToPx(279.4) },
	],
	[
		PaperSize.USLegal,
		{ widthMm: 215.9, heightMm: 355.6, widthPx: mmToPx(215.9), heightPx: mmToPx(355.6) },
	],
]);

/** CSS @page size keywords for each paper size. */
const CSS_SIZE_KEYWORDS: ReadonlyMap<PaperSize, string> = new Map<PaperSize, string>([
	[PaperSize.DINA4, 'A4'],
	[PaperSize.DINA5, 'A5'],
	[PaperSize.USLetter, 'letter'],
	[PaperSize.USLegal, 'legal'],
]);

/** Returns the physical and pixel dimensions for a paper size. */
export function getPaperDimensions(size: PaperSize): PaperDimensions {
	const dims: PaperDimensions | undefined = PAPER_DIMENSIONS.get(size);
	if (!dims) {
		throw new Error(`Unknown paper size: ${size}`);
	}
	return dims;
}

/**
 * Document margin constants for paper mode (in px).
 * These define the content padding inside the paper surface in the editor,
 * and become @page margins in print output to ensure WYSIWYG fidelity.
 */
export const PAPER_MARGIN_TOP_PX: number = 48;
export const PAPER_MARGIN_HORIZONTAL_PX: number = 56;

/** Returns the CSS @page size keyword (e.g. 'A4', 'letter') for a paper size. */
export function getPaperCSSSize(size: PaperSize): string {
	const keyword: string | undefined = CSS_SIZE_KEYWORDS.get(size);
	if (!keyword) {
		throw new Error(`Unknown paper size: ${size}`);
	}
	return keyword;
}
