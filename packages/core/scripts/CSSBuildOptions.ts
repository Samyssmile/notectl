import { Features } from 'lightningcss';
import type { BuildOptions, CSSOptions } from 'vite';

/** Keep inline CSS compatible with the documented browser minimums in both library formats. */
export const CSS_BUILD_OPTIONS = {
	cssMinify: 'lightningcss',
	cssTarget: ['chrome67', 'firefox63', 'safari12.1', 'edge79'],
} satisfies Pick<BuildOptions, 'cssMinify' | 'cssTarget'>;

/**
 * Ship CSS logical properties as authored. For the targets above, Lightning CSS
 * can only lower them to `left`/`right` behind `:lang()` selectors, which follow
 * the page language instead of `dir` and break right-to-left blocks (#259).
 * `size:check` rejects any such emulation in the build output.
 */
export const CSS_OPTIONS = {
	lightningcss: { exclude: Features.LogicalProperties },
} satisfies CSSOptions;
