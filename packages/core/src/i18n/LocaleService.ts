/**
 * Global locale service that resolves the active language.
 * Registered as a system-level service before plugin init.
 */

import { ServiceKey } from '../plugins/Plugin.js';

export class LocaleService {
	private readonly resolvedLocale: string;

	constructor(locale: string) {
		this.resolvedLocale =
			locale === 'browser'
				? typeof navigator !== 'undefined'
					? (navigator.language.split('-')[0] ?? 'en')
					: 'en'
				: locale;
	}

	getLocale(): string {
		return this.resolvedLocale;
	}
}

export const LocaleServiceKey = new ServiceKey<LocaleService>('locale');
