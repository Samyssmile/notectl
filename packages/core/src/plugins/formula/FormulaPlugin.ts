/**
 * FormulaPlugin: dependency-free, accessibility-first math support for notectl.
 *
 * Stores formulas as canonical MathML (the screen-reader surface) with the
 * LaTeX source embedded as a TeX annotation for lossless re-editing. Renders
 * natively via the browser's MathML engine (no runtime math library), authored
 * through a LaTeX field with live preview plus an accessible structural palette.
 *
 * Layer split: `latex/`, `mathml/`, and `math-field/` are framework-agnostic
 * (zero notectl imports), publishable on their own; this file and its siblings
 * are the notectl glue.
 */

import type { Keymap } from '../../model/Keymap.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { createDisplayMathNodeSpec } from './DisplayMathNodeSpec.js';
import { createDisplayMathNodeViewFactory } from './DisplayMathNodeView.js';
import {
	adjacentInlineEditTarget,
	displayEditTarget,
	inlineEditTargetFromElement,
	selectedDisplayBlockId,
} from './FormulaEditTrigger.js';
import { createFormulaInputRules } from './FormulaInputRules.js';
import { FORMULA_LOCALE_EN, type FormulaLocale, loadFormulaLocale } from './FormulaLocale.js';
import { FormulaOverlay } from './FormulaOverlay.js';
import { createFormulaPasteInterceptor } from './FormulaPasteInterceptor.js';
import { FORMULA_CSS, FORMULA_EDITOR_CSS } from './FormulaStyles.js';
import { registerFormulaToolbar } from './FormulaToolbar.js';
import {
	DEFAULT_FORMULA_CONFIG,
	DEFAULT_FORMULA_FONT_SIZES,
	DEFAULT_FORMULA_KEYMAP,
	DISPLAY_MATH_TYPE,
	type FormulaKeymap,
	type FormulaPluginConfig,
} from './FormulaTypes.js';
import { createInlineMathNodeSpec } from './InlineMathNodeSpec.js';
import { buildMathFontFaceCss } from './MathFontFace.js';

const INLINE_MATH_SELECTOR = '.notectl-math--inline';

export class FormulaPlugin implements Plugin {
	readonly id = 'formula';
	readonly name = 'Formula';
	readonly priority = 46;

	private readonly config: FormulaPluginConfig;
	private readonly resolvedKeymap: Readonly<Record<keyof FormulaKeymap, string | null>>;
	private readonly fontSizes: readonly number[];
	private locale: FormulaLocale = FORMULA_LOCALE_EN;
	private overlay: FormulaOverlay | null = null;
	private context: PluginContext | null = null;
	private clickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(config?: Partial<FormulaPluginConfig>) {
		this.config = { ...DEFAULT_FORMULA_CONFIG, ...config };
		this.resolvedKeymap = { ...DEFAULT_FORMULA_KEYMAP, ...config?.keymap };
		this.fontSizes = this.config.fontSizes ?? DEFAULT_FORMULA_FONT_SIZES;
	}

	async init(context: PluginContext): Promise<void> {
		this.context = context;
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			FORMULA_LOCALE_EN,
			loadFormulaLocale,
		);
		context.registerStyleSheet(FORMULA_CSS);
		context.registerStyleSheet(FORMULA_EDITOR_CSS);
		if (this.config.mathFont) {
			context.registerStyleSheet(buildMathFontFaceCss(this.config.mathFont));
		}

		context.registerInlineNodeSpec(createInlineMathNodeSpec());
		context.registerNodeSpec(createDisplayMathNodeSpec());

		this.overlay = new FormulaOverlay(context, this.locale, this.fontSizes);
		context.registerNodeView(
			DISPLAY_MATH_TYPE,
			createDisplayMathNodeViewFactory({
				onEdit: (blockId, rect) => this.editDisplay(blockId, rect),
				onSelect: () => context.announce(this.locale.selected),
			}),
		);
		for (const rule of createFormulaInputRules()) context.registerInputRule(rule);
		// Priority below smart-paste (50) so standalone <math> is claimed first.
		context.registerPasteInterceptor(createFormulaPasteInterceptor(), {
			name: 'formula',
			priority: 40,
		});

		this.registerCommands(context);
		this.registerKeymap(context);
		registerFormulaToolbar(context, this.locale, this.fontSizes);
		this.installClickToEdit(context);
	}

	destroy(): void {
		if (this.clickHandler && this.context) {
			this.context.getContainer().removeEventListener('click', this.clickHandler);
		}
		this.clickHandler = null;
		this.overlay?.close(false);
		this.overlay = null;
		this.context = null;
	}

	private registerCommands(context: PluginContext): void {
		// Context-aware: edit the formula at the caret if there is one, else insert.
		context.registerCommand('insertInlineFormula', () => {
			const adjacent = adjacentInlineEditTarget(context.getState());
			if (adjacent) {
				this.overlay?.openEdit(adjacent);
				return true;
			}
			this.overlay?.openInsert(false);
			return true;
		});
		context.registerCommand('insertDisplayFormula', () => {
			const blockId = selectedDisplayBlockId(context.getState());
			if (blockId) {
				this.editDisplay(blockId, null);
				return true;
			}
			this.overlay?.openInsert(true);
			return true;
		});
	}

	private registerKeymap(context: PluginContext): void {
		const keymap: Record<string, () => boolean> = {};
		const inline: string | null = this.resolvedKeymap.insertInline;
		const display: string | null = this.resolvedKeymap.insertDisplay;
		if (inline) keymap[inline] = () => context.executeCommand('insertInlineFormula');
		if (display) keymap[display] = () => context.executeCommand('insertDisplayFormula');
		// Enter edits the currently selected display formula; otherwise falls through.
		keymap.Enter = () => {
			const blockId = selectedDisplayBlockId(context.getState());
			if (!blockId) return false;
			this.editDisplay(blockId, null);
			return true;
		};
		context.registerKeymap(keymap as Keymap, { priority: 'context' });
	}

	private installClickToEdit(context: PluginContext): void {
		const container: HTMLElement = context.getContainer();
		const handler = (e: MouseEvent): void => {
			if (context.isReadOnly()) return;
			const target = e.target as HTMLElement | null;
			const element = target?.closest(INLINE_MATH_SELECTOR) as HTMLElement | null;
			if (!element) return;
			const editTarget = inlineEditTargetFromElement(container, element, context.getState());
			if (!editTarget) return;
			e.preventDefault();
			this.overlay?.openEdit(editTarget);
		};
		this.clickHandler = handler;
		container.addEventListener('click', handler);
	}

	private editDisplay(blockId: BlockId, rect: DOMRect | null): void {
		if (!this.overlay || !this.context) return;
		const target = displayEditTarget(this.context.getState(), blockId, rect);
		if (target) this.overlay.openEdit(target);
	}
}
