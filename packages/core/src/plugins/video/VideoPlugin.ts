/**
 * VideoPlugin: dependency-free, accessibility-first video embeds for notectl.
 *
 * Embeds are produced entirely by client-side URL parsing (no oEmbed, no provider
 * SDK). The node stores structured data, never raw iframe HTML; the live iframe is
 * built only at view time behind a privacy-first click-to-load facade. A global
 * DOMPurify host-allowlist hook guards every sanitize sink against untrusted
 * iframes on import.
 */

import { type BlockNode, getBlockText } from '../../model/Document.js';
import type { Keymap } from '../../model/Keymap.js';
import { isNodeSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import {
	type VideoTextRange,
	registerVideoCommands,
	removeVideo,
	resetVideoSize,
	resizeVideoByDelta,
	selectedVideoWidthPercent,
	setVideoAlign,
} from './VideoCommands.js';
import { VideoEditOverlay } from './VideoEditOverlay.js';
import { type EmbedPromptController, showEmbedPrompt } from './VideoEmbedPrompt.js';
import { VIDEO_LOCALE_EN, type VideoLocale, loadVideoLocale } from './VideoLocale.js';
import { createVideoNodeSpec } from './VideoNodeSpec.js';
import { createVideoNodeViewFactory } from './VideoNodeView.js';
import { createVideoPasteInterceptor } from './VideoPasteInterceptor.js';
import { VIDEO_POPUP_CSS } from './VideoPopupStyles.js';
import { type VideoMatch, collectEmbedHostnames, providerLabel } from './VideoProviders.js';
import { installVideoIframeHook, uninstallVideoIframeHook } from './VideoSanitizeHook.js';
import { VIDEO_CSS } from './VideoStyles.js';
import {
	DEFAULT_VIDEO_CONFIG,
	DEFAULT_VIDEO_KEYMAP,
	VIDEO_TYPE,
	type VideoKeymap,
	type VideoPluginConfig,
} from './VideoTypes.js';

const VIDEO_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm6 4.5v7l6-3.5-6-3.5z" fill="currentColor"/></svg>';

export class VideoPlugin implements Plugin {
	readonly id = 'video';
	readonly name = 'Video';
	readonly priority = 47;

	private readonly config: VideoPluginConfig;
	private readonly resolvedKeymap: Readonly<Record<keyof VideoKeymap, string | null>>;
	private context: PluginContext | null = null;
	private locale: VideoLocale = VIDEO_LOCALE_EN;
	private overlay: VideoEditOverlay | null = null;
	private embedPrompt: EmbedPromptController | null = null;

	constructor(config?: Partial<VideoPluginConfig>) {
		this.config = { ...DEFAULT_VIDEO_CONFIG, ...config };
		this.resolvedKeymap = { ...DEFAULT_VIDEO_KEYMAP, ...config?.keymap };
	}

	async init(context: PluginContext): Promise<void> {
		this.context = context;
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			VIDEO_LOCALE_EN,
			loadVideoLocale,
		);

		context.registerStyleSheet(VIDEO_CSS);
		context.registerStyleSheet(VIDEO_POPUP_CSS);
		installVideoIframeHook(collectEmbedHostnames(this.config.providers));

		context.registerNodeSpec(createVideoNodeSpec(this.config, this.locale));
		this.overlay = new VideoEditOverlay(context, this.config, this.locale);
		this.registerNodeView(context);

		registerVideoCommands(context);
		this.registerInsertCommand(context);
		this.registerResizeCommands(context);
		this.registerResizeKeymaps(context);
		this.registerPasteInterceptor(context);
		this.registerToolbarItem(context);
	}

	destroy(): void {
		uninstallVideoIframeHook();
		this.embedPrompt?.close();
		this.embedPrompt = null;
		this.overlay?.close(false);
		this.overlay = null;
		this.context = null;
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;
		if (!this.isVideoSelected(oldState) && this.isVideoSelected(newState)) {
			this.announceVideoSelection(newState);
		}
	}

	private registerNodeView(context: PluginContext): void {
		context.registerNodeView(
			VIDEO_TYPE,
			createVideoNodeViewFactory({
				config: this.config,
				locale: this.locale,
				resolvedKeymap: this.resolvedKeymap,
				announce: (text: string) => context.announce(text),
				actions: {
					edit: () => this.overlay?.openEditForSelected(),
					align: (align) => setVideoAlign(context, align),
					remove: () => removeVideo(context),
				},
			}),
		);
	}

	private registerInsertCommand(context: PluginContext): void {
		// Context-aware: edit the selected video, otherwise open the insert form.
		context.registerCommand('insertVideo', () => {
			if (this.isVideoSelected(context.getState())) this.overlay?.openEditForSelected();
			else this.overlay?.openInsert();
			return true;
		});
	}

	private registerResizeCommands(context: PluginContext): void {
		const step: number = this.config.widthStep;
		const stepLarge: number = this.config.widthStepLarge;
		const resize = (delta: number): boolean => {
			const ok: boolean = resizeVideoByDelta(context, delta, this.config);
			if (ok) this.announceCurrentSize(context);
			return ok;
		};

		context.registerCommand('resizeVideoGrow', () => resize(step));
		context.registerCommand('resizeVideoShrink', () => resize(-step));
		context.registerCommand('resizeVideoGrowLarge', () => resize(stepLarge));
		context.registerCommand('resizeVideoShrinkLarge', () => resize(-stepLarge));
		context.registerCommand('resetVideoSize', () => {
			const ok: boolean = resetVideoSize(context, this.config);
			if (ok) context.announce(this.locale.resetToDefaultSize);
			return ok;
		});
	}

	private registerResizeKeymaps(context: PluginContext): void {
		const commands: Record<keyof VideoKeymap, string> = {
			growWidth: 'resizeVideoGrow',
			shrinkWidth: 'resizeVideoShrink',
			growWidthLarge: 'resizeVideoGrowLarge',
			shrinkWidthLarge: 'resizeVideoShrinkLarge',
			resetSize: 'resetVideoSize',
		};
		const bindings: Record<string, () => boolean> = {};
		for (const [slot, commandName] of Object.entries(commands)) {
			const binding: string | null = this.resolvedKeymap[slot as keyof VideoKeymap] ?? null;
			if (binding) bindings[binding] = () => context.executeCommand(commandName);
		}
		if (Object.keys(bindings).length > 0) context.registerKeymap(bindings as Keymap);
	}

	private registerPasteInterceptor(context: PluginContext): void {
		// Priority below smart-paste (50) so a sole video URL is claimed first.
		context.registerPasteInterceptor(
			createVideoPasteInterceptor({
				providers: this.config.providers,
				onOffer: (range: VideoTextRange, match: VideoMatch) => this.offerEmbed(range, match),
			}),
			{ name: 'video', priority: 40 },
		);
	}

	/** Shows the ask-first affordance after a video URL was pasted as text. */
	private offerEmbed(range: VideoTextRange, match: VideoMatch): void {
		if (!this.context) return;
		const context = this.context;
		const name: string = providerLabel(match.provider, this.config.providers);
		this.embedPrompt?.close();

		// Defer so the pasted URL is in the DOM and the caret rect is available.
		requestAnimationFrame(() => {
			context.announce(this.locale.embedOfferAnnounce(name));
			const prefillUrl: string = readRangeText(context.getState(), range);
			this.embedPrompt = showEmbedPrompt({
				container: context.getPluginContainer('top'),
				rect: caretRect(),
				locale: this.locale,
				onEmbed: () => {
					this.embedPrompt = null;
					this.overlay?.openInsertReplacingRange(range, prefillUrl);
				},
				onDismiss: () => {
					this.embedPrompt = null;
					context.getContainer().focus();
				},
			});
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		context.registerToolbarItem({
			id: 'video',
			group: 'insert',
			icon: VIDEO_ICON,
			label: this.locale.insertVideo,
			tooltip: this.locale.insertVideoTooltip,
			command: 'insertVideo',
		});
	}

	private isVideoSelected(state: EditorState): boolean {
		const sel = state.selection;
		if (!isNodeSelection(sel)) return false;
		return state.getBlock(sel.nodeId)?.type === VIDEO_TYPE;
	}

	private announceVideoSelection(state: EditorState): void {
		if (!this.context) return;
		const sel = state.selection;
		if (!isNodeSelection(sel)) return;
		const block: BlockNode | undefined = state.getBlock(sel.nodeId);
		if (!block || block.type !== VIDEO_TYPE) return;

		const title: string = (block.attrs?.title as string | undefined) ?? '';
		const parts: string[] = [
			title ? this.locale.videoSelectedWithTitle(title) : this.locale.videoSelected,
		];
		const shrink: string | null = this.resolvedKeymap.shrinkWidth ?? null;
		const grow: string | null = this.resolvedKeymap.growWidth ?? null;
		if (shrink && grow) {
			parts.push(this.locale.resizeHint(formatShortcut(shrink), formatShortcut(grow)));
		}
		this.context.announce(parts.join(' '));
	}

	private announceCurrentSize(context: PluginContext): void {
		const percent: number | null = selectedVideoWidthPercent(context.getState(), this.config);
		if (percent !== null) context.announce(this.locale.videoResized(percent));
	}
}

/** Returns the current text occupying a range (the pasted URL), clamped to bounds. */
function readRangeText(state: EditorState, range: VideoTextRange): string {
	const block: BlockNode | undefined = state.getBlock(range.blockId);
	if (!block) return '';
	const text: string = getBlockText(block);
	return text.slice(range.start, Math.min(range.end, text.length));
}

/** Returns the current selection caret rect, or null. */
function caretRect(): DOMRect | null {
	const selection: Selection | null = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const rect: DOMRect = selection.getRangeAt(0).getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) return null;
	return rect;
}
