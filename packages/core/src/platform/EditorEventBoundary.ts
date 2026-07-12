/**
 * Returns whether a node belongs to the editor's document surface.
 *
 * Plugin controls may live inside the content element so they inherit the
 * editor's styles and positioning context. Form controls and descendants of a
 * `contenteditable="false"` boundary retain native behavior and must never be
 * interpreted as document input or selection.
 */
export function isNodeFromEditorContent(target: Node | null, contentElement: HTMLElement): boolean {
	if (!target || !contentElement.contains(target)) return false;

	const targetElement: Element | null = target instanceof Element ? target : target.parentElement;
	if (!targetElement || targetElement === contentElement) return true;

	if (targetElement.closest('input, textarea, select')) return false;

	const nonEditableBoundary: Element | null = targetElement.closest('[contenteditable="false"]');
	return !nonEditableBoundary || nonEditableBoundary === contentElement;
}

/** Event wrapper around {@link isNodeFromEditorContent}. */
export function isEventFromEditorContent(event: Event, contentElement: HTMLElement): boolean {
	return isNodeFromEditorContent(event.target as Node | null, contentElement);
}
