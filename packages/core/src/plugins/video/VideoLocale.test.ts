import { describe, expect, it } from 'vitest';
import { VIDEO_LOCALE_EN, type VideoLocale, loadVideoLocale } from './VideoLocale.js';

const LOCALES: readonly string[] = ['de', 'es', 'fr', 'zh', 'ru', 'ar', 'hi', 'pt'];

describe('loadVideoLocale', () => {
	it('returns the English locale for "en" without a dynamic import', async () => {
		expect(await loadVideoLocale('en')).toBe(VIDEO_LOCALE_EN);
	});

	it('loads a translated locale', async () => {
		const de = await loadVideoLocale('de');
		expect(de.insertVideo).toBe('Video einfügen');
		expect(de.closePlayer).toBe('Videoplayer schließen');
	});

	it('falls back to English for an unknown language', async () => {
		expect(await loadVideoLocale('xx')).toBe(VIDEO_LOCALE_EN);
	});

	it('defines every key in all shipped locales', async () => {
		const keys = Object.keys(VIDEO_LOCALE_EN) as (keyof VideoLocale)[];
		for (const lang of LOCALES) {
			const locale = await loadVideoLocale(lang);
			for (const key of keys) {
				expect(locale[key], `${lang}.${String(key)}`).toBeDefined();
			}
		}
	});
});
