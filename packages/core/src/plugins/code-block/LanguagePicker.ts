/**
 * Language picker popup for code blocks.
 * Opens a listbox dropdown anchored to the language button,
 * allowing users to select a syntax highlighting language.
 */

import { attachListboxKeyboard } from '../shared/PopupKeyboardPatterns.js';
import type { PopupServiceAPI } from '../shared/PopupManager.js';
import type { CodeBlockLocale } from './CodeBlockLocale.js';

/** Configuration for opening the language picker popup. */
export interface LanguagePickerConfig {
	readonly anchor: HTMLElement;
	readonly languages: readonly string[];
	readonly currentLanguage: string;
	readonly onSelect: (language: string) => void;
	readonly popupManager: PopupServiceAPI;
	readonly locale: CodeBlockLocale;
}

const OPTION_SELECTOR = '[role="option"]';

/** Opens a language picker popup anchored to the given element. */
export function openLanguagePicker(config: LanguagePickerConfig): void {
	const { anchor, languages, currentLanguage, onSelect, popupManager, locale } = config;

	popupManager.open({
		anchor,
		ariaRole: 'listbox',
		ariaLabel: locale.selectLanguageAria,
		className: 'notectl-language-picker',
		position: 'below-start',
		restoreFocusTo: anchor,
		content(container, close) {
			const normalizedCurrent: string = currentLanguage.toLowerCase();

			// "plain" option is always first
			appendOption(container, locale.plainText, '', normalizedCurrent === '');

			// Language options sorted alphabetically
			const sorted: readonly string[] = [...languages].sort((a, b) => a.localeCompare(b));
			for (const lang of sorted) {
				appendOption(container, lang, lang, normalizedCurrent === lang.toLowerCase());
			}

			attachListboxKeyboard({
				container,
				itemSelector: OPTION_SELECTOR,
				onSelect(item) {
					const value: string = item.getAttribute('data-language') ?? '';
					onSelect(value);
					close();
				},
				onClose() {
					close();
				},
			});

			container.addEventListener('click', (e: Event) => {
				const target: HTMLElement | null = (e.target as HTMLElement).closest(OPTION_SELECTOR);
				if (!target) return;
				const value: string = target.getAttribute('data-language') ?? '';
				onSelect(value);
				close();
			});
		},
	});

	anchor.setAttribute('aria-expanded', 'true');
}

function appendOption(
	container: HTMLElement,
	label: string,
	value: string,
	selected: boolean,
): void {
	const option: HTMLDivElement = document.createElement('div');
	option.className = 'notectl-language-picker__option';
	option.setAttribute('role', 'option');
	option.setAttribute('data-language', value);
	option.setAttribute('aria-selected', String(selected));
	option.setAttribute('tabindex', selected ? '0' : '-1');
	option.textContent = label;
	container.appendChild(option);
}
