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

// --- German Locale ---

export const CODE_BLOCK_LOCALE_DE: CodeBlockLocale = {
	label: 'Codeblock',
	tooltip: (shortcut?: string) => (shortcut ? `Codeblock (${shortcut})` : 'Codeblock'),
	enteredCodeBlock: 'Codeblock betreten. Escape zum Verlassen drücken.',
	leftCodeBlock: 'Codeblock verlassen.',
};

// --- Spanish Locale ---

export const CODE_BLOCK_LOCALE_ES: CodeBlockLocale = {
	label: 'Bloque de código',
	tooltip: (shortcut?: string) =>
		shortcut ? `Bloque de código (${shortcut})` : 'Bloque de código',
	enteredCodeBlock: 'Bloque de código activado. Pulse Escape para salir.',
	leftCodeBlock: 'Bloque de código desactivado.',
};

// --- French Locale ---

export const CODE_BLOCK_LOCALE_FR: CodeBlockLocale = {
	label: 'Bloc de code',
	tooltip: (shortcut?: string) => (shortcut ? `Bloc de code (${shortcut})` : 'Bloc de code'),
	enteredCodeBlock: 'Bloc de code activé. Appuyez sur Échap pour quitter.',
	leftCodeBlock: 'Bloc de code quitté.',
};

// --- Chinese (Simplified) Locale ---

export const CODE_BLOCK_LOCALE_ZH: CodeBlockLocale = {
	label: '代码块',
	tooltip: (shortcut?: string) => (shortcut ? `代码块 (${shortcut})` : '代码块'),
	enteredCodeBlock: '已进入代码块。按 Escape 退出。',
	leftCodeBlock: '已离开代码块。',
};

// --- Russian Locale ---

export const CODE_BLOCK_LOCALE_RU: CodeBlockLocale = {
	label: 'Блок кода',
	tooltip: (shortcut?: string) => (shortcut ? `Блок кода (${shortcut})` : 'Блок кода'),
	enteredCodeBlock: 'Вход в блок кода. Нажмите Escape для выхода.',
	leftCodeBlock: 'Выход из блока кода.',
};

// --- Arabic Locale ---

export const CODE_BLOCK_LOCALE_AR: CodeBlockLocale = {
	label: 'كتلة كود',
	tooltip: (shortcut?: string) => (shortcut ? `كتلة كود (${shortcut})` : 'كتلة كود'),
	enteredCodeBlock: 'تم الدخول إلى كتلة الكود. اضغط Escape للخروج.',
	leftCodeBlock: 'تم الخروج من كتلة الكود.',
};

// --- Hindi Locale ---

export const CODE_BLOCK_LOCALE_HI: CodeBlockLocale = {
	label: 'कोड ब्लॉक',
	tooltip: (shortcut?: string) => (shortcut ? `कोड ब्लॉक (${shortcut})` : 'कोड ब्लॉक'),
	enteredCodeBlock: 'कोड ब्लॉक में प्रवेश किया। बाहर निकलने के लिए Escape दबाएँ।',
	leftCodeBlock: 'कोड ब्लॉक से बाहर।',
};

// --- Locale Map ---

export const CODE_BLOCK_LOCALES: Record<string, CodeBlockLocale> = {
	en: CODE_BLOCK_LOCALE_EN,
	de: CODE_BLOCK_LOCALE_DE,
	es: CODE_BLOCK_LOCALE_ES,
	fr: CODE_BLOCK_LOCALE_FR,
	zh: CODE_BLOCK_LOCALE_ZH,
	ru: CODE_BLOCK_LOCALE_RU,
	ar: CODE_BLOCK_LOCALE_AR,
	hi: CODE_BLOCK_LOCALE_HI,
};
