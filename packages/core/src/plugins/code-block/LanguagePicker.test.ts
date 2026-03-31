import { describe, expect, it, vi } from 'vitest';
import { CODE_BLOCK_LOCALE_EN } from './CodeBlockLocale.js';
import { type LanguagePickerConfig, openLanguagePicker } from './LanguagePicker.js';

function createMockPopupManager() {
	let contentContainer: HTMLElement | null = null;
	let closeFn: (() => void) | null = null;

	return {
		open: vi.fn((config) => {
			contentContainer = document.createElement('div');
			closeFn = vi.fn();
			config.content(contentContainer, closeFn);
			return {
				close: closeFn,
				getElement: () => contentContainer as HTMLElement,
			};
		}),
		close: vi.fn(),
		closeAll: vi.fn(),
		isOpen: vi.fn(() => true),
		getContainer: () => contentContainer,
		getCloseFn: () => closeFn,
	};
}

function createConfig(overrides: Partial<LanguagePickerConfig> = {}): LanguagePickerConfig & {
	mockPopup: ReturnType<typeof createMockPopupManager>;
} {
	const mockPopup = createMockPopupManager();
	const anchor: HTMLButtonElement = document.createElement('button');
	anchor.setAttribute('aria-expanded', 'false');

	return {
		anchor,
		languages: ['java', 'json', 'xml'],
		currentLanguage: 'java',
		onSelect: vi.fn(),
		popupManager: mockPopup,
		locale: CODE_BLOCK_LOCALE_EN,
		mockPopup,
		...overrides,
	};
}

describe('LanguagePicker', () => {
	describe('popup creation', () => {
		it('opens popup via PopupManager', () => {
			const config = createConfig();
			openLanguagePicker(config);

			expect(config.mockPopup.open).toHaveBeenCalledOnce();
		});

		it('sets aria-expanded on anchor when opened', () => {
			const config = createConfig();
			openLanguagePicker(config);

			expect(config.anchor.getAttribute('aria-expanded')).toBe('true');
		});

		it('opens with listbox role and aria-label', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const popupConfig = config.mockPopup.open.mock.calls[0]?.[0];
			expect(popupConfig.ariaRole).toBe('listbox');
			expect(popupConfig.ariaLabel).toBe('Select language');
		});

		it('restores focus to anchor on close', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const popupConfig = config.mockPopup.open.mock.calls[0]?.[0];
			expect(popupConfig.restoreFocusTo).toBe(config.anchor);
		});
	});

	describe('option rendering', () => {
		it('renders plain option first', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const options = container?.querySelectorAll('[role="option"]');
			expect(options?.[0]?.textContent).toBe('plain');
		});

		it('renders all language options sorted alphabetically', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const options = container?.querySelectorAll('[role="option"]');

			// plain + java + json + xml = 4 options
			expect(options?.length).toBe(4);
			// plain first, then alphabetical: java, json, xml
			expect(options?.[1]?.textContent).toBe('java');
			expect(options?.[2]?.textContent).toBe('json');
			expect(options?.[3]?.textContent).toBe('xml');
		});

		it('marks current language as selected', () => {
			const config = createConfig({ currentLanguage: 'java' });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const javaOption = container?.querySelector('[data-language="java"]');
			expect(javaOption?.getAttribute('aria-selected')).toBe('true');
		});

		it('marks plain as selected when no language set', () => {
			const config = createConfig({ currentLanguage: '' });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const plainOption = container?.querySelector('[data-language=""]');
			expect(plainOption?.getAttribute('aria-selected')).toBe('true');
		});

		it('sets data-language attribute on each option', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const plainOption = container?.querySelector('[data-language=""]');
			const javaOption = container?.querySelector('[data-language="java"]');
			expect(plainOption).not.toBeNull();
			expect(javaOption).not.toBeNull();
		});

		it('sets tabindex 0 on selected option and -1 on others', () => {
			const config = createConfig({ currentLanguage: 'json' });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const jsonOption = container?.querySelector('[data-language="json"]');
			const javaOption = container?.querySelector('[data-language="java"]');
			expect(jsonOption?.getAttribute('tabindex')).toBe('0');
			expect(javaOption?.getAttribute('tabindex')).toBe('-1');
		});
	});

	describe('selection via click', () => {
		it('calls onSelect with language value on click', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const xmlOption = container?.querySelector('[data-language="xml"]') as HTMLElement | null;
			xmlOption?.click();

			expect(config.onSelect).toHaveBeenCalledWith('xml');
		});

		it('calls onSelect with empty string for plain option', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const plainOption = container?.querySelector('[data-language=""]') as HTMLElement | null;
			plainOption?.click();

			expect(config.onSelect).toHaveBeenCalledWith('');
		});

		it('closes popup after click selection', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const javaOption = container?.querySelector('[data-language="java"]') as HTMLElement | null;
			javaOption?.click();

			expect(config.mockPopup.getCloseFn()).toHaveBeenCalled();
		});
	});

	describe('keyboard navigation', () => {
		it('closes popup on Escape', () => {
			const config = createConfig();
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
			container?.dispatchEvent(event);

			expect(config.mockPopup.getCloseFn()).toHaveBeenCalled();
		});

		it('selects first option on Enter key without navigation', () => {
			const config = createConfig({ currentLanguage: '' });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
			container?.dispatchEvent(event);

			expect(config.onSelect).toHaveBeenCalledWith('');
		});

		it('selects navigated option on Enter key after ArrowDown', () => {
			const config = createConfig({ currentLanguage: '' });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			// Navigate down once to reach first language option
			container?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			container?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			expect(config.onSelect).toHaveBeenCalledWith('java');
		});
	});

	describe('empty languages list', () => {
		it('renders only plain option when no languages provided', () => {
			const config = createConfig({ languages: [] });
			openLanguagePicker(config);

			const container: HTMLElement | null = config.mockPopup.getContainer();
			const options = container?.querySelectorAll('[role="option"]');
			expect(options?.length).toBe(1);
			expect(options?.[0]?.textContent).toBe('plain');
		});
	});
});
