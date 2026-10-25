import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import type { PluginContext } from '../Plugin.js';
import { LinkPlugin } from './LinkPlugin.js';

interface Fixture {
	readonly plugin: LinkPlugin;
	readonly container: HTMLDivElement;
	readonly child: HTMLElement;
	readonly context: PluginContext;
	readonly activated: HTMLAnchorElement[];
	setReadonly(value: boolean): void;
}

const plugins: LinkPlugin[] = [];

async function fixture(href = 'https://example.com', openInNewTab = true): Promise<Fixture> {
	const container: HTMLDivElement = document.createElement('div');
	container.tabIndex = 0;
	const anchor: HTMLAnchorElement = document.createElement('a');
	anchor.setAttribute('href', href);
	const child: HTMLElement = document.createElement('strong');
	child.textContent = 'Link';
	anchor.append(child);
	container.append(anchor);
	document.body.append(container);
	let readonly = false;
	const context: PluginContext = mockPluginContext({
		getContainer: () => container,
		isReadOnly: () => readonly,
	});
	const plugin: LinkPlugin = new LinkPlugin({ openInNewTab });
	plugins.push(plugin);
	await plugin.init(context);
	const activated: HTMLAnchorElement[] = [];
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
		this: HTMLAnchorElement,
	): void {
		activated.push(this);
	});
	return {
		plugin,
		container,
		child,
		context,
		activated,
		setReadonly: (value: boolean): void => {
			readonly = value;
			plugin.onReadOnlyChange();
		},
	};
}

function click(target: HTMLElement, options: MouseEventInit = {}): MouseEvent {
	const event: MouseEvent = new MouseEvent('click', {
		bubbles: true,
		cancelable: true,
		...options,
	});
	target.dispatchEvent(event);
	return event;
}

describe('link interactions', () => {
	afterEach(() => {
		for (const plugin of plugins.splice(0)) plugin.destroy();
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it.each([{ ctrlKey: true }, { metaKey: true }])(
		'opens nested linked text exactly once with %o, without a document transaction',
		async (modifiers) => {
			const f: Fixture = await fixture();
			const event: MouseEvent = click(f.child, modifiers);
			expect(event.defaultPrevented).toBe(true);
			expect(f.activated).toHaveLength(1);
			expect(f.activated[0]?.getAttribute('href')).toBe('https://example.com');
			expect(f.activated[0]?.target).toBe('_blank');
			expect(f.context.dispatch).not.toHaveBeenCalled();
			expect(document.querySelector('.notectl-link-preview')).toBeNull();
		},
	);

	it('uses the native new-tab meaning of Ctrl-click even with a same-tab default', async () => {
		const f: Fixture = await fixture('/relative', false);
		click(f.child, { ctrlKey: true });
		expect(f.activated[0]?.target).toBe('_blank');
	});

	it('leaves readonly clicks and modifiers to native activation', async () => {
		const f: Fixture = await fixture();
		f.setReadonly(true);
		for (const options of [{}, { ctrlKey: true }, { metaKey: true }]) {
			expect(click(f.child, options).defaultPrevented).toBe(false);
		}
		expect(f.activated).toHaveLength(0);
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
	});

	it.each([{ button: 1 }, { button: 2 }, { shiftKey: true }, { altKey: true }])(
		'preserves other browser gestures: %o',
		async (options) => {
			const f: Fixture = await fixture();
			expect(click(f.child, options).defaultPrevented).toBe(false);
			expect(f.activated).toHaveLength(0);
		},
	);

	it('respects a canceled click', async () => {
		const f: Fixture = await fixture();
		f.child.addEventListener('click', (event) => event.preventDefault());
		click(f.child, { ctrlKey: true });
		expect(f.activated).toHaveLength(0);
	});

	it('leaves links inside non-editable plugin controls alone', async () => {
		const f: Fixture = await fixture();
		f.child.parentElement?.setAttribute('contenteditable', 'false');
		expect(click(f.child, { ctrlKey: true }).defaultPrevented).toBe(false);
		expect(f.activated).toHaveLength(0);
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
	});

	it.each(['', 'javascript:alert(1)'])('blocks unsafe/no-op anchors: %s', async (href) => {
		const f: Fixture = await fixture(href);
		f.setReadonly(true);
		expect(click(f.child).defaultPrevented).toBe(true);
		f.setReadonly(false);
		click(f.child, { ctrlKey: true });
		expect(f.activated).toHaveLength(0);
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
	});

	it('shows a native open action and URL without moving focus or editing the document', async () => {
		const f: Fixture = await fixture();
		f.container.focus();
		click(f.child);
		const link: HTMLAnchorElement | null = document.querySelector('.notectl-link-preview a');
		expect(link?.textContent).toContain('Open link in new tab');
		expect(link?.textContent).toContain('https://example.com');
		expect(link?.rel).toBe('noopener noreferrer');
		expect(document.activeElement).toBe(f.container);
		expect(f.context.dispatch).not.toHaveBeenCalled();
		expect(f.activated).toHaveLength(0);
	});

	it('uses the same-tab setting for the preview action', async () => {
		const f: Fixture = await fixture('/relative', false);
		click(f.child);
		const link: HTMLAnchorElement | null = document.querySelector('.notectl-link-preview a');
		expect(link?.target).toBe('');
		expect(link?.textContent).toBe('Open link/relative');
	});

	it('allows Tab into the preview and Escape back to editing', async () => {
		const f: Fixture = await fixture();
		click(f.child);
		const tab: KeyboardEvent = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
		f.container.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(true);
		const link: HTMLAnchorElement | null = document.querySelector('.notectl-link-preview a');
		expect(document.activeElement).toBe(link);
		link?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		expect(document.activeElement).toBe(f.container);
	});

	it('does not show a preview for double-click text selection', async () => {
		const f: Fixture = await fixture();
		click(f.child, { detail: 2 });
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
	});

	it('consumes Escape only while a preview is open, preserving normal editor Escape afterwards', async () => {
		const f: Fixture = await fixture();
		click(f.child);
		const dismiss: KeyboardEvent = new KeyboardEvent('keydown', {
			key: 'Escape',
			cancelable: true,
		});
		f.container.dispatchEvent(dismiss);
		expect(dismiss.defaultPrevented).toBe(true);
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		const exit: KeyboardEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		f.container.dispatchEvent(exit);
		expect(exit.defaultPrevented).toBe(false);
	});

	it('dismisses previews on typing, document replacement, readonly changes and destroy', async () => {
		const f: Fixture = await fixture();
		click(f.child);
		f.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		click(f.child);
		f.plugin.onStateChange(f.context.getState(), stateBuilder().paragraph('replacement').build());
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		click(f.child);
		f.setReadonly(true);
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		f.setReadonly(false);
		click(f.child);
		f.plugin.destroy();
		expect(document.querySelector('.notectl-link-preview')).toBeNull();
		click(f.child, { ctrlKey: true });
		expect(f.activated).toHaveLength(0);
	});
});
