/**
 * Floating panel for inserting and editing videos, hosting the shared video form
 * outside the editable/reconciled DOM. Mirrors `FormulaOverlay`: a focusable
 * dialog positioned at the caret (insert) or the video's bounding rect (edit),
 * promoted to the browser top layer so it escapes host-page stacking contexts.
 */

import { isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import { promoteToTopLayer } from '../shared/PopupPositioning.js';
import {
	type VideoEditInput,
	type VideoTextRange,
	applyVideoEdit,
	buildVideoAttrsFromForm,
	insertVideo,
	insertVideoReplacingRange,
} from './VideoCommands.js';
import type { VideoLocale } from './VideoLocale.js';
import { type VideoFormInitial, renderVideoForm } from './VideoPopup.js';
import { buildWatchUrlForMatch } from './VideoProviders.js';
import {
	VIDEO_TYPE,
	type VideoAttrs,
	type VideoPluginConfig,
	normalizeVideoAttrs,
} from './VideoTypes.js';

const PANEL_MARGIN = 8;

export class VideoEditOverlay {
	private panel: HTMLElement | null = null;
	private outsideHandler: ((e: MouseEvent) => void) | null = null;

	constructor(
		private readonly context: PluginContext,
		private readonly config: VideoPluginConfig,
		private readonly locale: VideoLocale,
	) {}

	/** Whether the overlay is currently open. */
	get isOpen(): boolean {
		return this.panel !== null;
	}

	/** Opens the insert form at the caret. */
	openInsert(): void {
		if (this.context.isReadOnly()) return;
		this.open({
			rect: caretRect(),
			mode: 'insert',
			label: this.locale.insertDialogLabel,
			onSubmit: (input: VideoEditInput) => {
				const attrs: VideoAttrs | null = buildVideoAttrsFromForm(input, this.config);
				if (attrs) insertVideo(this.context, attrs);
			},
		});
	}

	/**
	 * Opens the insert form pre-filled with a pasted URL; on submit the URL text
	 * range is replaced with the embed (ask-first paste flow). Cancelling leaves the
	 * URL as plain text.
	 */
	openInsertReplacingRange(range: VideoTextRange, prefillUrl: string): void {
		if (this.context.isReadOnly()) return;
		this.open({
			rect: caretRect(),
			mode: 'insert',
			label: this.locale.insertDialogLabel,
			initial: { url: prefillUrl },
			onSubmit: (input: VideoEditInput) => {
				const attrs: VideoAttrs | null = buildVideoAttrsFromForm(input, this.config);
				if (attrs) insertVideoReplacingRange(this.context, range, attrs);
			},
		});
	}

	/** Opens the edit form for the currently selected video, pre-filled. */
	openEditForSelected(): void {
		if (this.context.isReadOnly()) return;
		const state = this.context.getState();
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;
		const block = state.getBlock(sel.nodeId);
		if (!block || block.type !== VIDEO_TYPE) return;

		const attrs: VideoAttrs = normalizeVideoAttrs(block.attrs, this.config);
		const url: string =
			buildWatchUrlForMatch(
				{
					provider: attrs.provider,
					videoId: attrs.videoId,
					...(attrs.hash ? { hash: attrs.hash } : {}),
				},
				this.config.providers,
			) ?? '';
		const initial: VideoFormInitial = {
			url,
			title: attrs.title,
			caption: attrs.caption ?? '',
			aspectRatio: attrs.aspectRatio,
		};

		this.open({
			rect: this.videoRect(sel.nodeId),
			mode: 'edit',
			label: this.locale.editDialogLabel,
			initial,
			onSubmit: (input: VideoEditInput) => {
				applyVideoEdit(this.context, input, this.config);
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

	private open(config: {
		rect: DOMRect | null;
		mode: 'insert' | 'edit';
		label: string;
		initial?: VideoFormInitial;
		onSubmit: (input: VideoEditInput) => void;
	}): void {
		this.close(false);
		const panel: HTMLDivElement = document.createElement('div');
		panel.className = 'notectl-video-overlay';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-modal', 'false');
		panel.setAttribute('aria-label', config.label);
		this.panel = panel;

		renderVideoForm(panel, {
			mode: config.mode,
			initial: config.initial,
			config: this.config,
			locale: this.locale,
			onSubmit: config.onSubmit,
			onClose: () => this.close(true),
		});

		panel.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.close(true);
			}
		});

		this.context.getPluginContainer('top').appendChild(panel);
		promoteToTopLayer(panel);
		positionPanel(panel, config.rect);
		this.installOutsideHandler();
	}

	private videoRect(nodeId: BlockId): DOMRect | null {
		const el: Element | null = this.context
			.getContainer()
			.querySelector(`[data-block-id="${nodeId}"]`);
		return el ? el.getBoundingClientRect() : null;
	}

	private installOutsideHandler(): void {
		const handler = (e: MouseEvent): void => {
			if (this.panel && !e.composedPath().includes(this.panel)) {
				this.close(false);
			}
		};
		this.outsideHandler = handler;
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

/** Positions the panel below the anchor rect, clamped to the viewport. */
function positionPanel(panel: HTMLElement, rect: DOMRect | null): void {
	const anchorTop: number = rect ? rect.bottom : window.innerHeight / 3;
	const anchorLeft: number = rect ? rect.left : window.innerWidth / 3;
	const width: number = panel.offsetWidth || 320;
	const maxLeft: number = window.innerWidth - width - PANEL_MARGIN;
	const left: number = Math.max(PANEL_MARGIN, Math.min(anchorLeft, maxLeft));
	const maxTop: number = window.innerHeight - panel.offsetHeight - PANEL_MARGIN;
	const top: number = Math.min(anchorTop + PANEL_MARGIN, Math.max(PANEL_MARGIN, maxTop));
	panel.style.left = `${Math.round(left)}px`;
	panel.style.top = `${Math.round(top)}px`;
}
