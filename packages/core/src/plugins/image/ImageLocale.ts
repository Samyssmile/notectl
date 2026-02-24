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
	uploadFailed: 'Image upload failed.',
};

// --- German Locale ---

export const IMAGE_LOCALE_DE: ImageLocale = {
	insertImage: 'Bild einfügen',
	insertImageTooltip: 'Bild einfügen',
	uploadFromComputer: 'Vom Computer hochladen',
	uploadAria: 'Bild vom Computer hochladen',
	separator: 'oder',
	urlPlaceholder: 'https://...',
	urlAria: 'Bild-URL',
	insertButton: 'Einfügen',
	insertAria: 'Bild einfügen',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Bild'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} mal ${height} Pixel`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Bild auf Originalgröße zurückgesetzt.',
	uploadFailed: 'Bild-Upload fehlgeschlagen.',
};

// --- Spanish Locale ---

export const IMAGE_LOCALE_ES: ImageLocale = {
	insertImage: 'Insertar imagen',
	insertImageTooltip: 'Insertar imagen',
	uploadFromComputer: 'Subir desde el ordenador',
	uploadAria: 'Subir imagen desde el ordenador',
	separator: 'o',
	urlPlaceholder: 'https://...',
	urlAria: 'URL de la imagen',
	insertButton: 'Insertar',
	insertAria: 'Insertar imagen',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Imagen'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} por ${height} píxeles`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Imagen restablecida a tamaño natural.',
	uploadFailed: 'Error al subir la imagen.',
};

// --- French Locale ---

export const IMAGE_LOCALE_FR: ImageLocale = {
	insertImage: 'Insérer une image',
	insertImageTooltip: 'Insérer une image',
	uploadFromComputer: 'Télécharger depuis l\u2019ordinateur',
	uploadAria: 'Télécharger une image depuis l\u2019ordinateur',
	separator: 'ou',
	urlPlaceholder: 'https://...',
	urlAria: 'URL de l\u2019image',
	insertButton: 'Insérer',
	insertAria: 'Insérer une image',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Image'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} par ${height} pixels`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Image rétablie à sa taille d\u2019origine.',
	uploadFailed: 'Échec du téléchargement de l\u2019image.',
};

// --- Chinese (Simplified) Locale ---

export const IMAGE_LOCALE_ZH: ImageLocale = {
	insertImage: '插入图片',
	insertImageTooltip: '插入图片',
	uploadFromComputer: '从电脑上传',
	uploadAria: '从电脑上传图片',
	separator: '或',
	urlPlaceholder: 'https://...',
	urlAria: '图片链接',
	insertButton: '插入',
	insertAria: '插入图片',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || '图片'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} x ${height} 像素`);
		}
		return parts.join('，');
	},
	resetToNaturalSize: '图片已恢复原始大小。',
	uploadFailed: '图片上传失败。',
};

// --- Russian Locale ---

export const IMAGE_LOCALE_RU: ImageLocale = {
	insertImage: 'Вставить изображение',
	insertImageTooltip: 'Вставить изображение',
	uploadFromComputer: 'Загрузить с компьютера',
	uploadAria: 'Загрузить изображение с компьютера',
	separator: 'или',
	urlPlaceholder: 'https://...',
	urlAria: 'URL изображения',
	insertButton: 'Вставить',
	insertAria: 'Вставить изображение',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'Изображение'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} на ${height} пикселей`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'Изображение сброшено до исходного размера.',
	uploadFailed: 'Ошибка загрузки изображения.',
};

// --- Arabic Locale ---

export const IMAGE_LOCALE_AR: ImageLocale = {
	insertImage: 'إدراج صورة',
	insertImageTooltip: 'إدراج صورة',
	uploadFromComputer: 'رفع من الحاسوب',
	uploadAria: 'رفع صورة من الحاسوب',
	separator: 'أو',
	urlPlaceholder: 'https://...',
	urlAria: 'رابط الصورة',
	insertButton: 'إدراج',
	insertAria: 'إدراج صورة',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'صورة'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} × ${height} بكسل`);
		}
		return parts.join('، ');
	},
	resetToNaturalSize: 'تمت إعادة الصورة إلى حجمها الطبيعي.',
	uploadFailed: 'فشل رفع الصورة.',
};

// --- Hindi Locale ---

export const IMAGE_LOCALE_HI: ImageLocale = {
	insertImage: 'चित्र डालें',
	insertImageTooltip: 'चित्र डालें',
	uploadFromComputer: 'कंप्यूटर से अपलोड करें',
	uploadAria: 'कंप्यूटर से चित्र अपलोड करें',
	separator: 'या',
	urlPlaceholder: 'https://...',
	urlAria: 'चित्र URL',
	insertButton: 'डालें',
	insertAria: 'चित्र डालें',
	imageAria: (alt: string, width?: number, height?: number) => {
		const parts: string[] = [alt || 'चित्र'];
		if (width !== undefined && height !== undefined) {
			parts.push(`${width} x ${height} पिक्सेल`);
		}
		return parts.join(', ');
	},
	resetToNaturalSize: 'चित्र मूल आकार में पुनर्स्थापित।',
	uploadFailed: 'चित्र अपलोड विफल।',
};

// --- Locale Map ---

export const IMAGE_LOCALES: Record<string, ImageLocale> = {
	en: IMAGE_LOCALE_EN,
	de: IMAGE_LOCALE_DE,
	es: IMAGE_LOCALE_ES,
	fr: IMAGE_LOCALE_FR,
	zh: IMAGE_LOCALE_ZH,
	ru: IMAGE_LOCALE_RU,
	ar: IMAGE_LOCALE_AR,
	hi: IMAGE_LOCALE_HI,
};
