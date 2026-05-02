export { SmartPastePlugin } from './SmartPastePlugin.js';
export {
	SMART_PASTE_SERVICE_KEY,
	type ContentDetector,
	type PasteSegment,
	type DetectionResult,
	type SmartPasteConfig,
	type SmartPasteService,
} from './SmartPasteTypes.js';

export type { SmartPasteLocale } from './SmartPasteLocale.js';
export { SMART_PASTE_LOCALE_EN, loadSmartPasteLocale } from './SmartPasteLocale.js';
export { JsonDetector } from './detectors/JsonDetector.js';
export { XmlDetector } from './detectors/XmlDetector.js';
export { LexerDetector, type LexerDetectorOptions } from './detectors/LexerDetector.js';
export {
	computeTokenStats,
	DEFAULT_RELEVANCE_WEIGHTS,
	MAX_RELEVANCE_WEIGHT,
	type RelevanceWeights,
	type TokenStats,
} from './detectors/TokenStats.js';
export { scoreFromStats } from './detectors/DetectionScorer.js';
