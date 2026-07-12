/**
 * Safe table-dimension parsing and HTML serialization helpers.
 *
 * Table dimensions are stored as finite CSS-pixel numbers. HTML import accepts
 * notectl's numeric wire attributes and a deliberately small conventional
 * subset: unitless numeric presentation attributes and exact `px` CSS values.
 * Arbitrary CSS expressions never cross into document attributes.
 */

import type { HTMLExportContext } from '../model/NodeSpec.js';
import {
	MAX_TABLE_DIMENSION_PX,
	MIN_TABLE_DIMENSION_PX,
	normalizeTableDimensionPx,
} from '../model/TableDimensions.js';

/** Canonical HTML metadata carrying one logical column's width in CSS pixels. */
export const TABLE_COLUMN_WIDTH_DATA_ATTRIBUTE = 'data-notectl-width-px';

/** Canonical HTML metadata carrying one logical row's minimum height in CSS pixels. */
export const TABLE_ROW_MIN_HEIGHT_DATA_ATTRIBUTE = 'data-notectl-min-height-px';

/** Defensive upper bound for a serialized `<col>` vector. */
export const MAX_SERIALIZED_TABLE_COLUMNS = 1_000;

/** HTML's upper bound for a `<col span>` value. */
export const MAX_TABLE_COLUMN_SPAN = 1_000;

const DECIMAL_NUMBER_RE = /^\d+(?:\.\d+)?$/;
const CSS_PX_RE = /^(\d+(?:\.\d+)?)px$/i;
const POSITIVE_INTEGER_RE = /^\d+$/;

/** Returns a bounded, finite CSS-pixel value without clamping untrusted serialized input. */
export function normalizeSerializedTableDimensionPx(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	if (value < MIN_TABLE_DIMENSION_PX || value > MAX_TABLE_DIMENSION_PX) return undefined;
	return normalizeTableDimensionPx(value) ?? undefined;
}

/** Parses notectl's canonical numeric `data-notectl-*-px` value. */
export function parseTableDimensionMetadata(raw: string | null): number | undefined {
	return parseDecimal(raw, false);
}

/** Parses a conventional numeric or `px` presentation attribute. */
export function parseConventionalTableDimension(raw: string | null): number | undefined {
	return parseDecimal(raw, true);
}

/** Parses an exact CSS `<length>` in pixels. Other units and expressions are rejected. */
export function parseCSSTableDimension(raw: string | null): number | undefined {
	if (raw === null) return undefined;
	const match: RegExpMatchArray | null = raw.trim().match(CSS_PX_RE);
	return match?.[1] ? parseBoundedNumber(match[1]) : undefined;
}

/**
 * Reads a dimension from an element using deterministic precedence:
 * notectl metadata, exact CSS properties, then a conventional HTML attribute.
 */
export function readTableDimensionPx(
	element: HTMLElement,
	metadataAttribute: string,
	cssProperties: readonly string[],
	conventionalAttribute: string,
): number | undefined {
	const metadata: number | undefined = parseTableDimensionMetadata(
		element.getAttribute(metadataAttribute),
	);
	if (metadata !== undefined) return metadata;

	for (const property of cssProperties) {
		const cssValue: number | undefined = parseCSSTableDimension(
			element.style.getPropertyValue(property),
		);
		if (cssValue !== undefined) return cssValue;
	}

	return parseConventionalTableDimension(element.getAttribute(conventionalAttribute));
}

/** Parses a bounded positive integer HTML span, falling back to one when malformed. */
export function parseTableColumnSpan(raw: string | null): number {
	if (raw === null) return 1;
	const normalized: string = raw.trim();
	if (!POSITIVE_INTEGER_RE.test(normalized)) return 1;
	const value: number = Number(normalized);
	if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TABLE_COLUMN_SPAN) return 1;
	return value;
}

/**
 * Normalizes an untrusted logical column-width vector. Invalid entries become
 * automatic (`null`); a vector with no explicit width is omitted.
 */
export function normalizeTableColumnWidthsPx(
	value: unknown,
): readonly (number | null)[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const widths: (number | null)[] = Array.from(
		value.slice(0, MAX_SERIALIZED_TABLE_COLUMNS),
		(entry: unknown): number | null => normalizeSerializedTableDimensionPx(entry) ?? null,
	);
	return widths.some((width: number | null): boolean => width !== null) ? widths : undefined;
}

/** True when a table column-width vector contains at least one safe explicit value. */
export function hasExplicitTableColumnWidth(value: unknown): boolean {
	return normalizeTableColumnWidthsPx(value) !== undefined;
}

/**
 * Emits canonical metadata plus mode-aware visual CSS for one safe dimension.
 * `ctx.styleAttr()` remains the sole generated-style path in class/CSP mode.
 */
export function serializeTableDimensionAttrs(
	metadataAttribute: string,
	cssProperty: 'width' | 'height',
	value: unknown,
	ctx?: HTMLExportContext,
): string {
	const dimension: number | undefined = normalizeSerializedTableDimensionPx(value);
	if (dimension === undefined) return '';
	const declarations = `${cssProperty}: ${String(dimension)}px`;
	const styleAttribute: string = ctx?.styleAttr(declarations) ?? ` style="${declarations}"`;
	return ` ${metadataAttribute}="${String(dimension)}"${styleAttribute}`;
}

function parseDecimal(raw: string | null, allowPx: boolean): number | undefined {
	if (raw === null) return undefined;
	const normalized: string = raw.trim();
	if (DECIMAL_NUMBER_RE.test(normalized)) return parseBoundedNumber(normalized);
	if (!allowPx) return undefined;
	const match: RegExpMatchArray | null = normalized.match(CSS_PX_RE);
	return match?.[1] ? parseBoundedNumber(match[1]) : undefined;
}

function parseBoundedNumber(raw: string): number | undefined {
	const value: number = Number(raw);
	return normalizeSerializedTableDimensionPx(value);
}
