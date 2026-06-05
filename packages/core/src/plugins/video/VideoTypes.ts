/**
 * Video plugin types, configuration, and defaults.
 */

import { DEFAULT_VIDEO_PROVIDERS, type VideoProvider } from './VideoProviders.js';

// --- Video Attributes ---

/** Logical alignment of a video block within the content column. */
export type VideoAlign = 'start' | 'center' | 'end';

/**
 * Structured video node attributes. The node never stores raw `<iframe>` HTML;
 * the live iframe is constructed at view time from `provider` + `videoId`. This
 * is the privacy and security keystone (see `ARCHITECTURE.md` / issue #142).
 */
export interface VideoAttrs {
	/** Provider id, e.g. `youtube` | `vimeo` | `dailymotion`. */
	readonly provider: string;
	/** Provider-validated video id. */
	readonly videoId: string;
	/** Privacy hash for unlisted videos (Vimeo). */
	readonly hash?: string;
	/** CSS aspect ratio, e.g. `16/9`; height always follows width from this. */
	readonly aspectRatio: string;
	/** Responsive width as a percentage of the content column. */
	readonly widthPercent: number;
	/** Logical alignment. */
	readonly align: VideoAlign;
	/**
	 * Accessible name describing the video content (iframe `title`, figure label).
	 * Required for a non-empty, descriptive accessible name (WCAG SC 4.1.2).
	 */
	readonly title: string;
	/** Optional visible caption rendered as `<figcaption>`. */
	readonly caption?: string;
	/** Use privacy-enhanced host/params (nocookie / dnt). */
	readonly privacy: boolean;
}

// --- Keyboard Bindings ---

/**
 * Configurable keyboard bindings for video resize actions.
 * Omit a slot to use the default; set to `null` to disable the binding.
 *
 * Key descriptor format: `'Mod-Shift-ArrowRight'`, etc.
 * `Mod` resolves to Cmd on macOS, Ctrl on Windows/Linux.
 */
export interface VideoKeymap {
	readonly growWidth?: string | null;
	readonly shrinkWidth?: string | null;
	readonly growWidthLarge?: string | null;
	readonly shrinkWidthLarge?: string | null;
	readonly resetSize?: string | null;
}

export const DEFAULT_VIDEO_KEYMAP: Readonly<Record<keyof VideoKeymap, string>> = {
	growWidth: 'Mod-Shift-ArrowRight',
	shrinkWidth: 'Mod-Shift-ArrowLeft',
	growWidthLarge: 'Mod-Shift-Alt-ArrowRight',
	shrinkWidthLarge: 'Mod-Shift-Alt-ArrowLeft',
	resetSize: 'Mod-Shift-0',
};

// --- Configuration ---

import type { VideoLocale } from './VideoLocale.js';

export interface VideoPluginConfig {
	/** Declarative provider registry. Default: YouTube, Vimeo, Dailymotion. */
	readonly providers: readonly VideoProvider[];
	/** Use the privacy-first facade (click-to-load). @default true */
	readonly facade: boolean;
	/**
	 * Load the provider thumbnail in the facade. A provider thumbnail is itself a
	 * third-party request, so it is off by default to preserve the
	 * zero-contact-before-consent guarantee. @default false
	 */
	readonly useProviderThumbnail: boolean;
	/** Use privacy-enhanced host/params (nocookie / dnt). @default true */
	readonly privacy: boolean;
	/** Aspect ratios offered in the editing UI. */
	readonly allowedAspectRatios: readonly string[];
	/** Default aspect ratio for newly inserted videos. */
	readonly defaultAspectRatio: string;
	/** Default responsive width (percent of content column). @default 100 */
	readonly defaultWidthPercent: number;
	/** Minimum responsive width (percent). @default 25 */
	readonly minWidthPercent: number;
	/** Percent to grow/shrink per small resize step. @default 10 */
	readonly widthStep: number;
	/** Percent to grow/shrink per large resize step. @default 25 */
	readonly widthStepLarge: number;
	/** Whether videos are resizable. @default true */
	readonly resizable: boolean;
	/** Customize keyboard bindings for video resize actions. */
	readonly keymap?: VideoKeymap;
	/** Locale override for user-facing strings. */
	readonly locale?: VideoLocale;
}

export const DEFAULT_VIDEO_CONFIG: VideoPluginConfig = {
	providers: DEFAULT_VIDEO_PROVIDERS,
	facade: true,
	useProviderThumbnail: false,
	privacy: true,
	allowedAspectRatios: ['16/9', '4/3', '1/1', '9/16'],
	defaultAspectRatio: '16/9',
	defaultWidthPercent: 100,
	minWidthPercent: 25,
	widthStep: 10,
	widthStepLarge: 25,
	resizable: true,
};

// --- Shared constants ---

/** Node type name for the video block. */
export const VIDEO_TYPE = 'video';

/** Maximum responsive width (percent of content column). */
export const MAX_WIDTH_PERCENT = 100;

// --- Value validators (CSS-injection-safe; values may come from imported HTML) ---

/** A safe `<number>/<number>` ratio, e.g. `16/9` or `2.39 / 1`. */
const ASPECT_RATIO_PATTERN = /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/;

/**
 * Validates an aspect-ratio string before it is used as a CSS value. Returns the
 * normalized ratio (`16 / 9`) when it is a safe `<num>/<num>` form, otherwise the
 * configured default. This is the guard that prevents CSS injection from an
 * imported `data-video-ratio` attribute.
 */
export function sanitizeAspectRatio(value: string | undefined, config: VideoPluginConfig): string {
	if (!value || !ASPECT_RATIO_PATTERN.test(value.trim())) return config.defaultAspectRatio;
	const [w, h] = value.split('/');
	return `${w?.trim()} / ${h?.trim()}`;
}

/** Clamps a responsive width percentage to `[minWidthPercent, 100]` and rounds it. */
export function clampWidthPercent(value: number, config: VideoPluginConfig): number {
	if (!Number.isFinite(value)) return config.defaultWidthPercent;
	return Math.max(config.minWidthPercent, Math.min(MAX_WIDTH_PERCENT, Math.round(value)));
}

/** A video id shape shared by all built-in providers (alphanumeric, `_`, `-`). */
const SAFE_VIDEO_ID = /^[A-Za-z0-9_-]+$/;

/** True when a video id is well-formed enough to build a clean embed URL. */
export function isSafeVideoId(value: string): boolean {
	return value.length > 0 && value.length <= 64 && SAFE_VIDEO_ID.test(value);
}

/**
 * Normalizes a block's raw attributes into a fully-formed {@link VideoAttrs},
 * applying defaults and validating the ratio/width. Shared by the NodeSpec
 * renderer and the NodeView so both read attributes identically.
 */
export function normalizeVideoAttrs(
	attrs: Partial<VideoAttrs> | undefined,
	config: VideoPluginConfig,
): VideoAttrs {
	return {
		provider: attrs?.provider ?? '',
		videoId: attrs?.videoId ?? '',
		...(attrs?.hash ? { hash: attrs.hash } : {}),
		aspectRatio: sanitizeAspectRatio(attrs?.aspectRatio, config),
		widthPercent: clampWidthPercent(attrs?.widthPercent ?? config.defaultWidthPercent, config),
		align: attrs?.align ?? 'center',
		title: attrs?.title ?? '',
		...(attrs?.caption ? { caption: attrs.caption } : {}),
		privacy: attrs?.privacy ?? config.privacy,
	};
}
