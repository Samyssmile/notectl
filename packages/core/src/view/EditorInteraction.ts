/** Focus ownership without storing stale copies of the model selection. */
import type { CompositionState } from '../model/CompositionState.js';
import type { EditorState } from '../state/EditorState.js';
import { syncSelectionToDOM } from './SelectionSync.js';

export class EditorInteraction {
	private readonly elements = new Map<HTMLElement, number>();
	private destroyed = false;
	private ready = false;
	private readonly onFocus = (): void => {
		this.restoreSelection();
	};

	constructor(
		private readonly container: HTMLElement,
		private readonly getState: () => EditorState,
		private readonly composition: () => CompositionState,
	) {
		container.addEventListener('focus', this.onFocus);
	}

	start(): void {
		this.ready = true;
	}

	register(element: HTMLElement): () => void {
		if (this.destroyed) return () => {};
		this.elements.set(element, (this.elements.get(element) ?? 0) + 1);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			const count = this.elements.get(element) ?? 0;
			if (count > 1) this.elements.set(element, count - 1);
			else this.elements.delete(element);
		};
	}

	contains(node: Node | null): boolean {
		let current: Node | null = node;
		while (current) {
			if (
				current === this.container ||
				[...this.elements.keys()].some((el) => el.contains(current))
			)
				return true;
			current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
		}
		return false;
	}

	focus(element: HTMLElement): boolean {
		if (
			this.destroyed ||
			this.composition().isComposing ||
			!element.isConnected ||
			!this.contains(element)
		)
			return false;
		element.focus({ preventScroll: true });
		return this.activeElement() === element;
	}

	focusEditor(): boolean {
		if (this.destroyed || !this.container.isConnected || this.composition().isComposing)
			return false;
		this.container.focus({ preventScroll: true });
		this.restoreSelection();
		return this.activeElement() === this.container;
	}

	/** Updates may render while an input or another editor owns the browser selection. */
	shouldSyncSelection(): boolean {
		const active = this.activeElement();
		return (
			!active || active === this.container.ownerDocument.body || this.container.contains(active)
		);
	}

	destroy(): void {
		this.destroyed = true;
		this.container.removeEventListener('focus', this.onFocus);
		this.elements.clear();
	}

	private activeElement(): Element | null {
		let active = this.container.ownerDocument.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		return active;
	}

	private restoreSelection(): void {
		if (this.ready && !this.destroyed && !this.composition().isComposing) {
			syncSelectionToDOM(this.container, this.getState().selection);
		}
	}
}
