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

	// Sizing
	sizeLabel: 'Tamanho...',
	sizeDialogLabel: 'Tamanho da tabela',
	columnWidthLabel: 'Largura da coluna (px)',
	rowMinimumHeightLabel: 'Altura mínima da linha (px)',
	automatic: 'Automático',
	mixed: 'Misto',
	apply: 'Aplicar',
	cancel: 'Cancelar',
	resetColumnWidth: 'Redefinir largura da coluna',
	resetRowMinimumHeight: 'Redefinir altura mínima da linha',
	resetAllSizes: 'Redefinir todos os tamanhos',
	invalidDimensionRange: (minimum: number, maximum: number) =>
		`Insira um valor entre ${minimum} e ${maximum} px.`,
	selectRowLabel: (rowIndex: number) => `Selecionar linha ${rowIndex + 1}`,
	selectColumnLabel: (columnIndex: number) => `Selecionar coluna ${columnIndex + 1}`,
	resizeColumnSeparatorLabel: (columnIndex: number) =>
		`Alterar a largura da coluna ${columnIndex + 1}`,
	resizeRowSeparatorLabel: (rowIndex: number) => `Alterar a altura da linha ${rowIndex + 1}`,
	resizeKeyboardHint: (step: number, largeStep: number) =>
		`As setas alteram o tamanho em ${step} px; mantenha Shift pressionado para ${largeStep} px.`,
	announceColumnWidthSet: (columnIndex: number, valuePx: number) =>
		`Largura da coluna ${columnIndex + 1} definida como ${valuePx} px.`,
	announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) =>
		`Altura mínima da linha ${rowIndex + 1} definida como ${valuePx} px.`,
	announceColumnWidthReset: (columnIndex: number) =>
		`Largura da coluna ${columnIndex + 1} redefinida como automática.`,
	announceRowMinimumHeightReset: (rowIndex: number) =>
		`Altura mínima da linha ${rowIndex + 1} redefinida como automática.`,
	announceTableSizesReset:
		'Todas as larguras de coluna e alturas mínimas de linha foram redefinidas como automáticas.',

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
