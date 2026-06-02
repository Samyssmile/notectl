import { describe, expect, it, vi } from 'vitest';
import { MathField } from './MathField.js';
import type { MathFieldLocale, MathFieldOptions } from './MathFieldTypes.js';

const LOCALE: MathFieldLocale = {
	latexLabel: 'LaTeX',
	latexPlaceholder: 'e.g. x',
	previewLabel: 'Preview',
	emptyPreview: 'Nothing yet',
	altLabel: 'Description',
	altPlaceholder: 'optional',
	displayToggle: 'Display',
	sizeLabel: 'Size',
	sizeDefault: 'Default',
	commitInsert: 'Insert',
	commitUpdate: 'Update',
	cancel: 'Cancel',
	paletteLabel: 'Symbols',
	unknownCommand: (c: string) => `Unknown: ${c}`,
};

function makeField(overrides?: Partial<MathFieldOptions>): MathField {
	return new MathField({
		locale: LOCALE,
		mode: 'insert',
		onCommit: vi.fn(),
		onCancel: vi.fn(),
		...overrides,
	});
}

describe('MathField size control', () => {
	it('renders a labelled size select when fontSizes are provided', () => {
		const field = makeField({ fontSizes: [16, 24, 48] });
		const select = field.root.querySelector('select.notectl-formula-editor__size');
		expect(select).not.toBeNull();
		const labelFor = field.root.querySelector('label[for]')?.getAttribute('for');
		expect(field.root.querySelector(`#${(select as HTMLElement).id}`)).toBe(select);
		expect(labelFor).toBeTruthy();
		// Default option plus the three presets.
		expect((select as HTMLSelectElement).options.length).toBe(4);
	});

	it('omits the size control when no fontSizes are given', () => {
		const field = makeField();
		expect(field.root.querySelector('.notectl-formula-editor__size')).toBeNull();
	});

	it('getResult().fontSize defaults to empty (inherit)', () => {
		const field = makeField({ fontSizes: [16, 24, 48], initialLatex: 'x' });
		expect(field.getResult().fontSize).toBe('');
	});

	it('reflects initialFontSize and returns it from getResult', () => {
		const field = makeField({
			fontSizes: [16, 24, 48],
			initialFontSize: '24px',
			initialLatex: 'x',
		});
		const select = field.root.querySelector('.notectl-formula-editor__size') as HTMLSelectElement;
		expect(select.value).toBe('24px');
		expect(field.getResult().fontSize).toBe('24px');
	});

	it('preserves a current size that is not among the presets', () => {
		const field = makeField({ fontSizes: [16, 24], initialFontSize: '37px', initialLatex: 'x' });
		const select = field.root.querySelector('.notectl-formula-editor__size') as HTMLSelectElement;
		expect(select.value).toBe('37px');
		expect(field.getResult().fontSize).toBe('37px');
	});

	it('changing the select changes the committed size and scales the preview', () => {
		const field = makeField({ fontSizes: [16, 48], initialLatex: 'x' });
		const select = field.root.querySelector('.notectl-formula-editor__size') as HTMLSelectElement;
		select.value = '48px';
		select.dispatchEvent(new Event('change'));
		expect(field.getResult().fontSize).toBe('48px');
		const preview = field.root.querySelector('.notectl-formula-editor__preview') as HTMLElement;
		expect(preview.style.fontSize).toBe('48px');
	});
});

describe('MathField keyboard interaction', () => {
	function keydown(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
		);
	}

	function textareaOf(field: MathField): HTMLTextAreaElement {
		return field.root.querySelector('textarea') as HTMLTextAreaElement;
	}

	it('Escape cancels from the LaTeX field', () => {
		const onCancel = vi.fn();
		const field = makeField({ initialLatex: 'x', onCancel });
		keydown(textareaOf(field), 'Escape');
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('Enter commits the current formula', () => {
		const onCommit = vi.fn();
		const field = makeField({ initialLatex: 'a+b', onCommit });
		keydown(textareaOf(field), 'Enter');
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit.mock.calls[0]?.[0].latex).toBe('a+b');
	});

	it('Enter on an empty field cancels instead of committing', () => {
		const onCommit = vi.fn();
		const onCancel = vi.fn();
		const field = makeField({ onCommit, onCancel });
		keydown(textareaOf(field), 'Enter');
		expect(onCommit).not.toHaveBeenCalled();
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('Shift+Enter does not commit (allows a newline)', () => {
		const onCommit = vi.fn();
		const field = makeField({ initialLatex: 'x', onCommit });
		keydown(textareaOf(field), 'Enter', { shiftKey: true });
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('Tab keeps focus inside the dialog, moving to the next stop', () => {
		const field = makeField();
		document.body.appendChild(field.root);
		const textarea = textareaOf(field);
		const alt = field.root.querySelector('input.notectl-formula-editor__alt') as HTMLInputElement;
		textarea.focus();
		keydown(textarea, 'Tab');
		expect(field.root.contains(document.activeElement)).toBe(true);
		expect(document.activeElement).toBe(alt);
		field.root.remove();
	});

	it('inserts a palette snippet at the caret and honours the $0 marker', () => {
		const field = makeField({ initialLatex: '' });
		field.insertSnippet('\\frac{$0}{}');
		const textarea = textareaOf(field);
		expect(textarea.value).toBe('\\frac{}{}');
		expect(textarea.selectionStart).toBe('\\frac{'.length);
	});
});
