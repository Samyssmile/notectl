/**
 * Direction icon SVGs shared between `TextDirectionPlugin` (block-level
 * dropdown) and `BidiIsolationPlugin` (inline dropdown items).
 */

import type { TextDirection } from './TextDirectionService.js';

export const DIRECTION_ICONS: Readonly<Record<TextDirection, string>> = {
	ltr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 10v5h2V4h2v11h2V4h2V2H9C6.79 2 5 3.79 5 6s1.79 4 4 4zm12 8l-4-4v3H5v2h12v3l4-4z"/></svg>',
	rtl: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 10v5h2V4h2v11h2V4h2V2h-8C7.79 2 6 3.79 6 6s1.79 4 4 4zM8 14l-4 4 4 4v-3h12v-2H8v-3z"/></svg>',
	auto: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 10v5h2V4h2v11h2V4h2V2H9C6.79 2 5 3.79 5 6s1.79 4 4 4zm3 8l-4-4v3H3v2h5v3l4-4zm7 0v-3l4 4-4 4v-3h-5v-2h5z"/></svg>',
};
