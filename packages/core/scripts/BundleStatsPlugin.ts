import { writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { Plugin as VitePlugin } from 'vite';

interface BundleChunkStats {
	readonly file: string;
	readonly imports: readonly string[];
	readonly dynamicImports: readonly string[];
	readonly entry?: string;
}

interface BundleStats {
	readonly version: 1;
	readonly chunks: readonly BundleChunkStats[];
}

const EMBEDDED_FONT_SOURCES = ['/StarterFonts.ts', '/MathFont.ts'] as const;

/**
 * Keeps source mappings while omitting redundant Base64 font literals from
 * `sourcesContent`. The executable chunks remain self-contained; only the
 * non-debuggable binary payload is no longer duplicated in published maps.
 */
export function stripEmbeddedFontSourcesFromMaps(): VitePlugin {
	return {
		name: 'notectl-strip-embedded-font-sources',
		apply: 'build',
		generateBundle(_options, bundle): void {
			for (const output of Object.values(bundle)) {
				if (
					output.type !== 'asset' ||
					!output.fileName.endsWith('.map') ||
					typeof output.source !== 'string'
				) {
					continue;
				}
				const map = JSON.parse(output.source) as {
					sources?: string[];
					sourcesContent?: (string | null)[];
				};
				if (!map.sources || !map.sourcesContent) continue;

				let changed = false;
				map.sourcesContent = map.sourcesContent.map((content, index) => {
					const source: string | undefined = map.sources?.[index];
					if (
						source &&
						EMBEDDED_FONT_SOURCES.some((suffix) => source.endsWith(suffix))
					) {
						changed = true;
						return null;
					}
					return content;
				});
				if (changed) output.source = JSON.stringify(map);
			}
		},
	};
}

/**
 * Records the production chunk graph for the bundle-budget check.
 *
 * Vite's public manifest is intentionally not used here: it is large enough to
 * become accidental package payload when `dist/` is published. This compact
 * build-only artifact lives outside `dist/` and is ignored by both Git and npm.
 */
export function bundleStatsPlugin(packageRoot: string): VitePlugin {
	return {
		name: 'notectl-bundle-stats',
		apply: 'build',
		async writeBundle(_options, bundle): Promise<void> {
			const chunks: BundleChunkStats[] = Object.values(bundle)
				.filter((output): output is Extract<typeof output, { type: 'chunk' }> => {
					return output.type === 'chunk';
				})
				.map((chunk): BundleChunkStats => {
					const entry: string | undefined = chunk.facadeModuleId
						? relative(packageRoot, chunk.facadeModuleId).replaceAll('\\', '/')
						: undefined;
					return {
						file: chunk.fileName,
						imports: [...chunk.imports].sort(),
						dynamicImports: [...chunk.dynamicImports].sort(),
						...(entry ? { entry } : {}),
					};
				})
				.sort((left, right) => left.file.localeCompare(right.file));
			const stats: BundleStats = { version: 1, chunks };
			await writeFile(
				resolve(packageRoot, '.bundle-stats.json'),
				`${JSON.stringify(stats, null, 2)}\n`,
				'utf8',
			);
		},
	};
}
