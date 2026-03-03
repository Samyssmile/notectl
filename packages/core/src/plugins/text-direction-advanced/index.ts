export {
	TextDirectionPlugin as TextDirectionAdvancedPlugin,
	DIRECTION_ICONS,
	type TextDirectionConfig,
	type TextDirection,
} from '../text-direction/TextDirectionPlugin.js';

export {
	detectTextDirection,
	findSiblingDirection,
	getBlockDir,
} from '../text-direction/DirectionDetection.js';

export type { TextDirectionLocale } from '../text-direction/TextDirectionLocale.js';
export {
	TEXT_DIRECTION_LOCALE_EN,
	loadTextDirectionLocale,
} from '../text-direction/TextDirectionLocale.js';
