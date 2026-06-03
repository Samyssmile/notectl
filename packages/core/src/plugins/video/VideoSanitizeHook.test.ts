import DOMPurify from 'dompurify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { collectEmbedHostnames } from './VideoProviders.js';
import { installVideoIframeHook, uninstallVideoIframeHook } from './VideoSanitizeHook.js';

const ID = 'dQw4w9WgXcQ';

// happy-dom eagerly loads an `<iframe src>` it sees while DOMPurify builds the
// element, producing async fetch/abort noise unrelated to the hook. Intercept
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

/** Sanitizes with iframe allowed, so only the host-allowlist hook decides survival. */
function sanitize(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: ['iframe', 'div'],
		ALLOWED_ATTR: ['src', 'srcdoc', 'title'],
	});
}

describe('VideoSanitizeHook', () => {
	afterEach(() => uninstallVideoIframeHook());

	it('keeps an https embed iframe on an allowed host', () => {
		installVideoIframeHook(collectEmbedHostnames());
		const out = sanitize(`<iframe src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`);
		expect(out).toContain('<iframe');
	});

	it('removes a look-alike host iframe', () => {
		installVideoIframeHook(collectEmbedHostnames());
		const out = sanitize(`<iframe src="https://www.youtube.com.evil.com/embed/${ID}"></iframe>`);
		expect(out).not.toContain('<iframe');
	});

	it('removes a non-https iframe', () => {
		installVideoIframeHook(collectEmbedHostnames());
		const out = sanitize(`<iframe src="http://www.youtube-nocookie.com/embed/${ID}"></iframe>`);
		expect(out).not.toContain('<iframe');
	});

	it('removes an iframe carrying srcdoc', () => {
		installVideoIframeHook(collectEmbedHostnames());
		const out = sanitize(
			`<iframe srcdoc="<b>x</b>" src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`,
		);
		expect(out).not.toContain('<iframe');
	});

	it('stops filtering once the last installer uninstalls (ref-counted)', () => {
		installVideoIframeHook(collectEmbedHostnames());
		uninstallVideoIframeHook();
		// No hook now: DOMPurify's own allowlist (which we set to permit iframe) applies.
		expect(sanitize('<iframe src="https://evil.com/x"></iframe>')).toContain('<iframe');
	});
});
