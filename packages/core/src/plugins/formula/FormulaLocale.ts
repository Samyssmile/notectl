/**
 * Locale interface and default English strings for the formula plugin.
 * All authoring surfaces (toolbar, overlay, palette) draw their labels here so
 * the plugin is fully translatable and accessible out of the box.
 */

import { type LocaleModuleMap, loadLocaleModule } from '../shared/LocaleLoader.js';

// --- Locale Interface ---

export interface FormulaLocale {
	readonly insertInline: string;
	readonly insertInlineTooltip: string;
	readonly editFormula: string;
	readonly latexLabel: string;
	readonly latexPlaceholder: string;
	readonly previewLabel: string;
	readonly insertButton: string;
	readonly updateButton: string;
	readonly cancelButton: string;
	readonly displayToggle: string;
	readonly sizeLabel: string;
	readonly sizeDefault: string;
	readonly altLabel: string;
	readonly altPlaceholder: string;
	readonly paletteLabel: string;
	readonly emptyPreview: string;
	/** Announced when a formula is inserted. */
	readonly inserted: string;
	/** Announced when a formula is updated. */
	readonly updated: string;
	/** Announced when the editing overlay opens. */
	readonly editing: string;
	/** Announced when a formula node is selected (display math). */
	readonly selected: string;
	/** Builds the unknown-command error message. */
	readonly unknownCommand: (command: string) => string;
	/** Accessible group labels for the structural palette. */
	readonly groupFractions: string;
	readonly groupScripts: string;
	readonly groupRoots: string;
	readonly groupAccents: string;
	readonly groupOperators: string;
	readonly groupFunctions: string;
	readonly groupGreek: string;
	readonly groupRelations: string;
	readonly groupSets: string;
	readonly groupLogic: string;
	readonly groupArrows: string;
	readonly groupDelimiters: string;
	readonly groupDots: string;
	readonly groupMatrices: string;
}

// --- Default English Locale ---

export const FORMULA_LOCALE_EN: FormulaLocale = {
	insertInline: 'Insert formula',
	insertInlineTooltip: 'Insert inline formula',
	editFormula: 'Edit formula',
	latexLabel: 'LaTeX',
	latexPlaceholder: 'e.g. \\frac{a}{b} + \\sqrt{x}',
	previewLabel: 'Preview',
	insertButton: 'Insert',
	updateButton: 'Update',
	cancelButton: 'Cancel',
	displayToggle: 'Display (block) equation',
	sizeLabel: 'Size',
	sizeDefault: 'Default',
	altLabel: 'Description',
	altPlaceholder: 'Spoken description (optional)',
	paletteLabel: 'Symbols and structures',
	emptyPreview: 'Nothing to preview yet.',
	inserted: 'Formula inserted.',
	updated: 'Formula updated.',
	editing: 'Editing formula.',
	selected: 'Formula selected. Press Enter to edit.',
	unknownCommand: (command: string) => `Unknown LaTeX command: ${command}`,
	groupFractions: 'Fractions',
	groupScripts: 'Scripts',
	groupRoots: 'Roots',
	groupAccents: 'Accents',
	groupOperators: 'Operators',
	groupFunctions: 'Functions',
	groupGreek: 'Greek letters',
	groupRelations: 'Relations',
	groupSets: 'Sets',
	groupLogic: 'Logic',
	groupArrows: 'Arrows',
	groupDelimiters: 'Brackets',
	groupDots: 'Dots',
	groupMatrices: 'Matrices',
};

// --- Lazy Locale Loader ---

const localeModules: LocaleModuleMap<FormulaLocale> = import.meta.glob<{
	default: FormulaLocale;
}>('./locales/*.ts', { eager: false });

export async function loadFormulaLocale(lang: string): Promise<FormulaLocale> {
	return loadLocaleModule(localeModules, lang, FORMULA_LOCALE_EN);
}
