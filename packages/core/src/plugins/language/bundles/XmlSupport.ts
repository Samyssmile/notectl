/**
 * Built-in XML language support bundle.
 * Includes syntax highlighting and smart-paste detection.
 */

import { XML_LANGUAGE } from '../../code-block/highlighter/languages/xml.js';
import { XmlDetector } from '../../smart-paste/detectors/XmlDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

export const XML_SUPPORT: LanguageSupport = {
	id: 'xml',
	displayName: 'XML',
	aliases: ['html', 'xhtml', 'svg', 'xsl'],
	highlighting: XML_LANGUAGE,
	detection: new XmlDetector(),
};
