/**
 * Ask-first paste-to-embed interceptor.
 *
 * Runs on the RAW clipboard text/html before the editor's own sanitize pass (the
 * paste pipeline invokes interceptors first). When the sole clipboard content is
 * a known-provider video URL — or a standalone embed `<iframe>` — it claims the
 * paste, inserts the URL as plain text, and hands the inserted range to `onOffer`
 * so the plugin can show the "Embed this video?" affordance. Nothing is embedded
 * silently; the user opts in. Anything else passes through to default handling.
 */

import type { PasteInterceptor } from '../../model/PasteInterceptor.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { VideoTextRange } from './VideoCommands.js';
import {
	type VideoMatch,
	type VideoProvider,
	buildWatchUrlForMatch,
	parseVideoUrl,
} from './VideoProviders.js';

/** Parses untrusted clipboard HTML into an INERT fragment (no resource loads). */
function parseFragment(html: string): DocumentFragment {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

/** Returns the `src` of a standalone embed iframe (only content besides whitespace), else null. */
function standaloneIframeSrc(html: string): string | null {
	if (!html) return null;
	const fragment: DocumentFragment = parseFragment(html);
	const iframe: HTMLIFrameElement | null = fragment.querySelector('iframe');
	if (!iframe) return null;
	const clone: DocumentFragment = fragment.cloneNode(true) as DocumentFragment;
	for (const el of Array.from(clone.querySelectorAll('iframe'))) el.remove();
	if ((clone.textContent ?? '').trim() !== '') return null;
	return iframe.getAttribute('src');
}

/** Detects a sole-clipboard video paste, returning the text to insert and the match. */
function extractVideoPaste(
	plainText: string,
	html: string,
	providers: readonly VideoProvider[],
): { url: string; match: VideoMatch } | null {
	const text: string = plainText.trim();
	// A bare URL has no internal whitespace; this enforces "sole clipboard content".
	if (text && !/\s/.test(text)) {
		const match: VideoMatch | null = parseVideoUrl(text, providers);
		if (match) return { url: text, match };
	}

	const iframeSrc: string | null = standaloneIframeSrc(html);
	if (iframeSrc) {
		const match: VideoMatch | null = parseVideoUrl(iframeSrc, providers);
		if (match) {
			// Insert the friendly public watch URL as the placeholder text, not the
			// raw embed URL.
			return { url: buildWatchUrlForMatch(match, providers) ?? iframeSrc, match };
		}
	}
	return null;
}

/** Creates the ask-first video paste interceptor. */
export function createVideoPasteInterceptor(options: {
	providers: readonly VideoProvider[];
	onOffer: (range: VideoTextRange, match: VideoMatch) => void;
}): PasteInterceptor {
	return (plainText: string, html: string, state: EditorState): Transaction | null => {
		const result = extractVideoPaste(plainText, html, options.providers);
		if (!result) return null;

		const sel = state.selection;
		if (!isTextSelection(sel) || !isCollapsed(sel)) return null;

		const blockId = sel.anchor.blockId;
		const start: number = sel.anchor.offset;
		const end: number = start + result.url.length;

		const tr: Transaction = state
			.transaction('paste')
			.insertText(blockId, start, result.url, [])
			.setSelection(createCollapsedSelection(blockId, end))
			.build();

		// The transaction applies before the deferred affordance reads the DOM.
		options.onOffer({ blockId, start, end }, result.match);
		return tr;
	};
}
