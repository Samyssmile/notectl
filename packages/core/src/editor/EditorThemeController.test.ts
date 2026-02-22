import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorThemeController } from './EditorThemeController.js';
import { ThemePreset } from './theme/ThemeTokens.js';

function createShadow(): ShadowRoot {
	const host: HTMLElement = document.createElement('div');
	return host.attachShadow({ mode: 'open' });
}

describe('EditorThemeController', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('applies a light theme stylesheet to the shadow root', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		controller.apply(ThemePreset.Light);

		expect(shadow.adoptedStyleSheets).toHaveLength(2);
		const themeCss: string = shadow.adoptedStyleSheets[0]?.cssRules
			? Array.from(shadow.adoptedStyleSheets[0].cssRules)
					.map((r) => r.cssText)
					.join('')
			: '';
		expect(themeCss).toContain('--notectl-bg');
	});

	it('applies a dark theme stylesheet to the shadow root', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		controller.apply(ThemePreset.Dark);

		expect(shadow.adoptedStyleSheets).toHaveLength(2);
	});

	it('reuses the same CSSStyleSheet across apply calls', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		controller.apply(ThemePreset.Light);
		const firstSheet = shadow.adoptedStyleSheets[0];
		if (!firstSheet) return;

		controller.apply(ThemePreset.Dark);
		const secondSheet = shadow.adoptedStyleSheets[0];

		expect(firstSheet).toBe(secondSheet);
	});

	it('destroy cleans up the system theme listener', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		const removeSpy = vi.fn();
		const fakeQuery = {
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: removeSpy,
		} as unknown as MediaQueryList;
		vi.spyOn(window, 'matchMedia').mockReturnValue(fakeQuery);

		controller.apply(ThemePreset.System);
		expect(fakeQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

		controller.destroy();
		expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
	});

	it('includes plugin stylesheets in adoptedStyleSheets', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		controller.apply(ThemePreset.Light);
		const baseCount: number = shadow.adoptedStyleSheets.length;

		const sheet: CSSStyleSheet = new CSSStyleSheet();
		sheet.replaceSync('.plugin { color: red; }');
		controller.setPluginStyleSheets([sheet]);

		expect(shadow.adoptedStyleSheets).toHaveLength(baseCount + 1);
		expect(shadow.adoptedStyleSheets).toContain(sheet);
	});

	it('switches from system to preset without leaking listeners', () => {
		const shadow: ShadowRoot = createShadow();
		const controller = new EditorThemeController(shadow);

		const removeSpy = vi.fn();
		const fakeQuery = {
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: removeSpy,
		} as unknown as MediaQueryList;
		vi.spyOn(window, 'matchMedia').mockReturnValue(fakeQuery);

		controller.apply(ThemePreset.System);
		controller.apply(ThemePreset.Light);

		expect(removeSpy).toHaveBeenCalledOnce();
	});
});
