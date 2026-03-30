/**
 * InlineCodePlugin: registers an inline code mark with MarkSpec,
 * toggle command, keyboard shortcut (Mod-E), backtick InputRule,
 * toolbar button, and mark exclusivity middleware.
 */

import { isMarkActive, toggleMark } from '../../commands/Commands.js';
import type { BlockNode, Mark } from '../../model/Document.js';
import { getBlockContentSegmentsInRange } from '../../model/Document.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { Step } from '../../state/Steps.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import {
	INLINE_CODE_LOCALE_EN,
	type InlineCodeLocale,
	loadInlineCodeLocale,
} from './InlineCodeLocale.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		code: Record<string, never>;
	}
}

// --- Configuration ---

export interface InlineCodeConfig {
	/** Show toolbar button. Default: true */
	readonly toolbar?: boolean;
	/** Override keyboard shortcut. Set to null to disable. Default: 'Mod-E' */
	readonly keymap?: string | null;
	/** Enable backtick InputRule. Default: true */
	readonly inputRule?: boolean;
	/** Override locale strings */
	readonly locale?: InlineCodeLocale;
}

const DEFAULT_CONFIG: InlineCodeConfig = {
	toolbar: true,
	keymap: 'Mod-E',
	inputRule: true,
};

// --- CSS ---

const INLINE_CODE_CSS = `
.notectl-content code {
	font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
	font-size: 0.9em;
	padding: 0.15em 0.35em;
	border-radius: 4px;
	background-color: var(--notectl-code-bg, rgba(127, 127, 127, 0.15));
	color: var(--notectl-code-color, inherit);
	word-break: break-word;
}
@media (forced-colors: active) {
	.notectl-content code {
		border: 1px solid LinkText;
	}
}
`;

// --- Mark Exclusivity ---

const EXCLUDED_WITH_CODE: ReadonlySet<string> = new Set([
	'bold',
	'italic',
	'underline',
	'strikethrough',
	'highlight',
	'font',
	'fontSize',
	'superscript',
	'subscript',
]);

// --- Plugin ---

export class InlineCodePlugin implements Plugin {
	readonly id = 'inline-code';
	readonly name = 'Inline Code';
	readonly priority = 22;

	private readonly config: InlineCodeConfig;
	private locale!: InlineCodeLocale;

	constructor(config?: Partial<InlineCodeConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			INLINE_CODE_LOCALE_EN,
			loadInlineCodeLocale,
		);
		context.registerStyleSheet(INLINE_CODE_CSS);
		this.registerMarkSpec(context);
		this.registerCommand(context);

		if (this.config.keymap !== null) {
			this.registerKeymap(context);
		}
		if (this.config.inputRule !== false) {
			this.registerInputRule(context);
		}
		if (this.config.toolbar !== false) {
			this.registerToolbarItem(context);
		}
		this.registerExclusivityMiddleware(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'code',
			rank: 3,
			toDOM() {
				return document.createElement('code');
			},
			toHTMLString: (_mark, content) => `<code>${content}</code>`,
			parseHTML: [
				{ tag: 'code' },
				{
					tag: 'span',
					getAttrs: (el: HTMLElement) => {
						const fontFamily: string = el.style.fontFamily;
						if (/monospace/i.test(fontFamily)) return {};
						return false;
					},
				},
			],
			sanitize: { tags: ['code'] },
		});
	}

	private registerCommand(context: PluginContext): void {
		context.registerCommand('toggleInlineCode', () => {
			const tr = toggleMark(context.getState(), markType('code'));
			if (tr) {
				context.dispatch(tr);
				return true;
			}
			return false;
		});
	}

	private registerKeymap(context: PluginContext): void {
		const key: string = this.config.keymap ?? 'Mod-E';
		context.registerKeymap({
			[key]: () => context.executeCommand('toggleInlineCode'),
		});
	}

	private registerInputRule(context: PluginContext): void {
		const pattern: RegExp = /(?:^|[^`])(`([^`]+)`)$/;

		context.registerInputRule({
			pattern,
			handler(state, match, _start, end) {
				const sel = state.selection;
				if (!isTextSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
				if (!block || block.type === 'code_block') return null;

				const innerText: string | undefined = match[2];
				const backtickExpr: string | undefined = match[1];
				if (!innerText || !backtickExpr) return null;

				const backtickExprStart: number = end - backtickExpr.length;

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, backtickExprStart, end)
					.insertText(sel.anchor.blockId, backtickExprStart, innerText, [
						{ type: markType('code') },
					])
					.setSelection(
						createCollapsedSelection(sel.anchor.blockId, backtickExprStart + innerText.length),
					)
					.build();
			},
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>';

		context.registerToolbarItem({
			id: 'inline_code',
			group: 'format',
			icon,
			label: this.locale.label,
			tooltip: this.locale.tooltip(formatShortcut(this.config.keymap ?? 'Mod-E')),
			command: 'toggleInlineCode',
			isActive: (state) => isMarkActive(state, markType('code')),
		});
	}

	/**
	 * Prevents formatting marks from coexisting with the code mark.
	 * Bold, italic, underline, etc. are stripped when code is applied,
	 * and code is blocked on text that already has formatting marks.
	 * The link mark is allowed to coexist.
	 */
	private registerExclusivityMiddleware(context: PluginContext): void {
		context.registerMiddleware(
			(tr, state, next) => {
				let patched = false;
				const patchedSteps: Step[] = [];

				for (const step of tr.steps) {
					if (step.type !== 'addMark') {
						patchedSteps.push(step);
						continue;
					}

					const stepMarkType: string = step.mark.type;

					if (stepMarkType === 'code') {
						// Adding code mark: inject removeMark steps for excluded marks
						const block: BlockNode | undefined = state.getBlock(step.blockId);
						if (block) {
							const segments = getBlockContentSegmentsInRange(block, step.from, step.to);
							const marksToRemove: Set<string> = new Set();
							for (const seg of segments) {
								if (seg.kind !== 'text') continue;
								for (const m of seg.marks) {
									if (EXCLUDED_WITH_CODE.has(m.type)) {
										marksToRemove.add(m.type);
									}
								}
							}
							for (const mt of marksToRemove) {
								patched = true;
								patchedSteps.push({
									type: 'removeMark',
									blockId: step.blockId,
									from: step.from,
									to: step.to,
									mark: { type: markType(mt) },
									...(step.path ? { path: step.path } : {}),
								});
							}
						}
						patchedSteps.push(step);
						continue;
					}

					if (EXCLUDED_WITH_CODE.has(stepMarkType)) {
						// Adding a formatting mark: block if target range has code mark
						const block: BlockNode | undefined = state.getBlock(step.blockId);
						if (block) {
							const segments = getBlockContentSegmentsInRange(block, step.from, step.to);
							const hasCode: boolean = segments.some(
								(seg) => seg.kind === 'text' && seg.marks.some((m) => m.type === 'code'),
							);
							if (hasCode) {
								patched = true;
								continue; // skip this step
							}
						}
					}

					patchedSteps.push(step);
				}

				// Handle stored marks
				let storedMarksAfter: readonly Mark[] | null = tr.storedMarksAfter;
				if (storedMarksAfter) {
					const hasCode: boolean = storedMarksAfter.some((m) => m.type === 'code');
					const hasExcluded: boolean = storedMarksAfter.some((m) => EXCLUDED_WITH_CODE.has(m.type));

					if (hasCode && hasExcluded) {
						// Keep code, strip formatting marks
						storedMarksAfter = storedMarksAfter.filter((m) => !EXCLUDED_WITH_CODE.has(m.type));
						patched = true;
					}
				}

				next(patched ? { ...tr, steps: patchedSteps, storedMarksAfter } : tr);
			},
			{ name: 'inline-code:mark-exclusivity', priority: 50 },
		);
	}
}
