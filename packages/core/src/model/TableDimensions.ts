/** Shared, DOM-free table-dimension bounds and normalization. */

/** Smallest supported table column width or row minimum height, in CSS pixels. */
export const MIN_TABLE_DIMENSION_PX = 1;

/** Largest supported table column width or row minimum height, in CSS pixels. */
export const MAX_TABLE_DIMENSION_PX = 10_000;

/**
 * Normalizes a finite numeric table dimension into the requested bounded range.
 * Non-numeric and non-finite input is rejected with `null`.
 */
export function normalizeTableDimensionPx(
	value: unknown,
	minimum = MIN_TABLE_DIMENSION_PX,
	maximum = MAX_TABLE_DIMENSION_PX,
): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;

	const normalizedMinimum: number = normalizeBound(minimum, MIN_TABLE_DIMENSION_PX);
	const normalizedMaximum: number = Math.max(
		normalizedMinimum,
		normalizeBound(maximum, MAX_TABLE_DIMENSION_PX),
	);
	return Math.min(normalizedMaximum, Math.max(normalizedMinimum, value));
}

function normalizeBound(value: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(MAX_TABLE_DIMENSION_PX, Math.max(MIN_TABLE_DIMENSION_PX, value));
}
