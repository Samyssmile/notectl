/**
 * Built-in JSON language support bundle.
 * Includes syntax highlighting and smart-paste detection.
 */

import { JSON_LANGUAGE } from '../../code-block/highlighter/languages/json.js';
import { JsonDetector } from '../../smart-paste/detectors/JsonDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

export const JSON_SUPPORT: LanguageSupport = {
	id: 'json',
	displayName: 'JSON',
	aliases: ['jsonc'],
	highlighting: JSON_LANGUAGE,
	detection: new JsonDetector(),
};
