import { type Locator, type Page, test as base } from '@playwright/test';

/** Typed API surface exposed by the `<notectl-editor>` custom element. */
interface NotectlEditorElement extends HTMLElement {
	init(config: unknown): Promise<void>;
	destroy(): void;
	configure(config: unknown): void;
	configurePlugin(pluginId: string, config: unknown): void;
	getText(): string;
	getJSON(): {
		children: {
			type: string;
			children: { text: string; marks: { type: string }[] }[];
		}[];
	};
	getContentHTML(): Promise<string>;
	setContentHTML(html: string): Promise<void>;
	setJSON(doc: unknown): void;
	getState(): unknown;
	can(): {
		toggleBold(): boolean;
		toggleItalic(): boolean;
		toggleUnderline(): boolean;
		undo(): boolean;
		redo(): boolean;
		selectAll(): boolean;
	};
	canExecuteCommand(name: string): boolean;
	on(event: string, cb: () => void): void;
}

type ClipboardPayload = Record<string, string>;

type El = NotectlEditorElement;
const SEL = 'notectl-editor';

/** Descriptor for a plugin class exposed on `window` by the example app. */
interface PluginDescriptor {
	/** Class name on `window`, e.g. `'FontSizePlugin'` or `'TextFormattingPlugin'`. */
	readonly name: string;
	/** Optional constructor config passed to `new Plugin(config)`. */
	readonly config?: unknown;
}

/** Options for {@link EditorPage.recreateWithPlugins}. */
interface PluginRecreateOptions {
	/** Toolbar groups — each group is displayed as a visual section. */
	readonly toolbar: ReadonlyArray<ReadonlyArray<PluginDescriptor>>;
	/** Whether to autofocus the editor. Defaults to `true`. */
	readonly autofocus?: boolean;
}

/** Page-object model for `<notectl-editor>`. */
export class EditorPage {
	readonly root: Locator;
	readonly content: Locator;

	constructor(public readonly page: Page) {
		this.root = page.locator(SEL);
		this.content = this.root.locator('div.notectl-content');
	}

	// ── Locators ────────────────────────────────────────────────

	markButton(type: string): Locator {
		return this.root.locator(`button[data-toolbar-item="${type}"]`);
	}

	toolbar(): Locator {
		return this.root.locator('[role="toolbar"]');
	}

	announcer(): Locator {
		return this.root.locator('[aria-live="polite"]');
	}

	popup(): Locator {
		return this.root.locator('.notectl-toolbar-popup');
	}

	dropdownItems(): Locator {
		return this.root.locator('[role="menuitem"]');
	}

	// ── Navigation ──────────────────────────────────────────────

	async goto(): Promise<void> {
		for (let attempt = 0; attempt < 3; attempt++) {
			await this.page.goto('/', { waitUntil: 'networkidle' });
			try {
				await this.root.waitFor({ state: 'visible', timeout: 10_000 });
				await this.content.waitFor({ state: 'visible', timeout: 5_000 });
				return;
			} catch {
				if (attempt === 2) throw new Error('Editor failed to initialize after 3 attempts');
			}
		}
	}

	/**
	 * Destroys the current editor and creates a fresh one with arbitrary
	 * plugin configurations. Each toolbar group is an array of plugin
	 * descriptors referencing classes exposed on `window` by the example app
	 * (see `examples/vanillajs/src/main.ts`).
	 *
	 * @example
	 * ```ts
	 * await editor.recreateWithPlugins({
	 *   toolbar: [
	 *     [{ name: 'FontSizePlugin', config: { sizes: [12, 16], defaultSize: 12 } }],
	 *     [{ name: 'TextFormattingPlugin', config: { bold: true } }],
	 *   ],
	 *   autofocus: true,
	 * });
	 * ```
	 */
	async recreateWithPlugins(options: PluginRecreateOptions): Promise<void> {
		await this.page.evaluate(async (opts) => {
			const container = document.getElementById('editor-container');
			const existing = container?.querySelector('notectl-editor');
			if (existing) {
				(existing as unknown as El).destroy();
				existing.remove();
			}
			if (!container) return;

			const W = window as unknown as Record<string, new (cfg?: unknown) => unknown>;
			const toolbarGroups: unknown[][] = (opts.toolbar ?? []).map(
				(group: { name: string; config?: unknown }[]) =>
					group.map((desc) => {
						const Ctor = W[desc.name];
						if (!Ctor) throw new Error(`Plugin "${desc.name}" not found on window`);
						return new Ctor(desc.config);
					}),
			);

			const el = document.createElement('notectl-editor') as unknown as El;
			await el.init({
				toolbar: toolbarGroups,
				autofocus: opts.autofocus ?? true,
			});
			container.appendChild(el);
		}, options);
		await this.content.waitFor();
	}

	/** Destroys the current editor and creates a fresh one with the given config. */
	async recreate(config: Record<string, unknown>): Promise<void> {
		await this.page.evaluate(async (cfg) => {
			const container = document.getElementById('editor-container');
			const existing = container.querySelector('notectl-editor');
			if (existing) {
				(existing as unknown as El).destroy();
				existing.remove();
			}
			if (!container) return;

			const { toolbar, features, ...rest } = cfg;
			const TP = (window as unknown as Record<string, unknown>).ToolbarPlugin as new () => unknown;
			const TFP = (window as unknown as Record<string, unknown>).TextFormattingPlugin as new (
				config?: unknown,
			) => unknown;

			const feat = features as Record<string, boolean> | undefined;
			const tb = toolbar as Record<string, boolean> | undefined;

			const textFormattingConfig: Record<string, unknown> = {
				bold: feat?.bold ?? true,
				italic: feat?.italic ?? true,
				underline: feat?.underline ?? true,
			};
			if (tb) {
				textFormattingConfig.toolbar = {
					bold: tb.bold ?? true,
					italic: tb.italic ?? true,
					underline: tb.underline ?? true,
				};
			}

			const plugins = [new TP(), new TFP(textFormattingConfig)];

			const el = document.createElement('notectl-editor') as unknown as El;
			await el.init({ ...rest, plugins });
			container.appendChild(el);
		}, config);
		await this.content.waitFor();
	}

	// ── Input ───────────────────────────────────────────────────

	async focus(): Promise<void> {
		await this.content.click();
		await this.content.focus();
	}

	async typeText(text: string): Promise<void> {
		await this.focus();
		await this.page.keyboard.type(text, { delay: 10 });
	}

	async pasteText(text: string): Promise<void> {
		await this.page.evaluate((t) => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return;
			const dt = new DataTransfer();
			dt.setData('text/plain', t);
			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
			content.dispatchEvent(event);
		}, text);
	}

	async pasteHTML(html: string): Promise<void> {
		await this.page.evaluate((h) => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return;
			const dt = new DataTransfer();
			dt.setData('text/html', h);
			dt.setData('text/plain', '');
			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
			content.dispatchEvent(event);
		}, html);
	}

	async copySelection(): Promise<ClipboardPayload> {
		return this.page.evaluate(() => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return {};

			const dt = new DataTransfer();
			const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
			content.dispatchEvent(event);

			const payload: ClipboardPayload = {};
			for (const type of Array.from(dt.types)) {
				payload[type] = dt.getData(type);
			}
			return payload;
		});
	}

	async pasteClipboardData(payload: ClipboardPayload): Promise<void> {
		await this.page.evaluate((data) => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return;

			const dt = new DataTransfer();
			for (const [type, value] of Object.entries(data)) {
				dt.setData(type, value);
			}

			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
			content.dispatchEvent(event);
		}, payload);
	}

	// ── Touch ──────────────────────────────────────────────────

	async tapFocus(): Promise<void> {
		await this.content.tap();
	}

	async tapMarkButton(type: string): Promise<void> {
		await this.markButton(type).tap();
	}

	/**
	 * Sets a DOM selection range on a block within the editor.
	 * Uses `page.evaluate()` to programmatically create a Selection,
	 * simulating what a touch long-press selection would produce.
	 */
	async selectRange(blockIndex: number, startOffset: number, endOffset: number): Promise<void> {
		await this.page.evaluate(
			({ blockIdx, start, end }) => {
				const editor = document.querySelector('notectl-editor');
				const content = editor?.shadowRoot?.querySelector('.notectl-content');
				if (!content) return;
				const blocks = content.querySelectorAll('[data-block-id]');
				const block = blocks[blockIdx];
				if (!block) return;

				// Find the text node within the block
				const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
				let accumulated = 0;
				let startNode: Text | null = null;
				let startOff = 0;
				let endNode: Text | null = null;
				let endOff = 0;

				let next = walker.nextNode() as Text | null;
				while (next) {
					const len = next.length;
					if (!startNode && accumulated + len >= start) {
						startNode = next;
						startOff = start - accumulated;
					}
					if (!endNode && accumulated + len >= end) {
						endNode = next;
						endOff = end - accumulated;
						break;
					}
					accumulated += len;
					next = walker.nextNode() as Text | null;
				}

				if (!startNode || !endNode) return;

				const range = document.createRange();
				range.setStart(startNode, startOff);
				range.setEnd(endNode, endOff);
				const sel = window.getSelection();
				sel?.removeAllRanges();
				sel?.addRange(range);

				// Dispatch a selectionchange event so the editor picks it up
				document.dispatchEvent(new Event('selectionchange'));
			},
			{ blockIdx: blockIndex, start: startOffset, end: endOffset },
		);
		// Allow the editor's selection sync to process
		await this.page.waitForTimeout(150);
	}

	// ── Content ─────────────────────────────────────────────────

	async getText(): Promise<string> {
		return this.page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as El).getText(),
		);
	}

	async getJSON() {
		return this.page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as El).getJSON(),
		);
	}

	async getContentHTML(): Promise<string> {
		return this.page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as El).getContentHTML(),
		);
	}

	async setContentHTML(html: string): Promise<void> {
		await this.page.evaluate(
			(h) => (document.querySelector('notectl-editor') as unknown as El).setContentHTML(h),
			html,
		);
	}

	async setJSON(doc: unknown): Promise<void> {
		await this.page.evaluate(
			(d) => (document.querySelector('notectl-editor') as unknown as El).setJSON(d),
			doc,
		);
	}

	// ── API ─────────────────────────────────────────────────────

	async configure(config: unknown): Promise<void> {
		await this.page.evaluate(
			(c) => (document.querySelector('notectl-editor') as unknown as El).configure(c),
			config,
		);
	}

	async configurePlugin(pluginId: string, config: unknown): Promise<void> {
		await this.page.evaluate(
			({ id, cfg }) =>
				(document.querySelector('notectl-editor') as unknown as El).configurePlugin(id, cfg),
			{ id: pluginId, cfg: config },
		);
	}

	async destroy(): Promise<void> {
		return this.page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as El).destroy(),
		);
	}

	async getCanChecks() {
		return this.page.evaluate(() => {
			const c = (document.querySelector('notectl-editor') as unknown as El).can();
			return {
				bold: c.toggleBold(),
				italic: c.toggleItalic(),
				underline: c.toggleUnderline(),
				undo: c.undo(),
				redo: c.redo(),
			};
		});
	}

	async registerStateChangeCounter(): Promise<void> {
		await this.page.evaluate(() => {
			(window as unknown as Record<string, number>).__stateChangeCount = 0;
			(document.querySelector('notectl-editor') as unknown as El).on('stateChange', () => {
				(window as unknown as Record<string, number>).__stateChangeCount++;
			});
		});
	}

	async getStateChangeCount(): Promise<number> {
		return this.page.evaluate(
			() => (window as unknown as Record<string, number>).__stateChangeCount,
		);
	}

	// ── History ─────────────────────────────────────────────────

	/**
	 * Waits long enough for the editor's undo-grouping timeout (500 ms) to
	 * expire so that subsequent input starts a new undo group.
	 */
	async waitForUndoGroup(): Promise<void> {
		await this.page.waitForTimeout(600);
	}
}

/** Custom Playwright fixture that provides a ready-to-use `EditorPage`. */
export const test = base.extend<{ editor: EditorPage }>({
	editor: async ({ page }, use) => {
		const editor = new EditorPage(page);
		await editor.goto();
		await use(editor);
	},
});

export { expect } from '@playwright/test';
