/** Lazily observes layout while selection geometry has consumers. */
import type { SelectionView } from './SelectionGeometry.js';

export class SelectionObserver {
	private readonly listeners = new Set<(view: SelectionView) => void>();
	private cleanups: (() => void)[] = [];
	private frame: number | null = null;
	private destroyed = false;
	private previous = '';

	constructor(
		private readonly container: HTMLElement,
		private readonly measure: () => SelectionView,
		private readonly reportError: (error: unknown) => void,
	) {}

	subscribe(listener: (view: SelectionView) => void): () => void {
		if (this.destroyed) return () => {};
		this.listeners.add(listener);
		if (this.listeners.size === 1) this.observe();
		this.deliver(listener, this.measure());
		return () => {
			this.listeners.delete(listener);
			if (!this.listeners.size) this.stop();
		};
	}

	readonly invalidate = (): void => {
		if (this.destroyed || !this.listeners.size || this.frame !== null) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = null;
			const view = this.measure();
			const serialized = JSON.stringify(view);
			if (serialized === this.previous) return;
			this.previous = serialized;
			for (const listener of [...this.listeners]) {
				if (this.listeners.has(listener)) this.deliver(listener, view);
			}
		});
	};

	destroy(): void {
		this.destroyed = true;
		this.listeners.clear();
		this.stop();
	}

	private deliver(listener: (view: SelectionView) => void, view: SelectionView): void {
		try {
			listener(view);
		} catch (error) {
			this.reportError(error);
		}
	}

	private observe(): void {
		const doc = this.container.ownerDocument;
		const win = doc.defaultView;
		const listen = (target: EventTarget, name: string): void => {
			target.addEventListener(name, this.invalidate, true);
			this.cleanups.push(() => target.removeEventListener(name, this.invalidate, true));
		};
		// Scroll does not cross a shadow boundary: also observe each containing root.
		let ancestor: Node | null = this.container;
		const resize =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.invalidate);
		const attributes = new MutationObserver(this.invalidate);
		while (ancestor) {
			if (ancestor instanceof Element) {
				resize?.observe(ancestor);
				attributes.observe(ancestor, {
					attributes: true,
					attributeFilter: ['class', 'style', 'dir', 'hidden'],
				});
			}
			if (ancestor instanceof ShadowRoot || ancestor instanceof Document)
				listen(ancestor, 'scroll');
			ancestor = ancestor instanceof ShadowRoot ? ancestor.host : ancestor.parentNode;
		}
		const content = new MutationObserver(this.invalidate);
		listen(doc, 'scroll');
		content.observe(this.container, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});
		this.cleanups.push(
			() => resize?.disconnect(),
			() => attributes.disconnect(),
			() => content.disconnect(),
		);
		listen(this.container, 'load');
		listen(this.container, 'compositionend');
		if (win) listen(win, 'resize');
		if (win?.visualViewport) {
			listen(win.visualViewport, 'resize');
			listen(win.visualViewport, 'scroll');
		}
		if (doc.fonts) listen(doc.fonts, 'loadingdone');
		this.invalidate();
	}

	private stop(): void {
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups = [];
		if (this.frame !== null) cancelAnimationFrame(this.frame);
		this.frame = null;
		this.previous = '';
	}
}
