import type { CodeBlockLocale } from '../CodeBlockLocale.js';

const locale: CodeBlockLocale = {
	label: 'Bloco de Código',
	tooltip: (shortcut?: string) => (shortcut ? `Bloco de Código (${shortcut})` : 'Bloco de Código'),
	enteredCodeBlock: 'Entrou no bloco de código. Pressione Escape para sair.',
	leftCodeBlock: 'Saiu do bloco de código.',
};

export default locale;
