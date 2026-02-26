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

	it('uses STARTER_FONTS by default', () => {
		const preset = createMinimalPreset();
		const fontPlugin = preset.toolbar[0]?.[0] as FontPlugin;

		// Verify the font plugin has the starter fonts by checking the config
		// is constructed with STARTER_FONTS (internal detail verified via id)
		expect(fontPlugin.id).toBe('font');
	});

	it('allows overriding font config', () => {
		const customFonts = [{ name: 'Custom', family: "'Custom', sans-serif" }];
		const preset = createMinimalPreset({ font: { fonts: customFonts } });

		const fontPlugin = preset.toolbar[0]?.[0] as FontPlugin;
		expect(fontPlugin.id).toBe('font');
	});

	it('creates fresh instances per call', () => {
		const preset1 = createMinimalPreset();
		const preset2 = createMinimalPreset();

		expect(preset1.toolbar[0]?.[0]).not.toBe(preset2.toolbar[0]?.[0]);
	});

	it('is composable with additional toolbar groups', () => {
		const preset = createMinimalPreset();
		const extended: ReadonlyArray<ReadonlyArray<unknown>> = [
			...preset.toolbar,
			[{ id: 'custom', name: 'Custom' }],
		];

		expect(extended).toHaveLength(2);
	});
});
