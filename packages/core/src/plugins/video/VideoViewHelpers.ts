/**
 * Shared DOM helpers for the video figure shell, used by both the NodeSpec
 * `toDOM` (static fallback) and the interactive `VideoNodeView`. Keeping the
 * structure, class names, and sizing in one place keeps the two renderers in
 * sync so reconciliation never thrashes.
 */

import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { VideoAlign } from './VideoTypes.js';

/** Logical alignment → figure modifier class. */
export const VIDEO_ALIGNMENT_CLASSES: Readonly<Record<VideoAlign, string>> = {
	start: 'notectl-video--start',
	center: 'notectl-video--center',
	end: 'notectl-video--end',
};

/** Replaces the alignment modifier class on a video figure. */
export function applyVideoAlignment(figure: HTMLElement, align: VideoAlign): void {
	for (const cls of Object.values(VIDEO_ALIGNMENT_CLASSES)) figure.classList.remove(cls);
	const next: string = VIDEO_ALIGNMENT_CLASSES[align] ?? VIDEO_ALIGNMENT_CLASSES.center;
	figure.classList.add(next);
}

/**
 * Applies responsive sizing to the video frame: a validated `aspect-ratio`
 * (height always follows width, so the embed can never be distorted) and a width
 * as a percentage of the content column. Both values must be pre-validated by the
 * caller (`sanitizeAspectRatio` / `clampWidthPercent`).
 */
export function applyVideoFrameSizing(
	frame: HTMLElement,
	aspectRatio: string,
	widthPercent: number,
): void {
	setStyleProperty(frame, 'aspect-ratio', aspectRatio);
	setStyleProperty(frame, 'width', `${widthPercent}%`);
}
