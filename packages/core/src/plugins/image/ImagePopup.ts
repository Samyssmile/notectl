/**
 * Renders the image insert popup with file upload and URL input,
 * following the same pattern as FontSizePopup.
 */

import type { PluginContext } from '../Plugin.js';
import { insertImage } from './ImageCommands.js';
import type { ImageLocale } from './ImageLocale.js';

// --- Config ---

export interface ImagePopupConfig {
	readonly acceptedTypes: readonly string[];
	readonly locale: ImageLocale;
	readonly onFileInsert: (context: PluginContext, file: File) => void;
	readonly onClose: () => void;
}

// --- Public Entry Point ---

/** Builds the image insert popup DOM inside the given container. */
export function renderImagePopup(
	container: HTMLElement,
	context: PluginContext,
	config: ImagePopupConfig,
): void {
	container.classList.add('notectl-image-popup');

	appendFileUploadSection(container, context, config);
	appendSeparator(container, config.locale);
	appendUrlSection(container, context, config);
}

// --- File Upload Section ---

function appendFileUploadSection(
	container: HTMLElement,
	context: PluginContext,
	config: ImagePopupConfig,
): void {
	const fileInput: HTMLInputElement = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = config.acceptedTypes.join(',');
	fileInput.className = 'notectl-image-popup__file-input';

	const uploadBtn: HTMLButtonElement = document.createElement('button');
	uploadBtn.type = 'button';
	uploadBtn.textContent = config.locale.uploadFromComputer;
	uploadBtn.setAttribute('aria-label', config.locale.uploadAria);
	uploadBtn.className = 'notectl-image-popup__upload-btn';

	uploadBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		fileInput.click();
	});

	fileInput.addEventListener('change', () => {
		const file: File | undefined = fileInput.files?.[0];
		if (file) {
			config.onFileInsert(context, file);
			config.onClose();
			context.getContainer().focus();
		}
	});

	container.appendChild(fileInput);
	container.appendChild(uploadBtn);
}

// --- Separator ---

function appendSeparator(container: HTMLElement, locale: ImageLocale): void {
	const separator: HTMLDivElement = document.createElement('div');
	separator.className = 'notectl-image-popup__separator';

	const line1: HTMLSpanElement = document.createElement('span');
	line1.className = 'notectl-image-popup__separator-line';

	const orText: HTMLSpanElement = document.createElement('span');
	orText.textContent = locale.separator;
	orText.className = 'notectl-image-popup__separator-text';

	const line2: HTMLSpanElement = document.createElement('span');
	line2.className = 'notectl-image-popup__separator-line';

	separator.appendChild(line1);
	separator.appendChild(orText);
	separator.appendChild(line2);
	container.appendChild(separator);
}

// --- URL Input Section ---

function appendUrlSection(
	container: HTMLElement,
	context: PluginContext,
	config: ImagePopupConfig,
): void {
	const urlInput: HTMLInputElement = document.createElement('input');
	urlInput.type = 'url';
	urlInput.placeholder = config.locale.urlPlaceholder;
	urlInput.setAttribute('aria-label', config.locale.urlAria);
	urlInput.className = 'notectl-image-popup__url-input';

	const insertBtn: HTMLButtonElement = document.createElement('button');
	insertBtn.type = 'button';
	insertBtn.textContent = config.locale.insertButton;
	insertBtn.setAttribute('aria-label', config.locale.insertAria);
	insertBtn.className = 'notectl-image-popup__insert-btn';

	const applyUrl = (): void => {
		const src: string = urlInput.value.trim();
		if (src) {
			insertImage(context, { src });
			config.onClose();
			context.getContainer().focus();
		}
	};

	insertBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		applyUrl();
	});

	urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyUrl();
		}
	});

	container.appendChild(urlInput);
	container.appendChild(insertBtn);

	requestAnimationFrame(() => urlInput.focus());
}
