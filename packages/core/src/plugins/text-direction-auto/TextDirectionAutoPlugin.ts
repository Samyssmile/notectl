/**
 * Text direction auto-detection / inheritance / preservation plugin.
 *
 * Registers three transaction middlewares that keep block-level `dir`
 * attributes in sync with content changes. Strictly requires
 * {@link TextDirectionPlugin} (declared via `dependencies`) — without it,
 * the patched `dir` attribute does not exist on NodeSpecs and the
 * `directableTypes` service is unavailable.
 */

import type { Plugin, PluginContext } from '../Plugin.js';
import { TEXT_DIRECTION_SERVICE_KEY } from '../text-direction/TextDirectionService.js';
import {
	registerAutoDetectMiddleware,
	registerInheritDirMiddleware,
	registerPreserveDirMiddleware,
} from './TextDirectionAutoMiddleware.js';

export interface TextDirectionAutoConfig {
	/**
	 * Whether to register the auto-detect middleware (insertText / deleteText).
	 * @default true
	 */
	readonly autoDetect?: boolean;
	/**
	 * Whether to register the inherit-dir middleware (insertNode).
	 * @default true
	 */
	readonly inherit?: boolean;
	/**
	 * Whether to register the preserve-dir middleware (setBlockType).
	 * @default true
	 */
	readonly preserve?: boolean;
}

const DEFAULT_CONFIG: Required<TextDirectionAutoConfig> = {
	autoDetect: true,
	inherit: true,
	preserve: true,
};

export class TextDirectionAutoPlugin implements Plugin {
	readonly id = 'text-direction-auto';
	readonly name = 'Text Direction Auto-detect';
	readonly priority = 93;
	readonly dependencies = ['text-direction'] as const;

	private readonly config: Required<TextDirectionAutoConfig>;

	constructor(config?: TextDirectionAutoConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		const service = context.getService(TEXT_DIRECTION_SERVICE_KEY);
		if (!service) {
			throw new Error(
				'TextDirectionAutoPlugin requires TextDirectionPlugin to be registered first.',
			);
		}

		const { directableTypes } = service;

		if (this.config.preserve) {
			registerPreserveDirMiddleware(context, directableTypes);
		}
		if (this.config.autoDetect) {
			registerAutoDetectMiddleware(context, directableTypes);
		}
		if (this.config.inherit) {
			registerInheritDirMiddleware(context, directableTypes);
		}
	}
}
