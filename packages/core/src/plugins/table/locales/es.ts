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
