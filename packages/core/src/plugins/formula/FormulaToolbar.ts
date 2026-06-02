/**
 * Toolbar item for inserting formulas. Opens a custom popup that mounts the
 * accessible math field; on commit it inserts an inline or display formula
 * depending on the field's display toggle.
 */

import type { PluginContext } from '../Plugin.js';
import { commitInsertFormula } from './FormulaCommands.js';
import { mountFormulaEditor } from './FormulaEditorMount.js';
import type { FormulaLocale } from './FormulaLocale.js';
import type { MathFieldResult } from './math-field/index.js';

// Sigma (Σ) drawn as a clean STROKED outline, not a filled glyph. The toolbar
// CSS sets `fill: currentColor` on icon svgs, which would fill this open Σ
// polyline into a solid blob; the inline `fill:none` style overrides that (it
// beats the non-!important rule) so it renders as a normal Σ character.
const FORMULA_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
	'style="fill:none;stroke:currentColor;stroke-width:2.2;' +
	'stroke-linecap:round;stroke-linejoin:round">' +
	'<path d="M18 5 H6 L12 12 L6 19 H18"/></svg>';

/** Registers the "Insert formula" toolbar item (group: insert). */
export function registerFormulaToolbar(
	context: PluginContext,
	locale: FormulaLocale,
	fontSizes: readonly number[],
): void {
	context.registerToolbarItem({
		id: 'formula',
		group: 'insert',
		icon: FORMULA_ICON,
		label: locale.insertInline,
		tooltip: locale.insertInlineTooltip,
		command: 'insertInlineFormula',
		popupType: 'custom',
		renderPopup: (container: HTMLElement, ctx: PluginContext, onClose: () => void): void => {
			mountFormulaEditor(container, {
				context: ctx,
				locale,
				mode: 'insert',
				fontSizes,
				onClose,
				onCommit: (result: MathFieldResult): void => {
					commitInsertFormula(ctx, locale, result);
					onClose();
					ctx.getContainer().focus();
				},
			});
		},
	});
}
