import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { stripEmbeddedFontSourcesFromMaps } from './scripts/BundleStatsPlugin.js';

/**
 * Separate UMD build for CDN / script-tag consumers.
 * Produces a single file with no code-splitting; DOMPurify remains external.
 */
export default defineConfig({
	plugins: [stripEmbeddedFontSourcesFromMaps()],
	build: {
		lib: {
			entry: resolve(__dirname, 'src/full.ts'),
			name: 'NotectlCore',
			formats: ['umd'],
			fileName: () => 'notectl-core.umd.js',
		},
		rolldownOptions: {
			external: ['dompurify'],
			output: {
				globals: {
					dompurify: 'DOMPurify',
				},
			},
		},
		outDir: 'dist',
		emptyOutDir: false,
		sourcemap: true,
		minify: 'terser',
		terserOptions: {
			compress: { passes: 2 },
		},
	},
});
