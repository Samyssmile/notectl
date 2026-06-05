/**
 * Shared insert/edit form for videos: URL, accessible title (required), optional
 * caption, and aspect ratio. Used both by the toolbar insert popup and the
 * on-selection edit panel.
 *
 * Accessibility: every field has a programmatic label, the title field is
 * `aria-required` and blocks submission until filled (the iframe accessible name
 * is a Level A requirement), and validation errors are surfaced through a
 * `role="alert"` live region plus focus management.
 */

import type { VideoLocale } from './VideoLocale.js';
import { parseVideoUrl } from './VideoProviders.js';
import type { VideoPluginConfig } from './VideoTypes.js';

/** Initial field values when editing an existing video. */
export interface VideoFormInitial {
	readonly url?: string;
	readonly title?: string;
	readonly caption?: string;
	readonly aspectRatio?: string;
}

/** Validated form output passed to the submit handler. */
export interface VideoFormValues {
	readonly url: string;
	readonly title: string;
	readonly caption: string;
	readonly aspectRatio: string;
}

export interface VideoFormOptions {
	readonly mode: 'insert' | 'edit';
	readonly initial?: VideoFormInitial;
	readonly config: VideoPluginConfig;
	readonly locale: VideoLocale;
	/** Applies the change. The form has already validated URL + title. */
	readonly onSubmit: (values: VideoFormValues) => void;
	readonly onClose: () => void;
}

let formIdCounter = 0;

/** Returns a process-unique element id for label/aria associations. */
function nextFieldId(prefix: string): string {
	formIdCounter += 1;
	return `${prefix}-${formIdCounter}`;
}

/** Builds a labeled text field; returns the input element. */
function appendField(
	container: HTMLElement,
	options: {
		label: string;
		ariaLabel: string;
		placeholder: string;
		value: string;
		type: 'url' | 'text';
		required?: boolean;
		hint?: string;
		describedBy?: string;
	},
): HTMLInputElement {
	const id = nextFieldId('notectl-video-field');
	const wrapper: HTMLDivElement = document.createElement('div');
	wrapper.className = 'notectl-video-popup__field';

	const label: HTMLLabelElement = document.createElement('label');
	label.className = 'notectl-video-popup__label';
	label.setAttribute('for', id);
	label.textContent = options.label;
	wrapper.appendChild(label);

	const input: HTMLInputElement = document.createElement('input');
	input.id = id;
	input.type = options.type;
	input.value = options.value;
	input.placeholder = options.placeholder;
	input.className = 'notectl-video-popup__input';
	input.setAttribute('aria-label', options.ariaLabel);
	if (options.required) input.setAttribute('aria-required', 'true');

	const describedByIds: string[] = [];
	if (options.hint) {
		const hintId = `${id}-hint`;
		const hint: HTMLParagraphElement = document.createElement('p');
		hint.id = hintId;
		hint.className = 'notectl-video-popup__hint';
		hint.textContent = options.hint;
		wrapper.appendChild(hint);
		describedByIds.push(hintId);
	}
	if (options.describedBy) describedByIds.push(options.describedBy);
	if (describedByIds.length > 0) input.setAttribute('aria-describedby', describedByIds.join(' '));

	wrapper.insertBefore(input, wrapper.children[1] ?? null);
	container.appendChild(wrapper);
	return input;
}

/** Builds the labeled aspect-ratio select. */
function appendAspectRatioField(
	container: HTMLElement,
	config: VideoPluginConfig,
	locale: VideoLocale,
	value: string,
): HTMLSelectElement {
	const id = nextFieldId('notectl-video-field');
	const wrapper: HTMLDivElement = document.createElement('div');
	wrapper.className = 'notectl-video-popup__field';

	const label: HTMLLabelElement = document.createElement('label');
	label.className = 'notectl-video-popup__label';
	label.setAttribute('for', id);
	label.textContent = locale.aspectRatioLabel;
	wrapper.appendChild(label);

	const select: HTMLSelectElement = document.createElement('select');
	select.id = id;
	select.className = 'notectl-video-popup__select';
	select.setAttribute('aria-label', locale.aspectRatioAria);

	const ratios: readonly string[] = config.allowedAspectRatios.includes(value)
		? config.allowedAspectRatios
		: [value, ...config.allowedAspectRatios];
	for (const ratio of ratios) {
		const option: HTMLOptionElement = document.createElement('option');
		option.value = ratio;
		option.textContent = ratio;
		if (ratio === value) option.selected = true;
		select.appendChild(option);
	}
	wrapper.appendChild(select);
	container.appendChild(wrapper);
	return select;
}

/** Renders the video insert/edit form into the given container. */
export function renderVideoForm(container: HTMLElement, options: VideoFormOptions): void {
	const { config, locale, initial, mode } = options;
	container.classList.add('notectl-video-popup');

	const errorId = nextFieldId('notectl-video-error');
	const error: HTMLParagraphElement = document.createElement('p');
	error.id = errorId;
	error.className = 'notectl-video-popup__error';
	error.setAttribute('role', 'alert');

	const urlInput: HTMLInputElement = appendField(container, {
		label: locale.urlLabel,
		ariaLabel: locale.urlAria,
		placeholder: locale.urlPlaceholder,
		value: initial?.url ?? '',
		type: 'url',
		required: true,
		describedBy: errorId,
	});
	const titleInput: HTMLInputElement = appendField(container, {
		label: locale.titleLabel,
		ariaLabel: locale.titleAria,
		placeholder: locale.titlePlaceholder,
		value: initial?.title ?? '',
		type: 'text',
		required: true,
		hint: locale.titleHint,
	});
	const captionInput: HTMLInputElement = appendField(container, {
		label: locale.captionLabel,
		ariaLabel: locale.captionAria,
		placeholder: locale.captionPlaceholder,
		value: initial?.caption ?? '',
		type: 'text',
	});
	const ratioSelect: HTMLSelectElement = appendAspectRatioField(
		container,
		config,
		locale,
		initial?.aspectRatio ?? config.defaultAspectRatio,
	);

	container.appendChild(error);

	const actions: HTMLDivElement = document.createElement('div');
	actions.className = 'notectl-video-popup__actions';

	const cancelBtn: HTMLButtonElement = document.createElement('button');
	cancelBtn.type = 'button';
	cancelBtn.className = 'notectl-video-popup__cancel';
	cancelBtn.textContent = locale.cancelButton;

	const submitBtn: HTMLButtonElement = document.createElement('button');
	submitBtn.type = 'button';
	submitBtn.className = 'notectl-video-popup__submit';
	submitBtn.textContent = mode === 'edit' ? locale.updateButton : locale.insertButton;
	submitBtn.setAttribute('aria-label', mode === 'edit' ? locale.updateAria : locale.insertAria);

	actions.append(cancelBtn, submitBtn);
	container.appendChild(actions);

	const showError = (message: string, field: HTMLElement): void => {
		error.textContent = message;
		field.focus();
	};

	const submit = (): void => {
		const url: string = urlInput.value.trim();
		if (!parseVideoUrl(url, config.providers)) {
			showError(locale.invalidUrl, urlInput);
			return;
		}
		const title: string = titleInput.value.trim();
		if (!title) {
			showError(locale.titleRequired, titleInput);
			return;
		}
		error.textContent = '';
		options.onSubmit({
			url,
			title,
			caption: captionInput.value.trim(),
			aspectRatio: ratioSelect.value,
		});
		options.onClose();
	};

	cancelBtn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
	cancelBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		options.onClose();
	});
	submitBtn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
	submitBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		submit();
	});

	for (const input of [urlInput, titleInput, captionInput]) {
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		});
	}

	requestAnimationFrame(() => urlInput.focus());
}
