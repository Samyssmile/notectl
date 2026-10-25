import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNavigationLink, openLink, scrollToFragment } from './LinkNavigation.js';

describe('link navigation', () => {
	afterEach(() => vi.restoreAllMocks());

	it.each(['', 'javascript:alert(1)', 'data:text/html,hello', 'vbscript:msgbox(1)'])(
		'never activates a rejected or empty URL: %s',
		(href: string) => {
			const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
			expect(createNavigationLink(document, href, true)).toBeNull();
			expect(openLink(document.body, href, true)).toBe(false);
			expect(click).not.toHaveBeenCalled();
		},
	);

	it.each(['https://example.com', '/relative', '../page', 'mailto:a@example.com', 'tel:+49123'])(
		'keeps safe URLs intact for native browser handling: %s',
		(href: string) => {
			const link: HTMLAnchorElement | null = createNavigationLink(document, href, true);
			expect(link?.getAttribute('href')).toBe(href);
			expect(link?.target).toBe('_blank');
			expect(link?.rel).toBe('noopener noreferrer');
		},
	);

	it.each([true, false])('activates outside the editor and cleans up (new tab: %s)', (newTab) => {
		const editor: HTMLDivElement = document.createElement('div');
		editor.contentEditable = 'true';
		const activated: HTMLAnchorElement[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement,
		): void {
			expect(this.isConnected).toBe(true);
			expect(editor.contains(this)).toBe(false);
			activated.push(this);
		});

		expect(openLink(editor, '/page', newTab)).toBe(true);
		expect(activated).toHaveLength(1);
		expect(activated[0]?.target).toBe(newTab ? '_blank' : '');
		expect(activated[0]?.isConnected).toBe(false);
	});

	it('resolves encoded and selector-like IDs only inside the owning editor', () => {
		const container: HTMLDivElement = document.createElement('div');
		const target: HTMLParagraphElement = document.createElement('p');
		target.id = 'café:[chapter]';
		target.scrollIntoView = vi.fn();
		container.append(target);

		expect(openLink(container, '#caf%C3%A9:%5Bchapter%5D', true)).toBe(true);
		expect(target.scrollIntoView).toHaveBeenCalledOnce();
		expect(scrollToFragment(container, 'https://example.com/#café:[chapter]')).toBe(false);
		expect(openLink(document.createElement('div'), '#café:[chapter]', true)).toBe(false);
	});
});
