export {
	TextDirectionPlugin,
	type TextDirectionConfig,
	type TextDirection,
} from './TextDirectionPlugin.js';

export { DIRECTION_ICONS } from './DirectionIcons.js';

export { detectTextDirection, findSiblingDirection, getBlockDir } from './DirectionDetection.js';

export type { TextDirectionLocale } from './TextDirectionLocale.js';
export {
	TEXT_DIRECTION_LOCALE_EN,
	loadTextDirectionLocale,
} from './TextDirectionLocale.js';

export {
	TEXT_DIRECTION_SERVICE_KEY,
	type TextDirectionService,
} from './TextDirectionService.js';
