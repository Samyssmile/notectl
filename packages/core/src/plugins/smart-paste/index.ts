export { SmartPastePlugin } from './SmartPastePlugin.js';
export {
	SMART_PASTE_SERVICE_KEY,
	type ContentDetector,
	type DetectionResult,
	type SmartPasteConfig,
	type SmartPasteService,
} from './SmartPasteTypes.js';

export type { SmartPasteLocale } from './SmartPasteLocale.js';
export { SMART_PASTE_LOCALE_EN, loadSmartPasteLocale } from './SmartPasteLocale.js';
export { JavaDetector } from './detectors/JavaDetector.js';
export { JsonDetector } from './detectors/JsonDetector.js';
export { XmlDetector } from './detectors/XmlDetector.js';
