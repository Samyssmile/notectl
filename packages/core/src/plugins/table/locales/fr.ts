import type { TableLocale } from '../TableLocale.js';

const locale: TableLocale = {
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

	announceRowInsertedAbove: 'Ligne ins\u00e9r\u00e9e au-dessus',
	announceRowInsertedBelow: 'Ligne ins\u00e9r\u00e9e en dessous',
	announceColumnInserted: (side: string) => `Colonne ins\u00e9r\u00e9e \u00e0 ${side}`,
	announceRowDeleted: 'Ligne supprim\u00e9e',
	announceColumnDeleted: 'Colonne supprim\u00e9e',
	announceTableDeleted: 'Tableau supprim\u00e9',

	insertTable: 'Ins\u00e9rer un tableau',

	tableAriaLabel: (rows: number, cols: number) => `Tableau avec ${rows} lignes et ${cols} colonnes`,
	tableAriaDescription: 'Clic droit ou Maj+F10 pour les actions du tableau',
};

export default locale;
