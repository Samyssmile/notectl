import { describe, expect, it, vi } from 'vitest';
import * as StyleRuntime from '../style/StyleRuntime.js';
import { EditorStyleCoordinator } from './EditorStyleCoordinator.js';
import type { EditorThemeController } from './EditorThemeController.js';

vi.mock('../style/StyleRuntime.js', () => ({
	createRuntimeStyleSheet: vi.fn(() => new CSSStyleSheet()),
	registerStyleRoot: vi.fn(),
	unregisterStyleRoot: vi.fn(),
}));

function mockThemeController(): EditorThemeController {
	return {
		setRuntimeStyleSheets: vi.fn(),
	} as unknown as EditorThemeController;
}

function mockShadowRoot(): ShadowRoot {
	return {} as unknown as ShadowRoot;
}

describe('EditorStyleCoordinator', () => {
	describe('setup', () => {
		it('unregisters existing style root before registering new one', () => {
			const coordinator = new EditorStyleCoordinator();
			const shadow: ShadowRoot = mockShadowRoot();

			coordinator.setup(shadow, undefined, null);

			expect(StyleRuntime.unregisterStyleRoot).toHaveBeenCalledWith(shadow);
			expect(StyleRuntime.registerStyleRoot).toHaveBeenCalledWith(shadow, {
				nonce: undefined,
				sheet: expect.any(CSSStyleSheet),
			});
		});

		it('creates a runtime stylesheet', () => {
			const coordinator = new EditorStyleCoordinator();
			const shadow: ShadowRoot = mockShadowRoot();

			coordinator.setup(shadow, undefined, null);

			expect(StyleRuntime.createRuntimeStyleSheet).toHaveBeenCalled();
		});

		it('passes nonce to registerStyleRoot', () => {
			const coordinator = new EditorStyleCoordinator();
			const shadow: ShadowRoot = mockShadowRoot();

			coordinator.setup(shadow, 'test-nonce', null);

			expect(StyleRuntime.registerStyleRoot).toHaveBeenCalledWith(shadow, {
				nonce: 'test-nonce',
				sheet: expect.any(CSSStyleSheet),
			});
		});

		it('sets runtime stylesheets on theme controller', () => {
			const coordinator = new EditorStyleCoordinator();
			const shadow: ShadowRoot = mockShadowRoot();
			const themeCtrl: EditorThemeController = mockThemeController();

			coordinator.setup(shadow, undefined, themeCtrl);

			expect(themeCtrl.setRuntimeStyleSheets).toHaveBeenCalledWith([expect.any(CSSStyleSheet)]);
		});
	});

	describe('teardown', () => {
		it('unregisters style root', () => {
			const coordinator = new EditorStyleCoordinator();
			const shadow: ShadowRoot = mockShadowRoot();

			coordinator.teardown(shadow, null);

			expect(StyleRuntime.unregisterStyleRoot).toHaveBeenCalledWith(shadow);
		});

		it('clears runtime stylesheets on theme controller', () => {
			const coordinator = new EditorStyleCoordinator();
			const themeCtrl: EditorThemeController = mockThemeController();

			coordinator.teardown(null, themeCtrl);

			expect(themeCtrl.setRuntimeStyleSheets).toHaveBeenCalledWith([]);
		});

		it('handles null shadow root gracefully', () => {
			const coordinator = new EditorStyleCoordinator();

			expect(() => coordinator.teardown(null, null)).not.toThrow();
		});
	});
});
