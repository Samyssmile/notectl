/** Locale interface and default English locale for the AlignmentPlugin. */

export interface AlignmentLocale {
	readonly alignLeft: string;
	readonly alignCenter: string;
	readonly alignRight: string;
	readonly justify: string;
	readonly toolbarLabel: string;
	readonly toolbarTooltip: string;
}

// --- Default English Locale ---

export const ALIGNMENT_LOCALE_EN: AlignmentLocale = {
	alignLeft: 'Align Left',
	alignCenter: 'Align Center',
	alignRight: 'Align Right',
	justify: 'Justify',
	toolbarLabel: 'Alignment',
	toolbarTooltip: 'Alignment',
};

// --- German Locale ---

export const ALIGNMENT_LOCALE_DE: AlignmentLocale = {
	alignLeft: 'Linksbündig',
	alignCenter: 'Zentriert',
	alignRight: 'Rechtsbündig',
	justify: 'Blocksatz',
	toolbarLabel: 'Ausrichtung',
	toolbarTooltip: 'Ausrichtung',
};

// --- Spanish Locale ---

export const ALIGNMENT_LOCALE_ES: AlignmentLocale = {
	alignLeft: 'Alinear a la izquierda',
	alignCenter: 'Centrar',
	alignRight: 'Alinear a la derecha',
	justify: 'Justificar',
	toolbarLabel: 'Alineación',
	toolbarTooltip: 'Alineación',
};

// --- French Locale ---

export const ALIGNMENT_LOCALE_FR: AlignmentLocale = {
	alignLeft: 'Aligner à gauche',
	alignCenter: 'Centrer',
	alignRight: 'Aligner à droite',
	justify: 'Justifier',
	toolbarLabel: 'Alignement',
	toolbarTooltip: 'Alignement',
};

// --- Chinese (Simplified) Locale ---

export const ALIGNMENT_LOCALE_ZH: AlignmentLocale = {
	alignLeft: '左对齐',
	alignCenter: '居中',
	alignRight: '右对齐',
	justify: '两端对齐',
	toolbarLabel: '对齐',
	toolbarTooltip: '对齐',
};

// --- Russian Locale ---

export const ALIGNMENT_LOCALE_RU: AlignmentLocale = {
	alignLeft: 'По левому краю',
	alignCenter: 'По центру',
	alignRight: 'По правому краю',
	justify: 'По ширине',
	toolbarLabel: 'Выравнивание',
	toolbarTooltip: 'Выравнивание',
};

// --- Arabic Locale ---

export const ALIGNMENT_LOCALE_AR: AlignmentLocale = {
	alignLeft: 'محاذاة لليسار',
	alignCenter: 'توسيط',
	alignRight: 'محاذاة لليمين',
	justify: 'ضبط',
	toolbarLabel: 'المحاذاة',
	toolbarTooltip: 'المحاذاة',
};

// --- Hindi Locale ---

export const ALIGNMENT_LOCALE_HI: AlignmentLocale = {
	alignLeft: 'बाएँ संरेखित करें',
	alignCenter: 'केंद्र में',
	alignRight: 'दाएँ संरेखित करें',
	justify: 'समायोजित करें',
	toolbarLabel: 'संरेखण',
	toolbarTooltip: 'संरेखण',
};

// --- Locale Map ---

export const ALIGNMENT_LOCALES: Record<string, AlignmentLocale> = {
	en: ALIGNMENT_LOCALE_EN,
	de: ALIGNMENT_LOCALE_DE,
	es: ALIGNMENT_LOCALE_ES,
	fr: ALIGNMENT_LOCALE_FR,
	zh: ALIGNMENT_LOCALE_ZH,
	ru: ALIGNMENT_LOCALE_RU,
	ar: ALIGNMENT_LOCALE_AR,
	hi: ALIGNMENT_LOCALE_HI,
};
