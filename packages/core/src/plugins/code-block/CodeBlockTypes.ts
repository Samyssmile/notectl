/**
 * Types, interfaces, and constants for the code-block plugin.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import { ServiceKey } from '../Plugin.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		code_block: {
			language: string;
			backgroundColor: string;
		};
	}
}

// --- Syntax Highlighting Types ---

export interface SyntaxToken {
	readonly from: number;
	readonly to: number;
	readonly type: string;
}

export interface SyntaxHighlighter {
	tokenize(code: string, language: string): readonly SyntaxToken[];
	getSupportedLanguages(): readonly string[];
}

// --- Configuration ---

/**
 * Configurable keyboard bindings for CodeBlockPlugin actions.
 * Omit a slot to use the default; set to `null` to disable the binding.
 *
 * Key descriptor format: `'Mod-Enter'`, `'Mod-Shift-M'`, etc.
 * `Mod` resolves to Cmd on macOS, Ctrl on Windows/Linux.
 */
export interface CodeBlockKeymap {
	/**
	 * Insert a new paragraph below the code block and move the cursor there.
	 * @default 'Mod-Enter'
	 */
	readonly insertAfter?: string | null;

	/**
	 * Toggle the current block between code block and paragraph.
	 * @default 'Mod-Shift-M'
	 */
	readonly toggle?: string | null;
}

export const DEFAULT_KEYMAP: Readonly<Record<keyof CodeBlockKeymap, string>> = {
	insertAfter: 'Mod-Enter',
	toggle: 'Mod-Shift-M',
};

export interface CodeBlockConfig {
	readonly highlighter?: SyntaxHighlighter;
	readonly defaultLanguage?: string;
	readonly useSpaces?: boolean;
	readonly spaceCount?: number;
	readonly showCopyButton?: boolean;
	readonly separatorAfter?: boolean;
	/** Default body background color (overrides --notectl-code-block-bg). */
	readonly background?: string;
	/** Default header background color (overrides --notectl-code-block-header-bg). */
	readonly headerBackground?: string;
	/** Default text color (overrides --notectl-code-block-color). */
	readonly textColor?: string;
	/** Default header/label text color (overrides --notectl-code-block-header-color). */
	readonly headerColor?: string;
	/** Customize keyboard bindings for code block actions. */
	readonly keymap?: CodeBlockKeymap;
}

export const DEFAULT_CONFIG: CodeBlockConfig = {
	defaultLanguage: '',
	useSpaces: false,
	spaceCount: 2,
	showCopyButton: true,
};

// --- Service Types ---

export interface CodeBlockService {
	setLanguage(blockId: BlockId, language: string): void;
	getLanguage(blockId: BlockId): string;
	setBackground(blockId: BlockId, color: string): void;
	getBackground(blockId: BlockId): string;
	isCodeBlock(blockId: BlockId): boolean;
	getSupportedLanguages(): readonly string[];
}

export const CODE_BLOCK_SERVICE_KEY = new ServiceKey<CodeBlockService>('codeBlock');

// --- SVG Icon ---

export const CODE_BLOCK_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>';
