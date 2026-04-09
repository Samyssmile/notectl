/**
 * Shared helper for loading plugin locale bundles.
 *
 * Rationale:
 * Every notectl plugin used to ship its own copy of a ~15-line locale
 * loader: English shortcut, glob lookup, lazy import, try/catch fallback.
 * The logic is identical across ~23 plugins — only the locale type and
 * the default value change. This helper centralizes the pattern so each
 * plugin's `XxxLocale.ts` shrinks to a handful of lines.
 *
 * Why the glob map still lives in the plugin:
 * `import.meta.glob` is statically resolved by the bundler **relative to
 * the file that calls it**. The helper therefore cannot build the glob
 * itself — each plugin must pass in its own `import.meta.glob(...)`
 * result, and the helper takes care of everything else.
 */

/**
 * Signature of a single locale loader as produced by `import.meta.glob`.
 * The bundler wraps each matched module in a thunk returning a Promise
 * that resolves to an ES module whose default export is the locale.
 */
export type LocaleModuleLoader<TLocale> = () => Promise<{ default: TLocale }>;

/**
 * Map from the path string emitted by `import.meta.glob` (e.g.
 * `./locales/de.ts`) to its corresponding lazy loader.
 */
export type LocaleModuleMap<TLocale> = Record<string, LocaleModuleLoader<TLocale>>;

/**
 * Loads a plugin locale for the requested language with three fallbacks:
 *
 * 1. `lang === 'en'` — returns the default locale immediately, no import.
 * 2. No matching module in the map — returns the default locale.
 * 3. Module import throws — returns the default locale.
 *
 * This is the exact behavior every plugin needs; sharing it removes ~15
 * lines of boilerplate per plugin and guarantees consistent fallback
 * semantics across the entire editor.
 *
 * @param modules    The `import.meta.glob('./locales/*.ts', ...)` map from
 *                   the caller's module. Passing this in from the plugin
 *                   is mandatory — globs are resolved at the call site.
 * @param lang       IETF-style language tag, e.g. `'de'`, `'zh'`, `'en'`.
 * @param fallback   English default locale to return when lookup or
 *                   import fails. Must already be a fully-formed locale.
 */
export async function loadLocaleModule<TLocale>(
	modules: LocaleModuleMap<TLocale>,
	lang: string,
	fallback: TLocale,
): Promise<TLocale> {
	if (lang === 'en') return fallback;

	const loader: LocaleModuleLoader<TLocale> | undefined = modules[`./locales/${lang}.ts`];
	if (!loader) return fallback;

	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return fallback;
	}
}
