import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src'],
      exclude: ['**/*.test.ts'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NotectlVue',
      formats: ['es', 'umd'],
      fileName: (format) => `vue.${format === 'es' ? 'js' : 'umd.cjs'}`,
    },
    rollupOptions: {
      external: ['vue', '@notectl/core'],
      output: {
        exports: 'named',
        globals: {
          'vue': 'Vue',
          '@notectl/core': 'NotectlCore',
        },
      },
    },
    sourcemap: true,
  },
});
