/**
 * NodeView factory for image blocks.
 * Renders <figure> with <img>, handles selection state, upload overlay,
 * and resize with 4 corner handles + live size indicator.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import type { ImagePluginConfig, UploadState } from './ImageUpload.js';

const ALIGNMENT_CLASSES: Record<string, string> = {
	left: 'notectl-image--left',
	center: 'notectl-image--center',
	right: 'notectl-image--right',
};

// --- Alignment toolbar icons ---

const ALIGN_LEFT_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>';
const ALIGN_CENTER_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>';
const ALIGN_RIGHT_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>';

interface AlignmentDef {
	readonly key: string;
	readonly icon: string;
	readonly label: string;
}

const ALIGNMENTS: readonly AlignmentDef[] = [
	{ key: 'left', icon: ALIGN_LEFT_ICON, label: 'Align left' },
	{ key: 'center', icon: ALIGN_CENTER_ICON, label: 'Align center' },
	{ key: 'right', icon: ALIGN_RIGHT_ICON, label: 'Align right' },
];

const MIN_IMAGE_WIDTH = 50;

type HandlePosition = 'nw' | 'ne' | 'sw' | 'se';

const HANDLE_CURSORS: Readonly<Record<HandlePosition, string>> = {
	nw: 'nwse-resize',
	ne: 'nesw-resize',
	sw: 'nesw-resize',
	se: 'nwse-resize',
};

/** +1 means dragging right increases width; -1 means dragging left does. */
const HANDLE_X_SIGN: Readonly<Record<HandlePosition, 1 | -1>> = {
	nw: -1,
	ne: 1,
	sw: -1,
	se: 1,
};

// --- Global cursor override during resize ---

let activeCursorStyle: HTMLStyleElement | null = null;

function setGlobalResizeCursor(cursor: string): void {
	clearGlobalResizeCursor();
	activeCursorStyle = document.createElement('style');
	activeCursorStyle.textContent = `*{cursor:${cursor}!important;user-select:none!important}`;
	document.head.appendChild(activeCursorStyle);
}

function clearGlobalResizeCursor(): void {
	if (activeCursorStyle) {
		activeCursorStyle.remove();
		activeCursorStyle = null;
	}
}

/** Creates a NodeViewFactory for image blocks. */
export function createImageNodeViewFactory(
	config: ImagePluginConfig,
	uploadStates: Map<BlockId, UploadState>,
): NodeViewFactory {
	return (
		node: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
	): NodeView => {
		// --- DOM Construction ---
		const figure: HTMLElement = document.createElement('figure');
		figure.className = 'notectl-image';
		figure.setAttribute('data-block-id', node.id);
		figure.setAttribute('data-void', 'true');
		figure.setAttribute('data-selectable', 'true');

		const container: HTMLDivElement = document.createElement('div');
		container.className = 'notectl-image__container';

		const img: HTMLImageElement = document.createElement('img');
		img.className = 'notectl-image__img';
		img.draggable = false;

		const overlay: HTMLDivElement = document.createElement('div');
		overlay.className = 'notectl-image__overlay';

		container.appendChild(img);
		container.appendChild(overlay);
		figure.appendChild(container);

		let currentNodeId: BlockId = node.id;
		let resizeOverlay: HTMLDivElement | null = null;
		let alignmentToolbar: HTMLDivElement | null = null;

		// --- Attribute Application ---

		function applyAttrs(n: BlockNode): void {
			const src: string = (n.attrs?.src as string | undefined) ?? '';
			const alt: string = (n.attrs?.alt as string | undefined) ?? '';
			const width: number | undefined = n.attrs?.width as number | undefined;
			const height: number | undefined = n.attrs?.height as number | undefined;
			const align: string = (n.attrs?.align as string | undefined) ?? 'center';

			img.src = src;
			img.alt = alt;

			if (width !== undefined) {
				img.style.width = `${width}px`;
			} else {
				img.style.width = '';
			}
			if (height !== undefined) {
				img.style.height = `${height}px`;
			} else {
				img.style.height = '';
			}

			for (const cls of Object.values(ALIGNMENT_CLASSES)) {
				figure.classList.remove(cls);
			}
			const alignClass: string | undefined = ALIGNMENT_CLASSES[align];
			if (alignClass) {
				figure.classList.add(alignClass);
			}

			const uploadState: UploadState = uploadStates.get(n.id) ?? 'idle';
			overlay.classList.toggle('notectl-image__overlay--uploading', uploadState === 'uploading');
			overlay.classList.toggle('notectl-image__overlay--error', uploadState === 'error');
			overlay.textContent = uploadState === 'uploading' ? 'Uploading...' : '';
		}

		applyAttrs(node);

		// --- Resize Logic ---

		function clampWidth(width: number): number {
			return Math.max(MIN_IMAGE_WIDTH, Math.min(config.maxWidth, width));
		}

		function commitResize(nodeId: BlockId, width: number, height: number): void {
			const state: EditorState = getState();
			const block: BlockNode | undefined = state.getBlock(nodeId);
			if (!block) return;

			const prevWidth: number | undefined = block.attrs?.width as number | undefined;
			const prevHeight: number | undefined = block.attrs?.height as number | undefined;
			if (prevWidth === width && prevHeight === height) return;

			const path: BlockId[] | undefined = state.getNodePath(nodeId);
			if (!path) return;

			const merged: BlockAttrs = {
				...(block.attrs ?? {}),
				width,
				height,
			};

			const tr: Transaction = state.transaction('command').setNodeAttr(path, merged).build();
			dispatch(tr);
		}

		function attachHandleListeners(
			handle: HTMLDivElement,
			position: HandlePosition,
			nodeId: BlockId,
			sizeIndicator: HTMLDivElement,
		): void {
			let startX = 0;
			let startWidth = 0;
			let aspectRatio = 1;

			const onPointerMove = (e: PointerEvent): void => {
				const deltaX: number = e.clientX - startX;
				const newWidth: number = clampWidth(startWidth + deltaX * HANDLE_X_SIGN[position]);
				const newHeight: number = Math.round(newWidth / aspectRatio);

				img.style.width = `${newWidth}px`;
				img.style.height = `${newHeight}px`;

				sizeIndicator.textContent = `${Math.round(newWidth)} \u00D7 ${newHeight}`;
			};

			const onPointerUp = (e: PointerEvent): void => {
				document.removeEventListener('pointermove', onPointerMove);
				document.removeEventListener('pointerup', onPointerUp);

				figure.classList.remove('notectl-image--resizing');
				sizeIndicator.classList.remove('notectl-image__size-indicator--visible');
				clearGlobalResizeCursor();

				const finalWidth: number = Math.round(img.getBoundingClientRect().width);
				const finalHeight: number = Math.round(finalWidth / aspectRatio);

				commitResize(nodeId, finalWidth, finalHeight);

				(e.target as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
			};

			handle.addEventListener('pointerdown', (e: PointerEvent) => {
				e.preventDefault();
				e.stopPropagation();

				startX = e.clientX;
				startWidth = img.getBoundingClientRect().width;
				const imgHeight: number = img.getBoundingClientRect().height;
				aspectRatio = imgHeight > 0 ? startWidth / imgHeight : 1;

				figure.classList.add('notectl-image--resizing');
				sizeIndicator.textContent = `${Math.round(startWidth)} \u00D7 ${Math.round(imgHeight)}`;
				sizeIndicator.classList.add('notectl-image__size-indicator--visible');
				setGlobalResizeCursor(HANDLE_CURSORS[position]);

				(e.target as HTMLElement).setPointerCapture(e.pointerId);
				document.addEventListener('pointermove', onPointerMove);
				document.addEventListener('pointerup', onPointerUp);
			});
		}

		function createResizeOverlay(nodeId: BlockId): void {
			if (!config.resizable || resizeOverlay) return;

			resizeOverlay = document.createElement('div');
			resizeOverlay.className = 'notectl-image__resize-overlay';

			const sizeIndicator: HTMLDivElement = document.createElement('div');
			sizeIndicator.className = 'notectl-image__size-indicator';
			resizeOverlay.appendChild(sizeIndicator);

			const positions: readonly HandlePosition[] = ['nw', 'ne', 'sw', 'se'];
			for (const pos of positions) {
				const handle: HTMLDivElement = document.createElement('div');
				handle.className = `notectl-image__resize-handle notectl-image__resize-handle--${pos}`;
				attachHandleListeners(handle, pos, nodeId, sizeIndicator);
				resizeOverlay.appendChild(handle);
			}

			container.appendChild(resizeOverlay);
		}

		function removeResizeOverlay(): void {
			clearGlobalResizeCursor();
			if (resizeOverlay) {
				resizeOverlay.remove();
				resizeOverlay = null;
			}
		}

		// --- Alignment Toolbar ---

		function createAlignmentToolbar(nodeId: BlockId): void {
			if (alignmentToolbar) return;

			alignmentToolbar = document.createElement('div');
			alignmentToolbar.className = 'notectl-image__align-toolbar';

			for (const { key, icon, label } of ALIGNMENTS) {
				const btn: HTMLButtonElement = document.createElement('button');
				btn.type = 'button';
				btn.className = 'notectl-image__align-btn';
				btn.innerHTML = icon;
				btn.title = label;
				btn.setAttribute('aria-label', label);

				const currentAlign: string =
					(getState().getBlock(nodeId)?.attrs?.align as string | undefined) ?? 'center';
				if (currentAlign === key) {
					btn.classList.add('notectl-image__align-btn--active');
				}

				btn.addEventListener('pointerdown', (e: PointerEvent) => {
					e.preventDefault();
					e.stopPropagation();

					const state: EditorState = getState();
					const currentBlock: BlockNode | undefined = state.getBlock(nodeId);
					if (!currentBlock) return;

					const path: BlockId[] | undefined = state.getNodePath(nodeId);
					if (!path) return;

					const merged: BlockAttrs = { ...(currentBlock.attrs ?? {}), align: key };
					const tr: Transaction = state
						.transaction('command')
						.setNodeAttr(path, merged)
						.build();
					dispatch(tr);
				});

				alignmentToolbar.appendChild(btn);
			}

			container.appendChild(alignmentToolbar);
		}

		function removeAlignmentToolbar(): void {
			if (alignmentToolbar) {
				alignmentToolbar.remove();
				alignmentToolbar = null;
			}
		}

		// --- NodeView Interface ---

		return {
			dom: figure,
			contentDOM: null,

			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'image') return false;
				currentNodeId = updatedNode.id;
				figure.setAttribute('data-block-id', updatedNode.id);
				applyAttrs(updatedNode);
				return true;
			},

			selectNode(): void {
				figure.classList.add('notectl-image--selected');
				createResizeOverlay(currentNodeId);
				createAlignmentToolbar(currentNodeId);
			},

			deselectNode(): void {
				figure.classList.remove('notectl-image--selected');
				removeResizeOverlay();
				removeAlignmentToolbar();
			},

			destroy(): void {
				removeResizeOverlay();
				removeAlignmentToolbar();
				// Do NOT revoke blob URLs here — the URL may still be referenced
				// by the clipboard (cut/paste) or undo history. Blob URLs are
				// automatically released when the document is unloaded.
			},
		};
	};
}
