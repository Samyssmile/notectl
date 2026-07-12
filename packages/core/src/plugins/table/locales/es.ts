import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
	insertRowAbove: 'Insertar fila arriba',
	insertRowBelow: 'Insertar fila abajo',
	insertColumnLeft: 'Insertar columna a la izquierda',
	insertColumnRight: 'Insertar columna a la derecha',
	deleteRow: 'Eliminar fila',
	deleteColumn: 'Eliminar columna',
	borderColorLabel: 'Color del borde\u2026',
	deleteTable: 'Eliminar tabla',

	tableActions: 'Acciones de tabla',
	menuKeyboardHint: '\u2191\u2193 Navegar \u00b7 Enter Seleccionar \u00b7 Esc Cerrar',

	insertRow: 'Insertar fila',
	insertColumn: 'Insertar columna',
	addRow: 'A\u00f1adir fila',
	addColumn: 'A\u00f1adir columna',
	tableActionsHint: 'Acciones de tabla (clic derecho o May\u00fas+F10)',
	contextMenuHint: 'Clic derecho o May\u00fas+F10 para acciones de tabla',
	borderColor: 'Color del borde',

	sizeLabel: 'Tama\u00f1o\u2026',
	sizeDialogLabel: 'Tama\u00f1o de la tabla',
	columnWidthLabel: 'Ancho de columna (px)',
	rowMinimumHeightLabel: 'Altura m\u00ednima de fila (px)',
	automatic: 'Autom\u00e1tico',
	mixed: 'Mixto',
	apply: 'Aplicar',
	cancel: 'Cancelar',
	resetColumnWidth: 'Restablecer ancho de columna',
	resetRowMinimumHeight: 'Restablecer altura m\u00ednima de fila',
	resetAllSizes: 'Restablecer todos los tama\u00f1os',
	invalidDimensionRange: (minimum: number, maximum: number) =>
		`Introduce un valor entre ${minimum} y ${maximum} px.`,
	selectRowLabel: (rowIndex: number) => `Seleccionar fila ${rowIndex + 1}`,
	selectColumnLabel: (columnIndex: number) => `Seleccionar columna ${columnIndex + 1}`,
	resizeColumnSeparatorLabel: (columnIndex: number) =>
		`Cambiar el ancho de la columna ${columnIndex + 1}`,
	resizeRowSeparatorLabel: (rowIndex: number) => `Cambiar la altura de la fila ${rowIndex + 1}`,
	resizeKeyboardHint: (step: number, largeStep: number) =>
		`Las flechas cambian el tama\u00f1o en ${step} px; mant\u00e9n May\u00fas para ${largeStep} px.`,
	announceColumnWidthSet: (columnIndex: number, valuePx: number) =>
		`Ancho de la columna ${columnIndex + 1} establecido en ${valuePx} px.`,
	announceRowMinimumHeightSet: (rowIndex: number, valuePx: number) =>
		`Altura m\u00ednima de la fila ${rowIndex + 1} establecida en ${valuePx} px.`,
	announceColumnWidthReset: (columnIndex: number) =>
		`Ancho de la columna ${columnIndex + 1} restablecido al modo autom\u00e1tico.`,
	announceRowMinimumHeightReset: (rowIndex: number) =>
		`Altura m\u00ednima de la fila ${rowIndex + 1} restablecida al modo autom\u00e1tico.`,
	announceTableSizesReset:
		'Todos los anchos de columna y las alturas m\u00ednimas de fila se restablecieron al modo autom\u00e1tico.',

	defaultColor: 'Predeterminado',
	noBorders: 'Sin bordes',
	borderColorPicker: 'Selector de color de borde',
	announceBorderColorSet: (colorName: string) =>
		`Color del borde de tabla establecido en ${colorName}`,
	announceBorderReset: 'Bordes de tabla restablecidos a predeterminado',
	borderSwatchLabel: (colorName: string) => `Borde ${colorName}`,

	announceRowInsertedAbove: 'Fila insertada arriba',
	announceRowInsertedBelow: 'Fila insertada abajo',
	announceColumnInserted: (side: string) => `Columna insertada ${side}`,
	announceRowDeleted: 'Fila eliminada',
	announceColumnDeleted: 'Columna eliminada',
	announceTableDeleted: 'Tabla eliminada',

	insertTable: 'Insertar tabla',

	tableAriaLabel: (rows: number, cols: number) => `Tabla con ${rows} filas y ${cols} columnas`,
	tableAriaDescription: 'Clic derecho o May\u00fas+F10 para acciones de tabla',
};

export default locale;
