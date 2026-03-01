/**
 * ImagePlugin: registers an image void block type with NodeSpec,
 * NodeView, commands, file handler, toolbar button, and accessible
 * keyboard resize with screenreader announcements.
 */

import { IMAGE_CSS } from '../../editor/styles/image.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { setStyleProperty, setStyleText } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import {
	insertImage,
	registerImageCommands,
	resetImageSize,
	resizeImageByDelta,
} from './ImageCommands.js';
import { IMAGE_LOCALES, type ImageLocale } from './ImageLocale.js';
import { createImageNodeViewFactory } from './ImageNodeView.js';
import {
	DEFAULT_IMAGE_CONFIG,
	DEFAULT_IMAGE_KEYMAP,
	IMAGE_UPLOAD_SERVICE,
	type ImageKeymap,
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
	private readonly resolvedKeymap: Readonly<Record<keyof ImageKeymap, string | null>>;
	private readonly uploadStates = new Map<BlockId, UploadState>();
	private readonly blobUrls = new Set<string>();
	private context: PluginContext | null = null;
	private locale!: ImageLocale;

	constructor(config?: Partial<ImagePluginConfig>) {
		this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
		this.resolvedKeymap = { ...DEFAULT_IMAGE_KEYMAP, ...config?.keymap };
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(IMAGE_LOCALES, context, this.config.locale);
		context.registerStyleSheet(IMAGE_CSS);
		this.context = context;
		this.registerNodeSpec(context);
		this.registerNodeView(context);
		registerImageCommands(context);
		this.registerResizeCommands(context);
		this.registerResizeKeymaps(context);
		this.registerFileHandler(context);
		this.registerToolbarItem(context);
	}

	destroy(): void {
		for (const url of this.blobUrls) {
			URL.revokeObjectURL(url);
		}
		this.blobUrls.clear();
		this.uploadStates.clear();
		this.context = null;
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;

		// Clean up upload states for removed blocks (searches full tree)
		for (const id of this.uploadStates.keys()) {
			if (!newState.getBlock(id)) {
				this.uploadStates.delete(id);
			}
		}

		// Announce image selection for screenreaders
		const oldIsImage: boolean = this.isImageSelected(oldState);
		const nowIsImage: boolean = this.isImageSelected(newState);

		if (!oldIsImage && nowIsImage) {
			this.announceImageSelection(newState);
		}
	}

	private registerNodeSpec(context: PluginContext): void {
		const locale = this.locale;
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

				const alt: string = (node.attrs?.alt as string | undefined) ?? '';
				const width: number | undefined = node.attrs?.width as number | undefined;
				const height: number | undefined = node.attrs?.height as number | undefined;

				const img: HTMLImageElement = document.createElement('img');
				img.className = 'notectl-image__img';
				img.src = (node.attrs?.src as string | undefined) ?? '';
				img.alt = alt;
				img.draggable = false;

				if (width !== undefined) setStyleProperty(img, 'width', `${width}px`);
				if (height !== undefined) setStyleProperty(img, 'height', `${height}px`);

				const align: string = (node.attrs?.align as string | undefined) ?? 'center';
				const alignClass: string | undefined = {
					left: 'notectl-image--left',
					center: 'notectl-image--center',
					right: 'notectl-image--right',
				}[align];
				if (alignClass) figure.classList.add(alignClass);

				figure.setAttribute('aria-label', locale.imageAria(alt, width, height));

				imgContainer.appendChild(img);
				figure.appendChild(imgContainer);
				return figure;
			},
			toHTML(node) {
				const src: string = escapeHTML((node.attrs?.src as string | undefined) ?? '');
				const alt: string = escapeHTML((node.attrs?.alt as string | undefined) ?? '');
				const width: number | undefined = node.attrs?.width as number | undefined;
				const height: number | undefined = node.attrs?.height as number | undefined;

				const sizeAttrs: string =
					(width !== undefined ? ` width="${width}"` : '') +
					(height !== undefined ? ` height="${height}"` : '');

				// Alignment is handled by the serializer's alignment injection,
				// which works in both inline-style and CSS-class modes.
				return `<figure><img src="${src}" alt="${alt}"${sizeAttrs}></figure>`;
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

						// Check inline style first, then notectl-align-* classes, then legacy classes
						const textAlign: string = el.style?.textAlign ?? '';
						if (textAlign === 'left' || textAlign === 'right' || textAlign === 'center') {
							attrs.align = textAlign;
						} else if (el.classList.contains('notectl-align-left')) {
							attrs.align = 'left';
						} else if (el.classList.contains('notectl-align-right')) {
							attrs.align = 'right';
						} else if (el.classList.contains('notectl-align-center')) {
							attrs.align = 'center';
						} else if (el.classList.contains('notectl-image--left')) {
							attrs.align = 'left';
						} else if (el.classList.contains('notectl-image--right')) {
							attrs.align = 'right';
						}
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
				attrs: ['src', 'alt', 'width', 'height', 'class', 'style'],
			},
		});
	}

	private registerNodeView(context: PluginContext): void {
		context.registerNodeView(
			'image',
			createImageNodeViewFactory(this.config, this.uploadStates, this.resolvedKeymap),
		);
	}

	private registerResizeCommands(context: PluginContext): void {
		const step: number = this.config.resizeStep ?? 10;
		const stepLarge: number = this.config.resizeStepLarge ?? 50;
		const maxWidth: number = this.config.maxWidth;

		context.registerCommand('resizeImageGrow', () => {
			const result: boolean = resizeImageByDelta(context, step, maxWidth);
			if (result) this.announceCurrentSize(context);
			return result;
		});

		context.registerCommand('resizeImageShrink', () => {
			const result: boolean = resizeImageByDelta(context, -step, maxWidth);
			if (result) this.announceCurrentSize(context);
			return result;
		});

		context.registerCommand('resizeImageGrowLarge', () => {
			const result: boolean = resizeImageByDelta(context, stepLarge, maxWidth);
			if (result) this.announceCurrentSize(context);
			return result;
		});

		context.registerCommand('resizeImageShrinkLarge', () => {
			const result: boolean = resizeImageByDelta(context, -stepLarge, maxWidth);
			if (result) this.announceCurrentSize(context);
			return result;
		});

		context.registerCommand('resetImageSize', () => {
			const result: boolean = resetImageSize(context);
			if (result) context.announce(this.locale.resetToNaturalSize);
			return result;
		});
	}

	private registerResizeKeymaps(context: PluginContext): void {
		const bindings: Record<string, () => boolean> = {};
		const commands: Record<keyof ImageKeymap, string> = {
			growWidth: 'resizeImageGrow',
			shrinkWidth: 'resizeImageShrink',
			growWidthLarge: 'resizeImageGrowLarge',
			shrinkWidthLarge: 'resizeImageShrinkLarge',
			resetSize: 'resetImageSize',
		};

		for (const [slot, commandName] of Object.entries(commands)) {
			const binding: string | null = this.resolvedKeymap[slot as keyof ImageKeymap] ?? null;
			if (binding) {
				bindings[binding] = () => context.executeCommand(commandName);
			}
		}

		if (Object.keys(bindings).length > 0) {
			context.registerKeymap(bindings);
		}
	}

	private registerFileHandler(context: PluginContext): void {
		context.registerFileHandler('image/*', async (file, _position) => {
			if (!this.isAcceptedType(file.type)) return false;
			this.handleFileInsert(context, file);
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
			context.announce(this.locale.uploadFailed);
		}
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';

		context.registerToolbarItem({
			id: 'image',
			group: 'insert',
			icon,
			label: this.locale.insertImage,
			tooltip: this.locale.insertImageTooltip,
			command: 'insertImage',
			priority: 50,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx, onClose) => {
				this.renderImagePopup(container, ctx, onClose);
			},
		});
	}

	private renderImagePopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: () => void,
	): void {
		setStyleProperty(container, 'padding', '8px');
		setStyleProperty(container, 'minWidth', '240px');

		// --- File upload ---
		const fileInput: HTMLInputElement = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = this.config.acceptedTypes.join(',');
		setStyleText(fileInput, 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;');

		const uploadBtn: HTMLButtonElement = document.createElement('button');
		uploadBtn.type = 'button';
		uploadBtn.textContent = this.locale.uploadFromComputer;
		uploadBtn.setAttribute('aria-label', this.locale.uploadAria);
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
				this.handleFileInsert(context, file);
				onClose();
				context.getContainer().focus();
			}
		});

		container.appendChild(fileInput);
		container.appendChild(uploadBtn);

		// --- Separator ---
		const separator: HTMLDivElement = document.createElement('div');
		setStyleText(
			separator,
			'display:flex;align-items:center;margin:8px 0;' +
				'color:var(--notectl-fg-muted);font-size:12px;',
		);
		const line1: HTMLSpanElement = document.createElement('span');
		setStyleText(line1, 'flex:1;height:1px;background:var(--notectl-border);');
		const orText: HTMLSpanElement = document.createElement('span');
		orText.textContent = this.locale.separator;
		setStyleText(orText, 'padding:0 8px;');
		const line2: HTMLSpanElement = document.createElement('span');
		setStyleText(line2, 'flex:1;height:1px;background:var(--notectl-border);');
		separator.appendChild(line1);
		separator.appendChild(orText);
		separator.appendChild(line2);
		container.appendChild(separator);

		// --- URL input ---
		const urlInput: HTMLInputElement = document.createElement('input');
		urlInput.type = 'url';
		urlInput.placeholder = this.locale.urlPlaceholder;
		urlInput.setAttribute('aria-label', this.locale.urlAria);
		setStyleText(
			urlInput,
			'width:100%;padding:6px 8px;box-sizing:border-box;' +
				'border:1px solid var(--notectl-border);border-radius:4px;' +
				'background:var(--notectl-bg);color:var(--notectl-fg);',
		);

		const insertBtn: HTMLButtonElement = document.createElement('button');
		insertBtn.type = 'button';
		insertBtn.textContent = this.locale.insertButton;
		insertBtn.setAttribute('aria-label', this.locale.insertAria);
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
				onClose();
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

	private isAcceptedType(mimeType: string): boolean {
		return this.config.acceptedTypes.some(
			(accepted) =>
				accepted === mimeType ||
				(accepted.endsWith('/*') && mimeType.startsWith(accepted.slice(0, -1))),
		);
	}

	private isImageSelected(state: EditorState): boolean {
		const sel = state.selection;
		if (!isNodeSelection(sel)) return false;
		const block: BlockNode | undefined = state.getBlock(sel.nodeId);
		return block?.type === 'image';
	}

	private announceImageSelection(state: EditorState): void {
		if (!this.context) return;
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;

		const block: BlockNode | undefined = state.getBlock(sel.nodeId);
		if (!block || block.type !== 'image') return;

		const alt: string = (block.attrs?.alt as string | undefined) ?? '';
		const width: number | undefined = block.attrs?.width as number | undefined;
		const height: number | undefined = block.attrs?.height as number | undefined;

		const parts: string[] = ['Image selected.'];
		if (alt) parts.push(`Alt text: ${alt}.`);
		if (width !== undefined && height !== undefined) {
			parts.push(`Size: ${width} by ${height} pixels.`);
		}

		const shrinkKey: string | null = this.resolvedKeymap.shrinkWidth ?? null;
		const growKey: string | null = this.resolvedKeymap.growWidth ?? null;
		if (shrinkKey && growKey) {
			parts.push(`${formatShortcut(shrinkKey)} / ${formatShortcut(growKey)} to resize.`);
		}

		this.context.announce(parts.join(' '));
	}

	private announceCurrentSize(context: PluginContext): void {
		const state = context.getState();
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;

		const block: BlockNode | undefined = state.getBlock(sel.nodeId);
		if (!block || block.type !== 'image') return;

		const width: number | undefined = block.attrs?.width as number | undefined;
		const height: number | undefined = block.attrs?.height as number | undefined;
		if (width !== undefined && height !== undefined) {
			context.announce(`Image resized to ${width} by ${height} pixels.`);
		}
	}
}
