import { afterEach, describe, expect, it, vi } from 'vitest';
import { Locale } from '../i18n/Locale.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import type { Plugin } from '../plugins/Plugin.js';
import { NotectlEditor } from './NotectlEditor.js';

function deferred(): {
	promise: Promise<void>;
	resolve: () => void;
} {
	let resolve = (): void => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('NotectlEditor', () => {
	afterEach(async () => {
		document.body.innerHTML = '';
	});

	it('applies config from a manual init right after append', async () => {
		const editor = new NotectlEditor();
		document.body.appendChild(editor);

		await editor.init({
			locale: Locale.EN,
			placeholder: 'Configured placeholder',
		});
		await editor.whenReady();

		const content = editor.shadowRoot?.querySelector('.notectl-content');
		expect(content?.getAttribute('data-placeholder')).toBe('Configured placeholder');
		expect(() => editor.getState()).not.toThrow();
	});

	it('cancels scheduled auto-init when destroyed immediately after append', async () => {
		const editor = new NotectlEditor();
		const readySpy = vi.fn();
		editor.on('ready', readySpy);

		document.body.appendChild(editor);
		await editor.destroy();
		await Promise.resolve();

		expect(readySpy).not.toHaveBeenCalled();
		expect(editor.shadowRoot?.querySelector('.notectl-editor')).toBeNull();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('throws when setJSON is called before initialization', () => {
		const editor = new NotectlEditor();
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('hello')], blockId('b1')),
		]);

		expect(() => editor.setJSON(doc)).toThrow('Editor not initialized');
	});

	it('rejects setContentHTML before initialization', async () => {
		const editor = new NotectlEditor();

		await expect(editor.setContentHTML('<p>hello</p>')).rejects.toThrow('Editor not initialized');
	});

	it('rejects whenReady and allows retry after a failed init', async () => {
		const missingDependencyPlugin: Plugin = {
			id: 'needs-dependency',
			name: 'Needs Dependency',
			dependencies: ['dependency'],
			init: vi.fn(),
		};
		const dependencyPlugin: Plugin = {
			id: 'dependency',
			name: 'Dependency',
			init: vi.fn(),
		};
		const editor = new NotectlEditor();
		const readyPromise = editor.whenReady();

		await expect(
			editor.init({
				locale: Locale.EN,
				plugins: [missingDependencyPlugin],
			}),
		).rejects.toThrow('not registered');
		await expect(readyPromise).rejects.toThrow('not registered');

		expect(() => editor.registerPlugin(dependencyPlugin)).not.toThrow();
		await expect(editor.init()).resolves.toBeUndefined();
		await expect(editor.whenReady()).resolves.toBeUndefined();
		expect(dependencyPlugin.init).toHaveBeenCalledTimes(1);
		expect(missingDependencyPlugin.init).toHaveBeenCalledTimes(1);
		expect(() => editor.getState()).not.toThrow();
	});

	it('rejects whenReady on plugin init failure and allows retry', async () => {
		let shouldFail = true;
		const destroySpy = vi.fn();
		const readySpy = vi.fn();
		const flakyPlugin: Plugin = {
			id: 'flaky',
			name: 'Flaky',
			init: vi.fn(() => {
				if (shouldFail) {
					shouldFail = false;
					throw new Error('init fail');
				}
			}),
			destroy: destroySpy,
		};
		const editor = new NotectlEditor();
		editor.on('ready', readySpy);
		const readyPromise = editor.whenReady();

		await expect(
			editor.init({
				locale: Locale.EN,
				plugins: [flakyPlugin],
			}),
		).rejects.toThrow('init fail');
		await expect(readyPromise).rejects.toThrow('init fail');

		expect(destroySpy).toHaveBeenCalledTimes(1);
		expect(readySpy).not.toHaveBeenCalled();

		await expect(editor.init()).resolves.toBeUndefined();
		await expect(editor.whenReady()).resolves.toBeUndefined();
		expect(flakyPlugin.init).toHaveBeenCalledTimes(2);
		expect(readySpy).toHaveBeenCalledTimes(1);
	});

	it('preserves pre-init plugins across failed init retries', async () => {
		const preInitPlugin: Plugin = {
			id: 'pre-init',
			name: 'Pre Init',
			init: vi.fn(),
		};
		const missingDependencyPlugin: Plugin = {
			id: 'needs-missing',
			name: 'Needs Missing',
			dependencies: ['missing'],
			init: vi.fn(),
		};
		const missingPlugin: Plugin = {
			id: 'missing',
			name: 'Missing',
			init: vi.fn(),
		};
		const editor = new NotectlEditor();
		editor.registerPlugin(preInitPlugin);

		await expect(
			editor.init({
				locale: Locale.EN,
				plugins: [missingDependencyPlugin],
			}),
		).rejects.toThrow('not registered');

		editor.registerPlugin(missingPlugin);
		await expect(editor.init()).resolves.toBeUndefined();
		expect(preInitPlugin.init).toHaveBeenCalledTimes(1);
		expect(missingPlugin.init).toHaveBeenCalledTimes(1);
		expect(missingDependencyPlugin.init).toHaveBeenCalledTimes(1);
	});

	it('cancels in-flight init when destroyed before plugins finish initializing', async () => {
		const initStarted = deferred();
		const releaseInit = deferred();
		const destroySpy = vi.fn();
		const onReadySpy = vi.fn();
		const readySpy = vi.fn();

		const slowPlugin: Plugin = {
			id: 'slow-plugin',
			name: 'Slow Plugin',
			init: vi.fn(async () => {
				initStarted.resolve();
				await releaseInit.promise;
			}),
			destroy: destroySpy,
			onReady: onReadySpy,
		};

		const editor = new NotectlEditor();
		editor.on('ready', readySpy);

		const initPromise = editor.init({
			locale: Locale.EN,
			plugins: [slowPlugin],
		});

		await initStarted.promise;

		const destroyPromise = editor.destroy();
		releaseInit.resolve();

		await Promise.all([initPromise, destroyPromise]);

		expect(destroySpy).toHaveBeenCalledTimes(1);
		expect(onReadySpy).not.toHaveBeenCalled();
		expect(readySpy).not.toHaveBeenCalled();
		expect(editor.shadowRoot?.querySelector('.notectl-editor')).toBeNull();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('emits stateChange and notifies plugins when setJSON replaces content', async () => {
		const pluginStateChange = vi.fn();
		const plugin: Plugin = {
			id: 'state-spy',
			name: 'State Spy',
			init: vi.fn(),
			onStateChange: pluginStateChange,
		};
		const editor = new NotectlEditor();
		const stateChange = vi.fn();
		editor.on('stateChange', stateChange);

		document.body.appendChild(editor);
		await editor.init({
			locale: Locale.EN,
			plugins: [plugin],
		});
		await editor.whenReady();

		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [createTextNode('updated')], blockId('b1')),
		]);
		editor.setJSON(doc);

		expect(editor.getText()).toBe('updated');
		expect(pluginStateChange).toHaveBeenCalledTimes(1);
		expect(stateChange).toHaveBeenCalledTimes(1);
		expect(stateChange.mock.calls[0]?.[0]?.transaction.metadata.origin).toBe('api');
	});
});
