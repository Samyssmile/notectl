import { describe, expect, it } from 'vitest';
import { normalizeSource } from './SourceNormalizer.js';

function createContainer(html: string): HTMLElement {
	const template = document.createElement('template');
	template.innerHTML = html;
	const div = document.createElement('div');
	div.appendChild(template.content.cloneNode(true));
	return div;
}

describe('SourceNormalizer', () => {
	describe('source detection', () => {
		it('leaves browser content unchanged', () => {
			const html = '<p>Simple <strong>text</strong></p>';
			const container = createContainer(html);
			normalizeSource(html, container);

			expect(container.querySelector('p')).not.toBeNull();
			expect(container.querySelector('strong')).not.toBeNull();
		});
	});

	describe('Word normalization', () => {
		it('removes mso- styles', () => {
			const rawHTML = '<p class="MsoNormal">text</p>';
			const container = createContainer(
				'<p class="MsoNormal" style="mso-line-height: 1.5; color: red">text</p>',
			);
			normalizeSource(rawHTML, container);

			const p = container.querySelector('p');
			const style = p?.getAttribute('style') ?? '';
			expect(style).not.toContain('mso-');
		});

		it('unwraps empty spans', () => {
			const rawHTML = '<p class="MsoNormal"><span>text</span></p>';
			const container = createContainer('<p class="MsoNormal"><span>text</span></p>');
			normalizeSource(rawHTML, container);

			expect(container.querySelectorAll('span').length).toBe(0);
			expect(container.textContent).toContain('text');
		});

		it('removes empty paragraphs', () => {
			const rawHTML = '<p class="MsoNormal"></p><p class="MsoNormal">content</p>';
			const container = createContainer(rawHTML);
			normalizeSource(rawHTML, container);

			const paras = container.querySelectorAll('p');
			expect(paras.length).toBe(1);
			expect(paras[0]?.textContent).toBe('content');
		});

		it('converts MsoListParagraph to list items', () => {
			const rawHTML = '<p class="MsoListParagraphCxSpFirst">item</p>';
			const container = createContainer(rawHTML);
			normalizeSource(rawHTML, container);

			expect(container.querySelector('li')).not.toBeNull();
		});
	});

	describe('Google Docs normalization', () => {
		it('unwraps docs-internal-guid wrapper', () => {
			const rawHTML = '<b id="docs-internal-guid"><p>text</p></b>';
			const container = createContainer('<b id="docs-internal-guid"><p>text</p></b>');
			normalizeSource(rawHTML, container);

			expect(container.querySelector('[id="docs-internal-guid"]')).toBeNull();
			expect(container.querySelector('p')?.textContent).toBe('text');
		});

		it('converts font-weight:700 to strong', () => {
			const rawHTML = '<span id="docs-internal-guid">text</span>';
			const container = createContainer('<span style="font-weight:700">bold text</span>');
			normalizeSource(rawHTML, container);

			expect(container.querySelector('strong')).not.toBeNull();
		});

		it('converts font-style:italic to em', () => {
			const rawHTML = '<span id="docs-internal-guid">text</span>';
			const container = createContainer('<span style="font-style:italic">italic text</span>');
			normalizeSource(rawHTML, container);

			expect(container.querySelector('em')).not.toBeNull();
		});
	});

	describe('style cleanup', () => {
		it('strips remaining style attributes after normalization', () => {
			const rawHTML = '<p>text</p>';
			const container = createContainer('<p style="color: red">text</p>');
			normalizeSource(rawHTML, container);

			expect(container.querySelector('[style]')).toBeNull();
		});

		it('strips class attributes after normalization', () => {
			const rawHTML = '<p>text</p>';
			const container = createContainer('<p class="some-class">text</p>');
			normalizeSource(rawHTML, container);

			expect(container.querySelector('[class]')).toBeNull();
		});
	});
});
