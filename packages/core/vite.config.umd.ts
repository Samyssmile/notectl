import { resolve } from 'node:path';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'vite';

/**
 * Separate UMD build for CDN / script-tag consumers.
 * Produces a single self-contained file with no code-splitting.
 */
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'NotectlCore',
			formats: ['umd'],
			fileName: () => 'notectl-core.umd.js',
		},
		rollupOptions: {
			external: ['dompurify'],
			output: {
				globals: {
					dompurify: 'DOMPurify',
				},
			},
			plugins: [
				terser({
					compress: { passes: 2 },
				}),
			],
		},
		outDir: 'dist',
		emptyOutDir: false,
		sourcemap: true,
		minify: false,
	},
});
