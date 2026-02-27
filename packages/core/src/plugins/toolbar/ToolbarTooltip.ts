/**
 * ToolbarTooltip: manages the tooltip lifecycle for toolbar buttons.
 * Shows a tooltip after a short delay when hovering or focusing a button,
 * hides it when the cursor leaves or focus moves away.
 */

import { setStyleProperties, setStyleProperty } from '../../style/StyleRuntime.js';

const TOOLTIP_DELAY_MS = 500;

export class ToolbarTooltip {
	private readonly element: HTMLElement;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private target: HTMLButtonElement | null = null;
	private readonly isPopupActive: () => boolean;

	static readonly TOOLTIP_ID = 'notectl-toolbar-tooltip';

	constructor(isPopupActive: () => boolean) {
		this.isPopupActive = isPopupActive;
		this.element = document.createElement('div');
		this.element.className = 'notectl-toolbar-tooltip';
		this.element.id = ToolbarTooltip.TOOLTIP_ID;
		this.element.setAttribute('role', 'tooltip');
		setStyleProperty(this.element, 'display', 'none');
	}

	show(button: HTMLButtonElement): void {
		this.hide();

		if (this.isPopupActive() || button.disabled) return;

		const text: string | null = button.getAttribute('data-tooltip');
		if (!text) return;

		this.target = button;

		this.timer = setTimeout(() => {
			if (this.isPopupActive()) return;

			this.element.textContent = text;
			setStyleProperty(this.element, 'display', '');

			const root: Node = button.getRootNode();
			if (root instanceof ShadowRoot && !this.element.parentNode) {
				root.appendChild(this.element);
			} else if (!(root instanceof ShadowRoot) && !this.element.parentNode) {
				document.body.appendChild(this.element);
			}

			button.setAttribute('aria-describedby', ToolbarTooltip.TOOLTIP_ID);

			const rect: DOMRect = button.getBoundingClientRect();
			setStyleProperties(this.element, {
				position: 'fixed',
				top: `${rect.bottom + 6}px`,
				left: `${rect.left + rect.width / 2}px`,
				transform: 'translateX(-50%)',
			});
		}, TOOLTIP_DELAY_MS);
	}

	hide(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.target) {
			this.target.removeAttribute('aria-describedby');
			this.target = null;
		}
		setStyleProperty(this.element, 'display', 'none');
	}

	destroy(): void {
		this.hide();
		this.element.remove();
	}
}
