/**
 * The ask-first paste affordance: a small, keyboard-operable popover shown after
 * a video URL is pasted. It offers to turn the link into an embed rather than
 * silently rewriting the content under the caret (which is disorienting for
 * assistive-technology users). The change is announced separately via aria-live.
 */

import { promoteToTopLayer } from '../shared/PopupPositioning.js';
import type { VideoLocale } from './VideoLocale.js';

const PROMPT_MARGIN = 8;

export interface EmbedPromptController {
	close(): void;
}

export interface EmbedPromptOptions {
	/** Shadow-DOM container the popover mounts into (registered styles apply). */
	readonly container: HTMLElement;
	/** Anchor rect (the pasted URL / caret); centered in the viewport when null. */
	readonly rect: DOMRect | null;
	readonly locale: VideoLocale;
	/** Invoked when the user accepts the embed. */
	readonly onEmbed: () => void;
	/** Invoked when the user keeps the link (dismiss / Escape / outside click). */
	readonly onDismiss: () => void;
}

/** Shows the embed prompt and returns a controller to close it programmatically. */
export function showEmbedPrompt(options: EmbedPromptOptions): EmbedPromptController {
	const { locale } = options;
	const popover: HTMLDivElement = document.createElement('div');
	popover.className = 'notectl-video-embed-prompt';
	popover.setAttribute('role', 'dialog');
	popover.setAttribute('aria-label', locale.embedPrompt);

	const text: HTMLSpanElement = document.createElement('span');
	text.className = 'notectl-video-embed-prompt__text';
	text.textContent = locale.embedPrompt;

	const embedBtn: HTMLButtonElement = document.createElement('button');
	embedBtn.type = 'button';
	embedBtn.className = 'notectl-video-embed-prompt__embed';
	embedBtn.textContent = locale.embedConfirm;

	const dismissBtn: HTMLButtonElement = document.createElement('button');
	dismissBtn.type = 'button';
	dismissBtn.className = 'notectl-video-embed-prompt__dismiss';
	dismissBtn.textContent = locale.embedDismiss;

	popover.append(text, embedBtn, dismissBtn);

	let outsideHandler: ((e: MouseEvent) => void) | null = null;
	let closed = false;

	const close = (): void => {
		if (closed) return;
		closed = true;
		if (outsideHandler) {
			document.removeEventListener('mousedown', outsideHandler, true);
			outsideHandler = null;
		}
		popover.remove();
	};

	const finish = (action: () => void): void => {
		close();
		action();
	};

	embedBtn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
	embedBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		finish(options.onEmbed);
	});
	dismissBtn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
	dismissBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		finish(options.onDismiss);
	});
	popover.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			finish(options.onDismiss);
		}
	});

	options.container.appendChild(popover);
	promoteToTopLayer(popover);
	positionPrompt(popover, options.rect);

	outsideHandler = (e: MouseEvent): void => {
		if (!e.composedPath().includes(popover)) finish(options.onDismiss);
	};
	requestAnimationFrame(() => {
		if (outsideHandler) document.addEventListener('mousedown', outsideHandler, true);
		// Move focus to the primary action so keyboard and screen-reader users can
		// act immediately; the aria-live announcement explains the choice.
		embedBtn.focus();
	});

	return { close };
}

/** Positions the prompt just below the anchor rect, clamped to the viewport. */
function positionPrompt(popover: HTMLElement, rect: DOMRect | null): void {
	const anchorTop: number = rect ? rect.bottom : window.innerHeight / 3;
	const anchorLeft: number = rect ? rect.left : window.innerWidth / 3;
	const width: number = popover.offsetWidth || 240;
	const maxLeft: number = window.innerWidth - width - PROMPT_MARGIN;
	const left: number = Math.max(PROMPT_MARGIN, Math.min(anchorLeft, maxLeft));
	const maxTop: number = window.innerHeight - popover.offsetHeight - PROMPT_MARGIN;
	const top: number = Math.min(anchorTop + PROMPT_MARGIN, Math.max(PROMPT_MARGIN, maxTop));
	popover.style.left = `${Math.round(left)}px`;
	popover.style.top = `${Math.round(top)}px`;
}
