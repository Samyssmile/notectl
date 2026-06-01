/**
 * CSS for formula nodes and the authoring surfaces (editor panel + overlay).
 *
 * The `font-family: 'Notectl Math', math` cascade is essential: a real-browser
 * spike showed Chromium renders stretchy constructs (matrix brackets, large
 * integrals/roots) incorrectly without an explicit OpenType MATH font, and
 * correctly once one is applied. The bundled font is opt-in (see ./fonts); the
 * `math` generic keyword is the graceful fallback.
 */

export const FORMULA_CSS = `
.notectl-math math {
	font-family: 'Notectl Math', math;
}

.notectl-math--inline {
	display: inline-block;
	vertical-align: middle;
	padding: 0 1px;
	border-radius: 3px;
	cursor: pointer;
	user-select: none;
	-webkit-user-select: none;
}

.notectl-math--inline:hover {
	background: var(--notectl-highlight, rgba(0, 0, 0, 0.06));
}

.notectl-math--inline:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 1px;
}

.notectl-math--inline math {
	font-size: 1.15em;
}

.notectl-math--display {
	display: block;
	margin: 12px 0;
	text-align: center;
	cursor: pointer;
	user-select: none;
	-webkit-user-select: none;
}

.notectl-math--display math {
	font-size: 1.35em;
	display: inline-block;
}

.notectl-math--display.notectl-math--selected {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 4px;
	border-radius: 6px;
}

.notectl-math__error,
.notectl-math merror {
	color: var(--notectl-danger, #c0392b);
	background: var(--notectl-danger-bg, rgba(192, 57, 43, 0.1));
	border-radius: 3px;
	padding: 0 2px;
}
`;

export const FORMULA_EDITOR_CSS = `
.notectl-formula-editor {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	min-width: 320px;
	max-width: 460px;
	box-sizing: border-box;
}

.notectl-formula-editor__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.notectl-formula-editor__label {
	font-size: 12px;
	font-weight: 600;
	color: var(--notectl-fg-muted, #555);
}

.notectl-formula-editor__input {
	width: 100%;
	box-sizing: border-box;
	padding: 6px 8px;
	font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
	font-size: 13px;
	line-height: 1.5;
	resize: vertical;
	min-height: 56px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-overlay, #fff);
	color: var(--notectl-fg);
}

.notectl-formula-editor__alt {
	width: 100%;
	box-sizing: border-box;
	padding: 5px 8px;
	font-size: 13px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-overlay, #fff);
	color: var(--notectl-fg);
}

.notectl-formula-editor__preview {
	min-height: 44px;
	padding: 8px;
	border: 1px dashed var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised, #fafafa);
	text-align: center;
	overflow-x: auto;
}

.notectl-formula-editor__preview math {
	font-family: 'Notectl Math', math;
	font-size: 1.3em;
}

.notectl-formula-editor__preview-empty {
	color: var(--notectl-fg-muted, #888);
	font-size: 13px;
}

.notectl-formula-editor__errors {
	color: var(--notectl-danger, #c0392b);
	font-size: 12px;
	margin: 0;
	padding-inline-start: 16px;
}

.notectl-formula-editor__row {
	display: flex;
	gap: 8px;
	align-items: center;
}

.notectl-formula-editor__toggle {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	color: var(--notectl-fg);
}

.notectl-formula-editor__actions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
	margin-top: 2px;
}

.notectl-formula-editor__btn {
	padding: 6px 14px;
	border: 1px solid var(--notectl-border);
	border-radius: 4px;
	background: var(--notectl-surface-raised);
	color: var(--notectl-fg);
	cursor: pointer;
	font-size: 13px;
}

.notectl-formula-editor__btn--primary {
	background: var(--notectl-primary);
	border-color: var(--notectl-primary);
	color: var(--notectl-primary-fg, #fff);
}

.notectl-formula-editor__btn:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 2px;
}

.notectl-formula-overlay {
	position: fixed;
	z-index: 1000;
	border: 1px solid var(--notectl-border);
	border-radius: 8px;
	background: var(--notectl-surface-overlay, #fff);
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}

.notectl-math-palette {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 2px 0 8px;
	border-bottom: 1px solid var(--notectl-border);
	margin-bottom: 2px;
}

.notectl-math-palette__group {
	display: flex;
	flex-wrap: wrap;
	gap: 2px;
}

.notectl-math-palette__group + .notectl-math-palette__group {
	border-inline-start: 1px solid var(--notectl-border);
	padding-inline-start: 6px;
}

.notectl-math-palette__btn {
	min-width: 30px;
	height: 30px;
	padding: 0 6px;
	border: 1px solid transparent;
	border-radius: 4px;
	background: transparent;
	color: var(--notectl-fg);
	cursor: pointer;
	font-size: 15px;
	line-height: 1;
}

.notectl-math-palette__btn:hover {
	background: var(--notectl-surface-raised);
}

.notectl-math-palette__btn:focus-visible {
	outline: 2px solid var(--notectl-primary);
	outline-offset: 1px;
}
`;
