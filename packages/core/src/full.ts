/**
 * Full entry point — re-exports everything for UMD builds and legacy consumers.
 *
 * For ESM consumers, prefer importing from specific sub-paths:
 * - `@notectl/core` — core framework (model, state, view, plugin system)
 * - `@notectl/core/html` — HTML serialization/parsing
 * - `@notectl/core/presets` — preset factory functions
 * - `@notectl/core/fonts` — starter font definitions
 * - `@notectl/core/plugins/<name>` — individual plugins
 *
 * @example
 * ```ts
 * // UMD / kitchen-sink import:
 * import * as NotectlCore from '@notectl/core/full';
 * ```
 */

// --- Core Framework ---
export * from './index.js';

// --- HTML Serialization / Parsing ---
export * from './html.js';

// --- Presets ---
export * from './presets.js';

// --- Fonts ---
export * from './fonts.js';

// --- All Plugins ---
export * from './plugins/text-formatting/index.js';
export * from './plugins/heading/index.js';
export * from './plugins/toolbar/index.js';
export * from './plugins/table/index.js';
export * from './plugins/image/index.js';
export * from './plugins/code-block/index.js';
export * from './plugins/link/index.js';
export * from './plugins/list/index.js';
export * from './plugins/blockquote/index.js';
export * from './plugins/strikethrough/index.js';
export * from './plugins/text-color/index.js';
export * from './plugins/horizontal-rule/index.js';
export * from './plugins/alignment/index.js';
export * from './plugins/font/index.js';
export * from './plugins/font-size/index.js';
export * from './plugins/highlight/index.js';
export * from './plugins/super-sub/index.js';
export * from './plugins/hard-break/index.js';
export * from './plugins/gap-cursor/index.js';
export * from './plugins/caret-navigation/index.js';
export * from './plugins/print/index.js';
export * from './plugins/text-direction/index.js';
