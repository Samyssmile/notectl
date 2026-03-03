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
	uploading: '\u4e0a\u4f20\u4e2d...',
	resizeHandleLabel: (position: string) => {
		const positions: Record<string, string> = {
			'top-left': '\u5de6\u4e0a\u89d2',
			'top-right': '\u53f3\u4e0a\u89d2',
			'bottom-left': '\u5de6\u4e0b\u89d2',
			'bottom-right': '\u53f3\u4e0b\u89d2',
		};
		return `\u8c03\u6574${positions[position] ?? position}`;
	},
	imageSelected: '\u5df2\u9009\u4e2d\u56fe\u7247\u3002',
	altTextPrefix: '\u66ff\u4ee3\u6587\u672c\uff1a',
	imageSizeAnnounce: (w: number, h: number) => `\u5c3a\u5bf8\uff1a${w} x ${h} \u50cf\u7d20\u3002`,
	resizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} \u8c03\u6574\u5927\u5c0f\u3002`,
	imageResized: (w: number, h: number) =>
		`\u56fe\u7247\u5df2\u8c03\u6574\u4e3a ${w} x ${h} \u50cf\u7d20\u3002`,
	keyboardResizeHint: (shrink: string, grow: string) =>
		`${shrink} / ${grow} \u8c03\u6574\u5927\u5c0f`,
};

export default locale;
