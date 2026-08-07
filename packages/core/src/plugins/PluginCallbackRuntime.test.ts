import { describe, expect, it, vi } from 'vitest';
import type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import { makePluginOptions } from '../test/TestUtils.js';
import type { Logger } from './Logger.js';
import type { Plugin } from './Plugin.js';
import { PluginManager } from './PluginManager.js';

describe('Plugin callback runtime ownership', () => {
	it('assimilates callable thenables into a guarded native Promise', async () => {
		const executor = new PluginCallbackExecutor();
		const callable = (): void => {};
		const callableThenable = Object.defineProperty(callable, 'then', {
			value: (resolve: (value: boolean) => void): void => resolve(false),
		}) as unknown as PromiseLike<boolean>;

		const outcome = executor.executeMaybeAsync(
			{ pluginId: 'owned-plugin', name: 'thenable', kind: 'file-handler' },
			() => callableThenable,
		);

		expect(outcome).toBeInstanceOf(Promise);
		await expect(outcome).resolves.toEqual({ ok: true, value: false });
	});

	it('isolates a hostile thenable whose then getter throws', () => {
		const report = vi.fn();
		const executor = new PluginCallbackExecutor(report);
		const failure = new Error('hostile then getter');
		const hostile = Object.defineProperty({}, 'then', {
			get: () => {
				throw failure;
			},
		}) as PromiseLike<boolean>;

		const outcome = executor.executeMaybeAsync(
			{ pluginId: 'owned-plugin', name: 'thenable', kind: 'file-handler' },
			() => hostile,
		);

		expect(outcome).toEqual({ ok: false });
		expect(report).toHaveBeenCalledWith(
			expect.objectContaining({ pluginId: 'owned-plugin', cause: failure }),
		);
	});

	it('consumes asynchronous reporter failures without a secondary rejection', async () => {
		const executor = new PluginCallbackExecutor(async () => {
			throw new Error('reporter rejected');
		});

		expect(() =>
			executor.reportFailure(
				{ pluginId: 'owned-plugin', name: 'reporter', kind: 'paste-interceptor' },
				new Error('original failure'),
			),
		).not.toThrow();
		await Promise.resolve();
		await Promise.resolve();
	});

	it('consumes a hostile thenable returned by the failure reporter', async () => {
		const hostile = Object.defineProperty({}, 'then', {
			get: () => {
				throw new Error('reporter then getter failed');
			},
		});
		const executor = new PluginCallbackExecutor(() => hostile);

		expect(() =>
			executor.reportFailure(
				{ pluginId: 'owned-plugin', name: 'reporter', kind: 'paste-interceptor' },
				new Error('original failure'),
			),
		).not.toThrow();
		await Promise.resolve();
		await Promise.resolve();
	});

	it('retains plugin attribution for every input/view callback registry', async () => {
		const pm = new PluginManager();
		const plugin: Plugin = {
			id: 'owned-plugin',
			name: 'Owned plugin',
			init(context) {
				context.registerPasteInterceptor(() => null, { name: 'paste' });
				context.registerTextInputInterceptor(() => null, { name: 'text' });
				context.registerInputRule({ pattern: /x$/, handler: () => null });
				context.registerKeymap({ Enter: () => false });
				context.registerFileHandler('image/*', () => false);
			},
		};
		pm.register(plugin);
		await pm.init(makePluginOptions());

		expect(pm.getPasteInterceptors()[0]?.pluginId).toBe('owned-plugin');
		expect(pm.getTextInputInterceptors()[0]?.pluginId).toBe('owned-plugin');
		expect(pm.inputRuleRegistry.getInputRuleEntries()[0]?.pluginId).toBe('owned-plugin');
		expect(pm.keymapRegistry.getKeymapEntriesByPriority().default[0]?.pluginId).toBe(
			'owned-plugin',
		);
		expect(pm.fileHandlerRegistry.getFileHandlers()[0]?.pluginId).toBe('owned-plugin');

		await pm.destroy();
	});

	it('routes an attributed callback failure through the configured logger', () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		const pm = new PluginManager({ logger });
		const failure = new Error('broken callback');

		const outcome = pm
			.getCallbackExecutor()
			.execute({ pluginId: 'owned-plugin', name: 'paste', kind: 'paste-interceptor' }, () => {
				throw failure;
			});

		expect(outcome.ok).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "owned-plugin" paste-interceptor "paste" error',
			failure,
		);
	});

	it('guards plugin-owned schema parse callbacks at registration', async () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		const failure = new Error('broken parse rule');
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'schema-owner',
			name: 'Schema owner',
			init(context) {
				context.registerNodeSpec({
					type: 'owned-node',
					toDOM: () => document.createElement('section'),
					parseHTML: [
						{
							tag: 'section',
							getAttrs: () => {
								throw failure;
							},
						},
					],
				});
			},
		});
		await pm.init(makePluginOptions());

		const rule = pm.schemaRegistry.getBlockParseRules()[0]?.rule;
		expect(rule?.getAttrs?.(document.createElement('section'))).toBe(false);
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "schema-owner" schema-parse "owned-node:section" error',
			failure,
		);

		await pm.destroy();
	});

	it('guards and attributes plugin-owned Markdown syntax callbacks', async () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		const failure = new Error('broken markdown extension');
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'markdown-owner',
			name: 'Markdown owner',
			init(context) {
				context.registerMarkdownSyntax({
					id: 'custom-syntax',
					matchInline: () => {
						throw failure;
					},
				});
			},
		});
		await pm.init(makePluginOptions());

		const extension = pm.markdownSyntaxRegistry.getExtensions()[0];
		expect(extension?.matchInline?.('$broken$', 0)).toBeNull();
		expect(logger.error).toHaveBeenCalledWith(
			'[PluginCallback] Plugin "markdown-owner" markdown-syntax "custom-syntax:matchInline" error',
			failure,
		);

		await pm.destroy();
	});

	it('rejects invalid plugin-owned inline Markdown matches at the callback boundary', async () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		let callbackResult: unknown = null;
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'markdown-owner',
			name: 'Markdown owner',
			init(context) {
				context.registerMarkdownSyntax({
					id: 'custom-inline',
					matchInline: (() => callbackResult) as NonNullable<
						MarkdownSyntaxExtension['matchInline']
					>,
				});
			},
		});
		await pm.init(makePluginOptions());

		const extension = pm.markdownSyntaxRegistry.getExtensions()[0];
		const validDescriptor = { type: 'owned-inline', attrs: { value: 'x' } };
		const invalidResults: readonly unknown[] = [
			{ ...validDescriptor, length: 0 },
			{ ...validDescriptor, length: -1 },
			{ ...validDescriptor, length: Number.NaN },
			{ ...validDescriptor, length: Number.POSITIVE_INFINITY },
			{ ...validDescriptor, length: 1.5 },
			{ ...validDescriptor, length: 3 },
			{ type: ' ', attrs: {}, length: 1 },
			{ type: 'owned-inline', attrs: { value: {} }, length: 1 },
			undefined,
		];

		for (const invalidResult of invalidResults) {
			callbackResult = invalidResult;
			expect(extension?.matchInline?.('abc', 1)).toBeNull();
		}
		expect(logger.error).toHaveBeenCalledTimes(invalidResults.length);
		for (const [message, cause] of vi.mocked(logger.error).mock.calls) {
			expect(message).toBe(
				'[PluginCallback] Plugin "markdown-owner" markdown-syntax "custom-inline:matchInline" error',
			);
			expect(cause).toBeInstanceOf(TypeError);
		}

		await pm.destroy();
	});

	it('rejects invalid plugin-owned block Markdown matches at the callback boundary', async () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		let callbackResult: unknown = null;
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'markdown-owner',
			name: 'Markdown owner',
			init(context) {
				context.registerMarkdownSyntax({
					id: 'custom-block',
					matchBlock: (() => callbackResult) as NonNullable<MarkdownSyntaxExtension['matchBlock']>,
				});
			},
		});
		await pm.init(makePluginOptions());

		const extension = pm.markdownSyntaxRegistry.getExtensions()[0];
		const validDescriptor = { type: 'owned-block', attrs: { value: true } };
		const invalidResults: readonly unknown[] = [
			{ ...validDescriptor, linesConsumed: 0 },
			{ ...validDescriptor, linesConsumed: -1 },
			{ ...validDescriptor, linesConsumed: Number.NaN },
			{ ...validDescriptor, linesConsumed: Number.POSITIVE_INFINITY },
			{ ...validDescriptor, linesConsumed: 1.5 },
			{ ...validDescriptor, linesConsumed: 3 },
			{ type: '', attrs: {}, linesConsumed: 1 },
			{ type: 'owned-block', attrs: [], linesConsumed: 1 },
			null,
		];

		for (const invalidResult of invalidResults) {
			callbackResult = invalidResult;
			expect(extension?.matchBlock?.(['one', 'two', 'three'], 1)).toBeNull();
		}
		expect(logger.error).toHaveBeenCalledTimes(invalidResults.length - 1);
		for (const [message, cause] of vi.mocked(logger.error).mock.calls) {
			expect(message).toBe(
				'[PluginCallback] Plugin "markdown-owner" markdown-syntax "custom-block:matchBlock" error',
			);
			expect(cause).toBeInstanceOf(TypeError);
		}

		await pm.destroy();
	});

	it('accepts valid Markdown matches up to the remaining input boundary', async () => {
		const logger: Logger = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		};
		const pm = new PluginManager({ logger });
		pm.register({
			id: 'markdown-owner',
			name: 'Markdown owner',
			init(context) {
				context.registerMarkdownSyntax({
					id: 'custom-valid',
					matchInline: () => ({
						type: 'owned-inline',
						attrs: { value: 'x', count: 2, enabled: true },
						length: 2,
					}),
					matchBlock: () => ({
						type: 'owned-block',
						attrs: { value: 'x' },
						linesConsumed: 2,
					}),
				});
			},
		});
		await pm.init(makePluginOptions());

		const extension = pm.markdownSyntaxRegistry.getExtensions()[0];
		expect(extension?.matchInline?.('abc', 1)).toEqual({
			type: 'owned-inline',
			attrs: { value: 'x', count: 2, enabled: true },
			length: 2,
		});
		expect(extension?.matchBlock?.(['one', 'two', 'three'], 1)).toEqual({
			type: 'owned-block',
			attrs: { value: 'x' },
			linesConsumed: 2,
		});
		expect(logger.error).not.toHaveBeenCalled();

		await pm.destroy();
	});
});
