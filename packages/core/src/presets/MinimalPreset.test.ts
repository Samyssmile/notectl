import { describe, expect, it } from 'vitest';
import { FontPlugin } from '../plugins/font/FontPlugin.js';
import { STARTER_FONTS } from '../plugins/font/StarterFonts.js';
import { createMinimalPreset } from './MinimalPreset.js';

describe('createMinimalPreset', () => {
	it('returns a single toolbar group with FontPlugin', () => {
		const preset = createMinimalPreset();

		expect(preset.toolbar).toHaveLength(1);
		const group = preset.toolbar[0];
		expect(group).toHaveLength(1);
		expect(group?.[0]).toBeInstanceOf(FontPlugin);
	});

	it('returns an empty plugins array', () => {
		const preset = createMinimalPreset();

		expect(preset.plugins).toHaveLength(0);
	});

	it('creates fresh instances per call', () => {
		const preset1 = createMinimalPreset();
		const preset2 = createMinimalPreset();

		expect(preset1.toolbar[0]?.[0]).not.toBe(preset2.toolbar[0]?.[0]);
	});
});
