import { describe, expect, it, vi } from 'vitest';
import { createBlockNode } from '../../model/Document.js';
import { type BlockId, blockId, nodeType } from '../../model/TypeBrands.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { createImageNodeViewFactory } from './ImageNodeView.js';
import type { UploadState } from './ImageUpload.js';
import { DEFAULT_IMAGE_CONFIG } from './ImageUpload.js';

function makeImageBlock(
	attrs: Record<string, string | number | boolean> = {},
	id = 'img1',
): ReturnType<typeof createBlockNode> {
	return createBlockNode(nodeType('image'), [], blockId(id), {
		src: 'test.png',
		alt: 'Test image',
		align: 'center',
		...attrs,
	});
}

function makeState(imageAttrs?: Record<string, string | number | boolean>) {
	const attrs = { src: 'test.png', alt: '', align: 'center', ...imageAttrs };
	return stateBuilder()
		.paragraph('', 'b1')
		.block('image', '', 'img1', { attrs })
		.cursor('b1', 0)
		.schema(['paragraph', 'image'], [])
		.build();
}

describe('ImageNodeView', () => {
	describe('DOM construction', () => {
		it('creates figure element with data-block-id', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			expect(view.dom.tagName).toBe('FIGURE');
			expect(view.dom.getAttribute('data-block-id')).toBe('img1');
		});

		it('sets data-void and data-selectable attributes', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			expect(view.dom.getAttribute('data-void')).toBe('true');
			expect(view.dom.getAttribute('data-selectable')).toBe('true');
		});

		it('renders img with correct src and alt', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock({ src: 'photo.jpg', alt: 'A photo' });
			const view = factory(node, makeState, vi.fn());

			const img = view.dom.querySelector('img');
			expect(img).not.toBeNull();
			expect(img?.getAttribute('src')).toBe('photo.jpg');
			expect(img?.alt).toBe('A photo');
		});

		it('applies width and height when provided', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock({ width: 400, height: 300 });
			const view = factory(node, makeState, vi.fn());

			const img = view.dom.querySelector('img');
			expect(img?.style.width).toBe('400px');
			expect(img?.style.height).toBe('300px');
		});

		it('applies alignment class', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock({ align: 'left' });
			const view = factory(node, makeState, vi.fn());

			expect(view.dom.classList.contains('notectl-image--left')).toBe(true);
		});

		it('has null contentDOM (void node)', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			expect(view.contentDOM).toBeNull();
		});
	});

	describe('update', () => {
		it('updates img attributes on update()', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock({ src: 'old.png', alt: 'Old' });
			const view = factory(node, makeState, vi.fn());

			const updatedNode = createBlockNode(nodeType('image'), [], blockId('img1'), {
				src: 'new.png',
				alt: 'New',
				align: 'right',
				width: 200,
			});

			const result = view.update?.(updatedNode);
			expect(result).toBe(true);

			const img = view.dom.querySelector('img');
			expect(img?.getAttribute('src')).toBe('new.png');
			expect(img?.alt).toBe('New');
			expect(view.dom.classList.contains('notectl-image--right')).toBe(true);
		});

		it('returns false for non-image node types', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			const paragraph = createBlockNode(nodeType('paragraph'));
			const result = view.update?.(paragraph);
			expect(result).toBe(false);
		});
	});

	describe('selectNode / deselectNode', () => {
		it('selectNode adds selected class', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			expect(view.dom.classList.contains('notectl-image--selected')).toBe(true);
		});

		it('deselectNode removes selected class', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			view.deselectNode?.();
			expect(view.dom.classList.contains('notectl-image--selected')).toBe(false);
		});

		it('selectNode creates resize handle when resizable', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(
				{ ...DEFAULT_IMAGE_CONFIG, resizable: true },
				uploadStates,
			);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const handle = view.dom.querySelector('.notectl-image__resize-handle');
			expect(handle).not.toBeNull();
		});

		it('deselectNode removes resize handle', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			view.deselectNode?.();
			const handle = view.dom.querySelector('.notectl-image__resize-handle');
			expect(handle).toBeNull();
		});

		it('does not create resize handle when resizable is false', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(
				{ ...DEFAULT_IMAGE_CONFIG, resizable: false },
				uploadStates,
			);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const handle = view.dom.querySelector('.notectl-image__resize-handle');
			expect(handle).toBeNull();
		});

		it('creates exactly 4 corner resize handles', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const handles = view.dom.querySelectorAll('.notectl-image__resize-handle');
			expect(handles).toHaveLength(4);
		});

		it('creates handles with position modifier classes', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			for (const pos of ['nw', 'ne', 'sw', 'se']) {
				const handle = view.dom.querySelector(`.notectl-image__resize-handle--${pos}`);
				expect(handle).not.toBeNull();
			}
		});

		it('creates a size indicator element', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const indicator = view.dom.querySelector('.notectl-image__size-indicator');
			expect(indicator).not.toBeNull();
		});

		it('size indicator is not visible by default', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const indicator = view.dom.querySelector('.notectl-image__size-indicator');
			expect(indicator?.classList.contains('notectl-image__size-indicator--visible')).toBe(false);
		});

		it('creates resize overlay container', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			const overlay = view.dom.querySelector('.notectl-image__resize-overlay');
			expect(overlay).not.toBeNull();
		});

		it('deselectNode removes resize overlay completely', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			view.selectNode?.();
			view.deselectNode?.();
			const overlay = view.dom.querySelector('.notectl-image__resize-overlay');
			expect(overlay).toBeNull();
		});
	});

	describe('destroy', () => {
		it('does not revoke blob URLs on destroy (needed for clipboard and undo)', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock({ src: 'blob:http://localhost/abc' });
			const view = factory(node, makeState, vi.fn());

			const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
			view.destroy?.();

			expect(revokeSpy).not.toHaveBeenCalled();
			revokeSpy.mockRestore();
		});
	});

	describe('upload state overlay', () => {
		it('shows uploading overlay when upload state is uploading', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			uploadStates.set(blockId('img1'), 'uploading');
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			const overlayEl = view.dom.querySelector('.notectl-image__overlay');
			expect(overlayEl?.classList.contains('notectl-image__overlay--uploading')).toBe(true);
			expect(overlayEl?.textContent).toBe('Uploading...');
		});

		it('shows error overlay when upload state is error', () => {
			const uploadStates = new Map<BlockId, UploadState>();
			uploadStates.set(blockId('img1'), 'error');
			const factory = createImageNodeViewFactory(DEFAULT_IMAGE_CONFIG, uploadStates);
			const node = makeImageBlock();
			const view = factory(node, makeState, vi.fn());

			const overlayEl = view.dom.querySelector('.notectl-image__overlay');
			expect(overlayEl?.classList.contains('notectl-image__overlay--error')).toBe(true);
		});
	});
});
