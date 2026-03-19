/**
 * List type metadata: icons, patterns, and type definitions.
 * Pure data constants shared across list plugin modules.
 */

import type { ListType } from './ListPlugin.js';

// --- List Type Metadata ---

export interface ListTypeDefinition {
	readonly type: ListType;
	readonly icon: string;
	readonly inputPattern: RegExp;
	readonly inputPrefix: string;
}

const BULLET_LIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>';
const NUMBERED_LIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>';
const CHECKLIST_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z"/></svg>';

export const LIST_TYPE_DEFINITIONS: readonly ListTypeDefinition[] = [
	{
		type: 'bullet',
		icon: BULLET_LIST_ICON,
		inputPattern: /^[-*] $/,
		inputPrefix: '- ',
	},
	{
		type: 'ordered',
		icon: NUMBERED_LIST_ICON,
		inputPattern: /^\d+\. $/,
		inputPrefix: '1. ',
	},
	{
		type: 'checklist',
		icon: CHECKLIST_ICON,
		inputPattern: /^\[[ x]] $/,
		inputPrefix: '[ ] ',
	},
];
