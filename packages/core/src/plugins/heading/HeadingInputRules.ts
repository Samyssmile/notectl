/**
 * Input rule registration for heading block types.
 * Converts `# `, `## `, etc. at the start of a paragraph into headings.
 */

import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import type { HeadingConfig } from './HeadingPlugin.js';

/** Registers markdown-style input rules (e.g. `# ` → H1) for configured heading levels. */
export function registerHeadingInputRules(context: PluginContext, config: HeadingConfig): void {
	for (const level of config.levels) {
		const hashes: string = '#'.repeat(level);
		const pattern: RegExp = new RegExp(`^${hashes} $`);

		context.registerInputRule({
			pattern,
			handler(state, _match, start, _end) {
				const sel = state.selection;
				if (isNodeSelection(sel) || isGapCursor(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, start, start + level + 1)
					.setBlockType(sel.anchor.blockId, nodeType('heading'), { level })
					.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
					.build();
			},
		});
	}
}
