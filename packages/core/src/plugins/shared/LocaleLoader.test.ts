import { describe, expect, it, vi } from 'vitest';
import { type LocaleModuleMap, loadLocaleModule } from './LocaleLoader.js';

interface TestLocale {
	readonly label: string;
}

const FALLBACK: TestLocale = { label: 'default' };

describe('loadLocaleModule', () => {
	it('returns the fallback for English without touching the module map', async () => {
		const modules: LocaleModuleMap<TestLocale> = {
			'./locales/en.ts': vi.fn(),
		};

		const result = await loadLocaleModule(modules, 'en', FALLBACK);

		expect(result).toBe(FALLBACK);
		expect(modules['./locales/en.ts']).not.toHaveBeenCalled();
	});

	it('returns the fallback when no matching module exists', async () => {
		const modules: LocaleModuleMap<TestLocale> = {};
		const result = await loadLocaleModule(modules, 'xx', FALLBACK);
		expect(result).toBe(FALLBACK);
	});

	it('returns the resolved default export when the loader succeeds', async () => {
		const de: TestLocale = { label: 'Etikett' };
		const modules: LocaleModuleMap<TestLocale> = {
			'./locales/de.ts': async () => ({ default: de }),
		};

		const result = await loadLocaleModule(modules, 'de', FALLBACK);

		expect(result).toBe(de);
	});

	it('returns the fallback when the loader rejects', async () => {
		const modules: LocaleModuleMap<TestLocale> = {
			'./locales/fr.ts': async () => {
				throw new Error('network down');
			},
		};

		const result = await loadLocaleModule(modules, 'fr', FALLBACK);

		expect(result).toBe(FALLBACK);
	});
});
