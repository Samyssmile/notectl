/**
 * NodeView factory for video blocks.
 *
 * Renders a `<figure>` with a responsive, ratio-locked frame, layers the
 * click-to-load facade on top, manages the selection state and the pointer
 * resize overlay, and keeps everything in sync with attribute updates. The live
 * iframe lifecycle lives entirely in {@link VideoFacadeController}.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { getTextDirection } from '../../platform/Platform.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { VideoFacadeController } from './VideoFacade.js';
import type { VideoLocale } from './VideoLocale.js';
import { providerLabel } from './VideoProviders.js';
import { type VideoResizeOverlay, createVideoResizeOverlay } from './VideoResize.js';
import {
	type VideoSelectionToolbar,
	type VideoToolbarActions,
	createVideoSelectionToolbar,
} from './VideoSelectionToolbar.js';
import {
	type VideoAttrs,
	type VideoKeymap,
	type VideoPluginConfig,
	normalizeVideoAttrs,
} from './VideoTypes.js';
import { applyVideoAlignment, applyVideoFrameSizing } from './VideoViewHelpers.js';

/** Dependencies the factory closes over (the NodeView API itself is fixed). */
export interface VideoNodeViewOptions {
	readonly config: VideoPluginConfig;
	readonly locale: VideoLocale;
	readonly resolvedKeymap: Readonly<Record<keyof VideoKeymap, string | null>>;
	readonly announce: (text: string) => void;
	/** Context-bound edit/align/remove actions for the on-selection toolbar. */
	readonly actions: VideoToolbarActions;
}

/** Builds the visual keyboard-resize hint from the resolved keymap. */
function buildKeyboardHint(
	resolvedKeymap: Readonly<Record<keyof VideoKeymap, string | null>>,
	locale: VideoLocale,
): string {
	const shrink: string | null = resolvedKeymap.shrinkWidth ?? null;
	const grow: string | null = resolvedKeymap.growWidth ?? null;
	if (!shrink || !grow) return '';
	return locale.keyboardResizeHint(formatShortcut(shrink), formatShortcut(grow));
}

/** Creates a NodeViewFactory for video blocks. */
export function createVideoNodeViewFactory(options: VideoNodeViewOptions): NodeViewFactory {
	const { config, locale, resolvedKeymap, announce, actions } = options;

	return (
		node: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
	): NodeView => {
		const figure: HTMLElement = document.createElement('figure');
		figure.className = 'notectl-video';
		figure.setAttribute('data-block-id', node.id);
		figure.setAttribute('data-void', 'true');
		figure.setAttribute('data-selectable', 'true');

		const frame: HTMLDivElement = document.createElement('div');
		frame.className = 'notectl-video__frame';
		figure.appendChild(frame);

		let currentNodeId: BlockId = node.id;
		let currentAttrs: VideoAttrs = normalizeVideoAttrs(node.attrs as Partial<VideoAttrs>, config);
		let captionEl: HTMLElement | null = null;
		let resizeOverlay: VideoResizeOverlay | null = null;
		let toolbar: VideoSelectionToolbar | null = null;

		const facade = new VideoFacadeController({
			frame,
			getAttrs: () => currentAttrs,
			config,
			locale,
			announce,
		});

		function updateCaption(caption: string | undefined): void {
			if (caption) {
				if (!captionEl) {
					captionEl = document.createElement('figcaption');
					captionEl.className = 'notectl-video__caption';
					figure.appendChild(captionEl);
				}
				if (captionEl.textContent !== caption) captionEl.textContent = caption;
			} else if (captionEl) {
				captionEl.remove();
				captionEl = null;
			}
		}

		function applyAttrs(n: BlockNode): void {
			currentAttrs = normalizeVideoAttrs(n.attrs as Partial<VideoAttrs>, config);
			applyVideoFrameSizing(frame, currentAttrs.aspectRatio, currentAttrs.widthPercent);
			applyVideoAlignment(figure, currentAttrs.align);
			figure.setAttribute(
				'aria-label',
				locale.videoAria(
					providerLabel(currentAttrs.provider, config.providers),
					currentAttrs.title,
				),
			);
			updateCaption(currentAttrs.caption);
			facade.update();
			toolbar?.update(currentAttrs.align);
		}

		applyAttrs(node);

		function commitWidth(percent: number): void {
			const state: EditorState = getState();
			const block: BlockNode | undefined = state.getBlock(currentNodeId);
			if (!block) return;
			const path: BlockId[] | undefined = state.getNodePath(currentNodeId);
			if (!path) return;
			const merged: BlockAttrs = { ...(block.attrs ?? {}), widthPercent: percent };
			dispatch(state.transaction('command').setNodeAttr(path, merged).build());
		}

		function createOverlay(): void {
			if (!config.resizable || resizeOverlay) return;
			resizeOverlay = createVideoResizeOverlay(
				{
					minPercent: config.minWidthPercent,
					getWidthPercent: () => currentAttrs.widthPercent,
					getReferenceWidth: () => figure.clientWidth || frame.clientWidth,
					isRtl: () => getTextDirection(figure) === 'rtl',
					applyLiveWidth: (p: number) => setStyleProperty(frame, 'width', `${p}%`),
					commit: (p: number) => commitWidth(p),
					formatPercent: (p: number) => `${p}%`,
				},
				buildKeyboardHint(resolvedKeymap, locale),
			);
			frame.appendChild(resizeOverlay.element);
		}

		function removeOverlay(): void {
			if (!resizeOverlay) return;
			resizeOverlay.destroy();
			resizeOverlay.element.remove();
			resizeOverlay = null;
		}

		return {
			dom: figure,
			contentDOM: null,

			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'video') return false;
				currentNodeId = updatedNode.id;
				figure.setAttribute('data-block-id', updatedNode.id);
				applyAttrs(updatedNode);
				return true;
			},

			selectNode(): void {
				figure.classList.add('notectl-video--selected');
				createOverlay();
				if (!toolbar) {
					toolbar = createVideoSelectionToolbar({
						locale,
						actions,
						initialAlign: currentAttrs.align,
					});
					figure.appendChild(toolbar.element);
				}
			},

			deselectNode(): void {
				figure.classList.remove('notectl-video--selected');
				removeOverlay();
				toolbar?.destroy();
				toolbar = null;
			},

			destroy(): void {
				removeOverlay();
				toolbar?.destroy();
				toolbar = null;
				facade.destroy();
			},
		};
	};
}
