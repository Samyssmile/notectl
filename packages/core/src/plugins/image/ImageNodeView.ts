/**
 * NodeView factory for image blocks.
 * Renders <figure> with <img>, handles selection state, upload overlay,
 * resize with 4 corner handles + live size indicator, and a keyboard-hint
 * showing resize shortcuts when the image is selected.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import type { ImageKeymap, ImagePluginConfig, UploadState } from './ImageUpload.js';

const ALIGNMENT_CLASSES: Record<string, string> = {
	left: 'notectl-image--left',
	center: 'notectl-image--center',
	right: 'notectl-image--right',
};

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

const HANDLE_LABELS: Readonly<Record<HandlePosition, string>> = {
	nw: 'Resize top-left',
	ne: 'Resize top-right',
	sw: 'Resize bottom-left',
	se: 'Resize bottom-right',
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

/** Builds the keyboard-hint text from the resolved keymap. */
function buildKeyboardHintText(
	resolvedKeymap: Readonly<Record<keyof ImageKeymap, string | null>>,
): string {
	const shrink: string | null = resolvedKeymap.shrinkWidth ?? null;
	const grow: string | null = resolvedKeymap.growWidth ?? null;
	if (!shrink || !grow) return '';
	return `${formatShortcut(shrink)} / ${formatShortcut(grow)} to resize`;
}

/** Creates a NodeViewFactory for image blocks. */
export function createImageNodeViewFactory(
	config: ImagePluginConfig,
	uploadStates: Map<BlockId, UploadState>,
	resolvedKeymap?: Readonly<Record<keyof ImageKeymap, string | null>>,
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

		// --- ARIA Label ---

		function updateAriaLabel(n: BlockNode): void {
			const alt: string = (n.attrs?.alt as string | undefined) ?? '';
			const width: number | undefined = n.attrs?.width as number | undefined;
			const height: number | undefined = n.attrs?.height as number | undefined;

			const parts: string[] = [];
			if (alt) {
				parts.push(alt);
			} else {
				parts.push('Image');
			}
			if (width !== undefined && height !== undefined) {
				parts.push(`${width} by ${height} pixels`);
			}
			figure.setAttribute('aria-label', parts.join(', '));
		}

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
			const isUploading: boolean = uploadState === 'uploading';
			overlay.classList.toggle('notectl-image__overlay--uploading', isUploading);
			overlay.classList.toggle('notectl-image__overlay--error', uploadState === 'error');

			if (isUploading) {
				overlay.textContent = 'Uploading...';
			} else if (uploadState === 'error') {
				overlay.textContent = 'Upload failed';
			} else {
				overlay.textContent = '';
			}

			if (isUploading) {
				figure.setAttribute('aria-busy', 'true');
			} else {
				figure.removeAttribute('aria-busy');
			}

			updateAriaLabel(n);
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
				handle.setAttribute('role', 'separator');
				handle.setAttribute('aria-label', HANDLE_LABELS[pos]);
				attachHandleListeners(handle, pos, nodeId, sizeIndicator);
				resizeOverlay.appendChild(handle);
			}

			// Keyboard hint (hidden from screenreaders, visual only)
			if (resolvedKeymap) {
				const hintText: string = buildKeyboardHintText(resolvedKeymap);
				if (hintText) {
					const hint: HTMLDivElement = document.createElement('div');
					hint.className = 'notectl-image__keyboard-hint';
					hint.setAttribute('aria-hidden', 'true');
					hint.textContent = hintText;
					resizeOverlay.appendChild(hint);
				}
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
			},

			deselectNode(): void {
				figure.classList.remove('notectl-image--selected');
				removeResizeOverlay();
			},

			destroy(): void {
				removeResizeOverlay();
				// Do NOT revoke blob URLs here — the URL may still be referenced
				// by the clipboard (cut/paste) or undo history. Blob URLs are
				// automatically released when the document is unloaded.
			},
		};
	};
}
