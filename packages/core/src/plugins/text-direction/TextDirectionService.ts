/**
 * Service contract exposed by `TextDirectionPlugin` to other plugins
 * (e.g. `BidiIsolationPlugin`, `TextDirectionAutoPlugin`) that need to
 * read the current block-level direction or the set of types that
 * support direction.
 */

import type { BlockNode } from '../../model/Document.js';
import { ServiceKey } from '../../model/TypedKeys.js';

export type TextDirection = 'ltr' | 'rtl' | 'auto';

export interface TextDirectionService {
	readonly directableTypes: ReadonlySet<string>;
	getBlockDir(block: BlockNode): TextDirection;
}

export const TEXT_DIRECTION_SERVICE_KEY: ServiceKey<TextDirectionService> =
	new ServiceKey<TextDirectionService>('textDirection');
