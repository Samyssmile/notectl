import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { NotectlEditorConfig } from '@notectl/core';

/**
 * Default configuration applied to all `<notectl-editor>` instances within
 * the injector scope. Component-level inputs override these defaults.
 */
export const NOTECTL_DEFAULT_CONFIG: InjectionToken<Partial<NotectlEditorConfig>> =
	new InjectionToken<Partial<NotectlEditorConfig>>('notectl-default-config');

/**
 * Content format used by the `ControlValueAccessor` for forms integration.
 * Determines how editor content is serialized when reading/writing form values.
 *
 * - `'json'` — `Document` objects (default)
 * - `'html'` — sanitized HTML strings
 * - `'text'` — plain text strings
 */
export const NOTECTL_CONTENT_FORMAT: InjectionToken<ContentFormat> =
	new InjectionToken<ContentFormat>('notectl-content-format');

/** Supported content serialization formats for forms integration. */
export type ContentFormat = 'json' | 'html' | 'text';

/** Options for `provideNotectl()`. */
export interface NotectlProviderOptions {
	/** Default editor configuration applied to all instances. */
	readonly config?: Partial<NotectlEditorConfig>;
	/** Content serialization format for forms integration. Defaults to `'json'`. */
	readonly contentFormat?: ContentFormat;
}

/**
 * Configures the notectl editor at the environment injector level.
 *
 * @example
 * ```typescript
 * bootstrapApplication(App, {
 *   providers: [
 *     provideNotectl({
 *       config: { theme: ThemePreset.Light, placeholder: 'Start typing...' },
 *       contentFormat: 'json',
 *     }),
 *   ],
 * });
 * ```
 */
export function provideNotectl(options: NotectlProviderOptions = {}): EnvironmentProviders {
	const providers = [];

	if (options.config) {
		providers.push({ provide: NOTECTL_DEFAULT_CONFIG, useValue: options.config });
	}

	if (options.contentFormat) {
		providers.push({ provide: NOTECTL_CONTENT_FORMAT, useValue: options.contentFormat });
	}

	return makeEnvironmentProviders(providers);
}
