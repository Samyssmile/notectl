/**
 * Static editor registrations for the code-block plugin: the `code_block`
 * NodeSpec, the ```` ```lang ```` input rule, the toolbar item, the mark-guard
 * middleware, the paste interceptor, and the table-cell content patch.
 *
 * These are pure registration helpers with no per-instance state, mirroring the
 * `registerCodeBlockCommands` / `registerCodeBlockKeymaps` pattern.
 */

import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import type { BlockNode } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { PasteInterceptor, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import type { CodeBlockLocale } from './CodeBlockLocale.js';
import { CODE_BLOCK_ICON } from './CodeBlockTypes.js';

export function registerCodeBlockNodeSpec(context: PluginContext): void {
	context.registerNodeSpec({
		type: 'code_block',
		group: 'block',
		content: { allow: ['text'] },
		selectable: true,
		attrs: {
			language: { default: '' },
			backgroundColor: { default: '' },
		},
		toDOM(node) {
			const pre: HTMLElement = createBlockElement('pre', node.id);
			pre.className = 'notectl-code-block';
			pre.setAttribute('dir', 'ltr');
			pre.setAttribute('part', 'code-block');
			const code: HTMLElement = document.createElement('code');
			code.className = 'notectl-code-block__content';
			code.setAttribute('part', 'code-block-content');
			pre.appendChild(code);
			return pre;
		},
		toHTML(node, content, ctx?: HTMLExportContext) {
			const lang: string = escapeHTML((node.attrs?.language as string) ?? '');
			const bg: string = escapeHTML((node.attrs?.backgroundColor as string) ?? '');
			const langClass: string = lang ? ` class="language-${lang}"` : '';
			const bgAttr: string = bg
				? (ctx?.styleAttr(`background-color: ${bg}`) ?? ` style="background-color: ${bg}"`)
				: '';
			return `<pre dir="ltr"${bgAttr}><code${langClass}>${content || ''}</code></pre>`;
		},
		parseHTML: [
			{
				tag: 'pre',
				getAttrs(el: HTMLElement) {
					const code: HTMLElement | null = el.querySelector('code');
					const langClass: string = code?.className.match(/language-(\S+)/)?.[1] ?? '';
					const dataLang: string = code?.getAttribute('data-language') ?? '';
					return {
						language: dataLang || langClass,
					};
				},
			},
		],
		sanitize: {
			tags: ['pre', 'code'],
			attrs: ['data-language', 'class', 'style'],
		},
	});
}

export function registerCodeBlockInputRule(context: PluginContext): void {
	context.registerInputRule({
		pattern: /^```(\w*) $/,
		handler: (state, match, start, _end) => {
			const sel = state.selection;
			if (!isTextSelection(sel)) return null;
			if (!isCollapsed(sel)) return null;

			const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
			if (!block || block.type !== 'paragraph') return null;

			const language: string = match[1] ?? '';
			const attrs: Record<string, string | number | boolean> = {
				language,
				backgroundColor: '',
			};

			return state
				.transaction('input')
				.deleteTextAt(sel.anchor.blockId, start, start + match[0].length)
				.setBlockType(sel.anchor.blockId, nodeType('code_block'), attrs)
				.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
				.build();
		},
	});
}

export function registerCodeBlockToolbarItem(
	context: PluginContext,
	locale: CodeBlockLocale,
	toggleKey: string | null,
): void {
	context.registerToolbarItem({
		id: 'code_block',
		group: 'block',
		icon: CODE_BLOCK_ICON,
		label: locale.label,
		tooltip: locale.tooltip(toggleKey ? formatShortcut(toggleKey) : undefined),
		command: 'toggleCodeBlock',
		isActive: (state) => {
			if (!isTextSelection(state.selection)) return false;
			const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
			return block?.type === 'code_block';
		},
	});
}

/** Strips `addMark` steps targeting a code block so inline marks never apply there. */
export function registerCodeBlockMarkGuard(context: PluginContext): void {
	context.registerMiddleware(
		(tr, state, next) => {
			const hasMarkInCodeBlock: boolean = tr.steps.some((step) => {
				if (step.type !== 'addMark') return false;
				const block: BlockNode | undefined = state.getBlock(step.blockId);
				return block?.type === 'code_block';
			});

			if (!hasMarkInCodeBlock) {
				next(tr);
				return;
			}

			const filtered = tr.steps.filter((step) => {
				if (step.type !== 'addMark') return true;
				const block: BlockNode | undefined = state.getBlock(step.blockId);
				return block?.type !== 'code_block';
			});

			next({ ...tr, steps: filtered });
		},
		{ name: 'code-block:mark-guard', priority: 50 },
	);
}

export function registerCodeBlockPasteInterceptor(context: PluginContext): void {
	const handleCodeBlockPaste: PasteInterceptor = (
		plainText: string,
		_html: string,
		state: EditorState,
	): Transaction | null => {
		if (!plainText) return null;
		if (!isTextSelection(state.selection)) return null;

		const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
		if (!block || block.type !== 'code_block') return null;

		const builder = state.transaction('paste');

		let insertBlockId: BlockId = state.selection.anchor.blockId;
		let insertOffset: number = state.selection.anchor.offset;

		if (!isCollapsed(state.selection)) {
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
			if (landingId) {
				insertBlockId = landingId;
				insertOffset = 0;
			}
		}

		builder.insertText(insertBlockId, insertOffset, plainText, []);
		builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + plainText.length));

		return builder.build();
	};

	context.registerPasteInterceptor(handleCodeBlockPaste, {
		name: 'code-block:paste',
		priority: 10,
	});
}

/** Extends `table_cell` content to allow nested code blocks, if not already allowed. */
export function patchTableCellContent(context: PluginContext): void {
	const registry = context.getSchemaRegistry();
	const cellSpec = registry.getNodeSpec('table_cell');
	if (!cellSpec?.content) return;

	const currentAllow: readonly string[] = cellSpec.content.allow ?? [];
	if (currentAllow.includes('code_block')) return;

	registry.removeNodeSpec('table_cell');
	registry.registerNodeSpec({
		...cellSpec,
		content: {
			...cellSpec.content,
			allow: [...currentAllow, 'code_block'],
		},
	});
}
