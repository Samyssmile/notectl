/**
 * Builds an `@font-face` CSS rule from a font definition so the bundled MATH
 * font is registered as a plain web font (available to the `.notectl-math`
 * `font-family` cascade) WITHOUT appearing in the body-font picker.
 */

import type { FontDefinition } from '../font/FontPlugin.js';

/** Returns `@font-face` CSS for every descriptor in the font definition. */
export function buildMathFontFaceCss(font: FontDefinition): string {
	const family: string = (font.family.split(',')[0] ?? font.name).trim().replace(/['"]/g, '');
	const rules: string[] = (font.fontFaces ?? []).map((face) => {
		const declarations: string[] = [`font-family: '${family}'`, `src: ${face.src}`];
		if (face.weight) declarations.push(`font-weight: ${face.weight}`);
		if (face.style) declarations.push(`font-style: ${face.style}`);
		declarations.push(`font-display: ${face.display ?? 'swap'}`);
		return `@font-face { ${declarations.join('; ')}; }`;
	});
	return rules.join('\n');
}
