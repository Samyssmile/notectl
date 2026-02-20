import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E tests for the Angular State Inspector component.
 *
 * Verifies the real-time state inspector panel that displays formatted JSON
 * of document state, selection, and transaction data as the editor changes.
 */

// --- Helpers ---

async function waitForEditor(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const ntl = document.querySelector('ntl-editor');
			const inner = ntl?.querySelector('notectl-editor');
			return inner?.shadowRoot?.querySelector('.notectl-content') !== null;
		},
		{ timeout: 30000 },
	);
}

function contentLocator(page: Page) {
	return page.locator('ntl-editor notectl-editor div.notectl-content');
}

function inspectorLocator(page: Page) {
	return page.locator('app-state-inspector');
}

function sectionToggle(page: Page, section: string) {
	return inspectorLocator(page).locator('button.section-toggle', { hasText: section });
}

function sectionContent(page: Page, id: string) {
	return inspectorLocator(page).locator(`#section-${id}`);
}

// --- Tests ---

test.describe('Angular — State Inspector', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditor(page);
	});

	test('inspector panel renders with title', async ({ page }) => {
		const inspector = inspectorLocator(page);
		await expect(inspector).toBeAttached();

		const title = inspector.locator('.inspector-title');
		await expect(title).toHaveText('State Inspector');
	});

	test('three sections are present', async ({ page }) => {
		await expect(sectionToggle(page, 'Document')).toBeAttached();
		await expect(sectionToggle(page, 'Selection')).toBeAttached();
		await expect(sectionToggle(page, 'Last Transaction')).toBeAttached();
	});

	test('document section shows initial paragraph JSON', async ({ page }) => {
		// Type something to trigger a stateChange so inspector has data
		await contentLocator(page).click();
		await page.keyboard.type('Hello', { delay: 10 });

		const docSection = sectionContent(page, 'document');
		await expect(docSection).toBeAttached();

		const text = await docSection.innerText();
		expect(text).toContain('"children"');
		expect(text).toContain('"paragraph"');
	});

	test('selection section shows anchor and head with blockId and offset', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Test', { delay: 10 });

		const selSection = sectionContent(page, 'selection');
		await expect(selSection).toBeAttached();

		const text = await selSection.innerText();
		expect(text).toContain('"anchor"');
		expect(text).toContain('"head"');
		expect(text).toContain('"blockId"');
		expect(text).toContain('"offset"');
	});

	test('state updates in real-time when typing', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('First', { delay: 10 });

		const docSection = sectionContent(page, 'document');
		const textBefore = await docSection.innerText();
		expect(textBefore).toContain('First');

		await page.keyboard.type(' Second', { delay: 10 });

		const textAfter = await docSection.innerText();
		expect(textAfter).toContain('First Second');
	});

	test('transaction section shows origin and step info', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Hello', { delay: 10 });

		const trSection = sectionContent(page, 'transaction');
		await expect(trSection).toBeAttached();

		const text = await trSection.innerText();
		expect(text).toContain('"origin"');
		expect(text).toContain('"stepCount"');
		expect(text).toContain('"stepTypes"');
	});

	test('section toggle collapses and expands with aria-expanded', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('x', { delay: 10 });

		const docToggle = sectionToggle(page, 'Document');

		// Initially expanded
		await expect(docToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sectionContent(page, 'document')).toBeAttached();

		// Click to collapse
		await docToggle.click();
		await expect(docToggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sectionContent(page, 'document')).not.toBeAttached();

		// Click to expand again
		await docToggle.click();
		await expect(docToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sectionContent(page, 'document')).toBeAttached();
	});

	test('JSON syntax highlighting classes are present', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Highlight test', { delay: 10 });

		const docSection = sectionContent(page, 'document');
		const keySpan = docSection.locator('.json-key').first();
		await expect(keySpan).toBeAttached();

		const stringSpan = docSection.locator('.json-string').first();
		await expect(stringSpan).toBeAttached();
	});

	test('transaction counter increments', async ({ page }) => {
		const badge = inspectorLocator(page).locator('.transaction-badge');

		await contentLocator(page).click();
		await page.keyboard.type('abc', { delay: 50 });

		// Wait for state to settle
		await page.waitForTimeout(100);

		const text = await badge.innerText();
		const count = Number.parseInt(text, 10);
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('selection updates when cursor moves', async ({ page }) => {
		await contentLocator(page).click();
		await page.keyboard.type('Hello World', { delay: 10 });
		await page.waitForTimeout(50);

		const selSection = sectionContent(page, 'selection');
		const textAfterTyping = await selSection.innerText();

		// Move cursor to beginning
		await page.keyboard.press('Home');
		await page.waitForTimeout(100);

		// Type a character to trigger stateChange (Home alone may only trigger selectionChange)
		await page.keyboard.type('X', { delay: 10 });

		const textAfterMove = await selSection.innerText();
		// The selection offset should differ (was at end, now at beginning after Home + type)
		expect(textAfterMove).not.toBe(textAfterTyping);
	});
});
