import { describe, expect, it } from 'vitest';
import {
	DELETE_SVG,
	PLUS_SVG,
	TABLE_DELETE_SVG,
	buildAddButton,
	buildHandle,
	buildHandleBar,
	buildInsertLine,
	createButton,
} from './TableControlsDOM.js';

describe('TableControlsDOM', () => {
	describe('createButton', () => {
		it('creates a button with correct class, title, type, and ARIA label', () => {
			const btn: HTMLButtonElement = createButton('my-class', '<span>X</span>', 'My Title');

			expect(btn.tagName).toBe('BUTTON');
			expect(btn.className).toBe('my-class');
			expect(btn.title).toBe('My Title');
			expect(btn.type).toBe('button');
			expect(btn.getAttribute('aria-label')).toBe('My Title');
			expect(btn.getAttribute('contenteditable')).toBe('false');
		});

		it('sets innerHTML from the provided string', () => {
			const btn: HTMLButtonElement = createButton('cls', PLUS_SVG, 'Add');

			expect(btn.innerHTML).toContain('svg');
		});
	});

	describe('buildInsertLine', () => {
		it('creates horizontal insert line with correct classes', () => {
			const line: HTMLDivElement = buildInsertLine('horizontal');

			expect(line.classList.contains('ntbl-insert-line')).toBe(true);
			expect(line.classList.contains('ntbl-insert-line--horizontal')).toBe(true);
			expect(line.getAttribute('contenteditable')).toBe('false');
		});

		it('creates vertical insert line with correct classes', () => {
			const line: HTMLDivElement = buildInsertLine('vertical');

			expect(line.classList.contains('ntbl-insert-line')).toBe(true);
			expect(line.classList.contains('ntbl-insert-line--vertical')).toBe(true);
		});

		it('contains a button child with insert-btn class', () => {
			const line: HTMLDivElement = buildInsertLine('horizontal');
			const btn = line.querySelector('.ntbl-insert-btn');

			expect(btn).not.toBeNull();
			expect(btn?.tagName).toBe('BUTTON');
			expect(btn?.getAttribute('aria-label')).toBe('Insert row');
		});

		it('uses "Insert column" label for vertical orientation', () => {
			const line: HTMLDivElement = buildInsertLine('vertical');
			const btn = line.querySelector('.ntbl-insert-btn');

			expect(btn?.getAttribute('aria-label')).toBe('Insert column');
		});
	});

	describe('buildAddButton', () => {
		it('creates a button with zone class and custom class', () => {
			const btn: HTMLButtonElement = buildAddButton('ntbl-add-row', 'Add row');

			expect(btn.tagName).toBe('BUTTON');
			expect(btn.classList.contains('ntbl-add-zone')).toBe(true);
			expect(btn.classList.contains('ntbl-add-row')).toBe(true);
			expect(btn.getAttribute('aria-label')).toBe('Add row');
			expect(btn.getAttribute('contenteditable')).toBe('false');
		});

		it('contains a span with add-icon class', () => {
			const btn: HTMLButtonElement = buildAddButton('ntbl-add-col', 'Add column');
			const icon = btn.querySelector('.ntbl-add-icon');

			expect(icon).not.toBeNull();
			expect(icon?.innerHTML).toContain('svg');
		});
	});

	describe('buildHandleBar', () => {
		it('creates a div with the given class', () => {
			const bar: HTMLDivElement = buildHandleBar('ntbl-col-bar');

			expect(bar.tagName).toBe('DIV');
			expect(bar.className).toBe('ntbl-col-bar');
			expect(bar.getAttribute('contenteditable')).toBe('false');
		});
	});

	describe('buildHandle', () => {
		it('creates a handle with correct class and data-index', () => {
			const handle: HTMLDivElement = buildHandle('ntbl-col-handle', 2, 'Delete column', () => {});

			expect(handle.classList.contains('ntbl-handle')).toBe(true);
			expect(handle.classList.contains('ntbl-col-handle')).toBe(true);
			expect(handle.dataset.index).toBe('2');
		});

		it('contains a delete button with correct ARIA label for columns', () => {
			const handle: HTMLDivElement = buildHandle('ntbl-col-handle', 0, 'Delete column', () => {});
			const deleteBtn = handle.querySelector('.ntbl-handle-delete');

			expect(deleteBtn).not.toBeNull();
			expect(deleteBtn?.getAttribute('aria-label')).toBe('Delete column');
		});

		it('contains a delete button with correct ARIA label for rows', () => {
			const handle: HTMLDivElement = buildHandle('ntbl-row-handle', 0, 'Delete row', () => {});
			const deleteBtn = handle.querySelector('.ntbl-handle-delete');

			expect(deleteBtn?.getAttribute('aria-label')).toBe('Delete row');
		});

		it('uses the provided deleteLabel for ARIA', () => {
			const handle: HTMLDivElement = buildHandle('ntbl-custom', 0, 'Remove item', () => {});
			const deleteBtn = handle.querySelector('.ntbl-handle-delete');

			expect(deleteBtn?.getAttribute('aria-label')).toBe('Remove item');
		});

		it('calls onDelete callback with correct index when delete button is clicked', () => {
			let deletedIndex = -1;
			const handle: HTMLDivElement = buildHandle(
				'ntbl-row-handle',
				3,
				'Delete row',
				(idx: number) => {
					deletedIndex = idx;
				},
			);
			const deleteBtn = handle.querySelector('.ntbl-handle-delete') as HTMLButtonElement;

			deleteBtn.click();

			expect(deletedIndex).toBe(3);
		});
	});

	describe('SVG constants', () => {
		it('PLUS_SVG contains an SVG element', () => {
			expect(PLUS_SVG).toContain('<svg');
			expect(PLUS_SVG).toContain('</svg>');
		});

		it('DELETE_SVG contains an SVG element', () => {
			expect(DELETE_SVG).toContain('<svg');
			expect(DELETE_SVG).toContain('</svg>');
		});

		it('TABLE_DELETE_SVG contains an SVG element', () => {
			expect(TABLE_DELETE_SVG).toContain('<svg');
			expect(TABLE_DELETE_SVG).toContain('</svg>');
		});
	});
});
