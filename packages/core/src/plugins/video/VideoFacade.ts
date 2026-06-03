/**
 * Privacy-first facade (click-to-load) for the video NodeView.
 *
 * Until the user activates the embed there is NO iframe in the DOM and zero
 * contact with the provider — the GDPR / Schrems II safe default. Activation,
 * playback, and exit are pure view state: they never dispatch a transaction, so
 * "play" never enters the undo stack.
 *
 * The iframe is built with `createElement` + `setAttribute` (never from an HTML
 * string), so no attacker-controllable markup is ever passed through `innerHTML`.
 * Autoplay is only ever requested in response to the explicit facade click, and
 * is suppressed under `prefers-reduced-motion` — so it can never be an
 * autoplay-on-load (WCAG F93) violation.
 */

import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { VideoLocale } from './VideoLocale.js';
import { buildEmbedUrlForMatch, buildThumbnailForMatch, providerLabel } from './VideoProviders.js';
import type { VideoMatch } from './VideoProviders.js';
import type { VideoAttrs, VideoPluginConfig } from './VideoTypes.js';

const PLAY_ICON =
	'<svg viewBox="0 0 68 48" width="48" height="34" aria-hidden="true" focusable="false"><path d="M66.5 7.7c-.8-2.9-2.5-5.4-5.4-6.2C55.8.1 34 0 34 0S12.2.1 6.9 1.5C4 2.3 2.3 4.8 1.5 7.7.1 13 0 24 0 24s.1 11 1.5 16.3c.8 2.9 2.5 5.4 5.4 6.2C12.2 47.9 34 48 34 48s21.8-.1 27.1-1.5c2.9-.8 4.6-3.3 5.4-6.2C67.9 35 68 24 68 24s-.1-11-1.5-16.3z" fill="currentColor"/><path d="M45 24 27 14v20z" fill="#fff"/></svg>';

const CLOSE_ICON =
	'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" fill="currentColor"/></svg>';

/** True when the user prefers reduced motion (guarded for non-browser test envs). */
function prefersReducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Builds the embed iframe for the given attributes via DOM APIs (never innerHTML). */
function buildPlayerIframe(
	attrs: VideoAttrs,
	config: VideoPluginConfig,
	locale: VideoLocale,
): HTMLIFrameElement {
	const match: VideoMatch = {
		provider: attrs.provider,
		videoId: attrs.videoId,
		...(attrs.hash ? { hash: attrs.hash } : {}),
	};
	const src: string =
		buildEmbedUrlForMatch(match, config.providers, {
			privacy: attrs.privacy,
			autoplay: !prefersReducedMotion(),
		}) ?? '';

	const iframe: HTMLIFrameElement = document.createElement('iframe');
	iframe.className = 'notectl-video__iframe';
	iframe.setAttribute('src', src);
	// A non-empty, descriptive iframe name is a Level A requirement (SC 4.1.2).
	iframe.setAttribute(
		'title',
		attrs.title || locale.providerBadge(providerLabel(attrs.provider, config.providers)),
	);
	iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
	iframe.setAttribute('allowfullscreen', 'true');
	iframe.setAttribute('referrerpolicy', 'no-referrer');
	iframe.setAttribute('loading', 'lazy');
	iframe.setAttribute('frameborder', '0');
	return iframe;
}

/**
 * Owns the facade ↔ player lifecycle for a single video frame. Construction
 * renders the facade; `activate()` swaps in the iframe; `deactivate()` restores
 * the facade. All transitions are view-only.
 */
export class VideoFacadeController {
	private readonly frame: HTMLElement;
	private readonly getAttrs: () => VideoAttrs;
	private readonly config: VideoPluginConfig;
	private readonly locale: VideoLocale;
	private readonly announce: (text: string) => void;

	private facadeButton: HTMLButtonElement | null = null;
	private player: HTMLElement | null = null;
	private iframe: HTMLIFrameElement | null = null;
	private escapeHandler: ((e: KeyboardEvent) => void) | null = null;
	/** Snapshot of the embed-relevant attributes currently rendered. */
	private renderedKey = '';

	constructor(options: {
		frame: HTMLElement;
		getAttrs: () => VideoAttrs;
		config: VideoPluginConfig;
		locale: VideoLocale;
		announce: (text: string) => void;
	}) {
		this.frame = options.frame;
		this.getAttrs = options.getAttrs;
		this.config = options.config;
		this.locale = options.locale;
		this.announce = options.announce;
		this.renderFacade();
	}

	/** Whether the player iframe is currently mounted. */
	get isActive(): boolean {
		return this.player !== null;
	}

	/** Embed-relevant attribute snapshot; a change means facade/iframe must refresh. */
	private facadeKey(attrs: VideoAttrs): string {
		return [
			attrs.provider,
			attrs.videoId,
			attrs.hash ?? '',
			attrs.privacy,
			attrs.title,
			this.config.useProviderThumbnail,
		].join('|');
	}

	/** (Re)builds the facade play button and poster from current attributes. */
	renderFacade(): void {
		this.facadeButton?.remove();
		const attrs: VideoAttrs = this.getAttrs();
		this.renderedKey = this.facadeKey(attrs);

		const button: HTMLButtonElement = document.createElement('button');
		button.type = 'button';
		button.className = 'notectl-video__facade';
		button.setAttribute('aria-label', this.locale.play(attrs.title));

		const poster: HTMLSpanElement = document.createElement('span');
		poster.className = 'notectl-video__poster';
		poster.setAttribute('aria-hidden', 'true');
		if (this.config.useProviderThumbnail) {
			const thumbnail: string | undefined = buildThumbnailForMatch(
				{ provider: attrs.provider, videoId: attrs.videoId },
				this.config.providers,
			);
			if (thumbnail) setStyleProperty(poster, 'background-image', `url("${thumbnail}")`);
		}

		const icon: HTMLSpanElement = document.createElement('span');
		icon.className = 'notectl-video__play-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = PLAY_ICON;

		const badge: HTMLSpanElement = document.createElement('span');
		badge.className = 'notectl-video__badge';
		badge.setAttribute('aria-hidden', 'true');
		badge.textContent = this.locale.providerBadge(
			providerLabel(attrs.provider, this.config.providers),
		);

		button.append(poster, icon, badge);
		// Stop selection mousedown so pressing Play plays instead of node-selecting;
		// clicking the surrounding frame still selects the node.
		button.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
		button.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.activate();
		});

		this.facadeButton = button;
		this.frame.insertBefore(button, this.frame.firstChild);
	}

	/**
	 * Refreshes after an attribute change. Re-renders the facade label/poster, or
	 * rebuilds the active iframe when the embed source changed. No-ops when nothing
	 * relevant changed, so unrelated state updates never steal focus from the facade.
	 */
	update(): void {
		const attrs: VideoAttrs = this.getAttrs();
		const key: string = this.facadeKey(attrs);
		if (key === this.renderedKey) return;
		this.renderedKey = key;

		if (this.isActive && this.iframe) {
			const next: HTMLIFrameElement = buildPlayerIframe(attrs, this.config, this.locale);
			this.iframe.replaceWith(next);
			this.iframe = next;
			return;
		}
		this.renderFacade();
	}

	/** Builds the iframe, moves focus into the player, and announces the change. */
	activate(): void {
		if (this.isActive || !this.facadeButton) return;
		const attrs: VideoAttrs = this.getAttrs();

		const player: HTMLDivElement = document.createElement('div');
		player.className = 'notectl-video__player';

		const exit: HTMLButtonElement = document.createElement('button');
		exit.type = 'button';
		exit.className = 'notectl-video__exit';
		exit.setAttribute('aria-label', this.locale.closePlayer);
		exit.innerHTML = CLOSE_ICON;
		exit.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
		exit.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.deactivate(true);
		});

		const iframe: HTMLIFrameElement = buildPlayerIframe(attrs, this.config, this.locale);

		// Exit button precedes the iframe so Shift+Tab out of the player reaches a
		// reliable, same-document return control (the cross-origin iframe can swallow
		// Escape once focus is inside it).
		player.append(exit, iframe);
		this.facadeButton.remove();
		this.facadeButton = null;
		this.frame.insertBefore(player, this.frame.firstChild);
		this.player = player;
		this.iframe = iframe;

		this.escapeHandler = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			this.deactivate(true);
		};
		this.frame.addEventListener('keydown', this.escapeHandler);

		iframe.focus();
		this.announce(this.locale.enteredPlayer(attrs.title));
	}

	/** Tears down the iframe and restores the facade. */
	deactivate(returnFocus: boolean): void {
		if (!this.player) return;
		if (this.escapeHandler) {
			this.frame.removeEventListener('keydown', this.escapeHandler);
			this.escapeHandler = null;
		}
		this.player.remove();
		this.player = null;
		this.iframe = null;
		this.renderFacade();
		if (returnFocus) this.facadeButton?.focus();
		this.announce(this.locale.exitedPlayer);
	}

	/** Removes all DOM and listeners. */
	destroy(): void {
		if (this.escapeHandler) {
			this.frame.removeEventListener('keydown', this.escapeHandler);
			this.escapeHandler = null;
		}
		this.player?.remove();
		this.player = null;
		this.iframe = null;
		this.facadeButton?.remove();
		this.facadeButton = null;
	}
}
