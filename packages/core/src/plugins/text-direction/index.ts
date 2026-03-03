export {
	TextDirectionCorePlugin as TextDirectionPlugin,
	DIRECTION_ICONS,
	type TextDirectionConfig,
	type TextDirection,
} from './TextDirectionCorePlugin.js';

export { detectTextDirection, findSiblingDirection, getBlockDir } from './DirectionDetection.js';

export type { TextDirectionLocale } from './TextDirectionLocale.js';
export {
	TEXT_DIRECTION_LOCALE_EN,
	loadTextDirectionLocale,
} from './TextDirectionLocale.js';
