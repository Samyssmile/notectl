import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloco de Código',
	tooltip: (shortcut?: string) => (shortcut ? `Bloco de Código (${shortcut})` : 'Bloco de Código'),
	enteredCodeBlock: 'Entrou no bloco de código. Pressione Escape para sair.',
	leftCodeBlock: 'Saiu do bloco de código.',
	copyCodeAria: 'Copiar código',
	escToExit: 'Esc para sair',
	codeBlockAriaLabel: (lang: string) => `Bloco de código ${lang}. Pressione Escape para sair.`,
	copiedToClipboard: 'Copiado para a área de transferência',
	copyFailed: 'Falha ao copiar o código',
	deleteCodeBlockAria: 'Excluir bloco de código',
	deletedCodeBlock: 'Bloco de código excluído',
	selectLanguageAria: 'Selecionar idioma',
	languageChanged: (lang: string) => `Idioma alterado para ${lang}`,
	plainText: 'texto simples',
};

export default locale;
