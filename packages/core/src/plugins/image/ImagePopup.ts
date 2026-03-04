/**
 * Renders the image insert popup with file upload and URL input,
 * following the same pattern as FontSizePopup.
 */

import { setStyleProperty, setStyleText } from '../../style/StyleRuntime.js';
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
	setStyleProperty(container, 'padding', '8px');
	setStyleProperty(container, 'minWidth', '240px');

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
	setStyleText(fileInput, 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;');

	const uploadBtn: HTMLButtonElement = document.createElement('button');
	uploadBtn.type = 'button';
	uploadBtn.textContent = config.locale.uploadFromComputer;
	uploadBtn.setAttribute('aria-label', config.locale.uploadAria);
	setStyleText(
		uploadBtn,
		'display:block;width:100%;padding:8px 12px;cursor:pointer;' +
			'text-align:center;box-sizing:border-box;' +
			'border:1px solid var(--notectl-border);border-radius:4px;' +
			'background:var(--notectl-surface-raised);color:var(--notectl-fg);',
	);

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
	setStyleText(
		separator,
		'display:flex;align-items:center;margin:8px 0;' +
			'color:var(--notectl-fg-muted);font-size:12px;',
	);

	const line1: HTMLSpanElement = document.createElement('span');
	setStyleText(line1, 'flex:1;height:1px;background:var(--notectl-border);');

	const orText: HTMLSpanElement = document.createElement('span');
	orText.textContent = locale.separator;
	setStyleText(orText, 'padding:0 8px;');

	const line2: HTMLSpanElement = document.createElement('span');
	setStyleText(line2, 'flex:1;height:1px;background:var(--notectl-border);');

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
	setStyleText(
		urlInput,
		'width:100%;padding:6px 8px;box-sizing:border-box;' +
			'border:1px solid var(--notectl-border);border-radius:4px;' +
			'background:var(--notectl-bg);color:var(--notectl-fg);',
	);

	const insertBtn: HTMLButtonElement = document.createElement('button');
	insertBtn.type = 'button';
	insertBtn.textContent = config.locale.insertButton;
	insertBtn.setAttribute('aria-label', config.locale.insertAria);
	setStyleText(
		insertBtn,
		'width:100%;padding:8px 12px;margin-top:4px;cursor:pointer;' +
			'border:1px solid var(--notectl-border);border-radius:4px;' +
			'background:var(--notectl-surface-raised);color:var(--notectl-fg);',
	);

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
