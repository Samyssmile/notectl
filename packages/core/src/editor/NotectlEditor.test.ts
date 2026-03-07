import { afterEach, describe, expect, it, vi } from 'vitest';
import { Locale } from '../i18n/Locale.js';
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
});
