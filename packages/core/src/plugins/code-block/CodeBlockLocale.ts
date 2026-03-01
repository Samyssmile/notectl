/** Locale interface and default English locale for the CodeBlockPlugin. */

// --- Locale Interface ---

export interface CodeBlockLocale {
	readonly label: string;
	readonly tooltip: (shortcut?: string) => string;
	readonly enteredCodeBlock: string;
	readonly leftCodeBlock: string;
}

// --- Default English Locale ---

export const CODE_BLOCK_LOCALE_EN: CodeBlockLocale = {
	label: 'Code Block',
	tooltip: (shortcut?: string) => (shortcut ? `Code Block (${shortcut})` : 'Code Block'),
	enteredCodeBlock: 'Entered code block. Press Escape to exit.',
	leftCodeBlock: 'Left code block.',
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: CodeBlockLocale }>> =
	import.meta.glob<{ default: CodeBlockLocale }>('./locales/*.ts', { eager: false });

export async function loadCodeBlockLocale(lang: string): Promise<CodeBlockLocale> {
	if (lang === 'en') return CODE_BLOCK_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return CODE_BLOCK_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return CODE_BLOCK_LOCALE_EN;
	}
}
