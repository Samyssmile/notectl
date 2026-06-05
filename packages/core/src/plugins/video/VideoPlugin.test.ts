import { afterEach, describe, expect, it } from 'vitest';
import type { EditorState } from '../../state/EditorState.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { VideoPlugin } from './VideoPlugin.js';

function baseState(): EditorState {
	return stateBuilder()
		.paragraph('', 'b1')
		.cursor('b1', 0)
		.schema(['paragraph', 'video'], [])
		.build();
}

describe('VideoPlugin', () => {
	let plugin: VideoPlugin | null = null;
	afterEach(() => {
		plugin?.destroy();
		plugin = null;
	});

	it('registers the video node as a void, selectable block that allows iframe through sanitize', async () => {
		plugin = new VideoPlugin();
		const h = await pluginHarness(plugin, baseState());
		const spec = h.getNodeSpec('video');
		expect(spec?.isVoid).toBe(true);
		expect(spec?.selectable).toBe(true);
		expect(spec?.sanitize?.tags).toContain('iframe');
		expect(spec?.sanitize?.tags).toContain('figure');
	});

	it('registers an insert toolbar item bound to the insertVideo command', async () => {
		plugin = new VideoPlugin();
		const h = await pluginHarness(plugin, baseState());
		const item = h.getToolbarItem('video');
		expect(item?.group).toBe('insert');
		expect(item?.command).toBe('insertVideo');
	});

	it('registers the removeVideo command and resize keymaps', async () => {
		plugin = new VideoPlugin();
		const h = await pluginHarness(plugin, baseState());
		// removeVideo is a no-op without a selected video but must be registered.
		expect(h.executeCommand('removeVideo')).toBe(false);
		const bindings = h.getKeymaps().flatMap((k) => Object.keys(k));
		expect(bindings).toContain('Mod-Shift-ArrowRight');
	});
});
