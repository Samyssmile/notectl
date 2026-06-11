/**
 * Glue between the framework-agnostic MathField (Layer A) and notectl. Maps the
 * plugin locale onto the math field's locale and builds the structural palette,
 * then mounts a MathField into a container and wires focus + announcements.
 */

import type { PluginContext } from '../Plugin.js';
import type { FormulaLocale } from './FormulaLocale.js';
import { MathField, buildMathPalette } from './math-field/index.js';
import type { MathFieldLocale, MathFieldResult, MathPaletteGroup } from './math-field/index.js';

/** Options for mounting the formula editor into a host container. */
export interface MountFormulaEditorOptions {
	readonly context: PluginContext;
	readonly locale: FormulaLocale;
	readonly mode: 'insert' | 'edit';
	readonly initialLatex?: string;
	readonly initialAlt?: string;
	readonly initialDisplay?: boolean;
	readonly initialFontSize?: string;
	readonly fontSizes?: readonly number[];
	readonly onCommit: (result: MathFieldResult) => void;
	readonly onClose: () => void;
}

function toMathFieldLocale(locale: FormulaLocale): MathFieldLocale {
	return {
		latexLabel: locale.latexLabel,
		latexPlaceholder: locale.latexPlaceholder,
		previewLabel: locale.previewLabel,
		emptyPreview: locale.emptyPreview,
		altLabel: locale.altLabel,
		altPlaceholder: locale.altPlaceholder,
		displayToggle: locale.displayToggle,
		sizeLabel: locale.sizeLabel,
		sizeDefault: locale.sizeDefault,
		commitInsert: locale.insertButton,
		commitUpdate: locale.updateButton,
		cancel: locale.cancelButton,
		paletteLabel: locale.paletteLabel,
		unknownCommand: locale.unknownCommand,
	};
}

function paletteFor(locale: FormulaLocale): MathPaletteGroup[] {
	return buildMathPalette({
		fractions: locale.groupFractions,
		scripts: locale.groupScripts,
		roots: locale.groupRoots,
		accents: locale.groupAccents,
		operators: locale.groupOperators,
		functions: locale.groupFunctions,
		greek: locale.groupGreek,
		relations: locale.groupRelations,
		sets: locale.groupSets,
		logic: locale.groupLogic,
		arrows: locale.groupArrows,
		delimiters: locale.groupDelimiters,
		dots: locale.groupDots,
		matrices: locale.groupMatrices,
	});
}

/** Creates a MathField, appends it to `container`, and focuses it on next frame. */
export function mountFormulaEditor(
	container: HTMLElement,
	options: MountFormulaEditorOptions,
): MathField {
	const field = new MathField({
		locale: toMathFieldLocale(options.locale),
		mode: options.mode,
		initialLatex: options.initialLatex,
		initialAlt: options.initialAlt,
		initialDisplay: options.initialDisplay,
		initialFontSize: options.initialFontSize,
		fontSizes: options.fontSizes,
		palette: paletteFor(options.locale),
		onCommit: options.onCommit,
		onCancel: options.onClose,
	});
	container.appendChild(field.root);
	requestAnimationFrame(() => field.focus());
	return field;
}
