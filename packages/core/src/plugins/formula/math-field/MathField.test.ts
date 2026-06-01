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
