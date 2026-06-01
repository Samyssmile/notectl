/**
 * Accessible math field (Layer A, zero notectl imports).
 *
 * A self-contained formula authoring surface: LaTeX source field, live MathML
 * preview, accessible description, display toggle, and structural palette. The
 * LaTeX field is the primary fully-accessible authoring path (linear, keyboard,
 * screen-reader friendly); unknown commands are surfaced visibly and announced
 * via a live region rather than swallowed. Emits MathML/LaTeX through callbacks.
 */

import { latexToMathML } from '../latex/index.js';
import { buildMathML } from '../mathml/index.js';
import type { MathFieldOptions, MathFieldResult } from './MathFieldTypes.js';
import { MathPalette } from './MathPalette.js';

let uidCounter = 0;

export class MathField {
	/** The field's root element; mount this wherever the formula is edited. */
	readonly root: HTMLElement;

	private readonly options: MathFieldOptions;
	private readonly textarea: HTMLTextAreaElement;
	private readonly preview: HTMLElement;
	private readonly previewEmpty: HTMLElement;
	private readonly errorsList: HTMLElement;
	private readonly altInput: HTMLInputElement;
	private readonly commitBtn: HTMLButtonElement;
	private display: boolean;
	private lastErrorKey = '';

	constructor(options: MathFieldOptions) {
		this.options = options;
		this.display = options.initialDisplay ?? false;
		const uid: number = ++uidCounter;

		this.root = document.createElement('div');
		this.root.className = 'notectl-formula-editor';
		this.root.setAttribute('role', 'group');
		this.root.setAttribute('aria-label', options.locale.latexLabel);

		if (options.palette && options.palette.length > 0) {
			const palette = new MathPalette(options.palette, options.locale.paletteLabel, (s) =>
				this.insertSnippet(s),
			);
			this.root.appendChild(palette.root);
		}

		this.textarea = this.buildLatexField(uid);
		this.preview = document.createElement('div');
		this.previewEmpty = document.createElement('div');
		this.errorsList = document.createElement('ul');
		this.altInput = this.buildAltField(uid);
		this.commitBtn = document.createElement('button');

		this.root.appendChild(this.buildPreview());
		this.root.appendChild(this.errorsList);
		this.root.appendChild(this.altInput.parentElement as HTMLElement);
		if (options.mode === 'insert') this.root.appendChild(this.buildDisplayToggle(uid));
		this.root.appendChild(this.buildActions());

		this.errorsList.className = 'notectl-formula-editor__errors';
		this.errorsList.id = `notectl-formula-errors-${uid}`;
		this.errorsList.setAttribute('aria-live', 'polite');
		this.textarea.setAttribute('aria-describedby', this.errorsList.id);

		this.update();
	}

	/** Focuses the LaTeX field. */
	focus(): void {
		this.textarea.focus();
		this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
	}

	/** Builds the committed result (canonical MathML + LaTeX + alt + display). */
	getResult(): MathFieldResult {
		const latex: string = this.textarea.value.trim();
		const alt: string = this.altInput.value.trim();
		const { presentation } = latexToMathML(latex, { display: this.display });
		const mathml: string = buildMathML({
			presentation,
			latex,
			display: this.display,
			alt: alt || undefined,
		});
		return { latex, mathml, alt, display: this.display };
	}

	/** Inserts a LaTeX snippet at the caret, honouring an optional `$0` caret marker. */
	insertSnippet(snippet: string): void {
		const start: number = this.textarea.selectionStart ?? this.textarea.value.length;
		const end: number = this.textarea.selectionEnd ?? start;
		const markerAt: number = snippet.indexOf('$0');
		const text: string = markerAt >= 0 ? snippet.replace('$0', '') : snippet;
		const caretOffset: number = markerAt >= 0 ? markerAt : text.length;

		const value: string = this.textarea.value;
		this.textarea.value = value.slice(0, start) + text + value.slice(end);
		const caret: number = start + caretOffset;
		this.textarea.focus();
		this.textarea.setSelectionRange(caret, caret);
		this.update();
	}

	private buildLatexField(uid: number): HTMLTextAreaElement {
		const field: HTMLDivElement = document.createElement('div');
		field.className = 'notectl-formula-editor__field';
		const label: HTMLLabelElement = document.createElement('label');
		label.className = 'notectl-formula-editor__label';
		label.htmlFor = `notectl-formula-latex-${uid}`;
		label.textContent = this.options.locale.latexLabel;
		const textarea: HTMLTextAreaElement = document.createElement('textarea');
		textarea.id = `notectl-formula-latex-${uid}`;
		textarea.className = 'notectl-formula-editor__input';
		textarea.placeholder = this.options.locale.latexPlaceholder;
		textarea.rows = 2;
		textarea.spellcheck = false;
		textarea.value = this.options.initialLatex ?? '';
		textarea.addEventListener('input', () => this.update());
		textarea.addEventListener('keydown', (e: KeyboardEvent) => this.onTextareaKeydown(e));
		field.appendChild(label);
		field.appendChild(textarea);
		this.root.appendChild(field);
		return textarea;
	}

	private buildPreview(): HTMLElement {
		const field: HTMLDivElement = document.createElement('div');
		field.className = 'notectl-formula-editor__field';
		const label: HTMLSpanElement = document.createElement('span');
		label.className = 'notectl-formula-editor__label';
		label.textContent = this.options.locale.previewLabel;
		this.preview.className = 'notectl-formula-editor__preview';
		this.previewEmpty.className = 'notectl-formula-editor__preview-empty';
		this.previewEmpty.textContent = this.options.locale.emptyPreview;
		field.appendChild(label);
		field.appendChild(this.previewEmpty);
		field.appendChild(this.preview);
		return field;
	}

	private buildAltField(uid: number): HTMLInputElement {
		const field: HTMLDivElement = document.createElement('div');
		field.className = 'notectl-formula-editor__field';
		const label: HTMLLabelElement = document.createElement('label');
		label.className = 'notectl-formula-editor__label';
		label.htmlFor = `notectl-formula-alt-${uid}`;
		label.textContent = this.options.locale.altLabel;
		const input: HTMLInputElement = document.createElement('input');
		input.id = `notectl-formula-alt-${uid}`;
		input.type = 'text';
		input.className = 'notectl-formula-editor__alt';
		input.placeholder = this.options.locale.altPlaceholder;
		input.value = this.options.initialAlt ?? '';
		field.appendChild(label);
		field.appendChild(input);
		return input;
	}

	private buildDisplayToggle(uid: number): HTMLElement {
		const wrapper: HTMLLabelElement = document.createElement('label');
		wrapper.className = 'notectl-formula-editor__toggle';
		wrapper.htmlFor = `notectl-formula-display-${uid}`;
		const checkbox: HTMLInputElement = document.createElement('input');
		checkbox.id = `notectl-formula-display-${uid}`;
		checkbox.type = 'checkbox';
		checkbox.checked = this.display;
		checkbox.addEventListener('change', () => {
			this.display = checkbox.checked;
			this.update();
		});
		const text: HTMLSpanElement = document.createElement('span');
		text.textContent = this.options.locale.displayToggle;
		wrapper.appendChild(checkbox);
		wrapper.appendChild(text);
		return wrapper;
	}

	private buildActions(): HTMLElement {
		const actions: HTMLDivElement = document.createElement('div');
		actions.className = 'notectl-formula-editor__actions';
		const cancel: HTMLButtonElement = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'notectl-formula-editor__btn';
		cancel.textContent = this.options.locale.cancel;
		cancel.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		});
		cancel.addEventListener('click', () => this.options.onCancel());
		this.commitBtn.type = 'button';
		this.commitBtn.className = 'notectl-formula-editor__btn notectl-formula-editor__btn--primary';
		this.commitBtn.textContent =
			this.options.mode === 'edit'
				? this.options.locale.commitUpdate
				: this.options.locale.commitInsert;
		this.commitBtn.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		});
		this.commitBtn.addEventListener('click', () => this.commit());
		actions.appendChild(cancel);
		actions.appendChild(this.commitBtn);
		return actions;
	}

	private onTextareaKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			this.commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			this.options.onCancel();
		}
	}

	private commit(): void {
		const result: MathFieldResult = this.getResult();
		if (!result.latex) {
			this.options.onCancel();
			return;
		}
		this.options.onCommit(result);
	}

	private update(): void {
		const latex: string = this.textarea.value.trim();
		if (!latex) {
			this.preview.innerHTML = '';
			this.previewEmpty.hidden = false;
			this.renderErrors([]);
			return;
		}
		this.previewEmpty.hidden = true;
		const { presentation, errors } = latexToMathML(latex, { display: this.display });
		this.preview.innerHTML = buildMathML({ presentation, display: this.display });
		this.renderErrors(errors.map((err) => err.command ?? err.message));
	}

	private renderErrors(commands: readonly string[]): void {
		const key: string = commands.join('');
		if (key === this.lastErrorKey) return;
		this.lastErrorKey = key;
		this.errorsList.replaceChildren();
		for (const command of commands) {
			const li: HTMLLIElement = document.createElement('li');
			li.textContent = command.startsWith('\\')
				? this.options.locale.unknownCommand(command)
				: command;
			this.errorsList.appendChild(li);
		}
	}
}
