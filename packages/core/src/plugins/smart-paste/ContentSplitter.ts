/**
 * Splits pasted text at blank-line boundaries and classifies each segment
 * using content detectors. Adjacent segments of the same type are merged.
 */

import type { ContentDetector, DetectionResult, PasteSegment } from './SmartPasteTypes.js';

/** Pattern matching one or more consecutive blank lines (may contain whitespace). */
const BLANK_LINE_SPLIT: RegExp = /\n(?:[ \t]*\n)+/;

/**
 * Splits text at blank-line boundaries and classifies each segment
 * using the provided detectors. Returns null if no code is detected
 * in any segment (the paste should fall through to default handling).
 */
export function splitAndClassify(
	text: string,
	detectors: readonly ContentDetector[],
): readonly PasteSegment[] | null {
	const rawSegments: readonly string[] = text.split(BLANK_LINE_SPLIT);
	const trimmed: readonly string[] = rawSegments
		.map((s: string) => s.trim())
		.filter((s: string) => s.length > 0);

	if (trimmed.length === 0) return null;

	let hasCode = false;
	const segments: PasteSegment[] = trimmed.map((segmentText: string): PasteSegment => {
		const detection: DetectionResult | null = detectBest(segmentText, detectors);
		if (detection) hasCode = true;
		return { text: segmentText, detection };
	});

	if (!hasCode) return null;

	return mergeAdjacentSegments(segments);
}

/**
 * Merges adjacent segments that share the same classification:
 * consecutive text segments become one paragraph, consecutive code
 * segments of the same language become one code block.
 */
export function mergeAdjacentSegments(segments: readonly PasteSegment[]): readonly PasteSegment[] {
	if (segments.length <= 1) return segments;

	const merged: PasteSegment[] = [segments[0] as PasteSegment];

	for (let i = 1; i < segments.length; i++) {
		const current: PasteSegment = segments[i] as PasteSegment;
		const previous: PasteSegment = merged[merged.length - 1] as PasteSegment;

		if (canMerge(previous, current)) {
			merged[merged.length - 1] = merge(previous, current);
		} else {
			merged.push(current);
		}
	}

	return merged;
}

/** Picks the highest-confidence detection result from all detectors. */
function detectBest(text: string, detectors: readonly ContentDetector[]): DetectionResult | null {
	let best: DetectionResult | null = null;

	for (const detector of detectors) {
		const result: DetectionResult | null = detector.detect(text);
		if (result && (best === null || result.confidence > best.confidence)) {
			best = result;
		}
	}

	return best;
}

/** Two segments can merge if both are text or both are code of the same language. */
function canMerge(a: PasteSegment, b: PasteSegment): boolean {
	if (!a.detection && !b.detection) return true;
	if (a.detection && b.detection) return a.detection.language === b.detection.language;
	return false;
}

/** Merges two compatible segments into one. */
function merge(a: PasteSegment, b: PasteSegment): PasteSegment {
	const joinedText: string = `${a.text}\n\n${b.text}`;

	if (!a.detection && !b.detection) {
		return { text: joinedText, detection: null };
	}

	const detA: DetectionResult = a.detection as DetectionResult;
	const detB: DetectionResult = b.detection as DetectionResult;

	return {
		text: joinedText,
		detection: {
			language: detA.language,
			formattedText: `${detA.formattedText}\n\n${detB.formattedText}`,
			confidence: Math.max(detA.confidence, detB.confidence),
		},
	};
}
