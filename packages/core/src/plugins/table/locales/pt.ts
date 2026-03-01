import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
	// Context Menu
	insertRowAbove: 'Inserir Linha Acima',
	insertRowBelow: 'Inserir Linha Abaixo',
	insertColumnLeft: 'Inserir Coluna à Esquerda',
	insertColumnRight: 'Inserir Coluna à Direita',
	deleteRow: 'Excluir Linha',
	deleteColumn: 'Excluir Coluna',
	borderColorLabel: 'Cor da Borda...',
	deleteTable: 'Excluir Tabela',

	// Menu A11y
	tableActions: 'Ações da tabela',
	menuKeyboardHint: '\u2191\u2193 Navegar \u00b7 Enter Selecionar \u00b7 Esc Fechar',

	// Controls
	insertRow: 'Inserir linha',
	insertColumn: 'Inserir coluna',
	addRow: 'Adicionar linha',
	addColumn: 'Adicionar coluna',
	tableActionsHint: 'Ações da tabela (Clique direito ou Shift+F10)',
	contextMenuHint: 'Clique direito ou Shift+F10 para ações da tabela',
	borderColor: 'Cor da borda',

	// Border Color Picker
	defaultColor: 'Padrão',
	noBorders: 'Sem bordas',
	borderColorPicker: 'Seletor de cor da borda',
	announceBorderColorSet: (colorName: string) =>
		`Cor da borda da tabela definida para ${colorName}`,
	announceBorderReset: 'Bordas da tabela redefinidas para o padrão',
	borderSwatchLabel: (colorName: string) => `Borda ${colorName}`,

	// Command Announcements
	announceRowInsertedAbove: 'Linha inserida acima',
	announceRowInsertedBelow: 'Linha inserida abaixo',
	announceColumnInserted: (side: string) => `Coluna inserida à ${side}`,
	announceRowDeleted: 'Linha excluída',
	announceColumnDeleted: 'Coluna excluída',
	announceTableDeleted: 'Tabela excluída',

	// Toolbar
	insertTable: 'Inserir Tabela',

	// NodeView ARIA
	tableAriaLabel: (rows: number, cols: number) => `Tabela com ${rows} linhas e ${cols} colunas`,
	tableAriaDescription: 'Clique direito ou pressione Shift+F10 para ações da tabela',
};

export default locale;
