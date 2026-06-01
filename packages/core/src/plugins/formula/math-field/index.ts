/**
 * Layer A `math-field/` barrel: the accessible, framework-agnostic formula
 * authoring component. Zero notectl imports — publishable as `<a11y-math-field>`.
 */

export { MathField } from './MathField.js';
export { MathPalette } from './MathPalette.js';
export { type MathPaletteLabels, buildMathPalette } from './MathPaletteData.js';
export type {
	MathFieldLocale,
	MathFieldOptions,
	MathFieldResult,
	MathPaletteGroup,
	MathPaletteItem,
} from './MathFieldTypes.js';
