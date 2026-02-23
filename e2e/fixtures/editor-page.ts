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
	getHTML(): string;
	setHTML(html: string): void;
	setJSON(doc: unknown): void;
	getState(): unknown;
	can(): {
		toggleBold(): boolean;
		toggleItalic(): boolean;
		toggleUnderline(): boolean;
		undo(): boolean;
		redo(): boolean;
	};
	on(event: string, cb: () => void): void;
}

type El = NotectlEditorElement;
const SEL = 'notectl-editor';

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
		await this.page.goto('/', { waitUntil: 'networkidle' });
		await this.root.waitFor({ timeout: 15_000 });
		await this.content.waitFor({ timeout: 10_000 });
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
			content.dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: dt,
					bubbles: true,
					cancelable: true,
				}),
			);
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
			content.dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: dt,
					bubbles: true,
					cancelable: true,
				}),
			);
		}, html);
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

	async getHTML(): Promise<string> {
		return this.page.evaluate(() =>
			(document.querySelector('notectl-editor') as unknown as El).getHTML(),
		);
	}

	async setHTML(html: string): Promise<void> {
		await this.page.evaluate(
			(h) => (document.querySelector('notectl-editor') as unknown as El).setHTML(h),
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
