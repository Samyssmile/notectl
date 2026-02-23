/**
 * NodeView factory for code blocks.
 * Renders <pre> with a non-editable header (language label + copy button)
 * and a <code> content area where the Reconciler renders text.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import type { CodeBlockConfig } from './CodeBlockTypes.js';

const COPY_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

/** Creates a NodeViewFactory for code_block nodes. */
export function createCodeBlockNodeViewFactory(config: CodeBlockConfig): NodeViewFactory {
	return (
		node: BlockNode,
		getState: () => EditorState,
		_dispatch: (tr: Transaction) => void,
	): NodeView => {
		// --- DOM Construction ---
		const pre: HTMLElement = document.createElement('pre');
		pre.className = 'notectl-code-block';
		pre.setAttribute('data-block-id', node.id);
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
			copyBtn.setAttribute('aria-label', 'Copy code');
			copyBtn.type = 'button';
			copyBtn.innerHTML = COPY_ICON;
		}

		// Screen reader live region for copy feedback
		const copyAnnouncer: HTMLSpanElement = document.createElement('span');
		copyAnnouncer.className = 'notectl-sr-only';
		copyAnnouncer.setAttribute('aria-live', 'assertive');
		copyAnnouncer.setAttribute('aria-atomic', 'true');

		header.appendChild(langLabel);
		if (copyBtn) {
			header.appendChild(copyBtn);
		}
		header.appendChild(copyAnnouncer);

		// Content area (Reconciler target)
		const code: HTMLElement = document.createElement('code');
		code.className = 'notectl-code-block__content';

		// Escape hint (visible only when focused, CSS-driven)
		const escHint: HTMLDivElement = document.createElement('div');
		escHint.className = 'notectl-code-block__esc-hint';
		escHint.setAttribute('contenteditable', 'false');
		escHint.setAttribute('aria-hidden', 'true');
		escHint.textContent = 'Esc to exit';

		pre.appendChild(header);
		pre.appendChild(code);
		pre.appendChild(escHint);

		// Apply config-level color overrides as CSS custom properties
		if (config.background) {
			pre.style.setProperty('--notectl-code-block-bg', config.background);
		}
		if (config.headerBackground) {
			pre.style.setProperty('--notectl-code-block-header-bg', config.headerBackground);
		}
		if (config.textColor) {
			pre.style.setProperty('--notectl-code-block-color', config.textColor);
		}
		if (config.headerColor) {
			pre.style.setProperty('--notectl-code-block-header-color', config.headerColor);
		}

		let currentNodeId: BlockId = node.id;

		// --- Attribute Application ---

		function applyAttrs(n: BlockNode): void {
			const lang: string = (n.attrs?.language as string) ?? '';
			const langName: string = lang || 'plain';
			langLabel.textContent = langName;
			pre.setAttribute('aria-label', `${langName} code block. Press Escape to exit.`);

			if (lang) {
				code.setAttribute('data-language', lang);
			} else {
				code.removeAttribute('data-language');
			}

			const bg: string = (n.attrs?.backgroundColor as string) ?? '';
			pre.style.backgroundColor = bg || '';
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

				// Announce to screen readers
				copyAnnouncer.textContent = 'Copied to clipboard';
				setTimeout(() => {
					copyAnnouncer.textContent = '';
				}, 1000);
			});
		}

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
