/**
 * NodeView factory for code blocks.
 * Renders <pre> with a non-editable header (language label + action buttons)
 * and a <code> content area where the Reconciler renders text.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import { createDeleteCodeBlockTransaction } from './CodeBlockCommands.js';
import { CODE_BLOCK_LOCALE_EN, type CodeBlockLocale } from './CodeBlockLocale.js';
import type { CodeBlockConfig } from './CodeBlockTypes.js';

const COPY_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

const DELETE_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

/** Creates a NodeViewFactory for code_block nodes. */
export function createCodeBlockNodeViewFactory(
	config: CodeBlockConfig,
	locale: CodeBlockLocale = CODE_BLOCK_LOCALE_EN,
): NodeViewFactory {
	return (
		node: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
	): NodeView => {
		// --- DOM Construction ---
		const pre: HTMLElement = document.createElement('pre');
		pre.className = 'notectl-code-block';
		pre.setAttribute('data-block-id', node.id);
		pre.setAttribute('dir', 'ltr');
		pre.setAttribute('role', 'group');
		pre.setAttribute('aria-roledescription', 'code block');

		// Header (non-editable)
		const header: HTMLDivElement = document.createElement('div');
		header.className = 'notectl-code-block__header';
		header.setAttribute('contenteditable', 'false');

		const langLabel: HTMLSpanElement = document.createElement('span');
		langLabel.className = 'notectl-code-block__language';

		const showCopy: boolean = config.showCopyButton !== false;
		let copyBtn: HTMLButtonElement | null = null;

		if (showCopy) {
			copyBtn = document.createElement('button');
			copyBtn.className = 'notectl-code-block__copy';
			copyBtn.setAttribute('aria-label', locale.copyCodeAria);
			copyBtn.setAttribute('data-notectl-no-print', '');
			copyBtn.type = 'button';
			copyBtn.innerHTML = COPY_ICON;
		}

		// Delete button
		const deleteBtn: HTMLButtonElement = document.createElement('button');
		deleteBtn.className = 'notectl-code-block__delete';
		deleteBtn.setAttribute('aria-label', locale.deleteCodeBlockAria);
		deleteBtn.title = locale.deleteCodeBlockAria;
		deleteBtn.setAttribute('data-notectl-no-print', '');
		deleteBtn.type = 'button';
		deleteBtn.innerHTML = DELETE_ICON;

		// Screen reader live region for action feedback
		const announcer: HTMLSpanElement = document.createElement('span');
		announcer.className = 'notectl-sr-only';
		announcer.setAttribute('aria-live', 'assertive');
		announcer.setAttribute('aria-atomic', 'true');

		// Actions wrapper groups buttons on the right side
		const actions: HTMLDivElement = document.createElement('div');
		actions.className = 'notectl-code-block__actions';
		if (copyBtn) {
			actions.appendChild(copyBtn);
		}
		actions.appendChild(deleteBtn);

		header.appendChild(langLabel);
		header.appendChild(actions);
		header.appendChild(announcer);

		// Content area (Reconciler target)
		const code: HTMLElement = document.createElement('code');
		code.className = 'notectl-code-block__content';

		// Escape hint (visible only when focused, CSS-driven)
		const escHint: HTMLDivElement = document.createElement('div');
		escHint.className = 'notectl-code-block__esc-hint';
		escHint.setAttribute('contenteditable', 'false');
		escHint.setAttribute('aria-hidden', 'true');
		escHint.setAttribute('data-notectl-no-print', '');
		escHint.textContent = locale.escToExit;

		pre.appendChild(header);
		pre.appendChild(code);
		pre.appendChild(escHint);

		// Apply config-level color overrides as CSS custom properties
		if (config.background) {
			setStyleProperty(pre, '--notectl-code-block-bg', config.background);
		}
		if (config.headerBackground) {
			setStyleProperty(pre, '--notectl-code-block-header-bg', config.headerBackground);
		}
		if (config.textColor) {
			setStyleProperty(pre, '--notectl-code-block-color', config.textColor);
		}
		if (config.headerColor) {
			setStyleProperty(pre, '--notectl-code-block-header-color', config.headerColor);
		}

		let currentNodeId: BlockId = node.id;

		// --- Attribute Application ---

		function applyAttrs(n: BlockNode): void {
			const lang: string = (n.attrs?.language as string) ?? '';
			const langName: string = lang || 'plain';
			langLabel.textContent = langName;
			pre.setAttribute('aria-label', locale.codeBlockAriaLabel(langName));

			if (lang) {
				code.setAttribute('data-language', lang);
			} else {
				code.removeAttribute('data-language');
			}

			const bg: string = (n.attrs?.backgroundColor as string) ?? '';
			setStyleProperty(pre, 'backgroundColor', bg || '');
		}

		applyAttrs(node);

		// --- Copy Button Handler ---

		if (copyBtn) {
			copyBtn.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();

				const state: EditorState = getState();
				const block: BlockNode | undefined = state.getBlock(currentNodeId);
				if (!block) return;

				const text: string = getBlockText(block);
				navigator.clipboard.writeText(text);

				announcer.textContent = locale.copiedToClipboard;
				setTimeout(() => {
					announcer.textContent = '';
				}, 1000);
			});
		}

		// --- Delete Button Handler ---

		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const state: EditorState = getState();
			const tr: Transaction | null = createDeleteCodeBlockTransaction(state, currentNodeId);
			if (!tr) return;

			announcer.textContent = locale.deletedCodeBlock;
			dispatch(tr);
		});

		// --- NodeView Interface ---

		return {
			dom: pre,
			contentDOM: code,

			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'code_block') return false;
				currentNodeId = updatedNode.id;
				pre.setAttribute('data-block-id', updatedNode.id);
				applyAttrs(updatedNode);
				return true;
			},

			selectNode(): void {
				pre.classList.add('notectl-code-block--selected');
			},

			deselectNode(): void {
				pre.classList.remove('notectl-code-block--selected');
			},

			destroy(): void {
				// No cleanup needed
			},
		};
	};
}
