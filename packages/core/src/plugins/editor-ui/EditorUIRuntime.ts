/** Editor-owned UI capabilities, independent of any toolbar renderer. */
import UI_POPUP_CSS from '../../editor/styles/ui-popup.css?inline';
import { EditorInteraction } from '../../view/EditorInteraction.js';
import { type SelectionView, measureSelection } from '../../view/SelectionGeometry.js';
import { SelectionObserver } from '../../view/SelectionObserver.js';
import type { Logger } from '../Logger.js';
import type { PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { PopupManager, PopupServiceKey } from '../shared/PopupManager.js';
import type { PopupAnchor, PopupHandle } from '../shared/PopupManager.js';
import { getDeepActiveHTMLElement } from '../shared/PopupPositioning.js';
import { TableSelectionServiceKey } from '../table/TableSelectionTypes.js';
import type { ToolbarItem } from '../toolbar/ToolbarItem.js';
import { TOOLBAR_LOCALE_EN, loadToolbarLocale } from '../toolbar/ToolbarLocale.js';
import { ToolbarPopupController } from '../toolbar/ToolbarPopupController.js';
import {
	type ActionPopupOptions,
	type EditorAction,
	type EditorUIService,
	EditorUIServiceKey,
} from './EditorUI.js';

const EMPTY_ACTIONS: readonly EditorAction[] = Object.freeze([]);
const EMPTY_SELECTION: SelectionView = Object.freeze({
	type: 'text',
	collapsed: true,
	geometry: null,
});

export class EditorUIRuntime implements EditorUIService {
	readonly interaction: EditorInteraction;
	readonly popups: PopupManager;
	private readonly geometry: SelectionObserver;
	private readonly listeners = new Set<(actions: readonly EditorAction[]) => void>();
	private readonly unsubscribeRegistry: () => void;
	private readonly onComposition = (): void => {
		queueMicrotask(() => this.refresh());
	};
	private actions: readonly EditorAction[] = EMPTY_ACTIONS;
	private controller: ToolbarPopupController | null = null;
	private activeAction: string | null = null;
	private ready = false;
	private destroyed = false;

	constructor(
		private readonly context: PluginContext,
		private readonly canExecute: (name: string) => boolean,
		private readonly logger: Logger,
	) {
		const container = context.getContainer();
		this.interaction = new EditorInteraction(
			container,
			context.getState,
			context.getCompositionState,
		);
		this.popups = new PopupManager(container, (element) => this.registerInteraction(element));
		this.geometry = new SelectionObserver(
			container,
			() => this.getSelection(),
			(error) => this.report(error),
		);
		this.unsubscribeRegistry = context.getToolbarRegistry().subscribe(() => this.refresh());
		context.registerStyleSheet(UI_POPUP_CSS);
		context.registerService(EditorUIServiceKey, this);
		context.registerService(PopupServiceKey, this.popups);
		container.addEventListener('compositionstart', this.onComposition);
		container.addEventListener('compositionend', this.onComposition);
	}

	async start(): Promise<void> {
		const locale = await resolveLocale(
			this.context,
			undefined,
			TOOLBAR_LOCALE_EN,
			loadToolbarLocale,
		);
		if (this.destroyed) return;
		this.controller = new ToolbarPopupController(
			() => getDeepActiveHTMLElement(this.context.getContainer()),
			locale,
		);
		this.controller.setPopupManager(this.popups);
		this.ready = true;
		this.interaction.start();
		this.refresh();
	}

	getActions(): readonly EditorAction[] {
		return this.actions;
	}

	subscribeActions(listener: (actions: readonly EditorAction[]) => void): () => void {
		if (this.destroyed) return () => {};
		this.listeners.add(listener);
		this.deliver(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	refresh(): void {
		if (!this.ready || this.destroyed) return;
		const next = this.context
			.getToolbarRegistry()
			.getToolbarItems()
			.map((item) => this.snapshot(item));
		if (this.activeAction && !next.find((a) => a.id === this.activeAction)?.enabled)
			this.closePopup();
		if (JSON.stringify(next) !== JSON.stringify(this.actions)) {
			this.actions = Object.freeze(next);
			for (const listener of [...this.listeners])
				if (this.listeners.has(listener)) this.deliver(listener);
		}
		this.geometry.invalidate();
	}

	executeAction(id: string): boolean {
		const item = this.availableItem(id);
		if (!item || item.popupType) return false;
		return this.context.executeCommand(item.command);
	}

	openAction(id: string, options: ActionPopupOptions = {}): PopupHandle | null {
		const item = this.availableItem(id);
		if (!item?.popupType || !this.controller) return null;
		const anchor = options.anchor ?? this.createSelectionAnchor();
		if ('getRect' in anchor && !anchor.getRect()) return null;
		this.closePopup();
		this.activeAction = id;
		try {
			return this.controller.open(item, this.context, {
				...options,
				anchor,
				onClose: () => {
					this.activeAction = null;
				},
			});
		} catch (error) {
			this.closePopup();
			this.report(error);
			return null;
		}
	}

	closePopup(): void {
		this.activeAction = null;
		this.controller?.close();
	}
	isPopupOpen(): boolean {
		return this.controller?.isOpen() ?? false;
	}

	getSelection(): SelectionView {
		if (!this.ready || this.destroyed) return EMPTY_SELECTION;
		const cells = this.context.getService(TableSelectionServiceKey)?.getSelectedCellIds() ?? [];
		return measureSelection(
			this.context.getContainer(),
			this.context.getState().selection,
			cells,
			this.context.getCompositionState().isComposing,
		);
	}

	subscribeSelection(listener: (selection: SelectionView) => void): () => void {
		return this.geometry.subscribe(listener);
	}

	invalidateGeometry(): void {
		this.geometry.invalidate();
	}

	createSelectionAnchor(edge: 'bounds' | 'anchor' | 'focus' = 'bounds'): PopupAnchor {
		let measured: SelectionView | undefined;
		return Object.freeze({
			getRect: () =>
				this.destroyed ? null : ((measured ?? this.getSelection()).geometry?.[edge] ?? null),
			subscribe: (listener: () => void) => {
				const unsubscribe = this.subscribeSelection((view) => {
					measured = view;
					listener();
				});
				return () => {
					unsubscribe();
					measured = undefined;
				};
			},
		});
	}

	registerInteraction(element: HTMLElement): () => void {
		return this.interaction.register(element);
	}
	focus(element: HTMLElement): boolean {
		return this.ready && this.interaction.focus(element);
	}
	focusEditor(): boolean {
		return this.ready && this.interaction.focusEditor();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.ready = false;
		this.listeners.clear();
		this.unsubscribeRegistry();
		this.context.getContainer().removeEventListener('compositionstart', this.onComposition);
		this.context.getContainer().removeEventListener('compositionend', this.onComposition);
		this.geometry.destroy();
		this.interaction.destroy();
		this.popups.destroy();
		this.controller?.destroy();
		this.controller = null;
		this.actions = EMPTY_ACTIONS;
	}

	private availableItem(id: string): ToolbarItem | null {
		if (!this.ready || this.destroyed || this.context.getCompositionState().isComposing)
			return null;
		const item = this.context.getToolbarRegistry().getToolbarItem(id);
		return item && this.snapshot(item).enabled ? item : null;
	}

	private snapshot(item: ToolbarItem): EditorAction {
		const state = this.context.getState();
		let enabled = false;
		let active = false;
		let icon = item.icon ?? '';
		let value: string | null = null;
		try {
			// Popups without a command are declarative renderers (e.g. grid pickers).
			enabled =
				(item.command
					? this.canExecute(item.command)
					: !!item.popupType && !this.context.isReadOnly()) &&
				(item.isEnabled?.(state) ?? true) &&
				!this.context.getCompositionState().isComposing;
			active = item.isActive?.(state) ?? false;
			icon = item.getIcon?.(state) ?? icon;
			value = item.popupType === 'combobox' ? item.getLabel(state) : null;
		} catch (error) {
			enabled = false;
			this.report(error);
		}
		return Object.freeze({
			id: item.id,
			group: item.group,
			label: item.label,
			tooltip: item.tooltip ?? item.label,
			icon,
			value,
			active,
			enabled,
			popupType: item.popupType ?? null,
		});
	}

	private deliver(listener: (actions: readonly EditorAction[]) => void): void {
		try {
			listener(this.actions);
		} catch (error) {
			this.report(error);
		}
	}
	private report(error: unknown): void {
		this.logger.error('[EditorUI] callback failed', error);
	}
}
