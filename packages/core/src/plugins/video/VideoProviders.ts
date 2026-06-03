/**
 * Dependency-free video provider registry.
 *
 * Every embed is derived from pure client-side parsing of the user-supplied URL.
 * No oEmbed, no provider SDK, no runtime network call — a hard project constraint.
 *
 * A provider knows three things:
 *  - which incoming hostnames it recognizes (`hostnames`),
 *  - how to extract a video id (+ optional privacy hash) from such a URL (`parse`),
 *  - how to build the canonical embed/watch/thumbnail URLs from that id.
 *
 * The `embedHostnames` set is the load-bearing security boundary: it is the exact
 * set of hosts a video `<iframe src>` may point at. The sanitize host-allowlist
 * (see `VideoPlugin`) is built from the union of every provider's `embedHostnames`,
 * so adding a provider keeps the allowlist in sync automatically.
 */

/** A parsed reference to a hosted video. */
export interface VideoMatch {
	readonly provider: string;
	readonly videoId: string;
	/** Privacy hash for unlisted videos (Vimeo). */
	readonly hash?: string;
}

/** Options influencing embed-URL construction. */
export interface EmbedUrlOptions {
	/** Use the privacy-enhanced host/params (youtube-nocookie, Vimeo `dnt`). */
	readonly privacy: boolean;
	/**
	 * Start playback immediately. Only ever set in response to an explicit user
	 * gesture (the facade Play button), never on load — so this can never be an
	 * autoplay-on-load (WCAG F93) violation.
	 */
	readonly autoplay: boolean;
}

/**
 * A video provider. Recognizing a new service is a single object: declare its
 * hostnames, a `parse` that pulls the id out of a URL, and the URL builders.
 */
export interface VideoProvider {
	/** Stable identifier persisted in the node (`youtube` | `vimeo` | ...). */
	readonly id: string;
	/** Human-readable provider name for UI surfaces. */
	readonly label: string;
	/** Exact hostnames recognized when parsing an incoming watch/share URL. */
	readonly hostnames: readonly string[];
	/** Exact hostnames permitted as an embed `<iframe src>` (sanitize allowlist). */
	readonly embedHostnames: readonly string[];
	/** Extracts the video id (and optional hash) from a host-matched URL. */
	parse(url: URL): { readonly videoId: string; readonly hash?: string } | null;
	/** Builds the embed `<iframe src>` for the match. */
	buildEmbedUrl(match: VideoMatch, options: EmbedUrlOptions): string;
	/** Builds the canonical public watch URL (facade link + HTML export). */
	buildWatchUrl(match: VideoMatch): string;
	/**
	 * Builds a deterministic thumbnail URL, if the provider exposes one without an
	 * API call. Absent (or returning undefined) means the facade uses a local
	 * placeholder. Loading a provider thumbnail is itself a third-party request,
	 * so it is opt-in (`useProviderThumbnail`), never the default.
	 */
	thumbnailUrl?(match: VideoMatch): string | undefined;
}

// --- ID shape validators ---

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[A-Za-z0-9]+$/;
const DAILYMOTION_ID = /^[A-Za-z0-9]+$/;

/** Reads the first non-empty path segment after a given marker segment. */
function segmentAfter(segments: readonly string[], marker: string): string | undefined {
	const index: number = segments.indexOf(marker);
	if (index === -1) return undefined;
	return segments[index + 1];
}

// --- YouTube ---

const YOUTUBE: VideoProvider = {
	id: 'youtube',
	label: 'YouTube',
	hostnames: [
		'youtube.com',
		'www.youtube.com',
		'm.youtube.com',
		'music.youtube.com',
		'youtu.be',
		'youtube-nocookie.com',
		'www.youtube-nocookie.com',
	],
	embedHostnames: [
		'www.youtube-nocookie.com',
		'youtube-nocookie.com',
		'www.youtube.com',
		'youtube.com',
	],
	parse(url: URL): { readonly videoId: string } | null {
		const host: string = url.hostname.toLowerCase();
		const segments: string[] = url.pathname.split('/').filter(Boolean);

		// youtu.be/<id>
		if (host === 'youtu.be') {
			const id: string | undefined = segments[0];
			return id && YOUTUBE_ID.test(id) ? { videoId: id } : null;
		}

		// /watch?v=<id>
		const queryId: string | null = url.searchParams.get('v');
		if (queryId && YOUTUBE_ID.test(queryId)) return { videoId: queryId };

		// /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
		for (const marker of ['embed', 'shorts', 'live', 'v']) {
			const id: string | undefined = segmentAfter(segments, marker);
			if (id && YOUTUBE_ID.test(id)) return { videoId: id };
		}
		return null;
	},
	buildEmbedUrl(match: VideoMatch, options: EmbedUrlOptions): string {
		const host: string = options.privacy ? 'www.youtube-nocookie.com' : 'www.youtube.com';
		const params: string = buildQuery({
			rel: '0',
			...(options.autoplay ? { autoplay: '1' } : {}),
		});
		return `https://${host}/embed/${match.videoId}${params}`;
	},
	buildWatchUrl(match: VideoMatch): string {
		return `https://www.youtube.com/watch?v=${match.videoId}`;
	},
	thumbnailUrl(match: VideoMatch): string {
		return `https://i.ytimg.com/vi/${match.videoId}/hqdefault.jpg`;
	},
};

// --- Vimeo ---

const VIMEO: VideoProvider = {
	id: 'vimeo',
	label: 'Vimeo',
	hostnames: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
	embedHostnames: ['player.vimeo.com'],
	parse(url: URL): { readonly videoId: string; readonly hash?: string } | null {
		const segments: string[] = url.pathname.split('/').filter(Boolean);

		// player.vimeo.com/video/<id>?h=<hash>
		const playerId: string | undefined = segmentAfter(segments, 'video');
		if (playerId && VIMEO_ID.test(playerId)) {
			return withVimeoHash(playerId, url, undefined);
		}

		// vimeo.com/<id>, vimeo.com/<id>/<hash>, vimeo.com/channels/<name>/<id>
		const numeric: string | undefined = segments.find((s) => VIMEO_ID.test(s));
		if (numeric) {
			const index: number = segments.indexOf(numeric);
			const pathHash: string | undefined = segments[index + 1];
			return withVimeoHash(numeric, url, pathHash);
		}
		return null;
	},
	buildEmbedUrl(match: VideoMatch, options: EmbedUrlOptions): string {
		const params: string = buildQuery({
			...(match.hash ? { h: match.hash } : {}),
			...(options.privacy ? { dnt: '1' } : {}),
			...(options.autoplay ? { autoplay: '1' } : {}),
		});
		return `https://player.vimeo.com/video/${match.videoId}${params}`;
	},
	buildWatchUrl(match: VideoMatch): string {
		const base = `https://vimeo.com/${match.videoId}`;
		return match.hash ? `${base}/${match.hash}` : base;
	},
};

/** Validates an optional Vimeo hash (query `h=` takes precedence over a path segment). */
function withVimeoHash(
	videoId: string,
	url: URL,
	pathHash: string | undefined,
): { readonly videoId: string; readonly hash?: string } {
	const queryHash: string | null = url.searchParams.get('h');
	const candidate: string | undefined = queryHash ?? pathHash;
	if (candidate && VIMEO_HASH.test(candidate)) {
		return { videoId, hash: candidate };
	}
	return { videoId };
}

// --- Dailymotion ---

const DAILYMOTION: VideoProvider = {
	id: 'dailymotion',
	label: 'Dailymotion',
	hostnames: ['dailymotion.com', 'www.dailymotion.com', 'geo.dailymotion.com', 'dai.ly'],
	embedHostnames: ['www.dailymotion.com', 'geo.dailymotion.com'],
	parse(url: URL): { readonly videoId: string } | null {
		const host: string = url.hostname.toLowerCase();
		const segments: string[] = url.pathname.split('/').filter(Boolean);

		// dai.ly/<id>
		if (host === 'dai.ly') {
			const id: string | undefined = segments[0];
			return id && DAILYMOTION_ID.test(id) ? { videoId: id } : null;
		}

		// /video/<id> or /embed/video/<id>
		const id: string | undefined = segmentAfter(segments, 'video');
		if (id && DAILYMOTION_ID.test(id)) return { videoId: id };
		return null;
	},
	buildEmbedUrl(match: VideoMatch, options: EmbedUrlOptions): string {
		const params: string = buildQuery(options.autoplay ? { autoplay: '1' } : {});
		return `https://www.dailymotion.com/embed/video/${match.videoId}${params}`;
	},
	buildWatchUrl(match: VideoMatch): string {
		return `https://www.dailymotion.com/video/${match.videoId}`;
	},
	thumbnailUrl(match: VideoMatch): string {
		return `https://www.dailymotion.com/thumbnail/video/${match.videoId}`;
	},
};

/** The default provider registry: YouTube, Vimeo, Dailymotion. */
export const DEFAULT_VIDEO_PROVIDERS: readonly VideoProvider[] = [YOUTUBE, VIMEO, DAILYMOTION];

// --- URL parsing entry point ---

/**
 * Parses a user-supplied URL into a {@link VideoMatch} against the given providers.
 * Returns null when the URL is malformed, not `https`/`http`, or matches no
 * provider — the caller then falls back to a plain link (never a blind embed).
 *
 * Host matching is exact set-membership, never substring: this is what rejects
 * look-alikes such as `evilyoutube.com`, `youtube.com.evil.com`, and the
 * `https://youtube.com@evil.com` userinfo trick (whose real host is `evil.com`).
 */
export function parseVideoUrl(
	rawUrl: string,
	providers: readonly VideoProvider[] = DEFAULT_VIDEO_PROVIDERS,
): VideoMatch | null {
	const url: URL | null = safeParseUrl(rawUrl);
	if (!url) return null;
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

	const host: string = url.hostname.toLowerCase();
	for (const provider of providers) {
		if (!provider.hostnames.includes(host)) continue;
		const result = provider.parse(url);
		if (result) {
			return {
				provider: provider.id,
				videoId: result.videoId,
				...(result.hash ? { hash: result.hash } : {}),
			};
		}
	}
	return null;
}

/** Looks up a provider by id. */
export function findProvider(
	providerId: string,
	providers: readonly VideoProvider[] = DEFAULT_VIDEO_PROVIDERS,
): VideoProvider | undefined {
	return providers.find((p) => p.id === providerId);
}

/** Builds the embed `<iframe src>` for a match, or null when the provider is unknown. */
export function buildEmbedUrlForMatch(
	match: VideoMatch,
	providers: readonly VideoProvider[],
	options: EmbedUrlOptions,
): string | null {
	const provider: VideoProvider | undefined = findProvider(match.provider, providers);
	return provider ? provider.buildEmbedUrl(match, options) : null;
}

/** Builds the canonical public watch URL for a match, or null when unknown. */
export function buildWatchUrlForMatch(
	match: VideoMatch,
	providers: readonly VideoProvider[],
): string | null {
	const provider: VideoProvider | undefined = findProvider(match.provider, providers);
	return provider ? provider.buildWatchUrl(match) : null;
}

/** Builds a deterministic thumbnail URL for a match, or undefined when unavailable. */
export function buildThumbnailForMatch(
	match: VideoMatch,
	providers: readonly VideoProvider[],
): string | undefined {
	const provider: VideoProvider | undefined = findProvider(match.provider, providers);
	return provider?.thumbnailUrl?.(match);
}

/** Returns the human-readable provider label, falling back to the raw id. */
export function providerLabel(
	providerId: string,
	providers: readonly VideoProvider[] = DEFAULT_VIDEO_PROVIDERS,
): string {
	return findProvider(providerId, providers)?.label ?? providerId;
}

/**
 * Builds the exact set of hostnames permitted as a video embed `<iframe src>`,
 * unioned across all providers. Used by the sanitize host-allowlist hook.
 */
export function collectEmbedHostnames(
	providers: readonly VideoProvider[] = DEFAULT_VIDEO_PROVIDERS,
): ReadonlySet<string> {
	const hosts = new Set<string>();
	for (const provider of providers) {
		for (const host of provider.embedHostnames) hosts.add(host.toLowerCase());
	}
	return hosts;
}

/**
 * True when `src` is a safe video embed URL: an `https:` URL whose hostname is an
 * exact member of the embed allowlist. Used both to validate iframes on import
 * and to reject anything that does not provably point at a known provider.
 */
export function isAllowedEmbedSrc(src: string, allowedHosts: ReadonlySet<string>): boolean {
	const url: URL | null = safeParseUrl(src);
	if (!url) return false;
	if (url.protocol !== 'https:') return false;
	return allowedHosts.has(url.hostname.toLowerCase());
}

/** Parses a URL, returning null instead of throwing on malformed input. */
function safeParseUrl(raw: string): URL | null {
	try {
		return new URL(raw.trim());
	} catch {
		return null;
	}
}

/** Builds a query string (`?a=1&b=2`) from defined entries, or '' when empty. */
function buildQuery(params: Record<string, string>): string {
	const entries: [string, string][] = Object.entries(params);
	if (entries.length === 0) return '';
	const query: string = entries
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join('&');
	return `?${query}`;
}
