/**
 * Built-in Java language support bundle.
 * Includes syntax highlighting (Java 21) and smart-paste detection.
 */

import { JAVA_LANGUAGE } from '../../code-block/highlighter/languages/java.js';
import { JavaDetector } from '../../smart-paste/detectors/JavaDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

export const JAVA_SUPPORT: LanguageSupport = {
	id: 'java',
	displayName: 'Java',
	highlighting: JAVA_LANGUAGE,
	detection: new JavaDetector(),
};
