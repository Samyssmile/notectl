/**
 * Manages the paper-mode DOM transformation and scale-to-fit behavior.
 *
 * In paper mode, the content element is reparented into a viewport/surface
 * structure that constrains it to the exact paper width. A ResizeObserver
 * drives CSS `transform: scale()` when the container is narrower than
 * the paper, producing a Google Docs-like shrink-to-fit effect.
 */

import { PAPER_VIEWPORT_PADDING_PX, type PaperSize, getPaperDimensions } from './PaperSize.js';

export class PaperLayoutController {
	private readonly wrapper: HTMLElement;
	private readonly content: HTMLElement;

	private viewport: HTMLElement | null = null;
	private surface: HTMLElement | null = null;

	private viewportObserver: ResizeObserver | null = null;
	private surfaceObserver: ResizeObserver | null = null;

	private currentSize: PaperSize | null = null;
	private currentPaperWidthPx = 0;
	private currentPaperHeightPx = 0;
	private currentScale = 1;

	constructor(wrapper: HTMLElement, content: HTMLElement) {
		this.wrapper = wrapper;
		this.content = content;
	}

	/** Enables, changes, or disables paper mode. Pass `null` to disable. */
	apply(paperSize: PaperSize | null): void {
		if (paperSize === null) {
			this.disable();
			return;
		}

		const dims = getPaperDimensions(paperSize);
		this.currentPaperWidthPx = dims.widthPx;
		this.currentPaperHeightPx = dims.heightPx;
		this.currentSize = paperSize;

		if (!this.viewport) {
			this.enable();
		}

		this.updateSurfaceDimensions();
		this.wrapper.setAttribute('data-paper-mode', paperSize);
	}

	/** Cleans up observers and restores original DOM. */
	destroy(): void {
		this.disable();
	}

	/** Returns the currently applied paper size, or null if disabled. */
	getPaperSize(): PaperSize | null {
		return this.currentSize;
	}

	// --- Private ---

	private enable(): void {
		// Create viewport (scroll container)
		this.viewport = document.createElement('div');
		this.viewport.className = 'notectl-paper-viewport';

		// Create surface (page representation)
		this.surface = document.createElement('div');
		this.surface.className = 'notectl-paper-surface';

		// Reparent content: remove from wrapper, place inside surface
		this.wrapper.removeChild(this.content);
		this.surface.appendChild(this.content);
		this.viewport.appendChild(this.surface);

		// Insert viewport after top plugin container (index 1 in wrapper children)
		const bottomContainer: Element | null = this.wrapper.querySelector(
			'.notectl-plugin-container--bottom',
		);
		if (bottomContainer) {
			this.wrapper.insertBefore(this.viewport, bottomContainer);
		} else {
			this.wrapper.appendChild(this.viewport);
		}

		// Observe viewport width for scale-to-fit
		this.viewportObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				this.onViewportResize(entry.contentRect.width);
			}
		});
		this.viewportObserver.observe(this.viewport);

		// Observe surface height to compensate for layout shift from transform
		this.surfaceObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				this.onSurfaceResize(entry.contentRect.height);
			}
		});
		this.surfaceObserver.observe(this.surface);
	}

	private disable(): void {
		this.viewportObserver?.disconnect();
		this.viewportObserver = null;
		this.surfaceObserver?.disconnect();
		this.surfaceObserver = null;

		if (this.viewport && this.surface) {
			// Reparent content back to wrapper
			this.surface.removeChild(this.content);

			const bottomContainer: Element | null = this.wrapper.querySelector(
				'.notectl-plugin-container--bottom',
			);
			if (bottomContainer) {
				this.wrapper.insertBefore(this.content, bottomContainer);
			} else {
				this.wrapper.appendChild(this.content);
			}

			// Remove viewport from wrapper
			this.wrapper.removeChild(this.viewport);
		}

		this.viewport = null;
		this.surface = null;
		this.currentSize = null;
		this.currentPaperWidthPx = 0;
		this.currentPaperHeightPx = 0;
		this.currentScale = 1;
		this.wrapper.removeAttribute('data-paper-mode');
	}

	private updateSurfaceDimensions(): void {
		if (!this.surface) return;
		this.surface.style.width = `${this.currentPaperWidthPx}px`;
		this.surface.style.minHeight = `${this.currentPaperHeightPx}px`;
	}

	private onViewportResize(viewportWidth: number): void {
		if (!this.surface || this.currentPaperWidthPx === 0) return;

		const availableWidth: number = viewportWidth - 2 * PAPER_VIEWPORT_PADDING_PX;
		const scale: number = Math.min(1, availableWidth / this.currentPaperWidthPx);
		this.currentScale = scale;

		this.surface.style.transform = scale < 1 ? `scale(${scale})` : '';

		// Compensate margin-bottom so parent layout sees correct visual height
		this.updateHeightCompensation(scale);
	}

	private onSurfaceResize(_height: number): void {
		if (!this.surface || !this.viewport) return;
		this.updateHeightCompensation(this.currentScale);
	}

	private updateHeightCompensation(scale: number): void {
		if (!this.surface) return;

		if (scale >= 1) {
			this.surface.style.marginBottom = '';
			return;
		}

		// transform doesn't affect layout size, so the parent sees unscaled height.
		// Negative margin-bottom compensates: surfaceHeight * (1 - scale).
		const surfaceHeight: number = this.surface.scrollHeight;
		const visualHeight: number = surfaceHeight * scale;
		const compensation: number = visualHeight - surfaceHeight;
		this.surface.style.marginBottom = `${compensation}px`;
	}
}
