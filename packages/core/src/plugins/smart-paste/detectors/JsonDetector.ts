/**
 * JSON content detector — validates and formats JSON for code block insertion.
 */

import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';

/** Minimum length for formatted JSON to be considered meaningful. */
const MIN_FORMATTED_LENGTH = 5;

/** Confidence score for valid JSON detected via JSON.parse. */
const JSON_CONFIDENCE = 0.9;

export class JsonDetector implements ContentDetector {
	readonly id = 'json';

	detect(text: string): DetectionResult | null {
		const trimmed: string = text.trim();
		if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed !== 'object' || parsed === null) return null;

			const formatted: string = JSON.stringify(parsed, null, 2);
			if (formatted.length <= MIN_FORMATTED_LENGTH) return null;

			return { language: 'json', formattedText: formatted, confidence: JSON_CONFIDENCE };
		} catch {
			return null;
		}
	}
}
