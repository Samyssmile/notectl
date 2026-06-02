/**
 * Floating editor overlay for inserting and editing formulas.
 *
 * A focusable panel positioned at the caret (insert) or the formula's bounding
 * rect (edit), living OUTSIDE the editable/reconciled DOM. This is the pattern
 * the PR1 plan mandates instead of a widget decoration: a widget would be
 * rebuilt on every keystroke (losing focus/state) and a focusable input inside
 * contenteditable fights SelectionSync. Changes commit as a single transaction
 * on apply, so undo/redo work and per-keystroke re-rendering never happens.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import {
	commitInsertFormula,
	resultToFormulaAttrs,
	updateDisplayMath,
	updateInlineMath,
} from './FormulaCommands.js';
import { mountFormulaEditor } from './FormulaEditorMount.js';
import type { FormulaLocale } from './FormulaLocale.js';
import type { FormulaAttrs } from './FormulaTypes.js';
import type { MathFieldResult } from './math-field/index.js';

/** Identifies which existing formula node is being edited and where it sits. */
export interface FormulaEditTarget {
	readonly kind: 'inline' | 'display';
	readonly latex: string;
	readonly alt: string;
	/** Current CSS font-size of the formula (e.g. `'24px'`); empty inherits. */
	readonly fontSize: string;
	/** Anchor rect; when null the overlay falls back to the caret position. */
	readonly rect: DOMRect | null;
	/** Inline: the containing block id + the node's offset within it. */
	readonly blockId?: BlockId;
	readonly offset?: number;
	/** Display: the node's path. */
	readonly path?: readonly BlockId[];
}

const PANEL_MARGIN = 8;

export class FormulaOverlay {
	private panel: HTMLElement | null = null;
	private outsideHandler: ((e: MouseEvent) => void) | null = null;

	constructor(
		private readonly context: PluginContext,
		private readonly locale: FormulaLocale,
		private readonly fontSizes: readonly number[],
	) {}

	/** Whether the overlay is currently open. */
	isOpen(): boolean {
		return this.panel !== null;
	}

	/** Opens the overlay at the caret to insert a new formula. */
	openInsert(display: boolean): void {
		if (this.context.isReadOnly()) return;
		const rect: DOMRect | null = caretRect();
		this.open({
			rect,
			mode: 'insert',
			initialDisplay: display,
			onCommit: (result: MathFieldResult) => {
				commitInsertFormula(this.context, this.locale, result);
				this.close(true);
			},
		});
	}

	/** Opens the overlay at an existing formula to edit it. */
	openEdit(target: FormulaEditTarget): void {
		if (this.context.isReadOnly()) return;
		this.context.announce(this.locale.editing);
		this.open({
			rect: target.rect ?? caretRect(),
			mode: 'edit',
			initialLatex: target.latex,
			initialAlt: target.alt,
			initialDisplay: target.kind === 'display',
			initialFontSize: target.fontSize,
			onCommit: (result: MathFieldResult) => {
				this.commitEdit(target, result);
				this.context.announce(this.locale.updated);
				this.close(true);
			},
		});
	}

	/** Closes the overlay, optionally returning focus to the editor. */
	close(returnFocus: boolean): void {
		if (!this.panel) return;
		if (this.outsideHandler) {
			document.removeEventListener('mousedown', this.outsideHandler, true);
			this.outsideHandler = null;
		}
		this.panel.remove();
		this.panel = null;
		if (returnFocus) this.context.getContainer().focus();
	}

	private commitEdit(target: FormulaEditTarget, result: MathFieldResult): void {
		const attrs: FormulaAttrs = resultToFormulaAttrs(result);
		if (target.kind === 'inline' && target.blockId && target.offset !== undefined) {
			updateInlineMath(this.context, target.blockId, target.offset, attrs);
		} else if (target.kind === 'display' && target.path) {
			updateDisplayMath(this.context, target.path, attrs);
		}
	}

	private open(config: {
		rect: DOMRect | null;
		mode: 'insert' | 'edit';
		initialLatex?: string;
		initialAlt?: string;
		initialDisplay?: boolean;
		initialFontSize?: string;
		onCommit: (result: MathFieldResult) => void;
	}): void {
		this.close(false);
		const panel: HTMLDivElement = document.createElement('div');
		panel.className = 'notectl-formula-overlay';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute(
			'aria-label',
			config.mode === 'edit' ? this.locale.editFormula : this.locale.insertInline,
		);
		this.panel = panel;

		mountFormulaEditor(panel, {
			context: this.context,
			locale: this.locale,
			mode: config.mode,
			initialLatex: config.initialLatex,
			initialAlt: config.initialAlt,
			initialDisplay: config.initialDisplay,
			initialFontSize: config.initialFontSize,
			fontSizes: this.fontSizes,
			onCommit: config.onCommit,
			onClose: () => this.close(true),
		});

		// Mount inside the editor's shadow DOM so the registered stylesheets apply,
		// but outside the editable content flow. Positioned `fixed` (viewport coords).
		this.context.getPluginContainer('top').appendChild(panel);
		positionPanel(panel, config.rect);
		this.installOutsideHandler();
	}

	private installOutsideHandler(): void {
		const handler = (e: MouseEvent): void => {
			// Use composedPath, not e.target: the panel lives in the editor's shadow
			// DOM, so a document-level listener sees events retargeted to the host.
			if (this.panel && !e.composedPath().includes(this.panel)) {
				this.close(false);
			}
		};
		this.outsideHandler = handler;
		// Defer so the click that opened the overlay doesn't immediately close it.
		requestAnimationFrame(() => {
			if (this.outsideHandler) document.addEventListener('mousedown', handler, true);
		});
	}
}

/** Returns the bounding rect of the current DOM selection caret, if any. */
function caretRect(): DOMRect | null {
	const selection: Selection | null = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const rect: DOMRect = selection.getRangeAt(0).getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return null;
	return rect;
}

/**
 * Positions the panel below the anchor rect, clamped to the viewport. The panel
 * is `position: fixed`, so viewport coordinates from `getBoundingClientRect` are
 * used directly (no scroll offset).
 */
function positionPanel(panel: HTMLElement, rect: DOMRect | null): void {
	const anchorTop: number = rect ? rect.bottom : window.innerHeight / 3;
	const anchorLeft: number = rect ? rect.left : window.innerWidth / 3;
	const width: number = panel.offsetWidth || 360;
	const maxLeft: number = window.innerWidth - width - PANEL_MARGIN;
	const left: number = Math.max(PANEL_MARGIN, Math.min(anchorLeft, maxLeft));
	const maxTop: number = window.innerHeight - panel.offsetHeight - PANEL_MARGIN;
	const top: number = Math.min(anchorTop + PANEL_MARGIN, Math.max(PANEL_MARGIN, maxTop));
	panel.style.left = `${Math.round(left)}px`;
	panel.style.top = `${Math.round(top)}px`;
}
