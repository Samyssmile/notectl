/**
 * Accessible checkbox marker for checklist items.
 *
 * The marker is a real `role="checkbox"` element so assistive technology can
 * announce the item's checked state (WCAG 4.1.2 Name, Role, Value). It is
 * rendered `contenteditable="false"` and flagged `data-widget` so the selection
 * layer treats it as zero-width view chrome, never as document content or a caret
 * position. The visible checkbox glyph is drawn in CSS.
 */

/** CSS class identifying the checklist checkbox marker element. */
export const CHECKLIST_MARKER_CLASS = 'notectl-checklist-marker';

/** Creates the accessible checkbox marker for a checklist item. */
export function createChecklistMarker(checked: boolean, label: string): HTMLElement {
	const marker: HTMLElement = document.createElement('span');
	marker.className = CHECKLIST_MARKER_CLASS;
	marker.setAttribute('role', 'checkbox');
	marker.setAttribute('aria-checked', String(checked));
	marker.setAttribute('aria-label', label);
	marker.setAttribute('contenteditable', 'false');
	marker.setAttribute('data-widget', 'true');
	return marker;
}
