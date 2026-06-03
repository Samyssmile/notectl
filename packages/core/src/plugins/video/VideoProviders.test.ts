import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VIDEO_PROVIDERS,
	buildEmbedUrlForMatch,
	buildWatchUrlForMatch,
	collectEmbedHostnames,
	isAllowedEmbedSrc,
	parseVideoUrl,
} from './VideoProviders.js';

const ID = 'dQw4w9WgXcQ'; // valid 11-char YouTube id

describe('parseVideoUrl — YouTube', () => {
	it.each([
		['watch', `https://www.youtube.com/watch?v=${ID}`],
		['youtu.be', `https://youtu.be/${ID}`],
		['shorts', `https://www.youtube.com/shorts/${ID}`],
		['live', `https://www.youtube.com/live/${ID}`],
		['embed', `https://www.youtube.com/embed/${ID}`],
		['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
		['m.youtube', `https://m.youtube.com/watch?v=${ID}`],
		['extra params', `https://www.youtube.com/watch?foo=bar&v=${ID}&t=10s`],
	])('parses the %s form', (_label, url) => {
		expect(parseVideoUrl(url)).toEqual({ provider: 'youtube', videoId: ID });
	});

	it('rejects an id of the wrong length', () => {
		expect(parseVideoUrl('https://youtu.be/short')).toBeNull();
	});
});

describe('parseVideoUrl — Vimeo', () => {
	it('parses a plain numeric url', () => {
		expect(parseVideoUrl('https://vimeo.com/123456789')).toEqual({
			provider: 'vimeo',
			videoId: '123456789',
		});
	});

	it('parses an unlisted url with a path hash', () => {
		expect(parseVideoUrl('https://vimeo.com/123456789/abc123def')).toEqual({
			provider: 'vimeo',
			videoId: '123456789',
			hash: 'abc123def',
		});
	});

	it('parses a player url with a query hash', () => {
		expect(parseVideoUrl('https://player.vimeo.com/video/123456789?h=abc123def')).toEqual({
			provider: 'vimeo',
			videoId: '123456789',
			hash: 'abc123def',
		});
	});

	it('rejects a non-numeric id', () => {
		expect(parseVideoUrl('https://vimeo.com/notanumber')).toBeNull();
	});
});

describe('parseVideoUrl — Dailymotion', () => {
	it('parses /video/<id>', () => {
		expect(parseVideoUrl('https://www.dailymotion.com/video/x7tgad0')).toEqual({
			provider: 'dailymotion',
			videoId: 'x7tgad0',
		});
	});

	it('parses dai.ly short urls', () => {
		expect(parseVideoUrl('https://dai.ly/x7tgad0')).toEqual({
			provider: 'dailymotion',
			videoId: 'x7tgad0',
		});
	});
});

describe('parseVideoUrl — look-alike and malformed rejection', () => {
	it.each([
		['look-alike host', `https://evilyoutube.com/watch?v=${ID}`],
		['subdomain spoof', `https://youtube.com.evil.com/watch?v=${ID}`],
		['userinfo trick', `https://youtube.com@evil.com/watch?v=${ID}`],
		['non-http(s) scheme', `ftp://www.youtube.com/watch?v=${ID}`],
		['not a url', 'just some text'],
		['unknown provider', 'https://example.com/video/123'],
	])('rejects %s', (_label, url) => {
		expect(parseVideoUrl(url)).toBeNull();
	});
});

describe('buildEmbedUrlForMatch', () => {
	const providers = DEFAULT_VIDEO_PROVIDERS;

	it('uses the privacy host and autoplay for YouTube', () => {
		const url = buildEmbedUrlForMatch({ provider: 'youtube', videoId: ID }, providers, {
			privacy: true,
			autoplay: true,
		});
		expect(url).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0&autoplay=1`);
	});

	it('uses the standard host without autoplay when not privacy/autoplay', () => {
		const url = buildEmbedUrlForMatch({ provider: 'youtube', videoId: ID }, providers, {
			privacy: false,
			autoplay: false,
		});
		expect(url).toBe(`https://www.youtube.com/embed/${ID}?rel=0`);
	});

	it('adds the Vimeo hash and dnt', () => {
		const url = buildEmbedUrlForMatch(
			{ provider: 'vimeo', videoId: '123', hash: 'abc' },
			providers,
			{ privacy: true, autoplay: false },
		);
		expect(url).toBe('https://player.vimeo.com/video/123?h=abc&dnt=1');
	});

	it('returns null for an unknown provider', () => {
		expect(
			buildEmbedUrlForMatch({ provider: 'nope', videoId: '1' }, providers, {
				privacy: true,
				autoplay: false,
			}),
		).toBeNull();
	});
});

describe('buildWatchUrlForMatch', () => {
	it('builds public watch urls', () => {
		expect(
			buildWatchUrlForMatch({ provider: 'youtube', videoId: ID }, DEFAULT_VIDEO_PROVIDERS),
		).toBe(`https://www.youtube.com/watch?v=${ID}`);
		expect(
			buildWatchUrlForMatch(
				{ provider: 'vimeo', videoId: '123', hash: 'abc' },
				DEFAULT_VIDEO_PROVIDERS,
			),
		).toBe('https://vimeo.com/123/abc');
	});
});

describe('isAllowedEmbedSrc', () => {
	const hosts = collectEmbedHostnames();

	it('accepts an https embed url on an allowed host', () => {
		expect(isAllowedEmbedSrc(`https://www.youtube-nocookie.com/embed/${ID}`, hosts)).toBe(true);
		expect(isAllowedEmbedSrc('https://player.vimeo.com/video/123', hosts)).toBe(true);
	});

	it('rejects non-https, look-alike hosts, and unknown hosts', () => {
		expect(isAllowedEmbedSrc(`http://www.youtube-nocookie.com/embed/${ID}`, hosts)).toBe(false);
		expect(isAllowedEmbedSrc(`https://www.youtube.com.evil.com/embed/${ID}`, hosts)).toBe(false);
		expect(isAllowedEmbedSrc('https://evil.com/embed/123', hosts)).toBe(false);
	});

	it('collects the expected default embed hosts', () => {
		const hostSet = collectEmbedHostnames();
		expect(hostSet.has('www.youtube-nocookie.com')).toBe(true);
		expect(hostSet.has('player.vimeo.com')).toBe(true);
		expect(hostSet.has('www.dailymotion.com')).toBe(true);
	});
});
