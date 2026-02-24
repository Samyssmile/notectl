import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperLayoutController } from './PaperLayoutController.js';
import { PaperSize } from './PaperSize.js';

/**
 * Creates a minimal editor DOM matching the structure from EditorDOM.ts.
 */
function createMockEditorDOM(): {
	wrapper: HTMLElement;
	content: HTMLElement;
	topContainer: HTMLElement;
	bottomContainer: HTMLElement;
} {
	const wrapper: HTMLElement = document.createElement('div');
	wrapper.className = 'notectl-editor';

	const topContainer: HTMLElement = document.createElement('div');
	topContainer.className = 'notectl-plugin-container--top';

	const content: HTMLElement = document.createElement('div');
	content.className = 'notectl-content';

	const bottomContainer: HTMLElement = document.createElement('div');
	bottomContainer.className = 'notectl-plugin-container--bottom';

	const announcer: HTMLElement = document.createElement('div');
	announcer.className = 'notectl-sr-only';

	wrapper.appendChild(topContainer);
	wrapper.appendChild(content);
	wrapper.appendChild(bottomContainer);
	wrapper.appendChild(announcer);

	return { wrapper, content, topContainer, bottomContainer };
}

/** Stub ResizeObserver for happy-dom. */
class StubResizeObserver {
	callback: ResizeObserverCallback;
	observed: Element[] = [];

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}

	observe(target: Element): void {
		this.observed.push(target);
	}

	unobserve(_target: Element): void {
		/* no-op */
	}

	disconnect(): void {
		this.observed = [];
	}
}

let resizeObservers: StubResizeObserver[] = [];

beforeEach(() => {
	resizeObservers = [];
	vi.stubGlobal(
		'ResizeObserver',
		class extends StubResizeObserver {
			constructor(cb: ResizeObserverCallback) {
				super(cb);
				resizeObservers.push(this);
			}
		},
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('PaperLayoutController', () => {
	describe('apply(paperSize)', () => {
		it('creates viewport and surface DOM elements', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			const viewport: Element | null = wrapper.querySelector('.notectl-paper-viewport');
			const surface: Element | null = wrapper.querySelector('.notectl-paper-surface');
			expect(viewport).not.toBeNull();
			expect(surface).not.toBeNull();
		});

		it('reparents content into surface', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			const surface: Element | null = wrapper.querySelector('.notectl-paper-surface');
			expect(surface?.contains(content)).toBe(true);
		});

		it('sets data-paper-mode attribute on wrapper', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			expect(wrapper.getAttribute('data-paper-mode')).toBe('din-a4');
		});

		it('sets surface dimensions to paper pixel size', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			const surface = wrapper.querySelector('.notectl-paper-surface') as HTMLElement;
			expect(surface.style.width).toBe('794px');
			expect(surface.style.minHeight).toBe('1123px');
		});

		it('inserts viewport before bottom plugin container', () => {
			const { wrapper, content, bottomContainer } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			const viewport: Element | null = wrapper.querySelector('.notectl-paper-viewport');
			expect(viewport?.nextElementSibling).toBe(bottomContainer);
		});
	});

	describe('apply(null) — disable', () => {
		it('restores content to wrapper and removes viewport', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(null);

			expect(wrapper.querySelector('.notectl-paper-viewport')).toBeNull();
			expect(wrapper.querySelector('.notectl-paper-surface')).toBeNull();
			expect(wrapper.contains(content)).toBe(true);
		});

		it('removes data-paper-mode attribute', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(null);

			expect(wrapper.hasAttribute('data-paper-mode')).toBe(false);
		});

		it('restores content before bottom container', () => {
			const { wrapper, content, bottomContainer } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(null);

			expect(content.nextElementSibling).toBe(bottomContainer);
		});
	});

	describe('switching sizes', () => {
		it('updates data-paper-mode when switching', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(PaperSize.USLetter);

			expect(wrapper.getAttribute('data-paper-mode')).toBe('us-letter');
		});

		it('updates surface dimensions when switching', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(PaperSize.USLetter);

			const surface = wrapper.querySelector('.notectl-paper-surface') as HTMLElement;
			expect(surface.style.width).toBe('816px');
			expect(surface.style.minHeight).toBe('1056px');
		});

		it('does not create duplicate viewports', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(PaperSize.USLetter);

			const viewports: NodeListOf<Element> = wrapper.querySelectorAll('.notectl-paper-viewport');
			expect(viewports.length).toBe(1);
		});
	});

	describe('destroy()', () => {
		it('restores original DOM', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.destroy();

			expect(wrapper.querySelector('.notectl-paper-viewport')).toBeNull();
			expect(wrapper.contains(content)).toBe(true);
			expect(wrapper.hasAttribute('data-paper-mode')).toBe(false);
		});

		it('disconnects ResizeObservers', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			// Two observers: one for viewport, one for surface
			expect(resizeObservers.length).toBe(2);
			const disconnectSpies = resizeObservers.map((o) => vi.spyOn(o, 'disconnect'));

			controller.destroy();

			for (const spy of disconnectSpies) {
				expect(spy).toHaveBeenCalled();
			}
		});

		it('is safe to call multiple times', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.destroy();
			controller.destroy(); // should not throw
		});
	});

	describe('getPaperSize()', () => {
		it('returns null when disabled', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			expect(controller.getPaperSize()).toBeNull();
		});

		it('returns current paper size when enabled', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA5);

			expect(controller.getPaperSize()).toBe(PaperSize.DINA5);
		});

		it('returns null after disable', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);
			controller.apply(null);

			expect(controller.getPaperSize()).toBeNull();
		});
	});

	describe('scale calculation', () => {
		it('applies scale transform when viewport is narrower than paper', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			// Simulate viewport resize: 500px viewport, 24px padding each side = 452px available
			// Paper width = 794px, scale = 452/794 ≈ 0.569
			const viewportObserver: StubResizeObserver | undefined = resizeObservers[0];
			const viewport: Element | null = wrapper.querySelector('.notectl-paper-viewport');
			if (viewportObserver && viewport) {
				viewportObserver.callback(
					[{ target: viewport, contentRect: { width: 500 } } as unknown as ResizeObserverEntry],
					viewportObserver as unknown as ResizeObserver,
				);
			}

			const surface = wrapper.querySelector('.notectl-paper-surface') as HTMLElement;
			expect(surface.style.transform).toContain('scale(');
			const scaleMatch: RegExpMatchArray | null =
				surface.style.transform.match(/scale\(([\d.]+)\)/);
			const scale: number = Number.parseFloat(scaleMatch?.[1] ?? '0');
			expect(scale).toBeCloseTo(0.569, 2);
		});

		it('removes scale transform when viewport is wider than paper', () => {
			const { wrapper, content } = createMockEditorDOM();
			const controller = new PaperLayoutController(wrapper, content);

			controller.apply(PaperSize.DINA4);

			// Simulate wide viewport: 1200px
			const viewportObserver: StubResizeObserver | undefined = resizeObservers[0];
			const viewport: Element | null = wrapper.querySelector('.notectl-paper-viewport');
			if (viewportObserver && viewport) {
				viewportObserver.callback(
					[
						{
							target: viewport,
							contentRect: { width: 1200 },
						} as unknown as ResizeObserverEntry,
					],
					viewportObserver as unknown as ResizeObserver,
				);
			}

			const surface = wrapper.querySelector('.notectl-paper-surface') as HTMLElement;
			expect(surface.style.transform).toBe('');
		});
	});
});
