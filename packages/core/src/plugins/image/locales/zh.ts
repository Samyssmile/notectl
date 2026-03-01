import type { ImageLocale } from '../ImageLocale.js';

const locale: ImageLocale = {
	insertImage: '\u63d2\u5165\u56fe\u7247',
	insertImageTooltip: '\u63d2\u5165\u56fe\u7247',
	uploadFromComputer: '\u4ece\u7535\u8111\u4e0a\u4f20',
	uploadAria: '\u4ece\u7535\u8111\u4e0a\u4f20\u56fe\u7247',
	separator: '\u6216',
	urlPlaceholder: 'https://...',
	urlAria: '\u56fe\u7247\u94fe\u63a5',
	insertButton: '\u63d2\u5165',
	insertAria: '\u63d2\u5165\u56fe\u7247',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || '\u56fe\u7247'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} x ${height} \u50cf\u7d20`);
		}
		return parts.join('\uff0c');
	},
	resetToNaturalSize: '\u56fe\u7247\u5df2\u6062\u590d\u539f\u59cb\u5927\u5c0f\u3002',
	uploadFailed: '\u56fe\u7247\u4e0a\u4f20\u5931\u8d25\u3002',
};

export default locale;
