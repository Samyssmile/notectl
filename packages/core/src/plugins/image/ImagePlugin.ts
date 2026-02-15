/**
 * ImagePlugin: registers an image void block type with NodeSpec,
 * NodeView, commands, file handler, and toolbar button.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { insertImage, registerImageCommands } from './ImageCommands.js';
import { createImageNodeViewFactory } from './ImageNodeView.js';
import {
	DEFAULT_IMAGE_CONFIG,
	IMAGE_UPLOAD_SERVICE,
	type ImagePluginConfig,
	type UploadState,
} from './ImageUpload.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		image: {
			src: string;
			alt: string;
			width?: number;
			height?: number;
			align: 'left' | 'center' | 'right';
		};
	}
}

// --- Plugin ---

export class ImagePlugin implements Plugin {
	readonly id = 'image';
	readonly name = 'Image';
	readonly priority = 45;

	private readonly config: ImagePluginConfig;
	private readonly uploadStates = new Map<BlockId, UploadState>();
	private readonly blobUrls = new Set<string>();

	constructor(config?: Partial<ImagePluginConfig>) {
		this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.registerNodeSpec(context);
		this.registerNodeView(context);
		registerImageCommands(context);
		this.registerFileHandler(context);
		this.registerToolbarItem(context);
	}

	destroy(): void {
		for (const url of this.blobUrls) {
			URL.revokeObjectURL(url);
		}
		this.blobUrls.clear();
		this.uploadStates.clear();
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		// Clean up upload states for removed blocks (searches full tree)
		for (const id of this.uploadStates.keys()) {
			if (!newState.getBlock(id)) {
				this.uploadStates.delete(id);
			}
		}
	}

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'image',
			group: 'block',
			isVoid: true,
			selectable: true,
			attrs: {
				src: { default: '' },
				alt: { default: '' },
				align: { default: 'center' },
			},
			toDOM(node) {
				const figure = createBlockElement('figure', node.id);
				figure.className = 'notectl-image';
				figure.setAttribute('data-void', 'true');
				figure.setAttribute('data-selectable', 'true');

				const imgContainer: HTMLDivElement = document.createElement('div');
				imgContainer.className = 'notectl-image__container';

				const img: HTMLImageElement = document.createElement('img');
				img.className = 'notectl-image__img';
				img.src = (node.attrs?.src as string | undefined) ?? '';
				img.alt = (node.attrs?.alt as string | undefined) ?? '';
				img.draggable = false;

				const width: number | undefined = node.attrs?.width as number | undefined;
				const height: number | undefined = node.attrs?.height as number | undefined;
				if (width !== undefined) img.style.width = `${width}px`;
				if (height !== undefined) img.style.height = `${height}px`;

				const align: string = (node.attrs?.align as string | undefined) ?? 'center';
				const alignClass: string | undefined = {
					left: 'notectl-image--left',
					center: 'notectl-image--center',
					right: 'notectl-image--right',
				}[align];
				if (alignClass) figure.classList.add(alignClass);

				imgContainer.appendChild(img);
				figure.appendChild(imgContainer);
				return figure;
			},
			toHTML(node) {
				const src: string = escapeHTML((node.attrs?.src as string | undefined) ?? '');
				const alt: string = escapeHTML((node.attrs?.alt as string | undefined) ?? '');
				const width: number | undefined = node.attrs?.width as number | undefined;
				const height: number | undefined = node.attrs?.height as number | undefined;
				const align: string = (node.attrs?.align as string | undefined) ?? 'center';

				const sizeAttrs: string =
					(width !== undefined ? ` width="${width}"` : '') +
					(height !== undefined ? ` height="${height}"` : '');

				return `<figure class="notectl-image notectl-image--${escapeHTML(align)}"><img src="${src}" alt="${alt}"${sizeAttrs}></figure>`;
			},
			parseHTML: [
				{
					tag: 'figure',
					getAttrs(el) {
						const img: HTMLImageElement | null = el.querySelector('img');
						if (!img) return false;
						const attrs: Record<string, string | number | boolean> = {
							src: img.getAttribute('src') ?? '',
							alt: img.getAttribute('alt') ?? '',
							align: 'center',
						};
						const width: string | null = img.getAttribute('width');
						const height: string | null = img.getAttribute('height');
						if (width) attrs.width = Number.parseInt(width, 10);
						if (height) attrs.height = Number.parseInt(height, 10);

						if (el.classList.contains('notectl-image--left')) attrs.align = 'left';
						if (el.classList.contains('notectl-image--right')) attrs.align = 'right';
						return attrs;
					},
				},
				{
					tag: 'img',
					getAttrs(el) {
						const attrs: Record<string, string | number | boolean> = {
							src: el.getAttribute('src') ?? '',
							alt: el.getAttribute('alt') ?? '',
							align: 'center',
						};
						const width: string | null = el.getAttribute('width');
						const height: string | null = el.getAttribute('height');
						if (width) attrs.width = Number.parseInt(width, 10);
						if (height) attrs.height = Number.parseInt(height, 10);
						return attrs;
					},
				},
			],
			sanitize: {
				tags: ['figure', 'img'],
				attrs: ['src', 'alt', 'width', 'height', 'class'],
			},
		});
	}

	private registerNodeView(context: PluginContext): void {
		context.registerNodeView('image', createImageNodeViewFactory(this.config, this.uploadStates));
	}

	private registerFileHandler(context: PluginContext): void {
		context.registerFileHandler('image/*', async (files, _position) => {
			const imageFiles: File[] = files.filter((f) => this.isAcceptedType(f.type));
			if (imageFiles.length === 0) return false;

			for (const file of imageFiles) {
				this.handleFileInsert(context, file);
			}

			return true;
		});
	}

	private handleFileInsert(context: PluginContext, file: File): void {
		if (file.size > this.config.maxFileSize) return;

		const blobUrl: string = URL.createObjectURL(file);
		this.blobUrls.add(blobUrl);

		const inserted: boolean = insertImage(context, { src: blobUrl });
		if (!inserted) {
			URL.revokeObjectURL(blobUrl);
			this.blobUrls.delete(blobUrl);
			return;
		}

		// Find the newly inserted image block
		const state: EditorState = context.getState();
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;
		const imageBlockId: BlockId = sel.nodeId;

		this.uploadStates.set(imageBlockId, 'uploading');

		// Upload if service is registered
		const uploadService = context.getService(IMAGE_UPLOAD_SERVICE);
		if (uploadService) {
			this.uploadFile(context, file, imageBlockId, blobUrl);
		} else {
			this.uploadStates.set(imageBlockId, 'complete');
		}
	}

	private async uploadFile(
		context: PluginContext,
		file: File,
		imageBlockId: BlockId,
		blobUrl: string,
	): Promise<void> {
		const uploadService = context.getService(IMAGE_UPLOAD_SERVICE);
		if (!uploadService) return;

		try {
			const result = await uploadService.upload(file);
			this.uploadStates.set(imageBlockId, 'complete');

			// Replace blob URL with uploaded URL
			const state: EditorState = context.getState();
			const block: BlockNode | undefined = state.getBlock(imageBlockId);
			if (!block) return;

			const path: BlockId[] | undefined = state.getNodePath(imageBlockId);
			if (!path) return;

			const merged: BlockAttrs = {
				...(block.attrs ?? {}),
				src: result.url,
				...(result.width !== undefined ? { width: result.width } : {}),
				...(result.height !== undefined ? { height: result.height } : {}),
			};

			const tr: Transaction = state.transaction('command').setNodeAttr(path, merged).build();
			context.dispatch(tr);

			// Clean up blob URL
			URL.revokeObjectURL(blobUrl);
			this.blobUrls.delete(blobUrl);
		} catch {
			this.uploadStates.set(imageBlockId, 'error');
		}
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';

		context.registerToolbarItem({
			id: 'image',
			group: 'insert',
			icon,
			label: 'Insert Image',
			tooltip: 'Insert Image',
			command: 'insertImage',
			priority: 50,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderImagePopup(container, ctx);
			},
		});
	}

	private renderImagePopup(container: HTMLElement, context: PluginContext): void {
		container.style.padding = '8px';
		container.style.minWidth = '240px';

		// --- File upload ---
		const fileInput: HTMLInputElement = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = this.config.acceptedTypes.join(',');
		fileInput.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;';

		const uploadLabel: HTMLLabelElement = document.createElement('label');
		uploadLabel.textContent = 'Upload from computer';
		uploadLabel.style.cssText =
			'display:block;width:100%;padding:8px 12px;cursor:pointer;' +
			'text-align:center;box-sizing:border-box;' +
			'border:1px solid #ccc;border-radius:4px;background:#f8f8f8;';
		uploadLabel.appendChild(fileInput);

		uploadLabel.addEventListener('mousedown', (e: MouseEvent) => {
			e.stopPropagation();
		});

		fileInput.addEventListener('change', () => {
			const file: File | undefined = fileInput.files?.[0];
			if (file) {
				this.handleFileInsert(context, file);
			}
		});

		container.appendChild(uploadLabel);

		// --- Separator ---
		const separator: HTMLDivElement = document.createElement('div');
		separator.style.cssText =
			'display:flex;align-items:center;margin:8px 0;color:#999;font-size:12px;';
		const line1: HTMLSpanElement = document.createElement('span');
		line1.style.cssText = 'flex:1;height:1px;background:#ddd;';
		const orText: HTMLSpanElement = document.createElement('span');
		orText.textContent = 'or';
		orText.style.cssText = 'padding:0 8px;';
		const line2: HTMLSpanElement = document.createElement('span');
		line2.style.cssText = 'flex:1;height:1px;background:#ddd;';
		separator.appendChild(line1);
		separator.appendChild(orText);
		separator.appendChild(line2);
		container.appendChild(separator);

		// --- URL input ---
		const urlInput: HTMLInputElement = document.createElement('input');
		urlInput.type = 'url';
		urlInput.placeholder = 'https://...';
		urlInput.style.cssText =
			'width:100%;padding:6px 8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;';

		const insertBtn: HTMLButtonElement = document.createElement('button');
		insertBtn.type = 'button';
		insertBtn.textContent = 'Insert';
		insertBtn.style.cssText =
			'width:100%;padding:8px 12px;margin-top:4px;cursor:pointer;' +
			'border:1px solid #ccc;border-radius:4px;background:#f8f8f8;';

		const applyUrl = (): void => {
			const src: string = urlInput.value.trim();
			if (src) {
				insertImage(context, { src });
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

	private isAcceptedType(mimeType: string): boolean {
		return this.config.acceptedTypes.some(
			(accepted) =>
				accepted === mimeType ||
				(accepted.endsWith('/*') && mimeType.startsWith(accepted.slice(0, -1))),
		);
	}
}
