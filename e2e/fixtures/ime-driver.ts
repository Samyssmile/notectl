import type { CDPSession, Page } from '@playwright/test';

/**
 * Drives Chromium's IME emulation over CDP, so the browser performs the real
 * composition DOM edits and fires the real composition and input events.
 */
export interface ImeDriver {
	/** Sets the composition text, optionally replacing an existing plain-text range. */
	compose(text: string, replace?: { readonly start: number; readonly end: number }): Promise<void>;
	/** Commits the active composition with `text`. */
	commit(text: string): Promise<void>;
}

/** Creates an {@link ImeDriver} bound to `page`. */
export async function imeDriver(page: Page): Promise<ImeDriver> {
	const cdp: CDPSession = await page.context().newCDPSession(page);
	return {
		async compose(text, replace): Promise<void> {
			await cdp.send('Input.imeSetComposition', {
				text,
				selectionStart: text.length,
				selectionEnd: text.length,
				...(replace ? { replacementStart: replace.start, replacementEnd: replace.end } : {}),
			});
		},
		async commit(text): Promise<void> {
			await cdp.send('Input.insertText', { text });
		},
	};
}
