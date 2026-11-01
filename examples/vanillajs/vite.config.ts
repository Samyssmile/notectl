import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		rolldownOptions: { input: ['index.html', 'custom-ui.html'] },
	},
	server: {
		port: 3000,
		open: true,
	},
});
