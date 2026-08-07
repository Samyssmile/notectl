import DOMPurify from 'dompurify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SAFE_URI_REGEXP } from '../../model/HTMLUtils.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { sanitizeHTML } from '../../serialization/HTMLSanitization.js';
import { VIDEO_LOCALE_EN } from './VideoLocale.js';
import { createVideoNodeSpec } from './VideoNodeSpec.js';
import { DEFAULT_VIDEO_PROVIDERS, type VideoProvider } from './VideoProviders.js';
import { DEFAULT_VIDEO_CONFIG } from './VideoTypes.js';

const ID = 'dQw4w9WgXcQ';

// happy-dom eagerly loads an `<iframe src>` it sees while DOMPurify builds the
// element, producing async fetch/abort noise unrelated to the validator. Intercept
// those requests with an empty response (scoped to this isolated test file).
interface HappyDomFetchSettings {
	happyDOM?: { settings: { fetch: { interceptor: unknown } } };
}

beforeAll(() => {
	const w = window as unknown as HappyDomFetchSettings;
	if (w.happyDOM) {
		w.happyDOM.settings.fetch.interceptor = {
			beforeAsyncRequest: () => Promise.resolve(new Response('', { status: 200 })),
		};
	}
});

afterAll(() => {
	const w = window as unknown as HappyDomFetchSettings;
	if (w.happyDOM) w.happyDOM.settings.fetch.interceptor = null;
});

function provider(id: string): VideoProvider {
	const result = DEFAULT_VIDEO_PROVIDERS.find((candidate) => candidate.id === id);
	if (!result) throw new Error(`Missing test provider: ${id}`);
	return result;
}

function videoRegistry(...providers: readonly VideoProvider[]): SchemaRegistry {
	const registry = new SchemaRegistry();
	registry.registerNodeSpec(
		createVideoNodeSpec({ ...DEFAULT_VIDEO_CONFIG, providers }, VIDEO_LOCALE_EN),
	);
	registry.finalize();
	return registry;
}

/** Sanitizes through the same registry-owned boundary used by parse/export/paste. */
function sanitize(html: string, registry: SchemaRegistry): string {
	return sanitizeHTML(
		html,
		{
			ALLOWED_TAGS: registry.getAllowedTags(),
			ALLOWED_ATTR: registry.getAllowedAttrs(),
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
		},
		registry,
	);
}

describe('Video iframe sanitization', () => {
	it('keeps an https embed iframe on an owner-allowed host', () => {
		const registry = videoRegistry(provider('youtube'));
		const out = sanitize(
			`<iframe src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`,
			registry,
		);
		expect(out).toContain('<iframe');
	});

	it('removes look-alike, non-https, and srcdoc iframes', () => {
		const registry = videoRegistry(provider('youtube'));
		expect(
			sanitize(`<iframe src="https://www.youtube.com.evil.com/embed/${ID}"></iframe>`, registry),
		).not.toContain('<iframe');
		expect(
			sanitize(`<iframe src="http://www.youtube-nocookie.com/embed/${ID}"></iframe>`, registry),
		).not.toContain('<iframe');
		expect(
			sanitize(
				`<iframe srcdoc="<b>x</b>" src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`,
				registry,
			),
		).not.toContain('<iframe');
	});

	it('keeps each editor owner policy isolated instead of unioning provider hosts', () => {
		const youtube = videoRegistry(provider('youtube'));
		const vimeo = videoRegistry(provider('vimeo'));
		const youtubeFrame = `<iframe src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`;
		const vimeoFrame = '<iframe src="https://player.vimeo.com/video/123"></iframe>';

		expect(sanitize(youtubeFrame, youtube)).toContain('<iframe');
		expect(sanitize(vimeoFrame, youtube)).not.toContain('<iframe');
		expect(sanitize(vimeoFrame, vimeo)).toContain('<iframe');
		expect(sanitize(youtubeFrame, vimeo)).not.toContain('<iframe');
		// Reusing the first editor's sanitizer must not inherit the second owner's policy.
		expect(sanitize(vimeoFrame, youtube)).not.toContain('<iframe');
	});

	it('does not consume or remove hooks owned by another DOMPurify user', () => {
		const foreignHook = vi.fn();
		DOMPurify.addHook('uponSanitizeElement', foreignHook);
		try {
			sanitize(
				`<iframe src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`,
				videoRegistry(provider('youtube')),
			);
			foreignHook.mockClear();

			DOMPurify.sanitize('<div>foreign owner</div>');

			expect(foreignHook).toHaveBeenCalled();
		} finally {
			DOMPurify.removeHook('uponSanitizeElement', foreignHook);
		}
	});
});
