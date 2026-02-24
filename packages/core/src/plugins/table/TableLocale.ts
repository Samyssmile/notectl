/**
 * Locale interface and default English locale for the TablePlugin.
 * Allows full i18n of all user-facing strings in the table feature.
 */

// --- Locale Interface ---

export interface TableLocale {
	// Context Menu
	readonly insertRowAbove: string;
	readonly insertRowBelow: string;
	readonly insertColumnLeft: string;
	readonly insertColumnRight: string;
	readonly deleteRow: string;
	readonly deleteColumn: string;
	readonly borderColorLabel: string;
	readonly deleteTable: string;

	// Menu A11y
	readonly tableActions: string;
	readonly menuKeyboardHint: string;

	// Controls
	readonly insertRow: string;
	readonly insertColumn: string;
	readonly addRow: string;
	readonly addColumn: string;
	readonly tableActionsHint: string;
	readonly contextMenuHint: string;
	readonly borderColor: string;

	// Border Color Picker
	readonly defaultColor: string;
	readonly noBorders: string;
	readonly borderColorPicker: string;
	readonly announceBorderColorSet: (colorName: string) => string;
	readonly announceBorderReset: string;
	readonly borderSwatchLabel: (colorName: string) => string;

	// Toolbar
	readonly insertTable: string;

	// NodeView ARIA
	readonly tableAriaLabel: (rows: number, cols: number) => string;
	readonly tableAriaDescription: string;
}

// --- Default English Locale ---

export const TABLE_LOCALE_EN: TableLocale = {
	// Context Menu
	insertRowAbove: 'Insert Row Above',
	insertRowBelow: 'Insert Row Below',
	insertColumnLeft: 'Insert Column Left',
	insertColumnRight: 'Insert Column Right',
	deleteRow: 'Delete Row',
	deleteColumn: 'Delete Column',
	borderColorLabel: 'Border Color...',
	deleteTable: 'Delete Table',

	// Menu A11y
	tableActions: 'Table actions',
	menuKeyboardHint: '\u2191\u2193 Navigate \u00b7 Enter Select \u00b7 Esc Close',

	// Controls
	insertRow: 'Insert row',
	insertColumn: 'Insert column',
	addRow: 'Add row',
	addColumn: 'Add column',
	tableActionsHint: 'Table actions (Right-click or Shift+F10)',
	contextMenuHint: 'Right-click or Shift+F10 for table actions',
	borderColor: 'Border color',

	// Border Color Picker
	defaultColor: 'Default',
	noBorders: 'No borders',
	borderColorPicker: 'Border color picker',
	announceBorderColorSet: (colorName: string) => `Table border color set to ${colorName}`,
	announceBorderReset: 'Table borders reset to default',
	borderSwatchLabel: (colorName: string) => `Border ${colorName}`,

	// Toolbar
	insertTable: 'Insert Table',

	// NodeView ARIA
	tableAriaLabel: (rows: number, cols: number) => `Table with ${rows} rows and ${cols} columns`,
	tableAriaDescription: 'Right-click or press Shift+F10 for table actions',
};

// --- German Locale ---

export const TABLE_LOCALE_DE: TableLocale = {
	insertRowAbove: 'Zeile oberhalb einf\u00fcgen',
	insertRowBelow: 'Zeile unterhalb einf\u00fcgen',
	insertColumnLeft: 'Spalte links einf\u00fcgen',
	insertColumnRight: 'Spalte rechts einf\u00fcgen',
	deleteRow: 'Zeile l\u00f6schen',
	deleteColumn: 'Spalte l\u00f6schen',
	borderColorLabel: 'Rahmenfarbe\u2026',
	deleteTable: 'Tabelle l\u00f6schen',

	tableActions: 'Tabellenaktionen',
	menuKeyboardHint:
		'\u2191\u2193 Navigieren \u00b7 Eingabe Ausw\u00e4hlen \u00b7 Esc Schlie\u00dfen',

	insertRow: 'Zeile einf\u00fcgen',
	insertColumn: 'Spalte einf\u00fcgen',
	addRow: 'Zeile hinzuf\u00fcgen',
	addColumn: 'Spalte hinzuf\u00fcgen',
	tableActionsHint: 'Tabellenaktionen (Rechtsklick oder Umschalt+F10)',
	contextMenuHint: 'Rechtsklick oder Umschalt+F10 f\u00fcr Tabellenaktionen',
	borderColor: 'Rahmenfarbe',

	defaultColor: 'Standard',
	noBorders: 'Keine Rahmen',
	borderColorPicker: 'Rahmenfarbe ausw\u00e4hlen',
	announceBorderColorSet: (colorName: string) => `Tabellenrahmenfarbe auf ${colorName} gesetzt`,
	announceBorderReset: 'Tabellenrahmen auf Standard zur\u00fcckgesetzt',
	borderSwatchLabel: (colorName: string) => `Rahmen ${colorName}`,

	insertTable: 'Tabelle einf\u00fcgen',

	tableAriaLabel: (rows: number, cols: number) => `Tabelle mit ${rows} Zeilen und ${cols} Spalten`,
	tableAriaDescription: 'Rechtsklick oder Umschalt+F10 f\u00fcr Tabellenaktionen',
};

// --- Spanish Locale ---

export const TABLE_LOCALE_ES: TableLocale = {
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

	insertTable: 'Insertar tabla',

	tableAriaLabel: (rows: number, cols: number) => `Tabla con ${rows} filas y ${cols} columnas`,
	tableAriaDescription: 'Clic derecho o May\u00fas+F10 para acciones de tabla',
};

// --- French Locale ---

export const TABLE_LOCALE_FR: TableLocale = {
	insertRowAbove: 'Ins\u00e9rer une ligne au-dessus',
	insertRowBelow: 'Ins\u00e9rer une ligne en dessous',
	insertColumnLeft: 'Ins\u00e9rer une colonne \u00e0 gauche',
	insertColumnRight: 'Ins\u00e9rer une colonne \u00e0 droite',
	deleteRow: 'Supprimer la ligne',
	deleteColumn: 'Supprimer la colonne',
	borderColorLabel: 'Couleur de bordure\u2026',
	deleteTable: 'Supprimer le tableau',

	tableActions: 'Actions du tableau',
	menuKeyboardHint:
		'\u2191\u2193 Naviguer \u00b7 Entr\u00e9e S\u00e9lectionner \u00b7 \u00c9chap Fermer',

	insertRow: 'Ins\u00e9rer une ligne',
	insertColumn: 'Ins\u00e9rer une colonne',
	addRow: 'Ajouter une ligne',
	addColumn: 'Ajouter une colonne',
	tableActionsHint: 'Actions du tableau (clic droit ou Maj+F10)',
	contextMenuHint: 'Clic droit ou Maj+F10 pour les actions du tableau',
	borderColor: 'Couleur de bordure',

	defaultColor: 'Par d\u00e9faut',
	noBorders: 'Sans bordure',
	borderColorPicker: 'S\u00e9lecteur de couleur de bordure',
	announceBorderColorSet: (colorName: string) =>
		`Couleur de bordure du tableau d\u00e9finie sur ${colorName}`,
	announceBorderReset: 'Bordures du tableau r\u00e9initialis\u00e9es par d\u00e9faut',
	borderSwatchLabel: (colorName: string) => `Bordure ${colorName}`,

	insertTable: 'Ins\u00e9rer un tableau',

	tableAriaLabel: (rows: number, cols: number) => `Tableau avec ${rows} lignes et ${cols} colonnes`,
	tableAriaDescription: 'Clic droit ou Maj+F10 pour les actions du tableau',
};

// --- Chinese (Simplified) Locale ---

export const TABLE_LOCALE_ZH: TableLocale = {
	insertRowAbove: '\u5728\u4e0a\u65b9\u63d2\u5165\u884c',
	insertRowBelow: '\u5728\u4e0b\u65b9\u63d2\u5165\u884c',
	insertColumnLeft: '\u5728\u5de6\u4fa7\u63d2\u5165\u5217',
	insertColumnRight: '\u5728\u53f3\u4fa7\u63d2\u5165\u5217',
	deleteRow: '\u5220\u9664\u884c',
	deleteColumn: '\u5220\u9664\u5217',
	borderColorLabel: '\u8fb9\u6846\u989c\u8272\u2026',
	deleteTable: '\u5220\u9664\u8868\u683c',

	tableActions: '\u8868\u683c\u64cd\u4f5c',
	menuKeyboardHint: '\u2191\u2193 \u5bfc\u822a \u00b7 Enter \u9009\u62e9 \u00b7 Esc \u5173\u95ed',

	insertRow: '\u63d2\u5165\u884c',
	insertColumn: '\u63d2\u5165\u5217',
	addRow: '\u6dfb\u52a0\u884c',
	addColumn: '\u6dfb\u52a0\u5217',
	tableActionsHint: '\u8868\u683c\u64cd\u4f5c\uff08\u53f3\u952e\u6216 Shift+F10\uff09',
	contextMenuHint: '\u53f3\u952e\u6216 Shift+F10 \u6253\u5f00\u8868\u683c\u64cd\u4f5c',
	borderColor: '\u8fb9\u6846\u989c\u8272',

	defaultColor: '\u9ed8\u8ba4',
	noBorders: '\u65e0\u8fb9\u6846',
	borderColorPicker: '\u8fb9\u6846\u989c\u8272\u9009\u62e9\u5668',
	announceBorderColorSet: (colorName: string) =>
		`\u8868\u683c\u8fb9\u6846\u989c\u8272\u5df2\u8bbe\u7f6e\u4e3a${colorName}`,
	announceBorderReset: '\u8868\u683c\u8fb9\u6846\u5df2\u91cd\u7f6e\u4e3a\u9ed8\u8ba4',
	borderSwatchLabel: (colorName: string) => `\u8fb9\u6846 ${colorName}`,

	insertTable: '\u63d2\u5165\u8868\u683c',

	tableAriaLabel: (rows: number, cols: number) => `\u8868\u683c\uff0c${rows} \u884c ${cols} \u5217`,
	tableAriaDescription: '\u53f3\u952e\u6216 Shift+F10 \u6253\u5f00\u8868\u683c\u64cd\u4f5c',
};

// --- Russian Locale ---

export const TABLE_LOCALE_RU: TableLocale = {
	insertRowAbove:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443 \u0441\u0432\u0435\u0440\u0445\u0443',
	insertRowBelow:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443 \u0441\u043d\u0438\u0437\u0443',
	insertColumnLeft:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u043e\u043b\u0431\u0435\u0446 \u0441\u043b\u0435\u0432\u0430',
	insertColumnRight:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u043e\u043b\u0431\u0435\u0446 \u0441\u043f\u0440\u0430\u0432\u0430',
	deleteRow: '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443',
	deleteColumn:
		'\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u0442\u043e\u043b\u0431\u0435\u0446',
	borderColorLabel: '\u0426\u0432\u0435\u0442 \u0433\u0440\u0430\u043d\u0438\u0446\u044b\u2026',
	deleteTable:
		'\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0442\u0430\u0431\u043b\u0438\u0446\u0443',

	tableActions:
		'\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0441 \u0442\u0430\u0431\u043b\u0438\u0446\u0435\u0439',
	menuKeyboardHint:
		'\u2191\u2193 \u041d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f \u00b7 Enter \u0412\u044b\u0431\u0440\u0430\u0442\u044c \u00b7 Esc \u0417\u0430\u043a\u0440\u044b\u0442\u044c',

	insertRow:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443',
	insertColumn:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u043e\u043b\u0431\u0435\u0446',
	addRow: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u0440\u043e\u043a\u0443',
	addColumn:
		'\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0442\u043e\u043b\u0431\u0435\u0446',
	tableActionsHint:
		'\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0441 \u0442\u0430\u0431\u043b\u0438\u0446\u0435\u0439 (\u041f\u041a\u041c \u0438\u043b\u0438 Shift+F10)',
	contextMenuHint:
		'\u041f\u041a\u041c \u0438\u043b\u0438 Shift+F10 \u0434\u043b\u044f \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0442\u0430\u0431\u043b\u0438\u0446\u0435\u0439',
	borderColor: '\u0426\u0432\u0435\u0442 \u0433\u0440\u0430\u043d\u0438\u0446\u044b',

	defaultColor: '\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e',
	noBorders: '\u0411\u0435\u0437 \u0433\u0440\u0430\u043d\u0438\u0446',
	borderColorPicker:
		'\u0412\u044b\u0431\u043e\u0440 \u0446\u0432\u0435\u0442\u0430 \u0433\u0440\u0430\u043d\u0438\u0446\u044b',
	announceBorderColorSet: (colorName: string) =>
		`\u0426\u0432\u0435\u0442 \u0433\u0440\u0430\u043d\u0438\u0446\u044b \u0442\u0430\u0431\u043b\u0438\u0446\u044b \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d \u043d\u0430 ${colorName}`,
	announceBorderReset:
		'\u0413\u0440\u0430\u043d\u0438\u0446\u044b \u0442\u0430\u0431\u043b\u0438\u0446\u044b \u0441\u0431\u0440\u043e\u0448\u0435\u043d\u044b \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e',
	borderSwatchLabel: (colorName: string) =>
		`\u0413\u0440\u0430\u043d\u0438\u0446\u0430 ${colorName}`,

	insertTable:
		'\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0442\u0430\u0431\u043b\u0438\u0446\u0443',

	tableAriaLabel: (rows: number, cols: number) =>
		`\u0422\u0430\u0431\u043b\u0438\u0446\u0430: ${rows} \u0441\u0442\u0440\u043e\u043a, ${cols} \u0441\u0442\u043e\u043b\u0431\u0446\u043e\u0432`,
	tableAriaDescription:
		'\u041f\u041a\u041c \u0438\u043b\u0438 Shift+F10 \u0434\u043b\u044f \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0441 \u0442\u0430\u0431\u043b\u0438\u0446\u0435\u0439',
};

// --- Arabic Locale ---

export const TABLE_LOCALE_AR: TableLocale = {
	insertRowAbove: '\u0625\u062f\u0631\u0627\u062c \u0635\u0641 \u0623\u0639\u0644\u0649',
	insertRowBelow: '\u0625\u062f\u0631\u0627\u062c \u0635\u0641 \u0623\u0633\u0641\u0644',
	insertColumnLeft:
		'\u0625\u062f\u0631\u0627\u062c \u0639\u0645\u0648\u062f \u0639\u0644\u0649 \u0627\u0644\u064a\u0633\u0627\u0631',
	insertColumnRight:
		'\u0625\u062f\u0631\u0627\u062c \u0639\u0645\u0648\u062f \u0639\u0644\u0649 \u0627\u0644\u064a\u0645\u064a\u0646',
	deleteRow: '\u062d\u0630\u0641 \u0627\u0644\u0635\u0641',
	deleteColumn: '\u062d\u0630\u0641 \u0627\u0644\u0639\u0645\u0648\u062f',
	borderColorLabel: '\u0644\u0648\u0646 \u0627\u0644\u062d\u062f\u0648\u062f\u2026',
	deleteTable: '\u062d\u0630\u0641 \u0627\u0644\u062c\u062f\u0648\u0644',

	tableActions: '\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u062c\u062f\u0648\u0644',
	menuKeyboardHint:
		'\u2191\u2193 \u062a\u0646\u0642\u0644 \u00b7 Enter \u062a\u062d\u062f\u064a\u062f \u00b7 Esc \u0625\u063a\u0644\u0627\u0642',

	insertRow: '\u0625\u062f\u0631\u0627\u062c \u0635\u0641',
	insertColumn: '\u0625\u062f\u0631\u0627\u062c \u0639\u0645\u0648\u062f',
	addRow: '\u0625\u0636\u0627\u0641\u0629 \u0635\u0641',
	addColumn: '\u0625\u0636\u0627\u0641\u0629 \u0639\u0645\u0648\u062f',
	tableActionsHint:
		'\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u062c\u062f\u0648\u0644 (\u0627\u0646\u0642\u0631 \u0628\u0632\u0631 \u0627\u0644\u0645\u0627\u0648\u0633 \u0627\u0644\u0623\u064a\u0645\u0646 \u0623\u0648 Shift+F10)',
	contextMenuHint:
		'\u0627\u0646\u0642\u0631 \u0628\u0632\u0631 \u0627\u0644\u0645\u0627\u0648\u0633 \u0627\u0644\u0623\u064a\u0645\u0646 \u0623\u0648 Shift+F10 \u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u062c\u062f\u0648\u0644',
	borderColor: '\u0644\u0648\u0646 \u0627\u0644\u062d\u062f\u0648\u062f',

	defaultColor: '\u0627\u0641\u062a\u0631\u0627\u0636\u064a',
	noBorders: '\u0628\u062f\u0648\u0646 \u062d\u062f\u0648\u062f',
	borderColorPicker:
		'\u0645\u0646\u062a\u0642\u064a \u0644\u0648\u0646 \u0627\u0644\u062d\u062f\u0648\u062f',
	announceBorderColorSet: (colorName: string) =>
		`\u062a\u0645 \u062a\u0639\u064a\u064a\u0646 \u0644\u0648\u0646 \u062d\u062f\u0648\u062f \u0627\u0644\u062c\u062f\u0648\u0644 \u0625\u0644\u0649 ${colorName}`,
	announceBorderReset:
		'\u062a\u0645 \u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u062d\u062f\u0648\u062f \u0627\u0644\u062c\u062f\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a',
	borderSwatchLabel: (colorName: string) => `\u062d\u062f\u0648\u062f ${colorName}`,

	insertTable: '\u0625\u062f\u0631\u0627\u062c \u062c\u062f\u0648\u0644',

	tableAriaLabel: (rows: number, cols: number) =>
		`\u062c\u062f\u0648\u0644 \u0645\u0646 ${rows} \u0635\u0641\u0648\u0641 \u0648 ${cols} \u0623\u0639\u0645\u062f\u0629`,
	tableAriaDescription:
		'\u0627\u0646\u0642\u0631 \u0628\u0632\u0631 \u0627\u0644\u0645\u0627\u0648\u0633 \u0627\u0644\u0623\u064a\u0645\u0646 \u0623\u0648 Shift+F10 \u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u062c\u062f\u0648\u0644',
};

// --- Hindi Locale ---

export const TABLE_LOCALE_HI: TableLocale = {
	insertRowAbove:
		'\u090a\u092a\u0930 \u092a\u0902\u0915\u094d\u0924\u093f \u0921\u093e\u0932\u0947\u0902',
	insertRowBelow:
		'\u0928\u0940\u091a\u0947 \u092a\u0902\u0915\u094d\u0924\u093f \u0921\u093e\u0932\u0947\u0902',
	insertColumnLeft:
		'\u092c\u093e\u090f\u0902 \u0938\u094d\u0924\u0902\u092d \u0921\u093e\u0932\u0947\u0902',
	insertColumnRight:
		'\u0926\u093e\u090f\u0902 \u0938\u094d\u0924\u0902\u092d \u0921\u093e\u0932\u0947\u0902',
	deleteRow: '\u092a\u0902\u0915\u094d\u0924\u093f \u0939\u091f\u093e\u090f\u0902',
	deleteColumn: '\u0938\u094d\u0924\u0902\u092d \u0939\u091f\u093e\u090f\u0902',
	borderColorLabel: '\u092c\u0949\u0930\u094d\u0921\u0930 \u0930\u0902\u0917\u2026',
	deleteTable: '\u0924\u093e\u0932\u093f\u0915\u093e \u0939\u091f\u093e\u090f\u0902',

	tableActions:
		'\u0924\u093e\u0932\u093f\u0915\u093e \u0915\u094d\u0930\u093f\u092f\u093e\u090f\u0902',
	menuKeyboardHint:
		'\u2191\u2193 \u0928\u0947\u0935\u093f\u0917\u0947\u0936\u0928 \u00b7 Enter \u091a\u0941\u0928\u0947\u0902 \u00b7 Esc \u092c\u0902\u0926 \u0915\u0930\u0947\u0902',

	insertRow: '\u092a\u0902\u0915\u094d\u0924\u093f \u0921\u093e\u0932\u0947\u0902',
	insertColumn: '\u0938\u094d\u0924\u0902\u092d \u0921\u093e\u0932\u0947\u0902',
	addRow: '\u092a\u0902\u0915\u094d\u0924\u093f \u091c\u094b\u0921\u093c\u0947\u0902',
	addColumn: '\u0938\u094d\u0924\u0902\u092d \u091c\u094b\u0921\u093c\u0947\u0902',
	tableActionsHint:
		'\u0924\u093e\u0932\u093f\u0915\u093e \u0915\u094d\u0930\u093f\u092f\u093e\u090f\u0902 (\u0930\u093e\u0907\u091f-\u0915\u094d\u0932\u093f\u0915 \u092f\u093e Shift+F10)',
	contextMenuHint:
		'\u0924\u093e\u0932\u093f\u0915\u093e \u0915\u094d\u0930\u093f\u092f\u093e\u0913\u0902 \u0915\u0947 \u0932\u093f\u090f \u0930\u093e\u0907\u091f-\u0915\u094d\u0932\u093f\u0915 \u092f\u093e Shift+F10',
	borderColor: '\u092c\u0949\u0930\u094d\u0921\u0930 \u0930\u0902\u0917',

	defaultColor: '\u0921\u093f\u092b\u093c\u0949\u0932\u094d\u091f',
	noBorders: '\u0915\u094b\u0908 \u092c\u0949\u0930\u094d\u0921\u0930 \u0928\u0939\u0940\u0902',
	borderColorPicker:
		'\u092c\u0949\u0930\u094d\u0921\u0930 \u0930\u0902\u0917 \u091a\u0941\u0928\u0947\u0902',
	announceBorderColorSet: (colorName: string) =>
		`\u0924\u093e\u0932\u093f\u0915\u093e \u092c\u0949\u0930\u094d\u0921\u0930 \u0930\u0902\u0917 ${colorName} \u092a\u0930 \u0938\u0947\u091f \u0915\u093f\u092f\u093e \u0917\u092f\u093e`,
	announceBorderReset:
		'\u0924\u093e\u0932\u093f\u0915\u093e \u092c\u0949\u0930\u094d\u0921\u0930 \u0921\u093f\u092b\u093c\u0949\u0932\u094d\u091f \u092a\u0930 \u0930\u0940\u0938\u0947\u091f \u0915\u093f\u092f\u093e \u0917\u092f\u093e',
	borderSwatchLabel: (colorName: string) => `\u092c\u0949\u0930\u094d\u0921\u0930 ${colorName}`,

	insertTable: '\u0924\u093e\u0932\u093f\u0915\u093e \u0921\u093e\u0932\u0947\u0902',

	tableAriaLabel: (rows: number, cols: number) =>
		`\u0924\u093e\u0932\u093f\u0915\u093e: ${rows} \u092a\u0902\u0915\u094d\u0924\u093f\u092f\u093e\u0902 \u0914\u0930 ${cols} \u0938\u094d\u0924\u0902\u092d`,
	tableAriaDescription:
		'\u0924\u093e\u0932\u093f\u0915\u093e \u0915\u094d\u0930\u093f\u092f\u093e\u0913\u0902 \u0915\u0947 \u0932\u093f\u090f \u0930\u093e\u0907\u091f-\u0915\u094d\u0932\u093f\u0915 \u092f\u093e Shift+F10',
};
