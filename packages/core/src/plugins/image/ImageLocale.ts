/** Locale interface and default English locale for the ImagePlugin. */

// --- Locale Interface ---

export interface ImageLocale {
	readonly insertImage: string;
	readonly insertImageTooltip: string;
	readonly uploadFromComputer: string;
	readonly uploadAria: string;
	readonly separator: string;
	readonly urlPlaceholder: string;
	readonly urlAria: string;
	readonly insertButton: string;
	readonly insertAria: string;
	readonly imageAria: (alt: string, width?: number, height?: number) => string;
	readonly resetToNaturalSize: string;
	readonly uploadFailed: string;
	readonly uploading: string;
	readonly resizeHandleLabel: (position: string) => string;
	readonly imageSelected: string;
	readonly altTextPrefix: string;
	readonly imageSizeAnnounce: (w: number, h: number) => string;
	readonly resizeHint: (shrink: string, grow: string) => string;
	readonly imageResized: (w: number, h: number) => string;
	readonly keyboardResizeHint: (shrink: string, grow: string) => string;
}

// --- Default English Locale ---

export const IMAGE_LOCALE_EN: ImageLocale = {
	insertImage: 'Insert Image',
	insertImageTooltip: 'Insert Image',
	uploadFromComputer: 'Upload from computer',
	uploadAria: 'Upload image from computer',
	separator: 'or',
	urlPlaceholder: 'https://...',
	urlAria: 'Image URL',
	insertButton: 'Insert',
	insertAria: 'Insert image',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Image'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} by ${height} pixels`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Image reset to natural size.',
	uploadFailed: 'Upload failed',
	uploading: 'Uploading...',
	resizeHandleLabel: (position: string) => `Resize ${position}`,
	imageSelected: 'Image selected.',
	altTextPrefix: 'Alt text: ',
	imageSizeAnnounce: (w: number, h: number) => `Size: ${w} by ${h} pixels.`,
	resizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} to resize.`,
	imageResized: (w: number, h: number) => `Image resized to ${w} by ${h} pixels.`,
	keyboardResizeHint: (shrink: string, grow: string) => `${shrink} / ${grow} to resize`,
};

// --- Lazy Locale Loader ---

const localeModules: Record<string, () => Promise<{ default: ImageLocale }>> = import.meta.glob<{
	default: ImageLocale;
}>('./locales/*.ts', { eager: false });

export async function loadImageLocale(lang: string): Promise<ImageLocale> {
	if (lang === 'en') return IMAGE_LOCALE_EN;
	const loader = localeModules[`./locales/${lang}.ts`];
	if (!loader) return IMAGE_LOCALE_EN;
	try {
		const mod = await loader();
		return mod.default;
	} catch {
		return IMAGE_LOCALE_EN;
	}
}
