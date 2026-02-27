import { describe, expect, it } from 'vitest';
import type { NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import {
	applyBlockFilters,
	cloneContent,
	insertHeaderFooter,
	prepare,
	sanitize,
} from './PrintContentPreparer.js';

/** Creates a minimal editor container for testing. */
function createTestContainer(innerContent?: string): HTMLElement {
	const container: HTMLElement = document.createElement('div');
	const content: HTMLElement = document.createElement('div');
	content.className = 'notectl-content';
	content.setAttribute('contenteditable', 'true');
	content.setAttribute('data-placeholder', 'Type here...');
	content.innerHTML = innerContent ?? '<p data-block-id="b1" data-block-type="paragraph">Hello</p>';
	container.appendChild(content);
	return container;
}

describe('PrintContentPreparer', () => {
	describe('cloneContent', () => {
		it('deep-clones the .notectl-content element', () => {
			const container: HTMLElement = createTestContainer();
			const clone: HTMLElement = cloneContent(container);

			expect(clone.className).toBe('notectl-content');
			expect(clone.querySelector('p')?.textContent).toBe('Hello');
		});

		it('clone is independent from original', () => {
			const container: HTMLElement = createTestContainer();
			const clone: HTMLElement = cloneContent(container);

			clone.querySelector('p')?.remove();
			expect(container.querySelector('p')).not.toBeNull();
		});

		it('falls back to container if .notectl-content is missing', () => {
			const container: HTMLElement = document.createElement('div');
			container.innerHTML = '<p>fallback</p>';

			const clone: HTMLElement = cloneContent(container);
			expect(clone.querySelector('p')?.textContent).toBe('fallback');
		});
	});

	describe('sanitize', () => {
		it('removes contenteditable attribute', () => {
			const el: HTMLElement = document.createElement('div');
			el.setAttribute('contenteditable', 'true');

			sanitize(el);
			expect(el.getAttribute('contenteditable')).toBeNull();
		});

		it('removes selection-related CSS classes', () => {
			const el: HTMLElement = document.createElement('div');
			el.classList.add('notectl-node-selected', 'notectl-content--empty');

			const child: HTMLElement = document.createElement('p');
			child.classList.add('notectl-node-selected');
			el.appendChild(child);

			sanitize(el);

			expect(el.classList.contains('notectl-node-selected')).toBe(false);
			expect(el.classList.contains('notectl-content--empty')).toBe(false);
			expect(child.classList.contains('notectl-node-selected')).toBe(false);
		});

		it('removes data-placeholder attribute', () => {
			const el: HTMLElement = document.createElement('div');
			el.setAttribute('data-placeholder', 'Type here...');

			sanitize(el);
			expect(el.getAttribute('data-placeholder')).toBeNull();
		});
	});

	describe('applyBlockFilters', () => {
		it('removes excluded block types', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML =
				'<p data-block-type="paragraph">keep</p>' + '<hr data-block-type="horizontal_rule">';

			const excludeTypes: readonly NodeTypeName[] = [nodeType('horizontal_rule')];
			applyBlockFilters(clone, { excludeBlockTypes: excludeTypes });

			expect(clone.querySelector('[data-block-type="horizontal_rule"]')).toBeNull();
			expect(clone.querySelector('[data-block-type="paragraph"]')).not.toBeNull();
		});

		it('applies page-break-before to configured block types', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML =
				'<h1 data-block-type="heading">Title</h1>' + '<p data-block-type="paragraph">text</p>';

			const breakTypes: readonly NodeTypeName[] = [nodeType('heading')];
			applyBlockFilters(clone, { pageBreakBefore: breakTypes });

			const heading: HTMLElement | null = clone.querySelector('[data-block-type="heading"]');
			expect(heading?.style.pageBreakBefore).toBe('always');
			expect(heading?.style.breakBefore).toBe('page');
		});

		it('does nothing with empty options', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML = '<p data-block-type="paragraph">text</p>';

			applyBlockFilters(clone, {});
			expect(clone.querySelector('p')).not.toBeNull();
		});
	});

	describe('insertHeaderFooter', () => {
		it('inserts header at the beginning', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML = '<p>content</p>';

			insertHeaderFooter(clone, { header: '<h1>Header</h1>' });

			const headerEl: Element | null = clone.querySelector('.notectl-print-header');
			expect(headerEl).not.toBeNull();
			expect(headerEl?.innerHTML).toBe('<h1>Header</h1>');
			expect(clone.firstChild).toBe(headerEl);
		});

		it('inserts footer at the end', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML = '<p>content</p>';

			insertHeaderFooter(clone, { footer: '<div>Footer</div>' });

			const footerEl: Element | null = clone.querySelector('.notectl-print-footer');
			expect(footerEl).not.toBeNull();
			expect(clone.lastChild).toBe(footerEl);
		});

		it('supports function values for header and footer', () => {
			const clone: HTMLElement = document.createElement('div');

			insertHeaderFooter(clone, {
				header: () => '<h2>Dynamic</h2>',
				footer: () => '<span>Generated</span>',
			});

			expect(clone.querySelector('.notectl-print-header')?.innerHTML).toBe('<h2>Dynamic</h2>');
			expect(clone.querySelector('.notectl-print-footer')?.innerHTML).toBe(
				'<span>Generated</span>',
			);
		});

		it('does nothing when header and footer are undefined', () => {
			const clone: HTMLElement = document.createElement('div');
			clone.innerHTML = '<p>content</p>';

			insertHeaderFooter(clone, {});
			expect(clone.children.length).toBe(1);
		});
	});

	describe('prepare', () => {
		it('orchestrates all preparation steps', () => {
			const container: HTMLElement = createTestContainer(
				'<p data-block-id="b1" data-block-type="paragraph">Hello</p>' +
					'<hr data-block-id="b2" data-block-type="horizontal_rule">',
			);

			const result: HTMLElement = prepare(container, {
				excludeBlockTypes: [nodeType('horizontal_rule')],
				header: '<div>Top</div>',
				footer: '<div>Bottom</div>',
			});

			// Content is cloned
			expect(result.querySelector('[data-block-type="paragraph"]')).not.toBeNull();

			// Excluded block removed
			expect(result.querySelector('[data-block-type="horizontal_rule"]')).toBeNull();

			// Header and footer added
			expect(result.querySelector('.notectl-print-header')).not.toBeNull();
			expect(result.querySelector('.notectl-print-footer')).not.toBeNull();

			// contenteditable removed
			expect(result.getAttribute('contenteditable')).toBeNull();
		});
	});
});
