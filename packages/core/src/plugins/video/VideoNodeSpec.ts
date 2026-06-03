/**
 * NodeSpec for the `video` block: a void, selectable embed.
 *
 * The node stores structured attributes, never raw `<iframe>` HTML. The live
 * iframe is built only at view time (see `VideoNodeView`). Serialization uses a
 * privacy-preserving, progressive-enhancement `<figure>`:
 *
 *   - In a notectl renderer, `data-video-*` lets the plugin upgrade the figure to
 *     facade then iframe.
 *   - In a "dumb" context (email, plain HTML), it degrades to a labeled link (and
 *     an opt-in thumbnail), contacting no third party on load. The privacy promise
 *     therefore holds outside the editor too — a plain `<iframe>` export would
 *     leak it on every page that renders the export.
 *
 * `parseHTML` reconstructs the node from `data-video-*`, and additionally tolerates
 * a known-provider embed `<iframe>` on import (host-validated by the sanitize hook).
 */

import { escapeAttr, escapeHTML } from '../../model/HTMLUtils.js';
import type { NodeSpec } from '../../model/NodeSpec.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { VideoLocale } from './VideoLocale.js';
import {
	type VideoMatch,
	buildThumbnailForMatch,
	buildWatchUrlForMatch,
	findProvider,
	parseVideoUrl,
	providerLabel,
} from './VideoProviders.js';
import {
	type VideoAlign,
	type VideoAttrs,
	type VideoPluginConfig,
	clampWidthPercent,
	isSafeVideoId,
	normalizeVideoAttrs,
	sanitizeAspectRatio,
} from './VideoTypes.js';
import { applyVideoAlignment, applyVideoFrameSizing } from './VideoViewHelpers.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		video: {
			provider: string;
			videoId: string;
			hash?: string;
			aspectRatio: string;
			widthPercent: number;
			align: VideoAlign;
			title: string;
			caption?: string;
			privacy: boolean;
		};
	}
}

const VIDEO_HASH_PATTERN = /^[A-Za-z0-9]+$/;
/** Parse rules run above the image plugin's generic `figure` rule (default 50). */
const VIDEO_PARSE_PRIORITY = 60;

/** Builds a {@link VideoMatch} from node attributes. */
function matchFromAttrs(attrs: VideoAttrs): VideoMatch {
	return {
		provider: attrs.provider,
		videoId: attrs.videoId,
		...(attrs.hash ? { hash: attrs.hash } : {}),
	};
}

/**
 * Creates the `video` NodeSpec, closing over the plugin config so URL building
 * and provider lookups stay declarative and dependency-free.
 */
export function createVideoNodeSpec(
	config: VideoPluginConfig,
	locale: VideoLocale,
): NodeSpec<'video'> {
	const providers = config.providers;

	return {
		type: 'video',
		group: 'block',
		isVoid: true,
		selectable: true,
		attrs: {
			provider: { default: '' },
			videoId: { default: '' },
			hash: { default: '' },
			aspectRatio: { default: config.defaultAspectRatio },
			widthPercent: { default: config.defaultWidthPercent },
			align: { default: 'center' },
			title: { default: '' },
			caption: { default: '' },
			privacy: { default: config.privacy },
		},

		toDOM(node) {
			const attrs: VideoAttrs = normalizeVideoAttrs(node.attrs as Partial<VideoAttrs>, config);
			const figure: HTMLElement = createBlockElement('figure', node.id);
			figure.className = 'notectl-video';
			figure.setAttribute('data-void', 'true');
			figure.setAttribute('data-selectable', 'true');
			figure.setAttribute('data-video-provider', attrs.provider);
			figure.setAttribute('data-video-id', attrs.videoId);
			if (attrs.hash) figure.setAttribute('data-video-hash', attrs.hash);
			applyVideoAlignment(figure, attrs.align);
			figure.setAttribute(
				'aria-label',
				locale.videoAria(providerLabel(attrs.provider, providers), attrs.title),
			);

			const frame: HTMLDivElement = document.createElement('div');
			frame.className = 'notectl-video__frame';
			applyVideoFrameSizing(frame, attrs.aspectRatio, attrs.widthPercent);

			// Static, accessible fallback: a labeled link to the public watch URL.
			// The interactive facade is layered on by VideoNodeView when present.
			const watchUrl: string | null = buildWatchUrlForMatch(matchFromAttrs(attrs), providers);
			if (watchUrl) {
				const link: HTMLAnchorElement = document.createElement('a');
				link.className = 'notectl-video__fallback-link';
				link.href = watchUrl;
				link.rel = 'noopener noreferrer';
				link.textContent = attrs.title || watchUrl;
				frame.appendChild(link);
			}
			figure.appendChild(frame);

			if (attrs.caption) {
				const figcaption: HTMLElement = document.createElement('figcaption');
				figcaption.className = 'notectl-video__caption';
				figcaption.textContent = attrs.caption;
				figure.appendChild(figcaption);
			}
			return figure;
		},

		toHTML(node) {
			const attrs: VideoAttrs = normalizeVideoAttrs(node.attrs as Partial<VideoAttrs>, config);
			const match: VideoMatch = matchFromAttrs(attrs);
			const watchUrl: string | null = buildWatchUrlForMatch(match, providers);

			const dataAttrs: string[] = [
				`data-video-provider="${escapeAttr(attrs.provider)}"`,
				`data-video-id="${escapeAttr(attrs.videoId)}"`,
				`data-video-ratio="${escapeAttr(attrs.aspectRatio)}"`,
				`data-video-width="${attrs.widthPercent}"`,
				`data-video-privacy="${attrs.privacy ? 'true' : 'false'}"`,
			];
			if (attrs.hash) dataAttrs.push(`data-video-hash="${escapeAttr(attrs.hash)}"`);
			if (attrs.title) dataAttrs.push(`data-video-title="${escapeAttr(attrs.title)}"`);

			const thumbnail: string | undefined = config.useProviderThumbnail
				? buildThumbnailForMatch(match, providers)
				: undefined;
			const linkInner: string = thumbnail
				? `<img src="${escapeAttr(thumbnail)}" alt="">`
				: escapeHTML(attrs.title || watchUrl || '');
			const body: string = watchUrl
				? `<a href="${escapeAttr(watchUrl)}" rel="noopener noreferrer">${linkInner}</a>`
				: linkInner;
			const caption: string = attrs.caption
				? `<figcaption>${escapeHTML(attrs.caption)}</figcaption>`
				: '';

			return `<figure ${dataAttrs.join(' ')}>${body}${caption}</figure>`;
		},

		parseHTML: [
			{
				tag: 'figure',
				priority: VIDEO_PARSE_PRIORITY,
				getAttrs: (el: HTMLElement) => parseVideoFigure(el, config),
			},
			{
				tag: 'iframe',
				priority: VIDEO_PARSE_PRIORITY,
				getAttrs: (el: HTMLElement) => parseVideoIframe(el, config),
			},
		],

		// Tags/attrs needed for the figure export round-trip plus tolerant iframe
		// import. The iframe host is additionally validated by the sanitize hook;
		// declaring `iframe` here only lets DOMPurify keep it long enough for that
		// hook and the parse rule to run. `data-video-*` pass via ALLOW_DATA_ATTR.
		sanitize: {
			tags: ['figure', 'figcaption', 'a', 'img', 'iframe'],
			attrs: [
				'href',
				'rel',
				'src',
				'alt',
				'title',
				'allow',
				'allowfullscreen',
				'referrerpolicy',
				'loading',
				'width',
				'height',
				'frameborder',
				'class',
				'style',
			],
		},
	};
}

/** Reconstructs video attributes from a `data-video-*` figure, or false. */
function parseVideoFigure(
	el: HTMLElement,
	config: VideoPluginConfig,
): Record<string, string | number | boolean> | false {
	const provider: string | null = el.getAttribute('data-video-provider');
	const videoId: string | null = el.getAttribute('data-video-id');
	if (!provider || !videoId) return false;
	if (!isSafeVideoId(videoId)) return false;
	if (!findProvider(provider, config.providers)) return false;

	const title: string =
		el.getAttribute('data-video-title') ??
		el.querySelector('a')?.textContent?.trim() ??
		el.getAttribute('aria-label') ??
		'';
	const caption: string = el.querySelector('figcaption')?.textContent?.trim() ?? '';
	const widthAttr: string | null = el.getAttribute('data-video-width');

	const attrs: Record<string, string | number | boolean> = {
		provider,
		videoId,
		aspectRatio: sanitizeAspectRatio(el.getAttribute('data-video-ratio') ?? undefined, config),
		widthPercent: clampWidthPercent(
			widthAttr ? Number.parseFloat(widthAttr) : config.defaultWidthPercent,
			config,
		),
		align: 'center',
		title,
		privacy: el.getAttribute('data-video-privacy') !== 'false',
	};
	const hash: string | null = el.getAttribute('data-video-hash');
	if (hash && VIDEO_HASH_PATTERN.test(hash)) attrs.hash = hash;
	if (caption) attrs.caption = caption;
	return attrs;
}

/** Reconstructs video attributes from a known-provider embed `<iframe>`, or false. */
function parseVideoIframe(
	el: HTMLElement,
	config: VideoPluginConfig,
): Record<string, string | number | boolean> | false {
	const src: string = el.getAttribute('src') ?? '';
	const match: VideoMatch | null = parseVideoUrl(src, config.providers);
	if (!match || !isSafeVideoId(match.videoId)) return false;

	const attrs: Record<string, string | number | boolean> = {
		provider: match.provider,
		videoId: match.videoId,
		aspectRatio: ratioFromIframeDimensions(el, config),
		widthPercent: config.defaultWidthPercent,
		align: 'center',
		title: el.getAttribute('title') ?? '',
		privacy: config.privacy,
	};
	if (match.hash) attrs.hash = match.hash;
	return attrs;
}

/** Derives a validated aspect ratio from an iframe's width/height, else the default. */
function ratioFromIframeDimensions(el: HTMLElement, config: VideoPluginConfig): string {
	const width: number = Number.parseFloat(el.getAttribute('width') ?? '');
	const height: number = Number.parseFloat(el.getAttribute('height') ?? '');
	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		return sanitizeAspectRatio(`${width}/${height}`, config);
	}
	return config.defaultAspectRatio;
}
