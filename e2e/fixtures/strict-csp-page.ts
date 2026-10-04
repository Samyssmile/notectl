import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

/** The policy of a page that allows no inline styles at all. */
const STRICT_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'";

/**
 * Opens a page served with a strict Content Security Policy that loads the UMD
 * build (`NotectlCore`) and runs `startScript`. Returns the effective directive
 * of every CSP violation the page reports, as it reports them.
 */
export async function openStrictCSPPage(page: Page, startScript: string): Promise<string[]> {
	const violations: string[] = [];
	await page.exposeFunction('reportStyleViolation', (directive: string) => {
		violations.push(directive);
	});
	const root: string = process.cwd();
	const assets = new Map<string, Buffer>([
		['/library.js', await readFile(resolve(root, 'packages/core/dist/notectl-core.umd.js'))],
		[
			'/purify.js',
			await readFile(resolve(root, 'packages/core/node_modules/dompurify/dist/purify.min.js')),
		],
		[
			'/start.js',
			Buffer.from(`
				document.addEventListener('securitypolicyviolation', event => {
					window.reportStyleViolation(event.effectiveDirective);
				});
				${startScript}
			`),
		],
	]);
	await page.route('https://notectl.test/**', async (route) => {
		const pathname: string = new URL(route.request().url()).pathname;
		if (pathname === '/') {
			await route.fulfill({
				contentType: 'text/html',
				headers: { 'Content-Security-Policy': STRICT_CSP },
				body: '<!doctype html><html><head><title>Strict CSP</title></head><body><script src="/purify.js"></script><script src="/library.js"></script><script src="/start.js"></script></body></html>',
			});
			return;
		}
		const body: Buffer | undefined = assets.get(pathname);
		if (!body) {
			await route.abort();
			return;
		}
		await route.fulfill({ contentType: 'text/javascript', body });
	});
	await page.goto('https://notectl.test/');
	return violations;
}
