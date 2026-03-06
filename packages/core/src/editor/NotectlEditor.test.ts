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
