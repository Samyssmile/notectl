import { type Locator, type Page, test as base } from '@playwright/test';

/** Typed API surface exposed by the `<notectl-editor>` custom element. */
interface NotectlEditorElement extends HTMLElement {
	getText(): string;
	getJSON(): {
		children: {
			type: string;
			children: { text: string; marks: { type: string }[] }[];
		}[];
	};
	getContentHTML(): string;
	setContentHTML(html: string): void;
	setJSON(doc: unknown): void;
	getState(): { doc: unknown };
}

type El = NotectlEditorElement;
const WC_SEL = 'ntl-editor notectl-editor';

/**
 * Page-object model for the Angular example app.
 *
 * The Angular app wraps `<notectl-editor>` inside the `<ntl-editor>` component.
 * Control buttons use text labels (no IDs), and output goes to a `<pre>` in `.output`.
 */
export class AngularEditorPage {
	readonly root: Locator;
	readonly content: Locator;
	readonly output: Locator;

	constructor(public readonly page: Page) {
		this.root = page.locator(WC_SEL);
		this.content = this.root.locator('div.notectl-content');
		this.output = page.locator('.output pre');
	}

	// -- Locators --------------------------------------------------------

	toolbar(): Locator {
		return this.root.locator('[role="toolbar"]');
	}

	markButton(type: string): Locator {
		return this.root.locator(`button[data-toolbar-item="${type}"]`);
	}

	controlButton(name: string): Locator {
		return this.page.locator('.controls').getByRole('button', { name });
	}

	testIndicators(): Locator {
		return this.page.locator('.test-indicators');
	}

	// -- Navigation ------------------------------------------------------

	async goto(): Promise<void> {
		await this.page.goto('/');
		await this.root.waitFor({ timeout: 30_000 });
		await this.content.waitFor({ timeout: 10_000 });
	}

	// -- Input -----------------------------------------------------------

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
			const editor = document.querySelector('ntl-editor notectl-editor');
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
			const editor = document.querySelector('ntl-editor notectl-editor');
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

	// -- Content (direct Web Component access) ---------------------------

	async getText(): Promise<string> {
		return this.page.evaluate(() =>
			(document.querySelector('ntl-editor notectl-editor') as unknown as El).getText(),
		);
	}

	async getJSON() {
		return this.page.evaluate(() =>
			(document.querySelector('ntl-editor notectl-editor') as unknown as El).getJSON(),
		);
	}

	async getContentHTML(): Promise<string> {
		return this.page.evaluate(() =>
			(document.querySelector('ntl-editor notectl-editor') as unknown as El).getContentHTML(),
		);
	}

	async setContentHTML(html: string): Promise<void> {
		await this.page.evaluate(
			(h) =>
				(document.querySelector('ntl-editor notectl-editor') as unknown as El).setContentHTML(h),
			html,
		);
	}

	async setJSON(doc: unknown): Promise<void> {
		await this.page.evaluate(
			(d) => (document.querySelector('ntl-editor notectl-editor') as unknown as El).setJSON(d),
			doc,
		);
	}

	// -- Test Indicators (Angular-side data attributes) ------------------

	async getStateChangeCount(): Promise<number> {
		const value: string | null =
			await this.testIndicators().getAttribute('data-state-change-count');
		return Number(value ?? '0');
	}

	async getLastEvent(): Promise<string> {
		const value: string | null = await this.testIndicators().getAttribute('data-last-event');
		return value ?? '';
	}

	// -- Shadow DOM inspection -------------------------------------------

	async getThemeCSSVariable(name: string): Promise<string> {
		return this.page.evaluate((varName) => {
			const editor: Element | null = document.querySelector('ntl-editor notectl-editor');
			if (!editor?.shadowRoot) return '';
			const host: Element = editor;
			return getComputedStyle(host).getPropertyValue(varName).trim();
		}, name);
	}

	async isContentEditable(): Promise<boolean> {
		const value: string | null = await this.content.getAttribute('contenteditable');
		return value === 'true';
	}

	// -- Output area (Angular-rendered <pre>) ----------------------------

	async getOutputText(): Promise<string> {
		return this.output.innerText();
	}

	// -- History ---------------------------------------------------------

	async waitForUndoGroup(): Promise<void> {
		await this.page.waitForTimeout(600);
	}
}

/** Custom Playwright fixture that provides a ready-to-use `AngularEditorPage`. */
export const test = base.extend<{ editor: AngularEditorPage }>({
	editor: async ({ page }, use) => {
		const editor = new AngularEditorPage(page);
		await editor.goto();
		await use(editor);
	},
});

export { expect } from '@playwright/test';
