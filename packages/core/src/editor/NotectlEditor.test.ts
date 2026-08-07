import { afterEach, describe, expect, it, vi } from 'vitest';
import { Locale } from '../i18n/Locale.js';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import type { Logger } from '../plugins/Logger.js';
import type { Plugin } from '../plugins/Plugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { EditorState } from '../state/EditorState.js';
import '../register.js';
import * as ContentSerializer from './ContentSerializer.js';
import * as EditorInitializer from './EditorInitializer.js';
import type { InitResult } from './EditorInitializer.js';
import { EditorInitializationAbortedError } from './EditorLifecycleCoordinator.js';
import { NotectlEditor } from './NotectlEditor.js';

/** Dispatches a real `beforeinput` insertText on the editor's content element. */
function typeInsertText(editor: NotectlEditor, data: string): void {
	const content = editor.shadowRoot?.querySelector('.notectl-content');
	if (!content) throw new Error('content element not found');
	const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, data });
	Object.defineProperty(event, 'inputType', { value: 'insertText' });
	content.dispatchEvent(event);
}

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

function deferredValue<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve = (_value: T): void => {};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function capturingLogger(): Logger {
	return {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	};
}

function inaccessibleInitResource(): never {
	throw new Error('A stale init result must not publish resources to the host.');
}

function staleInitResult(dispose: () => Promise<void>): InitResult {
	return {
		get view(): never {
			return inaccessibleInitResource();
		},
		get pluginManager(): never {
			return inaccessibleInitResource();
		},
		get domElements(): never {
			return inaccessibleInitResource();
		},
		get themeController(): never {
			return inaccessibleInitResource();
		},
		get paperLayout(): never {
			return inaccessibleInitResource();
		},
		announce: vi.fn(),
		markdownImportedMessage: 'Markdown imported',
		dispose,
	};
}

type PromiseOutcome =
	| { readonly status: 'fulfilled' }
	| { readonly status: 'rejected'; readonly reason: unknown };

function observePromise(promise: Promise<unknown>): Promise<PromiseOutcome> {
	return promise.then(
		() => ({ status: 'fulfilled' }),
		(reason: unknown) => ({ status: 'rejected', reason }),
	);
}

function expectInitializationAborted(outcome: PromiseOutcome): void {
	expect(outcome.status).toBe('rejected');
	if (outcome.status === 'rejected') {
		expect(outcome.reason).toBeInstanceOf(EditorInitializationAbortedError);
	}
}

describe('NotectlEditor', () => {
	afterEach(async () => {
		vi.restoreAllMocks();
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
		expect(editor.shadowRoot?.querySelector('.notectl-editor') ?? null).toBeNull();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('skips auto-init for a static print replica', async () => {
		const editor = new NotectlEditor();
		editor.setAttribute('data-notectl-static', '');
		const readySpy = vi.fn();
		editor.on('ready', readySpy);

		document.body.appendChild(editor);
		editor.connectedCallback();
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Print output replicates the host element; injected into a page where
		// the component is registered, the replica must stay static markup —
		// including its declarative shadow root, which the editor never touches.
		expect(readySpy).not.toHaveBeenCalled();
		expect(editor.shadowRoot).toBeNull();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('rejects init() on a static print replica', async () => {
		const editor = new NotectlEditor();
		editor.setAttribute('data-notectl-static', '');
		// Simulates the declarative shadow root the parser attaches for print
		// replicas (the constructor itself never creates one).
		const shadow: ShadowRoot = editor.attachShadow({ mode: 'open' });
		shadow.appendChild(document.createElement('p'));

		// Even a direct consumer init() call must not boot a live editor over
		// the replicated print content.
		await expect(editor.init()).rejects.toThrow('static print replica');
		expect(shadow.querySelector('p')).not.toBeNull();
	});

	it('rejects whenReady() on a static print replica instead of hanging', async () => {
		const editor = new NotectlEditor();
		editor.setAttribute('data-notectl-static', '');

		// A replica never becomes ready. A consumer awaiting readiness of every
		// editor-tagged element on the page (e.g. Promise.all) must get a
		// settled rejection, not a promise that hangs forever.
		const outcome: string = await Promise.race([
			editor.whenReady().then(
				() => 'resolved',
				() => 'rejected',
			),
			new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 20)),
		]);
		expect(outcome).toBe('rejected');
		await expect(editor.whenReady()).rejects.toThrow('static print replica');
	});

	it('defers shadow root creation out of the constructor', () => {
		// Parser-created custom elements run the constructor before attributes
		// and children exist: an eagerly attached (empty) shadow root would
		// block a declarative shadow root in the markup from attaching, losing
		// replicated print content when the component is registered before the
		// markup is parsed (script in <head>).
		const editor = new NotectlEditor();
		expect(editor.shadowRoot).toBeNull();
	});

	it('clears an unmarked declarative shadow root when init boots', async () => {
		const editor = new NotectlEditor();
		const shadow: ShadowRoot = editor.attachShadow({ mode: 'open' });
		const leftover: HTMLElement = document.createElement('p');
		leftover.id = 'leftover';
		shadow.appendChild(leftover);
		document.body.appendChild(editor);

		// Without the static marker (e.g. stripped by a sanitizer) the editor
		// boots from a fresh root instead of stacking below leftover markup.
		await editor.init({ locale: Locale.EN });

		expect(shadow.querySelector('#leftover')).toBeNull();
		expect(shadow.querySelector('.notectl-editor')).not.toBeNull();
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
		const initOutcome = observePromise(initPromise);

		await initStarted.promise;

		const destroyPromise = editor.destroy();
		releaseInit.resolve();

		const outcome = await initOutcome;
		await destroyPromise;

		expectInitializationAborted(outcome);
		expect(destroySpy).toHaveBeenCalledTimes(1);
		expect(onReadySpy).not.toHaveBeenCalled();
		expect(readySpy).not.toHaveBeenCalled();
		expect(editor.shadowRoot?.querySelector('.notectl-editor')).toBeNull();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('disposes a completed init result that becomes stale before host publication', async () => {
		const result = deferredValue<InitResult | null>();
		const dispose = vi.fn(async () => {});
		vi.spyOn(EditorInitializer, 'initializeEditor').mockReturnValue(result.promise);
		const editor = new NotectlEditor();
		const initOutcome = observePromise(editor.init({ locale: Locale.EN }));
		expect(EditorInitializer.initializeEditor).toHaveBeenCalledOnce();

		const teardown = editor.destroy();
		result.resolve(staleInitResult(dispose));
		const outcome = await initOutcome;
		await teardown;

		expectInitializationAborted(outcome);
		expect(dispose).toHaveBeenCalledOnce();
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('publishes teardown state and its barrier before invoking session disposal', async () => {
		const editor = new NotectlEditor();
		const initializeEditor = EditorInitializer.initializeEditor;
		let runtimeWasPublishedDuringDispose: boolean | null = null;
		let reentrantInit: Promise<void> | null = null;
		let inspectNextDispose = true;
		vi.spyOn(EditorInitializer, 'initializeEditor').mockImplementation(async (deps) => {
			const result = await initializeEditor(deps);
			if (!result) return null;
			if (!inspectNextDispose) return result;
			inspectNextDispose = false;
			const dispose = result.dispose.bind(result);
			return {
				...result,
				dispose: async (): Promise<void> => {
					try {
						editor.getState();
						runtimeWasPublishedDuringDispose = true;
					} catch {
						runtimeWasPublishedDuringDispose = false;
					}
					reentrantInit = editor.init();
					await dispose();
				},
			};
		});
		await editor.init({ locale: Locale.EN });

		await editor.destroy();
		const initAfterTeardown: Promise<void> | null = reentrantInit;
		if (!initAfterTeardown) throw new Error('session disposal did not run');
		await initAfterTeardown;

		expect(runtimeWasPublishedDuringDispose).toBe(false);
		expect(() => editor.getState()).not.toThrow();
		await editor.destroy();
	});

	it('detaches session DOM listeners before a later generation starts', async () => {
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN });
		const staleContent = editor.shadowRoot?.querySelector<HTMLElement>('.notectl-content');
		if (!staleContent) throw new Error('content element not found');
		await editor.destroy();

		const focusListener = vi.fn();
		const blurListener = vi.fn();
		editor.on('focus', focusListener);
		editor.on('blur', blurListener);
		await editor.init({ locale: Locale.EN });
		const liveContent = editor.shadowRoot?.querySelector<HTMLElement>('.notectl-content');
		if (!liveContent) throw new Error('content element not found');

		liveContent.dispatchEvent(new Event('focus'));
		liveContent.dispatchEvent(new Event('blur'));
		staleContent.dispatchEvent(new Event('focus'));
		staleContent.dispatchEvent(new Event('blur'));

		expect(focusListener).toHaveBeenCalledOnce();
		expect(blurListener).toHaveBeenCalledOnce();
		await editor.destroy();
	});

	it('cancels a pending autofocus frame when its initialization is disposed', async () => {
		const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 41);
		const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN, autofocus: true });
		expect(requestFrame).toHaveBeenCalledOnce();

		await editor.destroy();

		expect(cancelFrame).toHaveBeenCalledWith(41);
	});

	it('rejects existing whenReady waiters when destroy aborts initialization', async () => {
		const initStarted = deferred();
		const releaseInit = deferred();
		const editor = new NotectlEditor();
		const initPromise = editor.init({
			locale: Locale.EN,
			plugins: [
				{
					id: 'slow-ready-abort',
					name: 'Slow Ready Abort',
					init: async () => {
						initStarted.resolve();
						await releaseInit.promise;
					},
				},
			],
		});
		const initOutcome = observePromise(initPromise);
		await initStarted.promise;
		const joinedInitOutcome = observePromise(editor.init());
		const ready = editor.whenReady();

		const teardown = editor.destroy();

		await expect(ready).rejects.toBeInstanceOf(EditorInitializationAbortedError);
		releaseInit.resolve();
		const [ownerOutcome, joinOutcome] = await Promise.all([initOutcome, joinedInitOutcome]);
		await teardown;
		expectInitializationAborted(ownerOutcome);
		expectInitializationAborted(joinOutcome);
	});

	it('coalesces a concurrent config-less init with the active initialization', async () => {
		const initStarted = deferred();
		const releaseInit = deferred();
		const editor = new NotectlEditor();
		const firstInit = editor.init({
			locale: Locale.EN,
			plugins: [
				{
					id: 'slow-coalesced-init',
					name: 'Slow Coalesced Init',
					init: async () => {
						initStarted.resolve();
						await releaseInit.promise;
					},
				},
			],
		});
		await initStarted.promise;

		let secondSettled = false;
		const secondInit = editor.init().finally(() => {
			secondSettled = true;
		});
		await Promise.resolve();
		expect(secondSettled).toBe(false);
		expect(() => editor.getState()).toThrow('Editor not initialized');

		releaseInit.resolve();
		await Promise.all([firstInit, secondInit]);
		expect(secondSettled).toBe(true);
		expect(() => editor.getState()).not.toThrow();
		await editor.destroy();
	});

	it('waits for active init before rejecting a conflicting concurrent config', async () => {
		const initStarted = deferred();
		const releaseInit = deferred();
		const editor = new NotectlEditor();
		const firstInit = editor.init({
			locale: Locale.EN,
			placeholder: 'First generation',
			plugins: [
				{
					id: 'slow-config-owner',
					name: 'Slow Config Owner',
					init: async () => {
						initStarted.resolve();
						await releaseInit.promise;
					},
				},
			],
		});
		await initStarted.promise;

		let secondSettled = false;
		const conflictingInit = editor
			.init({ locale: Locale.EN, placeholder: 'Must not be ignored' })
			.finally(() => {
				secondSettled = true;
			});
		const conflictingAssertion = expect(conflictingInit).rejects.toThrow(
			'Cannot apply init config while another initialization is in progress',
		);
		await Promise.resolve();
		expect(secondSettled).toBe(false);

		releaseInit.resolve();
		await firstInit;
		await conflictingAssertion;
		expect(secondSettled).toBe(true);
		expect(
			editor.shadowRoot?.querySelector('.notectl-content')?.getAttribute('data-placeholder'),
		).toBe('First generation');
		await editor.destroy();
	});

	it('rejects a configured init after readiness instead of silently ignoring it', async () => {
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN, placeholder: 'Original config' });

		await expect(editor.init({ locale: Locale.EN, placeholder: 'Ignored config' })).rejects.toThrow(
			'Cannot apply init config after the editor is initialized',
		);
		expect(
			editor.shadowRoot?.querySelector('.notectl-content')?.getAttribute('data-placeholder'),
		).toBe('Original config');
		await editor.destroy();
	});

	it('isolates a throwing ready listener from initialization', async () => {
		const logger = capturingLogger();
		const error = new Error('ready consumer failed');
		const editor = new NotectlEditor();
		editor.on('ready', () => {
			throw error;
		});

		await expect(editor.init({ locale: Locale.EN, logger })).resolves.toBeUndefined();
		await expect(editor.whenReady()).resolves.toBeUndefined();

		expect(() => editor.getState()).not.toThrow();
		expect(logger.error).toHaveBeenCalledWith(
			'[EditorEventEmitter] Listener error on "ready"',
			error,
		);
		await editor.destroy();
	});

	it('rejects init when a ready listener destroys the published generation', async () => {
		const editor = new NotectlEditor();
		const teardown: { current: Promise<void> | null } = { current: null };
		editor.on('ready', () => {
			teardown.current = editor.destroy();
		});

		const outcome = await observePromise(editor.init({ locale: Locale.EN }));
		await teardown.current;

		expectInitializationAborted(outcome);
		expect(() => editor.getState()).toThrow('Editor not initialized');
	});

	it('isolates a throwing stateChange listener so the DOM still reconciles', async () => {
		const logger = capturingLogger();
		const error = new Error('state consumer failed');
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN, logger });
		editor.on('stateChange', () => {
			throw error;
		});

		expect(() => editor.setText('DOM survives')).not.toThrow();

		const content = editor.shadowRoot?.querySelector('.notectl-content');
		expect(editor.getText()).toBe('DOM survives');
		expect(content?.textContent).toContain('DOM survives');
		expect(logger.error).toHaveBeenCalledWith(
			'[EditorEventEmitter] Listener error on "stateChange"',
			error,
		);
		await editor.destroy();
	});

	it('does not commit an async Markdown replacement into a later editor generation', async () => {
		const markdownStarted = deferred();
		const releaseMarkdown = deferred();
		const markdownSetter = vi
			.spyOn(ContentSerializer, 'setEditorContentMarkdown')
			.mockImplementation(async (_markdown, currentState, _registry, replaceState) => {
				markdownStarted.resolve();
				await releaseMarkdown.promise;
				replaceState(
					EditorState.create({
						doc: createDocument([
							createBlockNode(
								nodeType('paragraph'),
								[createTextNode('stale Markdown')],
								blockId('stale-markdown'),
							),
						]),
						schema: currentState.schema,
					}),
				);
			});
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN });

		const staleReplacement = editor.setContentMarkdown('stale Markdown');
		await markdownStarted.promise;
		expect(markdownSetter).toHaveBeenCalledOnce();

		await editor.destroy();
		await editor.init({ locale: Locale.EN });
		editor.setText('new generation');
		releaseMarkdown.resolve();
		await staleReplacement;

		expect(editor.getText()).toBe('new generation');
		await editor.destroy();
	});

	it('does not announce a completed Markdown import into a later editor generation', async () => {
		const markdownCommitted = deferred();
		const releaseMarkdown = deferred();
		vi.spyOn(ContentSerializer, 'setEditorContentMarkdown').mockImplementation(
			async (_markdown, currentState, _registry, replaceState) => {
				replaceState(currentState);
				markdownCommitted.resolve();
				await releaseMarkdown.promise;
			},
		);
		const editor = new NotectlEditor();
		await editor.init({ locale: Locale.EN });

		const staleReplacement = editor.setContentMarkdown('old generation');
		await markdownCommitted.promise;
		await editor.destroy();
		await editor.init({ locale: Locale.EN });
		const currentAnnouncer = editor.shadowRoot?.querySelector<HTMLElement>('[aria-live="polite"]');
		expect(currentAnnouncer).toBeDefined();
		if (!currentAnnouncer) throw new Error('announcer not found');
		currentAnnouncer.textContent = 'current generation status';

		releaseMarkdown.resolve();
		await staleReplacement;

		expect(currentAnnouncer.textContent).toBe('current generation status');
		await editor.destroy();
	});

	it('waits for in-flight teardown before starting a new initialization', async () => {
		const firstInitStarted = deferred();
		const releaseFirstInit = deferred();
		const secondInitSpy = vi.fn();
		const slowPlugin: Plugin = {
			id: 'slow-first-init',
			name: 'Slow First Init',
			init: async () => {
				firstInitStarted.resolve();
				await releaseFirstInit.promise;
			},
		};
		const secondPlugin: Plugin = {
			id: 'second-init',
			name: 'Second Init',
			init: secondInitSpy,
		};
		const editor = new NotectlEditor();
		const firstInit = editor.init({ locale: Locale.EN, plugins: [slowPlugin] });
		const firstInitOutcome = observePromise(firstInit);
		await firstInitStarted.promise;

		const teardown = editor.destroy();
		const secondInit = editor.init({ locale: Locale.EN, plugins: [secondPlugin] });
		for (let turn = 0; turn < 10; turn++) await Promise.resolve();

		expect(secondInitSpy).not.toHaveBeenCalled();

		releaseFirstInit.resolve();
		const firstOutcome = await firstInitOutcome;
		await Promise.all([teardown, secondInit]);

		expectInitializationAborted(firstOutcome);
		expect(secondInitSpy).toHaveBeenCalledTimes(1);
		expect(editor.shadowRoot?.querySelector('.notectl-editor')).not.toBeNull();
		expect(() => editor.getState()).not.toThrow();
		await editor.destroy();
	});

	it('coalesces parallel init calls that were both queued behind teardown', async () => {
		const firstInitStarted = deferred();
		const releaseFirstInit = deferred();
		const queuedInitStarted = deferred();
		const releaseQueuedInit = deferred();
		const editor = new NotectlEditor();
		const firstInit = editor.init({
			locale: Locale.EN,
			plugins: [
				{
					id: 'slow-before-parallel-queue',
					name: 'Slow Before Parallel Queue',
					init: async () => {
						firstInitStarted.resolve();
						await releaseFirstInit.promise;
					},
				},
			],
		});
		const firstInitOutcome = observePromise(firstInit);
		await firstInitStarted.promise;

		const teardown = editor.destroy();
		const queuedOwner = editor.init({
			locale: Locale.EN,
			plugins: [
				{
					id: 'slow-queued-owner',
					name: 'Slow Queued Owner',
					init: async () => {
						queuedInitStarted.resolve();
						await releaseQueuedInit.promise;
					},
				},
			],
		});
		let queuedJoinSettled = false;
		const queuedJoin = editor.init().finally(() => {
			queuedJoinSettled = true;
		});

		releaseFirstInit.resolve();
		await queuedInitStarted.promise;
		await Promise.resolve();
		expect(queuedJoinSettled).toBe(false);

		releaseQueuedInit.resolve();
		const firstOutcome = await firstInitOutcome;
		await Promise.all([teardown, queuedOwner, queuedJoin]);
		expectInitializationAborted(firstOutcome);
		expect(queuedJoinSettled).toBe(true);
		expect(() => editor.getState()).not.toThrow();
		await editor.destroy();
	});

	it('lets a later destroy supersede an initialization queued behind teardown', async () => {
		const firstInitStarted = deferred();
		const releaseFirstInit = deferred();
		const queuedInitSpy = vi.fn();
		const editor = new NotectlEditor();
		const firstInit = editor.init({
			locale: Locale.EN,
			plugins: [
				{
					id: 'slow-before-queued-init',
					name: 'Slow Before Queued Init',
					init: async () => {
						firstInitStarted.resolve();
						await releaseFirstInit.promise;
					},
				},
			],
		});
		const firstInitOutcome = observePromise(firstInit);
		await firstInitStarted.promise;
		const teardown = editor.destroy();
		const queuedInit = editor.init({
			locale: Locale.EN,
			plugins: [{ id: 'queued-init', name: 'Queued Init', init: queuedInitSpy }],
		});
		const queuedInitOutcome = observePromise(queuedInit);
		const queuedReady = editor.whenReady();
		const finalDestroy = editor.destroy();
		const queuedReadyAssertion = expect(queuedReady).rejects.toBeInstanceOf(
			EditorInitializationAbortedError,
		);

		releaseFirstInit.resolve();
		const [firstOutcome, queuedOutcome] = await Promise.all([
			firstInitOutcome,
			queuedInitOutcome,
			teardown,
			finalDestroy,
			queuedReadyAssertion,
		]);

		expectInitializationAborted(firstOutcome);
		expectInitializationAborted(queuedOutcome);
		expect(queuedInitSpy).not.toHaveBeenCalled();
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

	// End-to-end through the real editor stack: confirms the `markdown` config
	// option is wired through EditorInitializer -> InputManager -> InputHandler.
	describe('markdown config gates live shorthand typing', () => {
		async function setupHashCaret(markdown: boolean): Promise<NotectlEditor> {
			const editor = new NotectlEditor();
			document.body.appendChild(editor);
			await editor.init({ locale: Locale.EN, plugins: [new HeadingPlugin()], markdown });
			await editor.whenReady();

			editor.setText('#');
			const block = editor.getState().doc.children[0];
			if (!block) throw new Error('no block after setText');
			// Place the caret right after the "#" so typing a space completes "# ".
			const tr = editor
				.getState()
				.transaction('api')
				.setSelection(createCollapsedSelection(block.id, 1))
				.build();
			editor.dispatch(tr);
			return editor;
		}

		it('keeps typed "# " literal as a paragraph when markdown is false', async () => {
			const editor = await setupHashCaret(false);
			typeInsertText(editor, ' ');

			const block = editor.getState().doc.children[0];
			expect(block?.type).toBe('paragraph');
			expect(editor.getText()).toBe('# ');
		});

		it('converts typed "# " to a heading when markdown is on (default)', async () => {
			const editor = await setupHashCaret(true);
			typeInsertText(editor, ' ');

			const block = editor.getState().doc.children[0];
			expect(block?.type).toBe('heading');
		});
	});
});
