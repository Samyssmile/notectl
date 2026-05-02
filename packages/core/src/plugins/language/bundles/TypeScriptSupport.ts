/**
 * Built-in TypeScript language support bundle.
 * Includes syntax highlighting (modern TS) and smart-paste detection.
 *
 * Aliases `ts` and `tsx` are accepted for the language picker and code-block fences.
 */

import { TYPESCRIPT_LANGUAGE } from '../../code-block/highlighter/languages/typescript.js';
import { TypeScriptDetector } from '../../smart-paste/detectors/TypeScriptDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

export const TYPESCRIPT_SUPPORT: LanguageSupport = {
	id: 'typescript',
	displayName: 'TypeScript',
	aliases: ['ts', 'tsx'],
	highlighting: TYPESCRIPT_LANGUAGE,
	detection: new TypeScriptDetector(),
};
