/**
 * Types for the accessible math field (Layer A, zero notectl imports).
 *
 * The math field is the reusable, framework-agnostic authoring surface for a
 * single formula: a LaTeX source field, a live MathML preview, an accessible
 * description field, and a structural palette. It is designed to be publishable
 * as a standalone `<a11y-math-field>` and therefore knows nothing about notectl
 * — it communicates MathML/LaTeX in and out through plain callbacks.
 */

/** The committed result of editing a formula. */
export interface MathFieldResult {
	/** LaTeX source as typed. */
	readonly latex: string;
	/** Canonical `<math>` string (presentation + TeX annotation + display flag). */
	readonly mathml: string;
	/** Accessible fallback description. */
	readonly alt: string;
	/** Whether this is display (block) math. */
	readonly display: boolean;
	/** CSS font-size for the whole formula (e.g. `'24px'`); empty string inherits. */
	readonly fontSize: string;
}

/** User-facing strings the math field renders (supplied by the host). */
export interface MathFieldLocale {
	readonly latexLabel: string;
	readonly latexPlaceholder: string;
	readonly previewLabel: string;
	readonly emptyPreview: string;
	readonly altLabel: string;
	readonly altPlaceholder: string;
	readonly displayToggle: string;
	readonly sizeLabel: string;
	readonly sizeDefault: string;
	readonly commitInsert: string;
	readonly commitUpdate: string;
	readonly cancel: string;
	readonly paletteLabel: string;
	readonly unknownCommand: (command: string) => string;
}

/** A single palette/keyboard button that inserts a LaTeX snippet. */
export interface MathPaletteItem {
	/** Visible button content (usually the rendered symbol or a short label). */
	readonly label: string;
	/** Accessible name (announced by screen readers). */
	readonly ariaLabel: string;
	/** LaTeX to insert. A `$0` marker, if present, sets the caret position. */
	readonly snippet: string;
}

/** A labelled group of palette items (e.g. "Fractions", "Greek letters"). */
export interface MathPaletteGroup {
	readonly id: string;
	readonly label: string;
	readonly items: readonly MathPaletteItem[];
}

/** Configuration for constructing a {@link MathField}. */
export interface MathFieldOptions {
	readonly locale: MathFieldLocale;
	readonly mode: 'insert' | 'edit';
	readonly initialLatex?: string;
	readonly initialAlt?: string;
	readonly initialDisplay?: boolean;
	/** Initial CSS font-size (e.g. `'24px'`); empty/omitted means inherit. */
	readonly initialFontSize?: string;
	/** Preset px sizes for the size control; omit to hide the control entirely. */
	readonly fontSizes?: readonly number[];
	/** Structural palette groups; omit for a LaTeX-only field. */
	readonly palette?: readonly MathPaletteGroup[];
	/** Called when the user commits (Insert/Update button or Ctrl/Cmd+Enter). */
	readonly onCommit: (result: MathFieldResult) => void;
	/** Called when the user cancels (Cancel button or Escape). */
	readonly onCancel: () => void;
}
