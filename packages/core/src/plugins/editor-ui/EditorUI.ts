import { ServiceKey } from '../../model/TypedKeys.js';
import type { SelectionView } from '../../view/SelectionGeometry.js';
import type { PopupAnchor, PopupConfig, PopupHandle } from '../shared/PopupManager.js';
import type { PopupType, ToolbarGroup } from '../toolbar/ToolbarItem.js';

/** Evaluated presentation data, never live plugin callbacks or mutable registry entries. */
export interface EditorAction {
	readonly id: string;
	readonly group: ToolbarGroup;
	readonly label: string;
	readonly tooltip: string;
	readonly icon: string;
	readonly active: boolean;
	readonly enabled: boolean;
	readonly popupType: PopupType | null;
	/** Current combobox value, distinct from its accessible name. */
	readonly value: string | null;
}

export interface ActionPopupOptions {
	/** Defaults to a live selection anchor. */
	readonly anchor?: PopupConfig['anchor'];
	readonly restoreFocusTo?: HTMLElement;
	/** Optional control whose aria-expanded state follows the popup. */
	readonly trigger?: HTMLElement;
}

export interface EditorUIService {
	getActions(): readonly EditorAction[];
	/** Immediately receives a snapshot, then changes; returns an idempotent unsubscribe. */
	subscribeActions(listener: (actions: readonly EditorAction[]) => void): () => void;
	/** Re-evaluates callbacks after application state changes outside a transaction. */
	refresh(): void;
	/** Executes a button action against the current model selection. Popups use openAction. */
	executeAction(id: string): boolean;
	/** Renders any registered popup type using the feature's existing implementation. */
	openAction(id: string, options?: ActionPopupOptions): PopupHandle | null;
	closePopup(): void;
	isPopupOpen(): boolean;
	getSelection(): SelectionView;
	subscribeSelection(listener: (selection: SelectionView) => void): () => void;
	/** Coalesced remeasurement for application-driven layout changes. */
	invalidateGeometry(): void;
	createSelectionAnchor(edge?: 'bounds' | 'anchor' | 'focus'): PopupAnchor;
	/** Registers a UI subtree, including one outside the editor's shadow root. */
	registerInteraction(element: HTMLElement): () => void;
	/** Focuses a connected control in a registered interaction subtree. */
	focus(element: HTMLElement): boolean;
	/** Returns to the editor and restores the latest transaction-mapped selection. */
	focusEditor(): boolean;
}

export const EditorUIServiceKey = new ServiceKey<EditorUIService>('editorUI');
