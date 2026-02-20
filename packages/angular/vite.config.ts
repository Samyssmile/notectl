import { defineConfig } from 'vite';

export default defineConfig({
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.spec.ts'],
		setupFiles: ['src/test-setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
	},
});
