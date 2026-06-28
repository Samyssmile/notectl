/**
 * Shared factory for live Markdown "wrapping mark" input rules (D6).
 *
 * Covers the three wrapping marks that share the `inline-code` rule's shape:
 * bold (`**x**`), italic (`*x*`), and strikethrough (`~~x~~`). The link rule is
 * structurally different (two capture groups, an `href`/`title` attr) and stays
 * bespoke in the link plugin. These live rules are intentionally simpler than
 * the full parser and may diverge in edge cases; the conformance bar applies to
 * full-document import/export, not live typing.
 */

import type { BlockNode } from '../../model/Document.js';
import type { InputRule } from '../../model/InputRule.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';

/** Escapes a string for safe use inside a RegExp character class / literal. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a live input rule that wraps `delimiter…delimiter` text in `markTypeName`.
 * The opening delimiter must not be preceded by its own first character (so `*`
 * does not fire inside `**`), and the wrapped text may not contain that
 * character or a newline (a bounded, backtracking-free pattern).
 */
export function createMarkInputRule(markTypeName: string, delimiter: string): InputRule {
	const delim: string = escapeRegExp(delimiter);
	const guard: string = escapeRegExp(delimiter[0] ?? '');
	const pattern = new RegExp(`(?:^|[^${guard}])(${delim}([^${guard}\\n]+)${delim})$`);

	return {
		pattern,
		handler(state, match, _start, end) {
			const sel = state.selection;
			if (!isTextSelection(sel) || !isCollapsed(sel)) return null;

			const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
			if (!block || block.type === 'code_block') return null;

			const inner: string | undefined = match[2];
			const expr: string | undefined = match[1];
			if (!inner || !expr) return null;

			const exprStart: number = end - expr.length;
			return state
				.transaction('input')
				.deleteTextAt(sel.anchor.blockId, exprStart, end)
				.insertText(sel.anchor.blockId, exprStart, inner, [{ type: markType(markTypeName) }])
				.setSelection(createCollapsedSelection(sel.anchor.blockId, exprStart + inner.length))
				.build();
		},
	};
}
