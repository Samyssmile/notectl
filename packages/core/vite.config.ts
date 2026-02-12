import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
	plugins: [
		dts({
			insertTypesEntry: true,
			rollupTypes: true,
		}),
	],
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'NotectlCore',
			formats: ['es', 'umd'],
			fileName: (format) => `notectl-core.${format === 'es' ? 'mjs' : 'js'}`,
		},
		rollupOptions: {
			external: ['dompurify'],
			output: {
				globals: {
					dompurify: 'DOMPurify',
				},
			},
		},
		sourcemap: true,
		minify: 'esbuild',
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
	},
});
