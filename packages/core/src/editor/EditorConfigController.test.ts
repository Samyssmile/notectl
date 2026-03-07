import { describe, expect, it, vi } from 'vitest';
import type { PluginManager } from '../plugins/PluginManager.js';
import { type ConfigControllerDeps, EditorConfigController } from './EditorConfigController.js';
import type { EditorThemeController } from './EditorThemeController.js';
import { ThemePreset } from './theme/ThemeTokens.js';

function createMockDeps(overrides?: Partial<ConfigControllerDeps>): ConfigControllerDeps {
	const contentElement: HTMLElement = document.createElement('div');
	contentElement.contentEditable = 'true';
	contentElement.setAttribute('data-default-placeholder', 'Start typing...');
	return {
		contentElement,
		editorWrapper: document.createElement('div'),
		pluginManager: { setReadOnly: vi.fn() } as unknown as PluginManager,
		themeController: { apply: vi.fn() } as unknown as EditorThemeController,
		applyPaperSize: vi.fn(),
		...overrides,
	};
}

describe('EditorConfigController', () => {
	describe('getConfig / setConfig / mergeConfig', () => {
		it('setConfig replaces entire config', () => {
			const ctrl = new EditorConfigController();
			ctrl.setConfig({ readonly: true });
			expect(ctrl.getConfig().readonly).toBe(true);
		});

		it('mergeConfig merges into existing', () => {
			const ctrl = new EditorConfigController();
			ctrl.setConfig({ readonly: true, placeholder: 'hello' });
			ctrl.mergeConfig({ placeholder: 'world' });

			expect(ctrl.getConfig().readonly).toBe(true);
			expect(ctrl.getConfig().placeholder).toBe('world');
		});
	});

	describe('applyAttribute', () => {
		it('applies placeholder attribute and persists to config', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('placeholder', 'Type here...', deps);

			expect(deps.contentElement?.getAttribute('data-placeholder')).toBe('Type here...');
			expect(ctrl.getConfig().placeholder).toBe('Type here...');
		});

		it('resets placeholder config when attribute is removed', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();
			ctrl.applyAttribute('placeholder', 'Type here...', deps);

			ctrl.applyAttribute('placeholder', null, deps);

			expect(ctrl.getConfig().placeholder).toBeUndefined();
			expect(deps.contentElement?.getAttribute('data-placeholder')).toBe('Start typing...');
		});

		it('applies readonly attribute', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('readonly', '', deps);

			expect(deps.contentElement?.contentEditable).toBe('false');
			expect(deps.contentElement?.getAttribute('aria-readonly')).toBe('true');
			expect(ctrl.getConfig().readonly).toBe(true);
			expect(deps.pluginManager?.setReadOnly).toHaveBeenCalledWith(true);
		});

		it('removes readonly when value is null', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();
			ctrl.applyAttribute('readonly', '', deps);

			ctrl.applyAttribute('readonly', null, deps);

			expect(deps.contentElement?.contentEditable).toBe('true');
			expect(deps.contentElement?.getAttribute('aria-readonly')).toBeNull();
			expect(ctrl.getConfig().readonly).toBe(false);
		});

		it('applies theme attribute and persists to config', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('theme', 'dark', deps);

			expect(deps.themeController?.apply).toHaveBeenCalledWith('dark');
			expect(ctrl.getConfig().theme).toBe('dark');
		});

		it('resets theme config when attribute is removed', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();
			ctrl.applyAttribute('theme', 'dark', deps);

			ctrl.applyAttribute('theme', null, deps);

			expect(ctrl.getConfig().theme).toBeUndefined();
			expect(deps.themeController?.apply).toHaveBeenLastCalledWith(ThemePreset.Light);
		});

		it('applies dir attribute', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('dir', 'rtl', deps);

			expect(deps.contentElement?.getAttribute('dir')).toBe('rtl');
			expect(deps.editorWrapper?.getAttribute('dir')).toBe('rtl');
		});

		it('removes dir when value is invalid', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();
			ctrl.applyAttribute('dir', 'rtl', deps);

			ctrl.applyAttribute('dir', null, deps);

			expect(deps.contentElement?.getAttribute('dir')).toBeNull();
			expect(deps.editorWrapper?.getAttribute('dir')).toBeNull();
		});

		it('persists placeholder and theme even when deps are null (pre-init)', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps({
				contentElement: null,
				themeController: null,
			});

			ctrl.applyAttribute('placeholder', 'Write something...', deps);
			ctrl.applyAttribute('theme', 'dark', deps);

			expect(ctrl.getConfig().placeholder).toBe('Write something...');
			expect(ctrl.getConfig().theme).toBe('dark');
		});

		it('applies paper-size attribute', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('paper-size', 'din-a4', deps);

			expect(deps.applyPaperSize).toHaveBeenCalledWith('din-a4');
		});

		it('removes paper-size when null', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyAttribute('paper-size', null, deps);

			expect(deps.applyPaperSize).toHaveBeenCalledWith(undefined);
		});
	});

	describe('applyRuntimeConfig', () => {
		it('applies placeholder', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyRuntimeConfig({ placeholder: 'New text...' }, deps);

			expect(deps.contentElement?.getAttribute('data-placeholder')).toBe('New text...');
			expect(ctrl.getConfig().placeholder).toBe('New text...');
		});

		it('applies readonly', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyRuntimeConfig({ readonly: true }, deps);

			expect(deps.contentElement?.contentEditable).toBe('false');
			expect(ctrl.getConfig().readonly).toBe(true);
		});

		it('applies paperSize', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyRuntimeConfig({ paperSize: 'letter' as never }, deps);

			expect(deps.applyPaperSize).toHaveBeenCalledWith('letter');
		});

		it('applies dir', () => {
			const ctrl = new EditorConfigController();
			const deps: ConfigControllerDeps = createMockDeps();

			ctrl.applyRuntimeConfig({ dir: 'rtl' }, deps);

			expect(deps.contentElement?.getAttribute('dir')).toBe('rtl');
		});
	});

	describe('applyTheme', () => {
		it('updates config and calls controller', () => {
			const ctrl = new EditorConfigController();
			const mockThemeCtrl = { apply: vi.fn() } as unknown as EditorThemeController;

			ctrl.applyTheme(ThemePreset.Dark, mockThemeCtrl);

			expect(ctrl.getTheme()).toBe(ThemePreset.Dark);
			expect(mockThemeCtrl.apply).toHaveBeenCalledWith(ThemePreset.Dark);
		});
	});

	describe('isReadOnly', () => {
		it('returns false by default', () => {
			const ctrl = new EditorConfigController();
			expect(ctrl.isReadOnly).toBe(false);
		});

		it('returns true after setting readonly', () => {
			const ctrl = new EditorConfigController();
			ctrl.setConfig({ readonly: true });
			expect(ctrl.isReadOnly).toBe(true);
		});
	});
});
