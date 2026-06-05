import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Workaround for angular/angular-cli#31329.
//
// This app is zoneless (Angular v21+ default): it never imports zone.js, zone.js
// is not a dependency, and the angular.json polyfills are empty. Yet the
// `@angular/build:unit-test` (Vitest) builder still emits a runtime-guarded
// `if (typeof Zone !== 'undefined') await import('zone.js/testing')` into its
// generated TestBed bootstrap. The guard is false at runtime, but Vite resolves
// the specifier statically and fails because pnpm exposes zone.js as the optional
// peer of @angular/core in the store, which defeats the builder's zone-detection.
//
// Aliasing the (dead) specifier to an empty module lets Vite resolve it without
// pulling zone.js into the project, keeping the app genuinely zoneless. Wired in
// via `test.options.runnerConfig: true` in angular.json. Remove once the builder
// stops referencing zone.js for zoneless projects.
const zoneTestingStub: string = fileURLToPath(
  new URL('./src/testing/zone-noop.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [{ find: 'zone.js/testing', replacement: zoneTestingStub }],
  },
});
