import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VideoFacadeController } from './VideoFacade.js';
import { VIDEO_LOCALE_EN } from './VideoLocale.js';
import { DEFAULT_VIDEO_CONFIG, type VideoAttrs } from './VideoTypes.js';

const ID = 'dQw4w9WgXcQ';

// happy-dom eagerly fetches an inserted `<iframe src>`; intercept with an empty
// response (scoped to this isolated test file) to avoid async network noise.
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
afterEach(() => vi.restoreAllMocks());

function attrs(over: Partial<VideoAttrs> = {}): VideoAttrs {
	return {
		provider: 'youtube',
		videoId: ID,
		aspectRatio: '16 / 9',
		widthPercent: 100,
		align: 'center',
		title: 'How to set up notectl in 3 minutes',
		privacy: true,
		...over,
	};
}

function makeController(videoAttrs: VideoAttrs) {
	const frame = document.createElement('div');
	document.body.appendChild(frame);
	const announce = vi.fn();
	const controller = new VideoFacadeController({
		frame,
		getAttrs: () => videoAttrs,
		config: DEFAULT_VIDEO_CONFIG,
		locale: VIDEO_LOCALE_EN,
		announce,
	});
	return { frame, controller, announce };
}

describe('VideoFacadeController — facade', () => {
	it('renders a real, labeled play button (no iframe, zero provider contact)', () => {
		const { frame } = makeController(attrs());
		const button = frame.querySelector('button.notectl-video__facade');
		expect(button).not.toBeNull();
		expect(button?.getAttribute('aria-label')).toContain('How to set up notectl');
		expect(frame.querySelector('iframe')).toBeNull();
	});
});

describe('VideoFacadeController — activation', () => {
	it('builds an iframe with a descriptive title and the privacy host', () => {
		const { frame, controller, announce } = makeController(attrs());
		controller.activate();

		const iframe = frame.querySelector('iframe');
		expect(iframe).not.toBeNull();
		// SC 4.1.2: non-empty, descriptive accessible name describing the content.
		expect(iframe?.getAttribute('title')).toBe('How to set up notectl in 3 minutes');
		expect(iframe?.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/');
		expect(iframe?.hasAttribute('srcdoc')).toBe(false);
		expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(iframe?.getAttribute('loading')).toBe('lazy');
		expect(announce).toHaveBeenCalled();
	});

	it('uses the standard host when privacy is disabled', () => {
		const { frame, controller } = makeController(attrs({ privacy: false }));
		controller.activate();
		expect(frame.querySelector('iframe')?.getAttribute('src')).toContain(
			'https://www.youtube.com/embed/',
		);
	});

	it('autoplays on the explicit facade click (user gesture, not load-time)', () => {
		// Deviates intentionally from the spec's literal "no autoplay=1 unless mute=1":
		// the facade click IS the user gesture, so this can never be an F93 (load-time)
		// violation. Pinned here so the deviation is explicit, not a latent surprise.
		const { frame, controller } = makeController(attrs());
		controller.activate();
		expect(frame.querySelector('iframe')?.getAttribute('src')).toContain('autoplay=1');
	});

	it('does NOT autoplay when prefers-reduced-motion is set (SC 2.2.2)', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		const { frame, controller } = makeController(attrs());
		controller.activate();
		expect(frame.querySelector('iframe')?.getAttribute('src')).not.toContain('autoplay=1');
	});

	it('restores the facade and announces on deactivate', () => {
		const { frame, controller, announce } = makeController(attrs());
		controller.activate();
		announce.mockClear();
		controller.deactivate(true);

		expect(frame.querySelector('iframe')).toBeNull();
		expect(frame.querySelector('button.notectl-video__facade')).not.toBeNull();
		expect(announce).toHaveBeenCalledWith(VIDEO_LOCALE_EN.exitedPlayer);
	});
});
