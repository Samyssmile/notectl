/**
 * Floating toolbar shown when a video is selected: edit, align, and delete. All
 * controls are real `<button>`s with localized accessible names, grouped in a
 * `role="toolbar"`. Pointer interaction never disturbs the node selection
 * (mousedown is suppressed), so the toolbar stays usable while the video is held.
 */

import type { VideoLocale } from './VideoLocale.js';
import type { VideoAlign } from './VideoTypes.js';

/** Context-bound actions the toolbar invokes. */
export interface VideoToolbarActions {
	edit(): void;
	align(align: VideoAlign): void;
	remove(): void;
}

export interface VideoSelectionToolbar {
	readonly element: HTMLElement;
	update(align: VideoAlign): void;
	destroy(): void;
}

const ICONS = {
	edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>',
	alignStart:
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h18v2H3V4zm0 7h12v2H3v-2zm0 7h18v2H3v-2zm0-3.5h12v-2H3v2z" fill="currentColor"/></svg>',
	alignCenter:
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h18v2H3V4zm3 7h12v2H6v-2zm-3 7h18v2H3v-2zm3-3.5h12v-2H6v2z" fill="currentColor"/></svg>',
	alignEnd:
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h18v2H3V4zm6 7h12v2H9v-2zm-6 7h18v2H3v-2zm6-3.5h12v-2H9v2z" fill="currentColor"/></svg>',
	remove:
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>',
} as const;

/** Builds a toolbar button, suppressing the selection-clearing mousedown. */
function button(label: string, icon: string, onActivate: () => void): HTMLButtonElement {
	const btn: HTMLButtonElement = document.createElement('button');
	btn.type = 'button';
	btn.className = 'notectl-video__tool';
	btn.setAttribute('aria-label', label);
	btn.title = label;
	btn.innerHTML = icon;
	btn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
	btn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onActivate();
	});
	return btn;
}

/** Creates the on-selection video toolbar. */
export function createVideoSelectionToolbar(options: {
	locale: VideoLocale;
	actions: VideoToolbarActions;
	initialAlign: VideoAlign;
}): VideoSelectionToolbar {
	const { locale, actions } = options;

	const toolbar: HTMLDivElement = document.createElement('div');
	toolbar.className = 'notectl-video__toolbar';
	toolbar.setAttribute('role', 'toolbar');
	toolbar.setAttribute('aria-label', locale.videoOptions);
	toolbar.setAttribute('data-notectl-no-print', '');
	toolbar.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());

	const editBtn: HTMLButtonElement = button(locale.editVideo, ICONS.edit, () => actions.edit());

	const alignButtons: Readonly<Record<VideoAlign, HTMLButtonElement>> = {
		start: button(locale.alignStart, ICONS.alignStart, () => actions.align('start')),
		center: button(locale.alignCenter, ICONS.alignCenter, () => actions.align('center')),
		end: button(locale.alignEnd, ICONS.alignEnd, () => actions.align('end')),
	};

	const removeBtn: HTMLButtonElement = button(locale.deleteVideo, ICONS.remove, () =>
		actions.remove(),
	);

	const separator = (): HTMLSpanElement => {
		const sep: HTMLSpanElement = document.createElement('span');
		sep.className = 'notectl-video__tool-separator';
		sep.setAttribute('aria-hidden', 'true');
		return sep;
	};

	toolbar.append(
		editBtn,
		separator(),
		alignButtons.start,
		alignButtons.center,
		alignButtons.end,
		separator(),
		removeBtn,
	);

	const update = (align: VideoAlign): void => {
		for (const key of ['start', 'center', 'end'] as const) {
			const active: boolean = key === align;
			alignButtons[key].classList.toggle('notectl-video__tool--active', active);
			alignButtons[key].setAttribute('aria-pressed', active ? 'true' : 'false');
		}
	};
	update(options.initialAlign);

	return {
		element: toolbar,
		update,
		destroy(): void {
			toolbar.remove();
		},
	};
}
