import type { BuildOptions } from 'vite';

/** Keep inline CSS compatible with the documented browser minimums in both library formats. */
export const CSS_BUILD_OPTIONS = {
	cssMinify: 'lightningcss',
	cssTarget: ['chrome67', 'firefox63', 'safari12.1', 'edge79'],
} satisfies Pick<BuildOptions, 'cssMinify' | 'cssTarget'>;
