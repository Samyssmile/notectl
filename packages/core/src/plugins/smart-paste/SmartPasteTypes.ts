/**
 * Types for the smart paste plugin — content detection and formatting.
 */

import { ServiceKey } from '../Plugin.js';
import type { SmartPasteLocale } from './SmartPasteLocale.js';

/** Result of detecting structured content in pasted text. */
export interface DetectionResult {
	readonly language: string;
	readonly formattedText: string;
	readonly confidence: number;
}

/** A classified segment of pasted text — either plain text or detected code. */
export interface PasteSegment {
	readonly text: string;
	readonly detection: DetectionResult | null;
}

/** Interface for content detectors that identify and format pasted text. */
export interface ContentDetector {
	readonly id: string;
	detect(text: string): DetectionResult | null;
}

/** Configuration for the SmartPastePlugin. */
export interface SmartPasteConfig {
	readonly detectors?: readonly ContentDetector[];
	readonly locale?: SmartPasteLocale;
}

/** Public service for registering additional content detectors at runtime. */
export interface SmartPasteService {
	registerDetector(detector: ContentDetector): void;
}

export const SMART_PASTE_SERVICE_KEY = new ServiceKey<SmartPasteService>('smartPaste');
