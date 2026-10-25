import { type Page, expect } from '@playwright/test';

export const LINK_DESTINATION = 'http://localhost:3000/link-284-destination';

/** Observe real native navigation without depending on an external website. */
export async function routeLinkDestination(page: Page): Promise<void> {
	await page
		.context()
		.route(`${LINK_DESTINATION}**`, (route) =>
			route.fulfill({ contentType: 'text/html', body: '<title>Link destination</title>' }),
		);
}

export async function expectLinkPopup(page: Page, activate: () => Promise<unknown>): Promise<void> {
	// Native Ctrl-click can create a background tab without an opener-page popup event.
	const [popup] = await Promise.all([page.context().waitForEvent('page'), activate()]);
	await expect(popup).toHaveURL(LINK_DESTINATION);
	expect(await popup.evaluate(() => window.opener)).toBeNull();
	expect(page.context().pages()).toHaveLength(2);
	await popup.close();
}
